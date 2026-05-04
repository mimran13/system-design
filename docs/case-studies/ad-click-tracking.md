# Design an Ad Click Tracking System

## Problem statement

Design a system that:
- Tracks ad clicks and impressions in real time
- Handles 10 billion events per day (clicks + impressions)
- Provides advertisers with near-real-time reporting (< 1 minute lag)
- Deduplicates clicks (same user clicking the same ad multiple times)
- Detects fraudulent clicks (bots, click farms)
- Aggregates metrics: clicks, impressions, CTR, conversions by campaign/ad/time

## Clarifying questions

```
1. What events do we track?
   → Impressions (ad shown), clicks (ad clicked), conversions (purchase after click).
     Focus on clicks as the primary event.

2. Real-time vs batch reporting?
   → Near-real-time: advertisers should see clicks within ~1 minute.
     End-of-day billing runs on batch aggregation.

3. Accuracy vs availability trade-off?
   → Availability preferred for click counting (approximate is fine for
     real-time). Billing requires exact counts — run as batch reconciliation.

4. Deduplication window?
   → Same user, same ad: deduplicate within 24 hours.

5. Fraud detection?
   → Flag suspicious patterns: > 100 clicks/min from same IP,
     no real user behavior (no mouse movement, instant clicks).
```

## Scale estimation

```
10B events/day = 115,000 events/sec average
Peak (3× average): ~350,000 events/sec

Event payload: ~200 bytes (ad_id, user_id, timestamp, IP, user_agent, page_url)
Ingestion bandwidth: 350K × 200B = 70 MB/sec

Storage:
  Raw events: 10B/day × 200B = 2TB/day
  Aggregated data (much smaller): ~100GB/day
  
  Raw events: hot 7 days → warm 30 days → cold (S3) forever
  Aggregated: kept in fast storage for 2 years (reporting)

This is a write-dominated system. Reads (reporting) are far less frequent
than writes (event ingestion). Design for write throughput first.
```

---

## The core challenge: write volume at scale

At 350K events/sec, you cannot write every click directly to a database:

```
350K writes/sec to PostgreSQL:
  Max PostgreSQL write throughput: ~10K TPS (with indexes)
  → 35× over capacity → system collapses

Solution: decouple ingestion from processing
  
  Client → Lightweight ingestion API → Kafka → Stream processors → DB
  
  Ingestion API: just validates and publishes to Kafka (microseconds)
  Kafka: buffers millions of events/sec
  Stream processors (Kafka Streams/Flink): aggregate, deduplicate, detect fraud
  DB: receives pre-aggregated data at much lower write rate
```

---

## Architecture overview

```
Ads served via CDN (impression tracking: pixel/beacon)
User clicks → Ad Server
    │
    ├── Click Collector API (ECS, stateless, autoscaling)
    │   - Validate event
    │   - Enrich: resolve geo from IP, parse user agent
    │   - Publish to Kafka topic: raw-clicks
    │   - Return 200 immediately (fire-and-forget)
    │
    ▼
Kafka cluster (MSK)
    │
    ├── Deduplication Worker ────────────────────────────────────────┐
    │   Consumes raw-clicks                                         │
    │   Redis Bloom filter: seen this (user+ad) in 24h?            │
    │   → Duplicate: drop                                           │
    │   → New: publish to deduplicated-clicks topic                │
    │                                                               │
    ├── Aggregation Workers (Kafka Streams / Flink) ────────────────┤
    │   Consume deduplicated-clicks                                 │
    │   Tumbling windows: count clicks per (ad_id, minute)         │
    │   Write aggregates to ClickHouse (OLAP)                      │
    │                                                               │
    ├── Fraud Detection Worker ─────────────────────────────────────┤
    │   Consume raw-clicks                                          │
    │   Rate-limit checks: IP, user_id, device_id                  │
    │   Flag suspicious events → fraud-alerts topic                │
    │                                                               │
    └── Raw Event Archive ──────────────────────────────────────────┘
        Consume raw-clicks
        Write to S3 (Parquet, partitioned by date/hour)
        For billing reconciliation + ML training

Reporting DB: ClickHouse (columnar, OLAP)
  - Pre-aggregated: clicks/impressions per (campaign, ad, hour)
  - Advertiser dashboard reads from ClickHouse
  
Billing: Spark batch job runs at midnight
  - Reads raw S3 events (authoritative)
  - Exact deduplication
  - Generates invoices
```

---

## Component 1: Click collector API

```python
from fastapi import FastAPI, Request, Response
from kafka import KafkaProducer
import json
import time
import hashlib
import ipaddress

app = FastAPI()

producer = KafkaProducer(
    bootstrap_servers=['kafka:9092'],
    value_serializer=lambda v: json.dumps(v).encode(),
    acks=1,           # leader ack only — fast, not durable (we can lose some)
    linger_ms=5,      # batch events for 5ms before sending — throughput++
    batch_size=65536, # 64KB batch size
)

@app.post("/v1/click")
async def track_click(request: Request):
    body = await request.json()

    # Basic validation
    required = ['ad_id', 'user_id', 'session_id']
    if not all(k in body for k in required):
        return Response(status_code=400)

    # Enrich the event
    client_ip = request.headers.get("X-Forwarded-For", request.client.host)
    
    event = {
        'event_id':   hashlib.sha256(
            f"{body['ad_id']}:{body['user_id']}:{time.time()}".encode()
        ).hexdigest()[:16],
        'event_type': 'click',
        'ad_id':      body['ad_id'],
        'campaign_id': body.get('campaign_id'),
        'user_id':    body['user_id'],
        'session_id': body['session_id'],
        'ip':         client_ip,
        'user_agent': request.headers.get('User-Agent', ''),
        'page_url':   body.get('page_url', ''),
        'timestamp':  int(time.time() * 1000),  # epoch ms
    }

    # Publish to Kafka — async, returns immediately
    # Partition by ad_id so all events for one ad go to same partition
    producer.send(
        'raw-clicks',
        value=event,
        key=body['ad_id'].encode(),  # partition key
    )

    # Return immediately — don't wait for Kafka ack
    return Response(status_code=200)


@app.get("/v1/pixel/{ad_id}")
async def impression_pixel(ad_id: str, request: Request):
    """1×1 transparent pixel for impression tracking."""
    event = {
        'event_type': 'impression',
        'ad_id':      ad_id,
        'timestamp':  int(time.time() * 1000),
        'ip':         request.headers.get("X-Forwarded-For", ""),
    }
    producer.send('raw-impressions', value=event, key=ad_id.encode())

    # Return 1x1 transparent GIF
    pixel = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x00\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
    return Response(content=pixel, media_type="image/gif")
```

---

## Component 2: Deduplication with Bloom filter

A user clicking the same ad 50 times should count as one click. We deduplicate within a 24-hour window.

```python
import redis
import math

class ClickDeduplicator:
    """
    Deduplicates clicks using a Redis Bloom filter.
    
    Key: sha256(user_id + ad_id + date)  → unique per user-ad-day
    
    Using Redis's built-in Bloom filter (RedisBloom module):
    - False positive rate: ~0.1% (1 in 1000 legitimate clicks dropped)
    - Memory: ~10 bits per element = ~12KB for 10M daily unique pairs
    
    This is acceptable — we'll reconcile exact counts in batch billing.
    """
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.FALSE_POSITIVE_RATE = 0.001  # 0.1%
        self.EXPECTED_ITEMS = 10_000_000  # 10M unique (user, ad) pairs per day
    
    def _bloom_key(self, date_str: str) -> str:
        return f"click_dedup:{date_str}"
    
    def _event_key(self, user_id: str, ad_id: str) -> str:
        raw = f"{user_id}:{ad_id}"
        return hashlib.sha256(raw.encode()).hexdigest()
    
    def is_duplicate(self, user_id: str, ad_id: str) -> bool:
        """Returns True if this (user, ad) pair was seen today."""
        from datetime import date
        date_str = date.today().isoformat()
        bloom_key = self._bloom_key(date_str)
        event_key = self._event_key(user_id, ad_id)
        
        # BF.EXISTS: O(k) where k = number of hash functions (~7 for 0.1% FPR)
        exists = self.redis.execute_command('BF.EXISTS', bloom_key, event_key)
        return bool(exists)
    
    def record_click(self, user_id: str, ad_id: str) -> bool:
        """
        Record a click. Returns True if this is a new (non-duplicate) click.
        Creates the Bloom filter if needed; expires after 25 hours.
        """
        from datetime import date
        date_str = date.today().isoformat()
        bloom_key = self._bloom_key(date_str)
        event_key = self._event_key(user_id, ad_id)
        
        pipe = self.redis.pipeline()
        
        # BF.RESERVE: create filter with target FPR and capacity
        # (idempotent: no-op if filter already exists)
        pipe.execute_command(
            'BF.RESERVE', bloom_key,
            self.FALSE_POSITIVE_RATE,
            self.EXPECTED_ITEMS,
        )
        # BF.ADD: returns 1 if newly added, 0 if already existed
        pipe.execute_command('BF.ADD', bloom_key, event_key)
        pipe.expire(bloom_key, 25 * 3600)  # expire after 25 hours
        
        results = pipe.execute(raise_on_error=False)
        was_added = results[1] == 1  # BF.ADD result
        return was_added


# Kafka consumer that deduplicates
class DeduplicationWorker:
    def __init__(self, deduplicator: ClickDeduplicator, kafka_producer):
        self.dedup = deduplicator
        self.producer = kafka_producer
    
    def process(self, event: dict) -> None:
        user_id = event.get('user_id', '')
        ad_id = event['ad_id']
        
        if not user_id:
            # Anonymous user — can't deduplicate, pass through
            self.producer.send('deduplicated-clicks', value=event)
            return
        
        is_new = self.dedup.record_click(user_id, ad_id)
        
        if is_new:
            self.producer.send('deduplicated-clicks', value=event,
                               key=ad_id.encode())
        # else: duplicate, drop silently
```

---

## Component 3: Real-time aggregation (sliding windows)

```python
# Using Kafka Streams (pseudocode — actual Kafka Streams is Java)
# Python equivalent: Flink or custom Redis-based aggregation

class ClickAggregator:
    """
    Aggregates clicks into 1-minute tumbling windows.
    Writes aggregates to ClickHouse for dashboards.
    """
    
    def __init__(self, redis_client: redis.Redis, clickhouse_client):
        self.redis = redis_client
        self.ch = clickhouse_client
        self.WINDOW_SECONDS = 60
    
    def process_click(self, event: dict) -> None:
        ad_id = event['ad_id']
        campaign_id = event.get('campaign_id', '')
        timestamp_ms = event['timestamp']
        
        # Current 1-minute window bucket
        window_start = (timestamp_ms // 1000 // self.WINDOW_SECONDS) * self.WINDOW_SECONDS
        
        pipe = self.redis.pipeline()
        
        # Increment counts in Redis (fast, in-memory aggregation)
        pipe.hincrby(f"agg:clicks:{window_start}", f"ad:{ad_id}", 1)
        pipe.hincrby(f"agg:clicks:{window_start}", f"campaign:{campaign_id}", 1)
        pipe.expire(f"agg:clicks:{window_start}", 3600)  # keep 1 hour
        
        pipe.execute()
    
    def flush_completed_windows(self) -> None:
        """
        Called every minute. Flushes completed windows to ClickHouse.
        A window is "complete" when it's more than 2 minutes old
        (allows for late-arriving events).
        """
        import time
        now = int(time.time())
        cutoff = (now // self.WINDOW_SECONDS - 2) * self.WINDOW_SECONDS
        
        # Find all windows older than cutoff
        pattern = "agg:clicks:*"
        for key in self.redis.scan_iter(pattern):
            window_ts = int(key.decode().split(':')[-1])
            
            if window_ts <= cutoff:
                aggregates = self.redis.hgetall(key)
                self._write_to_clickhouse(window_ts, aggregates)
                self.redis.delete(key)
    
    def _write_to_clickhouse(self, window_ts: int, aggregates: dict):
        rows = []
        for field, count in aggregates.items():
            field_str = field.decode()
            entity_type, entity_id = field_str.split(':', 1)
            rows.append({
                'window_start': window_ts,
                'entity_type': entity_type,  # 'ad' or 'campaign'
                'entity_id': entity_id,
                'click_count': int(count),
            })
        
        if rows:
            self.ch.execute(
                "INSERT INTO click_aggregates VALUES",
                rows,
            )
```

---

## Component 4: Fraud detection

```python
class FraudDetector:
    """
    Real-time fraud signals. Flags suspicious activity — doesn't block
    (to avoid false positives blocking real users). A separate review
    process handles flagged clicks.
    """
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        
        self.CLICK_RATE_LIMIT = 100   # clicks per minute per IP
        self.BOT_USER_AGENTS = {
            'Googlebot', 'Bingbot', 'AhrefsBot', 'SemrushBot'
        }
    
    def check(self, event: dict) -> list[str]:
        """Returns list of fraud signals (empty = clean)."""
        signals = []
        
        signals.extend(self._check_click_rate(event))
        signals.extend(self._check_user_agent(event))
        signals.extend(self._check_timing(event))
        
        return signals
    
    def _check_click_rate(self, event: dict) -> list[str]:
        """More than 100 clicks/min from same IP → suspicious."""
        ip = event.get('ip', '')
        if not ip:
            return []
        
        key = f"fraud:ip_rate:{ip}:{int(time.time() // 60)}"
        count = self.redis.incr(key)
        self.redis.expire(key, 120)
        
        if count > self.CLICK_RATE_LIMIT:
            return [f'high_click_rate:{count}/min']
        return []
    
    def _check_user_agent(self, event: dict) -> list[str]:
        """Known bot user agents."""
        ua = event.get('user_agent', '')
        for bot in self.BOT_USER_AGENTS:
            if bot.lower() in ua.lower():
                return [f'bot_user_agent:{bot}']
        if not ua:
            return ['missing_user_agent']
        return []
    
    def _check_timing(self, event: dict) -> list[str]:
        """
        Click within 100ms of impression → likely bot (humans take > 300ms).
        Requires impression timestamp to be in the event.
        """
        impression_ts = event.get('impression_timestamp_ms')
        click_ts = event.get('timestamp')
        
        if impression_ts and click_ts:
            delta_ms = click_ts - impression_ts
            if delta_ms < 100:
                return [f'impossible_timing:{delta_ms}ms']
        return []
```

---

## ClickHouse schema for reporting

```sql
-- ClickHouse: columnar OLAP database, perfect for aggregation queries

-- Raw clicks (partitioned by day for efficient range queries)
CREATE TABLE clicks (
    click_id        String,
    ad_id           String,
    campaign_id     String,
    advertiser_id   String,
    user_id         String,
    session_id      String,
    timestamp       DateTime64(3),   -- millisecond precision
    ip              String,
    country         LowCardinality(String),
    device_type     LowCardinality(String),  -- 'mobile', 'desktop', 'tablet'
    fraud_signals   Array(String),
    is_valid        Bool
) ENGINE = MergeTree()
  PARTITION BY toYYYYMMDD(timestamp)
  ORDER BY (ad_id, timestamp);

-- Pre-aggregated (for fast dashboard queries)
CREATE TABLE click_aggregates_1min (
    window_start    DateTime,
    ad_id           String,
    campaign_id     String,
    advertiser_id   String,
    clicks          UInt64,
    unique_users    UInt64,          -- HyperLogLog approximation
    fraud_clicks    UInt64
) ENGINE = SummingMergeTree()
  ORDER BY (ad_id, window_start);

-- Materialized view: auto-aggregate as data arrives
CREATE MATERIALIZED VIEW click_agg_mv TO click_aggregates_1min AS
SELECT
    toStartOfMinute(timestamp) AS window_start,
    ad_id,
    campaign_id,
    advertiser_id,
    count()                     AS clicks,
    uniqCombined(user_id)       AS unique_users,   -- HLL approximation
    countIf(NOT is_valid)       AS fraud_clicks
FROM clicks
GROUP BY window_start, ad_id, campaign_id, advertiser_id;

-- Dashboard query: "How many clicks did campaign X get in the last hour?"
SELECT
    window_start,
    sum(clicks) AS total_clicks
FROM click_aggregates_1min
WHERE campaign_id = 'camp_abc'
  AND window_start >= now() - INTERVAL 1 HOUR
GROUP BY window_start
ORDER BY window_start;
-- Runs in < 100ms even for billions of rows
```

---

## Hot path vs cold path

```
Hot path (real-time, approximate):
  Click → Kafka → Dedup worker → Aggregation worker → Redis counters
  → ClickHouse (via materialized views)
  Latency: < 1 minute end-to-end
  Use for: advertiser dashboard, real-time pacing, fraud alerts

Cold path (batch, exact):
  Click → Kafka → S3 (raw Parquet)
  Daily Spark job: read all S3 events → exact dedup → billing
  Latency: T+1 day
  Use for: advertiser invoicing, financial reconciliation, ML training

The hot path uses approximate counting (Bloom filter dedup, HyperLogLog
for uniques). The cold path uses exact counting. Billing always uses
the cold path — the hot path is for dashboards only.
```

---

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. **Decouple ingestion from processing** — at 350K events/sec, you cannot write to a DB directly. The collector API just dumps to Kafka (sub-millisecond), and processing happens asynchronously. This is the core architecture pattern for high-volume write systems
    2. **Hot path vs cold path** — approximate counting (Bloom filter, HLL) for real-time dashboards; exact counting via batch Spark job for billing. These have different latency and accuracy requirements — don't use one solution for both
    3. **Bloom filter deduplication** — O(1) space-efficient dedup with configurable false positive rate (0.1%). A small number of legitimate clicks are dropped; reconciled in batch. Never acceptable to double-count (charge advertiser twice for same click)
    4. **ClickHouse for OLAP** — columnar storage means aggregation queries (sum clicks by campaign by minute) scan only the columns needed. 100ms queries on billions of rows. Standard OLTP DBs cannot do this
    5. **Fraud detection is async** — don't block click recording to run fraud checks. Flag suspicious events and handle them in a separate pipeline. False negatives (missed fraud) are better than false positives (blocking real users)
    6. **Partitioning by time** — ClickHouse partitions by day; S3 path is `s3://bucket/year=2024/month=04/day=28/hour=14/`. Queries that filter by date range skip entire partitions = fast

## Related topics

- [Event Streaming](../messaging/event-streaming.md) — Kafka as the backbone
- [Kafka Deep Dive](../messaging/kafka.md) — partitioning strategy, consumer groups
- [Distributed Primitives](../distributed/distributed-primitives.md) — Bloom filter and HyperLogLog internals
- [Rate Limiting](../patterns/rate-limiting.md) — fraud detection rate checks
- [Data Warehousing](../storage/data-warehousing.md) — ClickHouse and columnar OLAP
