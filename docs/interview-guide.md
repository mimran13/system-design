# System Design Interview Guide

The 45-minute framework used by candidates who pass senior/staff system design rounds. This isn't about memorizing designs — it's about running a structured conversation that shows you think like a senior engineer.

---

## The 45-minute structure

```
0:00 – 0:05   Clarify requirements           (5 min)
0:05 – 0:08   Estimate scale                 (3 min)
0:08 – 0:18   High-level design              (10 min)
0:18 – 0:38   Deep dives                     (20 min)
0:38 – 0:45   Wrap-up, trade-offs, evolution (7 min)
```

Each phase has a different goal. Skipping or rushing a phase is a common failure mode.

---

## Phase 1: Clarify requirements (5 min)

**Goal:** Scope the problem before touching any design. You cannot design what you haven't defined.

### What to ask

**Functional requirements** — what does it actually do?
```
"Before I start designing, I want to make sure I understand the scope.
 Can you confirm the core features we need to support?

 For example, for a ride-sharing system:
 - Matching riders to drivers?              ← confirm
 - Real-time location tracking?             ← confirm
 - Payments?                                ← out of scope?
 - Driver ratings and reviews?              ← out of scope?
 - Scheduling future rides?                 ← out of scope?"
```

**Non-functional requirements** — the hidden constraints that drive every design decision:
```
Scale:
  "How many daily active users?"
  "What's the expected QPS? Read/write ratio?"

Latency:
  "Is there a latency requirement? Is sub-100ms important, or is
   eventual delivery acceptable?"

Consistency vs availability:
  "If two users see slightly different data briefly, is that okay?
   (e.g., news feed) Or does data need to be immediately consistent?
   (e.g., bank balance)"

Durability:
  "What happens if we lose a message or event? Is that catastrophic
   or acceptable?"

Geography:
  "Global distribution, or single region?"
```

### What interviewers are looking for

They want to see that you **don't just jump in**. The ability to scope is itself a senior skill — junior engineers start designing before they understand the problem. Asking good questions signals you've been burned by under-specified requirements in real life.

**What to avoid:**
- Asking too many questions (analysis paralysis)
- Questions that don't affect the design ("What database does the client use?")
- Restating the problem without adding clarification

---

## Phase 2: Estimate scale (3 min)

**Goal:** Derive the numbers that constrain your architecture. You're not looking for precision — you're looking for the right **order of magnitude**.

### The numbers that matter

```
DAU → QPS:
  100M DAU, user does action 10x/day
  → 1B actions/day ÷ 86,400s = ~11,500 QPS (peak 2-3x = 35K QPS)

Write QPS → Storage:
  10K writes/sec × 1KB per record
  = 10MB/sec = 864GB/day = ~300TB/year

Read:write ratio determines caching strategy:
  100:1 → heavy read caching (CDN, Redis)
  1:1   → write path is equally important

Bandwidth:
  100K requests/sec × 100KB response = 10GB/sec
  → Need CDN or significant bandwidth provisioning
```

### How to present it

Do it **out loud** so the interviewer follows your reasoning. State assumptions explicitly:

```
"Let me do a quick back-of-envelope.

 Assuming 300M DAU, each user posts 2 tweets and reads
 100 tweets per day.
 
 Writes: 300M × 2 / 86,400 ≈ 7,000 TPS
 Reads:  300M × 100 / 86,400 ≈ 350,000 TPS
 Read-to-write ratio: ~50:1 — this is heavily read-optimized.
 
 Storage: 7,000 TPS × 1KB per tweet × 86,400s ≈ 600GB/day.
 5 years: ~1PB raw tweet data.
 
 This tells me we need: read-heavy caching, probably a 
 CDN for static assets, and blob storage for media."
```

The estimation should **drive your design decisions**. If you do the math and never reference it again, you've wasted the time.

---

## Phase 3: High-level design (10 min)

**Goal:** Draw the skeleton — the 5-7 boxes that represent the system, with data flowing between them. This is the map your deep dives will explore.

### What to draw

```
Client
  │
  ├── API Gateway / Load Balancer
  │
  ├── Core Services (what handles requests?)
  │
  ├── Data stores (where does data live?)
  │
  ├── Async workers / queues (what happens in the background?)
  │
  └── External integrations (CDN, blob storage, notifications)
```

### How to walk through it

Don't just draw silently. Narrate the request flow:

```
"A user opens the app. The request hits the load balancer,
 which routes to one of our API servers.
 
 For a read (timeline fetch): the API server checks Redis
 first — if the timeline is cached, we return it immediately.
 Cache miss → fetch from Cassandra → populate cache → return.
 
 For a write (new tweet): we persist to Cassandra, add the
 tweet_id to the user's sorted set in Redis, then publish
 an event to Kafka. Fanout workers consume from Kafka and
 push the tweet_id into each follower's timeline cache."
```

### Common high-level components

| Component | When to use |
|---|---|
| Load balancer / API Gateway | Always — entry point for traffic |
| Cache (Redis) | Read-heavy data, session state, leaderboards |
| Message queue (Kafka/SQS) | Async work, fanout, event sourcing |
| CDN | Static assets, media, geographically distributed users |
| Blob storage (S3) | Files, images, videos, backups |
| Search engine (Elasticsearch) | Full-text search, autocomplete |
| SQL (PostgreSQL, MySQL) | Structured relational data, strong consistency needed |
| NoSQL (Cassandra, DynamoDB) | High write throughput, wide distribution, flexible schema |

---

## Phase 4: Deep dives (20 min)

This is where senior candidates separate themselves. You need to go **deep on 2-3 components** — not just describe them, but explain the problem, the solution, and the trade-offs.

### How to structure a deep dive

For each component, answer:
1. **What problem does this component solve?**
2. **What's the naive solution and why does it fail at scale?**
3. **What's the better solution?**
4. **What are the trade-offs?**

```
Example: Fan-out for Twitter

"The naive approach is fan-out on write: when a user tweets,
 we write that tweet_id to every follower's timeline cache.
 
 For normal users (500 followers), that's 500 writes — totally fine.
 But for celebrities with 50M followers, a single tweet triggers
 50M cache writes. That takes hours and followers see the tweet
 too late.
 
 The solution Twitter uses is a hybrid:
 - Regular users: fan-out on write (push to follower caches immediately)
 - Celebrities (>1M followers): skip the push; inject their tweets
   at read time by fetching their recent posts and merging
 
 The trade-off: read path is slightly more complex — you now need
 to check who the user follows, identify celebrities, fetch their
 recent tweets, and merge with the pre-built cache. But this is
 bounded work: you know exactly how many celebrities a user follows."
```

### Picking what to deep-dive

The interviewer may guide you, but if they don't: **pick the components unique to this problem**. Don't deep-dive the load balancer — that's in every system. Deep-dive what makes this system hard.

```
Twitter:       fan-out + timeline generation
Dropbox:       chunking + block deduplication
Chat:          message ordering + WebSocket routing
URL Shortener: collision-free ID generation + redirect latency
Ride-sharing:  geo-matching + driver location updates
```

### Topics that always come up in deep dives

**Data modeling:**
- How is data stored? What's the schema?
- What are the access patterns? (Drives DB choice)
- How do you handle versioning/history?

**Scaling the write path:**
- Sharding strategy (by user_id? by time?)
- Async vs synchronous operations
- Write amplification problems

**Scaling the read path:**
- Caching strategy (what to cache, eviction, invalidation)
- Read replicas
- CDN for static/semi-static data

**Failure handling:**
- What happens if a component goes down?
- How do you avoid data loss?
- Retry/idempotency strategy

**Consistency:**
- Strong vs eventual — what does this system require?
- Where are the consistency boundaries?

---

## Phase 5: Wrap-up (7 min)

**Goal:** Show awareness of what you didn't address and what you'd improve.

### What to cover

```
"Let me quickly summarize the key decisions we made:

 1. Cassandra for tweet storage — append-only, high write throughput,
    time-series access pattern fits well.
 
 2. Redis sorted sets for timelines — O(log N) writes and reads,
    natural pagination with ZREVRANGEBYSCORE.
 
 3. Hybrid fan-out — push for regular users, pull for celebrities.
    Prevents write amplification at the cost of slightly more complex
    read path.
 
 If I had more time, I'd want to address:
 
 - Trending topics in more detail — I mentioned Redis sliding windows
   but didn't cover the Kafka Streams aggregation that handles this
   at full scale.
 
 - Data retention and cold storage — moving old tweets to S3 Glacier
   after 90 days.
 
 - Geo-distribution — right now the design is single-region. Global
   users would need multi-region with regional read replicas and
   eventual consistency between regions."
```

### Trade-off discussion

Interviewers at senior/staff level will push back on your decisions. Prepare to defend them while acknowledging the trade-offs:

```
Interviewer: "Why not use SQL instead of Cassandra for tweets?"

Bad answer:  "Cassandra is better for this use case."

Good answer: "SQL would work at moderate scale and gives us
              stronger consistency guarantees. The reason I
              chose Cassandra is the write throughput requirement —
              7,000 TPS of tweet writes plus fanout operations
              starts to strain a single PostgreSQL primary.
              
              Cassandra's multi-master, no-single-coordinator
              model handles high writes well. The trade-off is
              weaker consistency — no joins, limited query patterns.
              But tweets are immutable and accessed by primary key
              or time range, which fits Cassandra perfectly.
              
              If our scale were lower (say 1M DAU), PostgreSQL
              with read replicas would be my first choice — simpler
              operational model."
```

---

## Common failure modes

These are the patterns that cause candidates to fail:

### Jumping to solutions before understanding the problem
```
Interviewer: "Design a notification system"
Bad:  "Okay, so we'll use Kafka and have consumers that..."
Good: "Before I start — are we talking push notifications to mobile,
       email, SMS, or all of the above? And what's the scale —
       are we sending 1M/day or 1B/day?"
```

### Over-engineering the happy path, ignoring failure
```
Bad:  Designs the perfect write path, then says
      "and for reliability, we just add retries"
Good: Explicitly addresses: what if the DB is down?
      What if Kafka consumer falls behind?
      What if a fanout worker crashes mid-operation?
```

### Premature database choice
```
Bad:  "We'll use MongoDB" (with no justification)
Good: "The access pattern is key-value lookups by user_id with
       high write throughput and no joins needed → that points
       toward DynamoDB or Cassandra. I'll use DynamoDB here because
       it's fully managed and we don't need Cassandra's
       multi-datacenter topology."
```

### Not finishing (running out of time on phase 1 or 2)
Interviews fail when candidates spend 15 minutes on requirements and never get to the design. Use a timer mentally:
- Requirements: hard stop at 5 min. Pick the 3 most important clarifications.
- Estimation: hard stop at 8 min. Get to the high-level design.

### Silence
Interviewers cannot give you credit for thinking they can't see. Narrate everything:
```
"I'm thinking about whether to use a push or pull model here.
 Push is simpler to implement but creates write amplification
 for large follower counts... I'll go with hybrid."
```

---

## What interviewers actually evaluate

| Signal | What it looks like |
|---|---|
| **Problem decomposition** | Can you break a vague problem into clear, buildable components? |
| **Breadth** | Do you know the standard tools and when to use them? |
| **Depth** | Can you go deep on the components that matter for this problem? |
| **Trade-off awareness** | Do you acknowledge alternatives and explain why you chose what you did? |
| **Scale thinking** | Do your decisions change as scale increases? |
| **Communication** | Can you explain your reasoning while drawing? Are you collaborative? |

Senior engineers are expected to show **depth** on 2-3 components. Staff engineers are expected to additionally show **system-wide thinking** — how components interact, what happens at failure boundaries, how the system evolves.

---

## The single most common mistake

**Designing a system that works, but not the system that was asked for.**

If you're asked to design Twitter and your design handles 10K DAU, you've failed even if the design is technically correct. Always return to your scale estimates and check: "does my design actually handle 350,000 read TPS?"

---

## Quick reference: numbers to memorize

```
Powers of 10:
  1K = 10³    1M = 10⁶    1B = 10⁹    1T = 10¹²

Time:
  1 day   = 86,400 seconds  (≈ 10⁵)
  1 month = 2.5M seconds    (≈ 2.5 × 10⁶)
  1 year  = 31.5M seconds   (≈ 3 × 10⁷)

Storage:
  1 char = 1 byte
  1 UUID = 36 bytes
  1 tweet = ~300 bytes
  1 image = 200KB–2MB
  1 video (1 min, 720p) = ~150MB

Latency (approximate):
  L1 cache:        0.5ns
  RAM:             100ns
  SSD:             100μs
  Network (DC):    1ms
  Network (WAN):   100ms
  
QPS rules of thumb:
  "Active" user = 10 actions/day
  100M DAU × 10 = 1B/day ÷ 86,400 ≈ 12K QPS (avg)
  Peak = 3× average = 35K QPS
  
Replication factor 3 (standard):
  Store 3 copies, tolerate 1 node failure with quorum reads
```

---

## Template: requirements checklist

Print this mentally at the start of every interview:

```
Functional requirements:
  □ Core features confirmed (not assumed)
  □ Out-of-scope features explicitly parked

Non-functional requirements:
  □ Scale (DAU, QPS)
  □ Latency target (P99, P999)
  □ Consistency requirement (strong vs eventual)
  □ Availability target (99.9% vs 99.99%)
  □ Data durability (can we lose any data?)
  □ Geography (single region vs global)

Design checklist:
  □ Read path designed
  □ Write path designed
  □ Failure modes addressed
  □ Data model shown
  □ Scale bottlenecks identified
  □ Key trade-offs acknowledged
```
