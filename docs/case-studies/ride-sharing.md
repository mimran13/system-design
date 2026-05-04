# Design a Ride-Sharing Service (Uber/Lyft)

## Problem statement

Design a ride-sharing platform that:
- 10 million DAU (riders + drivers)
- Match riders to nearby drivers in < 1 minute
- Real-time location tracking (driver position updates every 5s)
- Surge pricing based on supply/demand
- ETA calculation

## Clarifying questions

```
1. Scope: full marketplace or just matching + tracking?
   → Core: driver matching, trip management, real-time location

2. City-scale or global?
   → Global, but cities are independent units

3. Driver location update frequency?
   → Every 5 seconds from driver app

4. How many concurrent active drivers?
   → 1M concurrent drivers globally, 100K in peak cities

5. Payment?
   → Out of scope for this design
```

## Scale estimation

```
Drivers: 1M concurrent active drivers
Location updates: 1M × 1 update/5s = 200,000 writes/sec

Riders: 10M DAU requesting rides
Peak ride requests: 100,000/min = 1,700/sec

Matching: find nearest available driver within 5km
Geospatial queries: must be fast (<100ms)
```

## Location storage: geospatial indexing

The core challenge: given a rider's location, find the nearest available drivers.

### Naive approach (wrong)

```sql
-- Full table scan for every ride request: O(all drivers)
SELECT *, ST_Distance(location, point(rider_lat, rider_lng)) as dist
FROM drivers 
WHERE available = true
ORDER BY dist ASC 
LIMIT 5;
-- At 1M drivers → too slow
```

### Solution: Geohash + Redis

Geohash encodes (lat, lng) into a short string. Nearby points share a common prefix:

```
Geohash precision:
  9chars → ~4.8m   (too precise, too many keys)
  7chars → ~153m   (good for driver matching)
  6chars → ~1.2km  (city-block level)
  5chars → ~4.9km  (neighborhood level)

New York Times Square: 9q8yy7
Nearby hotel: 9q8yyx  ← same 5-char prefix (9q8yy) = ~5km radius
```

```python
import redis
import geohash2

r = redis.Redis()

# Driver location update (every 5 seconds from driver app)
def update_driver_location(driver_id: str, lat: float, lng: float, available: bool):
    # Compute geohash at precision 6 (~1.2km cell)
    gh = geohash2.encode(lat, lng, precision=6)
    
    # Store current position in Sorted Set (score = timestamp for TTL-like expiry)
    r.zadd(f"drivers:geo:{gh}", {driver_id: time.time()})
    
    # Also store exact coords for distance calculation
    r.hset(f"driver:{driver_id}", mapping={
        'lat': lat, 'lng': lng,
        'geohash': gh,
        'available': int(available),
        'updated_at': time.time(),
    })
    
    # Expire stale drivers (offline > 30 seconds)
    r.zremrangebyscore(f"drivers:geo:{gh}", 0, time.time() - 30)

# Find nearby drivers for a rider
def find_nearby_drivers(rider_lat: float, rider_lng: float, radius_km: float = 5) -> list:
    rider_gh = geohash2.encode(rider_lat, rider_lng, precision=6)
    
    # Search rider's cell + 8 neighboring cells (cover edge cases)
    cells = [rider_gh] + geohash2.neighbors(rider_gh)
    
    candidate_drivers = []
    for cell in cells:
        # Get all drivers in this geohash cell (recently active)
        drivers = r.zrangebyscore(
            f"drivers:geo:{cell}",
            time.time() - 30,  # active in last 30s
            time.time(),
        )
        for driver_id in drivers:
            driver = r.hgetall(f"driver:{driver_id.decode()}")
            if driver and int(driver[b'available']):
                candidate_drivers.append(driver_id.decode())
    
    # Compute exact distances and sort
    results = []
    for driver_id in candidate_drivers:
        driver = r.hgetall(f"driver:{driver_id}") 
        dist = haversine(rider_lat, rider_lng,
                         float(driver[b'lat']), float(driver[b'lng']))
        if dist <= radius_km:
            results.append((dist, driver_id))
    
    return [d for _, d in sorted(results)[:10]]

def haversine(lat1, lng1, lat2, lng2) -> float:
    """Distance in km between two lat/lng points"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))
```

### Alternative: Redis GEO commands (simpler)

```python
# Redis GEOADD / GEORADIUS (built-in geospatial)
r.geoadd("drivers:available", [lng, lat, driver_id])

# Find drivers within 5km
nearby = r.georadius(
    "drivers:available",
    rider_lng, rider_lat,
    5, 'km',
    unit='km',
    withdist=True,
    withcoord=True,
    count=10,
    sort='ASC',
)
```

## Matching algorithm

```python
class MatchingService:
    async def match(self, ride_request: RideRequest) -> Optional[str]:
        # Find available drivers
        candidates = find_nearby_drivers(
            ride_request.pickup_lat,
            ride_request.pickup_lng,
            radius_km=5,
        )
        
        if not candidates:
            return None  # surge pricing kicks in, expand radius
        
        # Score each candidate driver
        scored = []
        for driver_id in candidates[:20]:  # top 20 nearest
            driver = await self.get_driver(driver_id)
            
            eta_minutes = await self.calculate_eta(
                driver.lat, driver.lng,
                ride_request.pickup_lat, ride_request.pickup_lng,
            )
            
            score = self.score_driver(driver, ride_request, eta_minutes)
            scored.append((score, driver_id, eta_minutes))
        
        # Pick best driver
        scored.sort(reverse=True)
        best_driver_id = scored[0][1]
        
        # Attempt to assign (handle race condition: driver may accept another ride)
        assigned = await self.try_assign_driver(best_driver_id, ride_request.id)
        
        return best_driver_id if assigned else None
    
    def score_driver(self, driver: Driver, request: RideRequest, eta: float) -> float:
        score = 100.0
        score -= eta * 10          # penalize long ETA
        score += driver.rating * 5  # reward high-rated drivers
        if driver.preferred_areas:
            # Slight preference for driver's home area
            if request.pickup_city == driver.preferred_areas[0]:
                score += 5
        return score
    
    async def try_assign_driver(self, driver_id: str, ride_id: str) -> bool:
        # Atomic compare-and-swap: set driver as assigned only if still available
        script = """
        local status = redis.call('HGET', KEYS[1], 'status')
        if status == 'available' then
            redis.call('HSET', KEYS[1], 'status', 'assigned', 'ride_id', ARGV[1])
            return 1
        end
        return 0
        """
        result = r.eval(script, 1, f"driver:{driver_id}", ride_id)
        return bool(result)
```

## Real-time location streaming

Driver and rider apps need live location updates during a trip:

```
During trip:
  Driver app → POST /location every 5s → Location Service
  Rider app → WebSocket connection → receives driver location updates
  ETA continuously recalculated
```

```python
# Location Service: fan-out driver location to rider
class LocationService:
    async def handle_driver_update(self, driver_id: str, lat: float, lng: float):
        # Update driver position in Redis
        update_driver_location(driver_id, lat, lng, available=False)
        
        # If driver has an active trip, notify the rider
        trip = await trip_db.get_active_trip_for_driver(driver_id)
        if trip:
            eta = await maps_api.get_eta(lat, lng, trip.destination_lat, trip.destination_lng)
            
            # Publish to Redis pub/sub → rider's WebSocket connection receives it
            await redis.publish(f"trip:{trip.id}:updates", json.dumps({
                'driver_lat': lat,
                'driver_lng': lng,
                'eta_minutes': eta,
            }))
    
    # Rider's WebSocket handler
    async def stream_trip_updates(self, trip_id: str, websocket: WebSocket):
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"trip:{trip_id}:updates")
        
        async for message in pubsub.listen():
            if message['type'] == 'message':
                await websocket.send_json(json.loads(message['data']))
```

## Surge pricing

```python
def calculate_surge_multiplier(city_zone: str) -> float:
    # Count available drivers and pending requests in zone
    available_drivers = count_available_drivers(city_zone)
    pending_requests = count_pending_requests(city_zone)
    
    if available_drivers == 0:
        return 3.0  # extreme surge
    
    demand_ratio = pending_requests / available_drivers
    
    if demand_ratio < 0.5:
        return 1.0   # normal
    elif demand_ratio < 1.0:
        return 1.2
    elif demand_ratio < 1.5:
        return 1.5
    elif demand_ratio < 2.0:
        return 2.0
    else:
        return min(3.0, 1.0 + demand_ratio)
```

## Data model

```sql
-- PostgreSQL: trip records
CREATE TABLE trips (
    id              UUID PRIMARY KEY,
    rider_id        UUID NOT NULL,
    driver_id       UUID,
    status          VARCHAR(20) NOT NULL,  -- requested, matched, in_progress, completed, cancelled
    pickup_lat      DECIMAL(10,7),
    pickup_lng      DECIMAL(10,7),
    destination_lat DECIMAL(10,7),
    destination_lng DECIMAL(10,7),
    requested_at    TIMESTAMP NOT NULL,
    matched_at      TIMESTAMP,
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    base_fare_cents INT,
    surge_multiplier DECIMAL(3,1),
    total_fare_cents INT,
);

-- Cassandra: location history (high write, time-series)
-- PK: (trip_id), SK: timestamp
-- Store every GPS point for audit, playback, dispute resolution
```

## AWS architecture

```
Driver app → NLB → Location Service (ECS, handles WebSocket + HTTP)
                         │
                   ElastiCache Redis
                   (geospatial index, driver state, pub/sub)
                         │
Rider app → ALB → API Service (ECS) ─────────────────────────────┤
                         │                                         │
                   Aurora PostgreSQL                        Matching Service
                   (trips, users)                          (ECS, async workers)
                                                                  │
                                                           Google Maps API
                                                           (ETA, routing)

Location history: Kinesis → S3 → Athena (analytics, dispute resolution)
```

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. Geohash for spatial indexing — search cell + 8 neighbors covers any radius efficiently
    2. Redis GEO or sorted sets — O(log N) radius queries, O(1) updates
    3. Atomic driver assignment (Lua script) — prevents two riders claiming same driver
    4. WebSocket + Redis pub/sub — real-time location updates during trip
    5. Location history in Cassandra/Kinesis → S3 — high-write time-series, separate from trip metadata

## Related topics

- [WebSockets & SSE](../networking/websockets-sse.md) — real-time location updates
- [Key-Value Stores](../storage/key-value-stores.md) — Redis geospatial commands
- [Wide-Column Stores](../storage/wide-column-stores.md) — location history
- [Rate Limiting](../patterns/rate-limiting.md) — location update throttle
