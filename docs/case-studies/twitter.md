# Design a Social Media Feed (Twitter/Instagram)

## Problem statement

Design a social media platform that:
- Users can post tweets (up to 280 characters, optional media)
- Users follow other users
- Each user has a **home timeline** (tweets from people they follow)
- Each user has a **user timeline** (their own tweets)
- Support 300 million DAU
- Tweets appear on followers' timelines within seconds
- System reads far outnumber writes (celebrities have millions of followers)

## Clarifying questions

```
1. Read/write ratio?
   → Very read-heavy: ~100 reads per write. Home timeline is accessed
     constantly; tweets are written infrequently.

2. How fast must a tweet appear on followers' timelines?
   → Within a few seconds for most users.

3. What's the follower ceiling?
   → Regular users: ~1,000 followers. Celebrities: 100M+ followers.
     This asymmetry is the hardest problem in this design.

4. Media (images/video)?
   → Yes, but treat as blob storage (S3). The hard problem is metadata
     and timeline delivery, not file storage.

5. Trending topics / search?
   → Out of scope for core design — focus on timeline delivery.

6. Global distribution?
   → Yes, users worldwide.
```

## Scale estimation

```
300M DAU
  Tweets posted: 300M × 2 tweets/day  = 600M tweets/day ≈ 7,000 TPS
  Timeline reads: 300M × 100 reads/day = 30B reads/day  ≈ 350,000 TPS

Read-to-write ratio: 50:1 — heavily read-optimized design needed.

Storage:
  Tweet: 280 chars + metadata ≈ 1KB
  600M tweets/day × 1KB = 600GB/day new tweet data
  5 years ≈ 1PB raw tweet storage

Fanout:
  Average user: 500 followers
  7,000 tweets/sec × 500 = 3.5M fanout writes/sec (background)
  Celebrity with 50M followers: 1 tweet → 50M timeline writes!
  → Celebrity fanout must be handled differently
```

---

## The core problem: fan-out

When User A (500 followers) tweets, how do all 500 followers see it on their home timeline?

```
Option 1: Fan-out on write (push model)
  When tweet is posted → immediately write to each follower's timeline cache
  
  Read: O(1) — timeline is pre-computed, just read from cache
  Write: O(followers) — can be millions for celebrities
  
  Problem: 1 tweet from @elonmusk (100M followers) = 100M cache writes

Option 2: Fan-out on read (pull model)
  Store each user's tweets. On timeline read, fetch tweets from
  all followed users and merge/sort.
  
  Read: O(following_count) — fetch N feeds and merge
  Write: O(1) — just store the tweet
  
  Problem: if you follow 500 people, reading timeline = 500 DB queries → slow

Option 3: Hybrid (Twitter's actual approach)
  → Fan-out on write for regular users
  → Fan-out on read for celebrities (high-follower accounts)
  → Merge at read time
```

The hybrid model is the right answer for interviews. It solves both problems.

---

## Architecture overview

```
Client (web/mobile)
    │
    ├── Tweet Service ──────────────────────────────────────────┐
    │   - Validate, store tweet in Tweet DB                      │
    │   - Push to Fanout Queue                                   │
    │                                                            │
    ├── Fanout Service (async workers) ─────────────────────────┤
    │   - Reads Fanout Queue                                     │
    │   - For regular users: write tweet_id to each follower's  │
    │     Timeline Cache (Redis sorted set by timestamp)        │
    │   - Skips celebrities (handled at read time)              │
    │                                                            │
    ├── Timeline Service ────────────────────────────────────────┤
    │   - Read user's pre-computed timeline from cache           │
    │   - Inject celebrity tweets at read time (merge)          │
    │   - Hydrate tweet_ids → full tweet objects from Tweet DB  │
    │                                                            │
    └── Social Graph Service ────────────────────────────────────┘
        - Stores follow relationships (who follows whom)
        - Followed by both Fanout and Timeline services

Tweet DB:     Cassandra (wide-column, tweet_id → tweet data)
Timeline Cache: Redis (sorted sets — one per user)
Graph DB:     MySQL + graph cache for follow lookups
Fanout Queue: Kafka
```

---

## Component 1: Tweet storage

Tweets are immutable once posted. Cassandra is ideal — append-only, high write throughput, easy time-based queries.

```python
# Cassandra schema
"""
CREATE TABLE tweets (
    tweet_id    BIGINT PRIMARY KEY,    -- Snowflake ID (time-ordered)
    user_id     BIGINT,
    content     TEXT,
    media_urls  LIST<TEXT>,
    reply_to    BIGINT,                -- null for original tweets
    retweet_of  BIGINT,                -- null for original tweets
    created_at  TIMESTAMP,
    like_count  COUNTER,               -- eventually consistent counter
    retweet_count COUNTER,
);

-- User's own tweets (user timeline)
CREATE TABLE user_tweets (
    user_id     BIGINT,
    tweet_id    BIGINT,
    created_at  TIMESTAMP,
    PRIMARY KEY (user_id, tweet_id)
) WITH CLUSTERING ORDER BY (tweet_id DESC);
"""

import time
import random

class SnowflakeID:
    """
    Twitter's Snowflake: 64-bit time-ordered unique ID
    
    Bit layout:
    [1 sign][41 timestamp ms][10 machine id][12 sequence]
    
    41 bits of timestamp → ~69 years from epoch
    10 bits machine ID   → 1024 machines
    12 bits sequence     → 4096 IDs per millisecond per machine
    """
    EPOCH = 1288834974657  # Twitter's custom epoch (Nov 4, 2010)
    
    def __init__(self, machine_id: int):
        self.machine_id = machine_id & 0x3FF  # 10 bits
        self.sequence = 0
        self.last_timestamp = -1
    
    def generate(self) -> int:
        timestamp = int(time.time() * 1000) - self.EPOCH
        
        if timestamp == self.last_timestamp:
            self.sequence = (self.sequence + 1) & 0xFFF  # 12 bits
            if self.sequence == 0:
                # Sequence exhausted — wait for next millisecond
                while timestamp <= self.last_timestamp:
                    timestamp = int(time.time() * 1000) - self.EPOCH
        else:
            self.sequence = 0
        
        self.last_timestamp = timestamp
        
        return (
            (timestamp << 22) |
            (self.machine_id << 12) |
            self.sequence
        )
    
    @staticmethod
    def timestamp_of(snowflake_id: int) -> int:
        """Extract creation timestamp from a Snowflake ID."""
        return (snowflake_id >> 22) + SnowflakeID.EPOCH
```

Why Snowflake IDs matter: they're time-ordered, which means tweet IDs naturally sort chronologically — no `created_at` index needed for range queries. `WHERE tweet_id > X` = "tweets newer than X".

---

## Component 2: Social graph

```python
# MySQL schema (with graph cache layer)
"""
CREATE TABLE follows (
    follower_id     BIGINT NOT NULL,
    followee_id     BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL,
    PRIMARY KEY (follower_id, followee_id)
);

-- Reverse index: who follows this user (needed for fanout)
CREATE INDEX idx_followee ON follows(followee_id, follower_id);
"""

import redis

class SocialGraphService:
    def __init__(self, db, redis_client: redis.Redis):
        self.db = db
        self.redis = redis_client
        self.FOLLOWERS_CACHE_TTL = 3600  # 1 hour
    
    def get_followers(self, user_id: int) -> list[int]:
        """Get all follower IDs for a user (for fanout)."""
        cache_key = f"followers:{user_id}"
        cached = self.redis.get(cache_key)
        if cached:
            return [int(x) for x in cached.split(b',')]
        
        rows = self.db.query(
            "SELECT follower_id FROM follows WHERE followee_id = %s",
            (user_id,)
        )
        follower_ids = [row['follower_id'] for row in rows]
        
        if follower_ids:
            self.redis.setex(
                cache_key,
                self.FOLLOWERS_CACHE_TTL,
                b','.join(str(f).encode() for f in follower_ids),
            )
        
        return follower_ids
    
    def get_following(self, user_id: int) -> list[int]:
        """Get all users this user follows (for celebrity pull at read time)."""
        cache_key = f"following:{user_id}"
        cached = self.redis.get(cache_key)
        if cached:
            return [int(x) for x in cached.split(b',')]
        
        rows = self.db.query(
            "SELECT followee_id FROM follows WHERE follower_id = %s",
            (user_id,)
        )
        following_ids = [row['followee_id'] for row in rows]
        
        if following_ids:
            self.redis.setex(
                cache_key,
                self.FOLLOWERS_CACHE_TTL,
                b','.join(str(f).encode() for f in following_ids),
            )
        
        return following_ids
    
    def is_celebrity(self, user_id: int) -> bool:
        """Celebrity threshold: more than 1M followers."""
        count = self.redis.get(f"follower_count:{user_id}")
        if count:
            return int(count) > 1_000_000
        # Fallback: count from DB (expensive, but cached result)
        return False
```

---

## Component 3: Fanout service

The fanout service runs asynchronously — the tweet is committed to the DB first, then fanned out in the background.

```python
import json
import kafka

CELEBRITY_THRESHOLD = 1_000_000  # followers

class FanoutService:
    def __init__(self, redis_client: redis.Redis, graph: SocialGraphService):
        self.redis = redis_client
        self.graph = graph
        self.TIMELINE_MAX_LENGTH = 800  # keep last 800 tweet_ids per user
    
    def handle_new_tweet(self, user_id: int, tweet_id: int):
        """
        Called for every new tweet (from Kafka consumer).
        Decide: push to follower timelines, or skip (celebrity).
        """
        if self.graph.is_celebrity(user_id):
            # Skip fanout for celebrities.
            # Their tweets will be injected at read time.
            return
        
        follower_ids = self.graph.get_followers(user_id)
        
        # Write tweet_id into each active follower's timeline cache
        pipe = self.redis.pipeline(transaction=False)
        for follower_id in follower_ids:
            timeline_key = f"timeline:{follower_id}"
            
            # Sorted set: score = tweet_id (time-ordered via Snowflake)
            pipe.zadd(timeline_key, {str(tweet_id): tweet_id})
            
            # Trim to last 800 tweets (cap memory usage)
            pipe.zremrangebyrank(timeline_key, 0, -(self.TIMELINE_MAX_LENGTH + 1))
        
        pipe.execute()
    
    def invalidate_follower_cache(self, user_id: int):
        """Called when a user gains or loses followers."""
        self.redis.delete(f"followers:{user_id}")


# Kafka consumer running the fanout workers
class FanoutWorker:
    def __init__(self, fanout_service: FanoutService):
        self.consumer = kafka.KafkaConsumer(
            'new-tweets',
            bootstrap_servers=['kafka:9092'],
            group_id='fanout-workers',
            value_deserializer=lambda m: json.loads(m.decode()),
        )
        self.fanout = fanout_service
    
    def run(self):
        for message in self.consumer:
            event = message.value
            self.fanout.handle_new_tweet(
                user_id=event['user_id'],
                tweet_id=event['tweet_id'],
            )
```

---

## Component 4: Timeline service (read path)

The read path is where the hybrid model's merge happens. For each timeline request, pull the pre-built cache but also inject celebrity tweets.

```python
from dataclasses import dataclass

@dataclass
class Tweet:
    tweet_id: int
    user_id: int
    content: str
    created_at: int  # epoch ms

class TimelineService:
    def __init__(
        self,
        redis_client: redis.Redis,
        tweet_store,      # Cassandra client
        graph: SocialGraphService,
    ):
        self.redis = redis_client
        self.tweets = tweet_store
        self.graph = graph
    
    def get_home_timeline(
        self, user_id: int, cursor: int = None, limit: int = 20
    ) -> list[Tweet]:
        """
        Hybrid timeline: pre-built cache + celebrity injection.
        
        cursor: tweet_id to paginate from (older than this)
        """
        # ── Step 1: Get tweet IDs from pre-built cache ──────────────
        timeline_key = f"timeline:{user_id}"
        
        # ZREVRANGEBYSCORE: tweet_ids newer than cursor, descending
        max_score = cursor if cursor else '+inf'
        cached_ids = self.redis.zrevrangebyscore(
            timeline_key,
            max=max_score,
            min='-inf',
            start=0,
            num=limit * 2,  # fetch extra to have room after celebrity merge
        )
        cached_tweet_ids = [int(t) for t in cached_ids]
        
        # ── Step 2: Pull celebrity tweets at read time ───────────────
        celebrity_tweet_ids = self._get_celebrity_tweets(user_id, cursor)
        
        # ── Step 3: Merge and sort by tweet_id (= time order) ────────
        all_ids = sorted(
            set(cached_tweet_ids + celebrity_tweet_ids),
            reverse=True,  # newest first
        )[:limit]
        
        # ── Step 4: Hydrate tweet_ids → full Tweet objects ───────────
        return self._hydrate(all_ids)
    
    def _get_celebrity_tweets(
        self, user_id: int, cursor: int = None
    ) -> list[int]:
        """Get recent tweets from celebrities this user follows."""
        following = self.graph.get_following(user_id)
        celebrity_ids = [
            uid for uid in following
            if self.graph.is_celebrity(uid)
        ]
        
        if not celebrity_ids:
            return []
        
        # Fetch last N tweets from each celebrity's sorted set
        # Celebrity timelines are stored separately (their own user_tweets)
        tweet_ids = []
        for celeb_id in celebrity_ids:
            celeb_timeline_key = f"user_tweets:{celeb_id}"
            max_score = cursor if cursor else '+inf'
            ids = self.redis.zrevrangebyscore(
                celeb_timeline_key,
                max=max_score,
                min='-inf',
                start=0,
                num=10,  # last 10 from each celebrity
            )
            tweet_ids.extend(int(t) for t in ids)
        
        return tweet_ids
    
    def _hydrate(self, tweet_ids: list[int]) -> list[Tweet]:
        """Batch-fetch full tweet objects from Cassandra."""
        if not tweet_ids:
            return []
        
        # Multi-get by primary key — efficient in Cassandra
        rows = self.tweets.execute(
            "SELECT * FROM tweets WHERE tweet_id IN %s",
            (tuple(tweet_ids),)
        )
        
        # Preserve sort order from tweet_ids
        tweet_map = {row.tweet_id: row for row in rows}
        return [tweet_map[tid] for tid in tweet_ids if tid in tweet_map]
    
    def get_user_timeline(self, user_id: int, cursor: int = None) -> list[Tweet]:
        """
        A user's own tweets — no fanout involved.
        Read directly from their sorted set.
        """
        user_timeline_key = f"user_tweets:{user_id}"
        max_score = cursor if cursor else '+inf'
        
        tweet_ids = self.redis.zrevrangebyscore(
            user_timeline_key,
            max=max_score,
            min='-inf',
            start=0,
            num=20,
        )
        return self._hydrate([int(t) for t in tweet_ids])
```

---

## Component 5: Tweet posting (write path)

```python
import kafka

class TweetService:
    def __init__(
        self,
        tweet_store,         # Cassandra
        redis_client,
        kafka_producer,
        snowflake: SnowflakeID,
    ):
        self.tweets = tweet_store
        self.redis = redis_client
        self.kafka = kafka_producer
        self.snowflake = snowflake
    
    def post_tweet(self, user_id: int, content: str, media_urls: list = None) -> int:
        # ── Step 1: Validate ─────────────────────────────────────────
        if len(content) > 280:
            raise ValueError("Tweet exceeds 280 characters")
        
        # ── Step 2: Generate Snowflake ID ────────────────────────────
        tweet_id = self.snowflake.generate()
        
        # ── Step 3: Persist to Cassandra ─────────────────────────────
        self.tweets.execute("""
            INSERT INTO tweets (tweet_id, user_id, content, media_urls, created_at)
            VALUES (%s, %s, %s, %s, toTimestamp(now()))
        """, (tweet_id, user_id, content, media_urls or []))
        
        # Add to user's own sorted set (user timeline)
        self.redis.zadd(
            f"user_tweets:{user_id}",
            {str(tweet_id): tweet_id},
        )
        
        # ── Step 4: Emit event for async fanout ──────────────────────
        # Fanout workers consume from this topic and push to timelines
        self.kafka.send('new-tweets', {
            'user_id': user_id,
            'tweet_id': tweet_id,
        })
        
        return tweet_id
    
    def delete_tweet(self, user_id: int, tweet_id: int):
        # Soft delete: mark deleted in Cassandra
        self.tweets.execute(
            "UPDATE tweets SET is_deleted = true WHERE tweet_id = %s",
            (tweet_id,)
        )
        # Remove from user timeline
        self.redis.zrem(f"user_tweets:{user_id}", str(tweet_id))
        
        # Note: timeline caches of followers will naturally drop this
        # tweet when they next read and hydrate (is_deleted check in hydrate)
        # No need to chase and remove from 500 follower caches.
```

---

## Timeline cache design

Each user's home timeline is a Redis sorted set:

```
Key:    timeline:{user_id}
Type:   Sorted Set
Score:  tweet_id (Snowflake — time-ordered)
Member: tweet_id (as string)

Operations:
  Write: ZADD timeline:123 {tweet_id: tweet_id}  → O(log N)
  Read:  ZREVRANGEBYSCORE timeline:123 +inf 0 LIMIT 0 20  → O(log N + 20)
  Trim:  ZREMRANGEBYRANK timeline:123 0 -801      → O(log N + M)

Memory per user:
  800 tweet_ids × 16 bytes (int64 + sorted set overhead) ≈ 13KB per user
  300M users: 300M × 13KB = ~4TB timeline cache
  
  Redis: ~40 nodes × 100GB each = 4TB capacity
  
  Reality: only active users' timelines kept in cache.
  Cold start: rebuild from DB on first access.
```

```python
class TimelineCacheManager:
    TIMELINE_MAX_LENGTH = 800
    
    def rebuild_from_db(self, user_id: int):
        """
        Cold start: user hasn't accessed timeline recently.
        Rebuild by fetching recent tweets from all followed users.
        Expensive — only done on cache miss.
        """
        following = self.graph.get_following(user_id)
        
        # Fetch last 100 tweets from each followed user
        # (simplified; in practice: merge-sort from multiple sources)
        tweet_ids = []
        for followee_id in following:
            if not self.graph.is_celebrity(followee_id):
                ids = self.tweet_store.get_user_tweets(
                    followee_id, limit=100
                )
                tweet_ids.extend(ids)
        
        # Sort by tweet_id (time-ordered)
        tweet_ids.sort(reverse=True)
        timeline_entries = {
            str(tid): tid for tid in tweet_ids[:self.TIMELINE_MAX_LENGTH]
        }
        
        if timeline_entries:
            pipe = self.redis.pipeline()
            pipe.zadd(f"timeline:{user_id}", timeline_entries)
            pipe.expire(f"timeline:{user_id}", 7 * 24 * 3600)  # 7-day TTL
            pipe.execute()
```

---

## Trending topics

Trending topics require knowing which hashtags have the highest tweet velocity in the last N minutes — a streaming aggregation problem.

```python
from collections import defaultdict
import heapq
import re

class TrendingService:
    """
    Real approach: process tweet stream with a sliding window counter.
    We use a 1-minute tumbling window with Redis sorted sets.
    """
    
    WINDOW_MINUTES = 60  # Trending = last 60 minutes
    
    def on_tweet_posted(self, content: str, timestamp: int):
        hashtags = self._extract_hashtags(content)
        if not hashtags:
            return
        
        # Current minute bucket (Unix timestamp / 60)
        bucket = timestamp // 60
        
        pipe = self.redis.pipeline()
        for tag in hashtags:
            # Increment count in current minute bucket
            key = f"trends:{bucket}"
            pipe.zincrby(key, 1, tag)
            pipe.expire(key, self.WINDOW_MINUTES * 60 + 120)  # keep slightly longer
        pipe.execute()
    
    def get_trending(self, top_n: int = 10) -> list[tuple[str, int]]:
        """Get top N trending hashtags over the last WINDOW_MINUTES."""
        now = int(time.time())
        current_bucket = now // 60
        
        # Collect all buckets in the window
        buckets = [
            f"trends:{current_bucket - i}"
            for i in range(self.WINDOW_MINUTES)
        ]
        
        # Aggregate counts across all buckets
        # ZUNIONSTORE merges sorted sets by summing scores
        temp_key = f"trends:aggregated:{current_bucket}"
        self.redis.zunionstore(temp_key, buckets)
        self.redis.expire(temp_key, 120)  # 2-minute cache on aggregated result
        
        # Get top N
        results = self.redis.zrevrangebyscore(
            temp_key, '+inf', '-inf',
            start=0, num=top_n, withscores=True
        )
        return [(tag.decode(), int(score)) for tag, score in results]
    
    def _extract_hashtags(self, content: str) -> list[str]:
        return [tag.lower() for tag in re.findall(r'#(\w+)', content)]
```

---

## The celebrity problem in detail

```
Normal user (500 followers):
  Post tweet → Kafka → Fanout worker → 500 ZADD operations
  Time: ~50ms async, user doesn't wait

Celebrity (50M followers):
  Post tweet → Kafka → Fanout worker
  → 50M ZADD operations = hours of work
  → Follower #49,999,999 sees tweet 3 hours late
  → Unacceptable

Real solutions:

1. Skip fanout for celebrities (Twitter's approach)
   → Celebrity tweets are NOT pushed to follower timelines
   → At read time: fetch recent tweets from followed celebrities + merge
   → Trade-off: slightly higher read latency, but bounded and predictable

2. Pre-shard celebrity fanout
   → Divide followers into shards of 10,000
   → Multiple workers process shards in parallel
   → Still writes 50M cache entries, but completes faster

3. Hybrid threshold
   → <1M followers: push fanout
   → >1M followers: pull at read time
   
   Twitter uses a variant of this. The threshold shifts based on
   how active the user is — inactive celebrities don't get push fanout
   even with fewer followers.
```

---

## Handling out-of-order and delayed tweets

```
Scenario:
  Tweet posted at T=0
  Fanout completes at T=5s (500 followers, each got the tweet)
  Timeline read at T=3s (before fanout completes for some followers)
  → User opens timeline, tweet not there yet
  → User refreshes → tweet appears
  
  This is acceptable — eventual consistency for non-critical social data.

Scenario 2: Server clock skew
  Two servers have different system clocks
  Tweet from Server A at "10:00:00.000"
  Tweet from Server B at "09:59:59.999" (1ms behind)
  Server B's tweet sorts BEFORE Server A's even though it came after
  
  Solution: Snowflake IDs generated per-machine with sequence numbers
  guarantee monotonic ordering within a machine. Cross-machine ordering
  is approximate (within ~1ms), which is acceptable for social feeds.
```

---

## AWS architecture

```
Client (web / iOS / Android)
    │
    ├─ API Gateway + CloudFront (cache public content)
    │
    ├─ Tweet Service (ECS Fargate)
    │   Write tweets → Aurora Cassandra (Aurora replaces Cassandra in small deploys)
    │   OR: self-managed Cassandra cluster on EC2
    │                       │
    │                       ├─ Kafka (MSK) ── Fanout Workers (ECS)
    │                       │                 Push to ElastiCache Redis
    │                       │
    │                       └─ Snowflake ID Generator (Lambda or sidecar)
    │
    ├─ Timeline Service (ECS Fargate)
    │   Read from ElastiCache Redis (timeline cache)
    │   Merge with celebrity tweets (pulled live)
    │   Hydrate from Cassandra
    │
    ├─ Social Graph Service (ECS Fargate)
    │   Follow/unfollow → RDS Aurora MySQL (OLTP, relational)
    │   Follower lookups → ElastiCache Redis (cache)
    │
    ├─ Trending Service (ECS Fargate)
    │   ZINCRBY on ElastiCache Redis per hashtag per minute
    │   ZUNIONSTORE for aggregation
    │
    └─ Media Upload
        Presigned S3 URL (client uploads direct, no proxy)
        CloudFront CDN serves images/videos

Scalability:
  Fanout Workers: autoscale based on Kafka consumer lag
  Timeline Redis: cluster mode, ~40 shards (one per user_id hash range)
  Social Graph: read replicas for follower lookups
```

---

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. **The fan-out problem** — write fan-out is O(followers) per tweet. For celebrities, this is untenable. Hybrid model (push for regular, pull for celebrities) is the standard answer
    2. **Snowflake IDs** — time-ordered unique IDs mean tweet_id itself encodes time. No need for a separate `created_at` index in Cassandra range queries. Also enables globally unique IDs without a central counter
    3. **Redis sorted sets for timelines** — score = tweet_id. `ZREVRANGEBYSCORE` gives paginated timeline reads in O(log N). Trim with `ZREMRANGEBYRANK` to cap memory per user
    4. **Async fanout via Kafka** — post returns immediately; followers receive tweets seconds later. Acceptable eventual consistency for social feeds. Kafka's consumer groups allow multiple fanout workers to process in parallel
    5. **Celebrity detection at read time** — celebrities' tweets are injected at read time by fetching their recent tweets directly. This bounds the worst-case write amplification at the cost of slightly higher read latency (one extra Redis fetch per celebrity followed)
    6. **Trending via sliding window in Redis** — ZINCRBY per hashtag per minute bucket, ZUNIONSTORE across last 60 buckets for aggregation. Entire trending computation in Redis, no separate analytics DB needed for this use case

## Related topics

- [Messaging & Pub/Sub](../messaging/pub-sub.md) — Kafka fanout queue
- [Caching](../caching/index.md) — Redis sorted sets for timeline storage
- [News Feed](news-feed.md) — similar problem with different constraints (Facebook-style graph)
- [Notification Service](notification-service.md) — push notifications when followers post
- [CRDTs](../distributed/crdts.md) — counters for like/retweet counts across regions
