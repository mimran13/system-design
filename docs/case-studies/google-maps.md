# Design a Maps / Navigation Service (Google Maps)

## Problem statement

Design a maps and navigation service that:
- Shows maps and satellite imagery for any location on Earth
- Provides turn-by-turn navigation between two points
- Supports real-time traffic and route recalculation
- Handles 1 billion daily active users
- Serves map tiles with low latency globally
- Estimates arrival times (ETA) accurately

## Clarifying questions

```
1. Which features are in scope?
   → Map display (tile serving), routing (A to B), ETA, live traffic.
   → Out of scope: business listings, Street View, offline maps.

2. How fresh does traffic data need to be?
   → Near-real-time: traffic conditions updated within 1-2 minutes.

3. Global coverage?
   → Yes: all countries, varying levels of detail.

4. Mobile vs web?
   → Both, but mobile is primary. Mobile bandwidth constraints matter.

5. Routing accuracy vs speed?
   → ETA must be within 10% of actual travel time.
     Route recalculation must complete in < 1 second.
```

## Scale estimation

```
1B DAU
  Map tile requests: users view maps constantly while navigating
  ~200 tile requests per navigation session × 500M daily navigations
  = 100B tile requests/day = ~1.2M tile requests/sec

Map tile storage:
  Earth surface: ~510M km²
  Zoom levels 0-20 (21 levels)
  At zoom 20 (street level): ~4.4 trillion tiles
  Each tile: 256×256 PNG, ~20KB
  Total: ~88 petabytes (uncompressed)
  
  With WebP compression + only storing populated areas:
  Real storage: ~5-10PB
  
  Most traffic: zoom levels 12-17 (city blocks to street level)
  → Cache these aggressively

Traffic data:
  Probe data from mobile devices (GPS pings every 5 seconds)
  1B users × 10% driving at any time × 1 ping/5s = 20M pings/sec
```

---

## The two independent problems

Google Maps is really two systems that share data but operate differently:

```
1. Map tile serving:
   Problem: serve billions of image tiles fast, globally
   Solution: pre-render tiles, cache aggressively in CDN
   Read-heavy, static (tiles don't change often)

2. Routing (A → B):
   Problem: find the fastest route through a road graph with 100M+ nodes
   Solution: graph algorithms (A*, Dijkstra) on a compressed road graph
   Compute-intensive, dynamic (traffic changes constantly)
```

---

## Part 1: Map tile serving

### What a tile is

Maps are divided into a grid of square tiles at each zoom level:

```
Zoom 0: 1 tile covers entire Earth (256×256 pixels)
Zoom 1: 4 tiles (2×2 grid)
Zoom 2: 16 tiles (4×4 grid)
...
Zoom 18: 68.7 billion tiles (city block level)
Zoom 20: 1 trillion tiles (building level)

Tile addressing: z/x/y
  z = zoom level
  x = column (0 to 2^z - 1)
  y = row    (0 to 2^z - 1)

URL: https://maps.googleapis.com/tiles/z18/x75432/y49823.png
```

### Tile pre-rendering pipeline

```
Geographic data sources:
  OpenStreetMap (roads, buildings, POIs)
  Satellite imagery (Landsat, DigitalGlobe, aerial photography)
  Proprietary data (Google's street-level imagery)
        │
        ▼
Tile Renderer (offline batch process)
  - Reads vector data (OpenStreetMap)
  - Renders to raster images (PNG/WebP) at each zoom level
  - Re-runs when underlying data changes (road added, building torn down)
  - Rendering a full planet: days of compute on hundreds of servers
        │
        ▼
Tile Storage (GCS / S3)
  Path: gs://map-tiles/{zoom}/{x}/{y}.webp
  ~10PB total storage
  Immutable blobs — tiles don't change between renders
        │
        ▼
CDN (Cloud CDN / Akamai with 200+ edge nodes)
  Tiles cached at edge by URL
  Cache hit rate: > 95% for popular zoom/areas
  Cache TTL: 30 days (tiles rarely change)
        │
        ▼
Client
  Requests visible tiles based on viewport position + zoom level
  Browser/app caches recently viewed tiles locally
```

### Tile serving architecture

```python
class TileServer:
    """
    Tile request handler. Most requests are CDN cache hits.
    Only cache misses hit this service.
    """
    
    def __init__(self, gcs_client, redis_client):
        self.gcs = gcs_client
        self.redis = redis_client  # L2 cache (in front of GCS)
        self.BUCKET = 'map-tiles'
    
    def get_tile(self, zoom: int, x: int, y: int, format: str = 'webp') -> bytes:
        """
        Fetch a map tile.
        Cache hierarchy: CDN (L1) → Redis (L2) → GCS (source of truth)
        """
        cache_key = f"tile:{zoom}:{x}:{y}:{format}"
        
        # L2: Redis cache (tiles served from this tier frequently)
        cached = self.redis.get(cache_key)
        if cached:
            return cached
        
        # L3: GCS (object storage)
        tile_path = f"{zoom}/{x}/{y}.{format}"
        try:
            tile_data = self.gcs.bucket(self.BUCKET).blob(tile_path).download_as_bytes()
        except Exception:
            # Tile doesn't exist (ocean, unpopulated area) → return empty tile
            tile_data = self._get_empty_tile(format)
        
        # Populate Redis cache (TTL: 1 hour for popular tiles)
        self.redis.setex(cache_key, 3600, tile_data)
        return tile_data
    
    def _get_empty_tile(self, format: str) -> bytes:
        """Return a blank (ocean/unpopulated) tile."""
        # Pre-generated blank tiles for each zoom level background color
        return b''  # simplified


class ViewportTileCalculator:
    """
    Given a viewport (lat/lng bounding box) and zoom level,
    calculate which tile coordinates need to be fetched.
    """
    import math
    
    def lat_lng_to_tile(self, lat: float, lng: float, zoom: int) -> tuple[int, int]:
        """Convert geographic coordinates to tile x/y at given zoom."""
        n = 2 ** zoom
        x = int((lng + 180) / 360 * n)
        y = int((1 - self.math.log(
            self.math.tan(self.math.radians(lat)) +
            1 / self.math.cos(self.math.radians(lat))
        ) / self.math.pi) / 2 * n)
        return x, y
    
    def get_viewport_tiles(
        self,
        min_lat: float, max_lat: float,
        min_lng: float, max_lng: float,
        zoom: int
    ) -> list[tuple[int, int, int]]:
        """Return all tile (z, x, y) coordinates covering a viewport."""
        x_min, y_max = self.lat_lng_to_tile(min_lat, min_lng, zoom)
        x_max, y_min = self.lat_lng_to_tile(max_lat, max_lng, zoom)
        
        tiles = []
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                tiles.append((zoom, x, y))
        return tiles
```

---

## Part 2: Road graph and routing

### Representing the road network

```
Road network as a directed weighted graph:
  Node = intersection (latitude, longitude)
  Edge = road segment between two intersections
  Weight = travel time (not just distance — speed limits, traffic)

Real world:
  USA road network: ~45M nodes, ~120M edges
  Global: ~500M nodes, ~1B edges

Too large to fit in memory on one server.
Must be partitioned.
```

### Graph partitioning

```
Hierarchical partitioning by geography:

Level 3: Countries (United States, Germany, ...)
Level 2: States/regions (California, Bavaria, ...)
Level 1: Cities/counties (Los Angeles, Munich, ...)
Level 0: Neighborhoods (blocks, streets)

Route calculation:
  Short route (same city): use level-0 graph (detailed street graph)
  Long route (cross-country): use level-2 graph (highway graph only)
    → Don't route through every side street when driving LA → NYC
    → Use highway abstraction: "take I-10 E for 2,800 miles"

Contraction Hierarchies (CH):
  Pre-process: rank nodes by importance (highways > local roads)
  Add "shortcut" edges that skip unimportant intermediate nodes
  Query: bidirectional search using only important nodes
  
  Result: route query in < 100ms even for cross-country routes
  (vs seconds for plain Dijkstra on full graph)
```

### Routing algorithm

```python
import heapq
from dataclasses import dataclass, field
from typing import Optional

@dataclass(order=True)
class PriorityItem:
    priority: float
    node_id: int = field(compare=False)
    parent_id: Optional[int] = field(compare=False, default=None)

class RoutingEngine:
    """
    A* routing on a road graph.
    
    A* uses a heuristic (straight-line distance) to guide search
    toward the destination — much faster than Dijkstra in practice.
    """
    
    def __init__(self, graph: 'RoadGraph'):
        self.graph = graph
    
    def find_route(
        self,
        origin_lat: float, origin_lng: float,
        dest_lat: float, dest_lng: float,
    ) -> list[int]:
        """
        Returns list of node IDs forming the optimal route.
        """
        origin = self.graph.nearest_node(origin_lat, origin_lng)
        dest = self.graph.nearest_node(dest_lat, dest_lng)
        
        if origin == dest:
            return [origin]
        
        # A* search
        open_set = [PriorityItem(0.0, origin)]
        came_from: dict[int, Optional[int]] = {origin: None}
        g_score: dict[int, float] = {origin: 0.0}  # actual cost from origin
        
        while open_set:
            current_item = heapq.heappop(open_set)
            current = current_item.node_id
            
            if current == dest:
                return self._reconstruct_path(came_from, dest)
            
            for neighbor, edge_cost in self.graph.neighbors(current):
                tentative_g = g_score[current] + edge_cost
                
                if tentative_g < g_score.get(neighbor, float('inf')):
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    
                    # f = g (actual) + h (heuristic: straight-line time)
                    h = self._heuristic(neighbor, dest)
                    f = tentative_g + h
                    
                    heapq.heappush(open_set, PriorityItem(f, neighbor))
        
        return []  # No path found
    
    def _heuristic(self, node_id: int, dest_id: int) -> float:
        """
        Estimate travel time from node to destination.
        Lower bound: straight-line distance / max speed.
        A* requires heuristic to never overestimate (admissible).
        """
        node_pos = self.graph.get_position(node_id)
        dest_pos = self.graph.get_position(dest_id)
        
        distance_km = self._haversine(node_pos, dest_pos)
        max_speed_kmh = 130  # max highway speed
        
        return (distance_km / max_speed_kmh) * 3600  # seconds
    
    def _haversine(self, pos1: tuple, pos2: tuple) -> float:
        """Calculate straight-line distance between two lat/lng points (km)."""
        import math
        lat1, lng1 = math.radians(pos1[0]), math.radians(pos1[1])
        lat2, lng2 = math.radians(pos2[0]), math.radians(pos2[1])
        
        dlat = lat2 - lat1
        dlng = lng2 - lng1
        
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
        c = 2 * math.asin(math.sqrt(a))
        
        return 6371 * c  # Earth radius in km
    
    def _reconstruct_path(
        self, came_from: dict, current: int
    ) -> list[int]:
        path = []
        while current is not None:
            path.append(current)
            current = came_from[current]
        return list(reversed(path))
```

---

## Part 3: Live traffic

### Collecting probe data

```python
class TrafficProbeCollector:
    """
    Mobile devices send GPS coordinates periodically.
    We infer road speeds from these anonymous probes.
    """
    
    def __init__(self, kafka_producer):
        self.kafka = kafka_producer
    
    def record_probe(
        self,
        device_id: str,
        lat: float,
        lng: float,
        speed_ms: float,      # meters/second from GPS
        heading: float,       # degrees 0-360
        timestamp_ms: int,
    ) -> None:
        """
        Called from mobile app every 5 seconds while navigating.
        Device ID is hashed — not linkable to user identity.
        """
        probe = {
            'device_id': device_id,  # hashed, anonymous
            'lat': lat,
            'lng': lng,
            'speed_ms': speed_ms,
            'heading': heading,
            'timestamp_ms': timestamp_ms,
        }
        self.kafka.send('traffic-probes', value=probe)


class TrafficSpeedCalculator:
    """
    Processes probe data to compute real-time speed on each road segment.
    """
    
    def __init__(self, redis_client, road_graph: 'RoadGraph'):
        self.redis = redis_client
        self.graph = road_graph
    
    def process_probe(self, probe: dict) -> None:
        """
        Map-match the probe to its road segment, update speed estimate.
        """
        # Map-matching: find which road segment this GPS point is on
        segment_id = self.graph.map_match(
            probe['lat'], probe['lng'], probe['heading']
        )
        
        if not segment_id:
            return  # Point not on a road (parking lot, etc.)
        
        # Exponential moving average of speed on this segment
        key = f"traffic:speed:{segment_id}"
        current = self.redis.get(key)
        
        alpha = 0.3  # smoothing factor (higher = more reactive to new data)
        new_speed = probe['speed_ms']
        
        if current:
            smoothed = alpha * new_speed + (1 - alpha) * float(current)
        else:
            smoothed = new_speed
        
        self.redis.setex(key, 300, str(smoothed))  # 5-minute TTL
    
    def get_congestion_level(self, segment_id: str) -> str:
        """Return traffic color: green/yellow/red/dark-red."""
        speed_str = self.redis.get(f"traffic:speed:{segment_id}")
        if not speed_str:
            return 'unknown'
        
        speed_ms = float(speed_str)
        free_flow = self.graph.get_free_flow_speed(segment_id)  # speed limit
        ratio = speed_ms / free_flow
        
        if ratio > 0.8:  return 'green'      # normal
        if ratio > 0.5:  return 'yellow'     # slow
        if ratio > 0.25: return 'red'        # very slow
        return 'dark_red'                    # standstill
```

### Incorporating traffic into routing

```python
class TrafficAwareRoutingEngine(RoutingEngine):
    def __init__(self, graph, traffic: TrafficSpeedCalculator):
        super().__init__(graph)
        self.traffic = traffic
    
    def _edge_cost(self, from_node: int, to_node: int) -> float:
        """
        Travel time for a road segment, adjusted for current traffic.
        """
        segment_id = self.graph.get_segment_id(from_node, to_node)
        distance_m = self.graph.get_distance(from_node, to_node)
        
        # Get current observed speed; fall back to speed limit
        observed_speed = self.traffic.redis.get(f"traffic:speed:{segment_id}")
        
        if observed_speed:
            speed_ms = float(observed_speed)
        else:
            speed_ms = self.graph.get_free_flow_speed(segment_id)  # no data
        
        return distance_m / speed_ms  # seconds
```

---

## ETA calculation

ETA is not just route distance ÷ current speed. Google uses ML models trained on billions of historical trips:

```
Features for ETA model:
  - Route distance
  - Number of turns, traffic lights, stop signs
  - Current traffic conditions on each segment
  - Time of day (rush hour patterns)
  - Day of week
  - Weather (rain adds 10-15% to travel time)
  - Historical travel times on this exact route at this time
  - Live incidents (accidents, construction) on route

Output: predicted travel time in seconds, with confidence interval

Accuracy: Google's ETA is typically within 5-10% of actual time
```

---

## Geospatial indexing: finding nearest nodes

A fundamental operation: given a lat/lng, find the nearest road node. Needs to be fast (milliseconds).

```python
class GeospatialIndex:
    """
    Geohash-based spatial index for fast nearest-node lookup.
    
    Geohash: encode lat/lng as a string of characters
    Each character adds precision. Nearby points share prefix.
    
    "9q8yy" = San Francisco, ~2.4km × 1.2km cell
    "9q8yyz" = more precise (smaller cell, same area)
    
    To find nearest nodes:
      1. Compute geohash of query point
      2. Find all nodes in same geohash cell
      3. If not enough, expand to neighboring cells
      4. Compute actual distance to filter
    """
    
    def __init__(self, redis_client):
        self.redis = redis_client
    
    def index_node(self, node_id: int, lat: float, lng: float):
        """Add a road node to the geospatial index."""
        # Redis GEOADD: stores lat/lng as a sorted set with geohash score
        self.redis.geoadd('road_nodes', (lng, lat, str(node_id)))
    
    def nearest_node(
        self, lat: float, lng: float, radius_km: float = 0.5
    ) -> int:
        """Find the nearest road node to a lat/lng point."""
        # Redis GEORADIUS (or GEOSEARCH in Redis 6.2+)
        results = self.redis.geosearch(
            'road_nodes',
            longitude=lng,
            latitude=lat,
            radius=radius_km,
            unit='km',
            sort='ASC',
            count=1,
        )
        
        if results:
            return int(results[0])
        
        # Expand search radius if nothing found
        return self.nearest_node(lat, lng, radius_km * 2)
```

---

## AWS architecture

```
Mobile/Web Client
  │
  ├── CloudFront CDN
  │   - Serves map tiles from edge cache (>95% cache hit rate)
  │   - Cache key: /tiles/{z}/{x}/{y}.webp
  │   - TTL: 30 days (tiles rarely change)
  │
  ├── Tile Origin (ECS, only handles CDN misses)
  │   - Fetches from S3 (tile store, ~10PB)
  │   - L2 cache in ElastiCache Redis
  │   - Returns 1x1 blank tile for ocean/empty areas
  │
  ├── Routing Service (ECS + large-memory EC2)
  │   - Road graph in memory (partitioned by region)
  │   - A* routing with traffic-adjusted edge weights
  │   - Traffic weights from ElastiCache (refreshed every 5 min)
  │   - Response: list of turn-by-turn instructions + ETA
  │
  ├── Traffic Pipeline (MSK Kafka)
  │   Mobile probe data → MSK → Flink (map-matching + smoothing)
  │   → ElastiCache Redis (current speeds, 5-min TTL)
  │   → S3 (historical traffic data for ML training)
  │
  └── Map Data Pipeline (offline)
      OpenStreetMap updates → EC2 tile renderer (Mapnik)
      → S3 tile store (incremental updates by region)
      → CloudFront invalidation for changed tiles
```

---

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. **Two separate systems** — tile serving (pre-rendered, CDN-cached, static) and routing (compute-intensive, dynamic). Mixing them up means designing the wrong thing for each problem
    2. **CDN is the entire tile serving strategy** — 95%+ cache hit rate means your origin servers handle almost nothing. Pre-render tiles offline, push to CDN. Tile TTL is 30 days (roads don't change daily)
    3. **Geohash for spatial indexing** — encoding lat/lng as a string where nearby points share prefix. Redis GEORADIUS/GEOSEARCH for O(log N) nearest-node lookups. This is the fundamental spatial index behind all geo queries
    4. **Contraction Hierarchies** — pre-processing the road graph to add shortcut edges, then routing only on important nodes. This takes cross-country route queries from seconds (Dijkstra) to milliseconds
    5. **Probe data for live traffic** — anonymous GPS pings from millions of phones. Map-matched to road segments. Exponential moving average for speed smoothing. The crowd IS the sensor network
    6. **ETA is ML, not just physics** — distance/speed gives a naive estimate. Real ETA models use time-of-day patterns, historical travel times, weather, incidents. Google's model is trained on billions of completed trips

## Related topics

- [CDN](../networking/cdn.md) — tile delivery at scale
- [Consistent Hashing](../patterns/consistent-hashing.md) — distributing routing servers by region
- [Caching](../storage/caching.md) — multi-layer tile cache hierarchy
- [Distributed Primitives](../distributed/distributed-primitives.md) — geohash spatial indexing
- [Ride-Sharing](ride-sharing.md) — similar geo-matching problem for driver dispatch
