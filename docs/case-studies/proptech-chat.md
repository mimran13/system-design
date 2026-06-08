---
tags:
  - applied
  - interview-critical
  - for-scale
---

# Proptech Chat (Buyer ↔ Seller)

## The problem

Build a chat feature inside a proptech app.

- **50M registered users** total
- **1M DAU** using chat to communicate
- Buyers chat with sellers about listings
- Sidebar shows recent conversations + per-conversation unread count
- **Sellers respond slowly → buyers drop off** (this is the business problem, not just a feature)
- Deployment target: k8s, ECS / Cloud Run, or self-managed servers — interviewer wants us to choose with rationale

The requirements are deliberately incomplete. Half the score is on what you ask.

## Clarifying questions (state them out loud)

| Question | Why it matters |
|---|---|
| 1:1 only, or also group (buyer + seller + agent)? | Fan-out + storage model |
| Are conversations scoped per listing, or per user pair? | Affects conversation key + UX |
| Read receipts and typing indicators required? | Affects RTT / event volume |
| Attachments (images of property documents)? | Adds blob storage + scanning |
| Message retention policy? | GDPR, storage cost, retention TTL |
| Need full-text search across history? | Adds Elasticsearch / OpenSearch |
| Multi-region or single region? | Latency budget + consistency strategy |
| Web + mobile, or mobile only? | Push channels, WS reconnect strategy |

I'll proceed with these defaults: **1:1 conversations scoped per listing**, read receipts yes, typing indicators yes, attachments yes (images), 2-year retention, search yes, single primary region (one DR region), web + iOS + Android.

## Requirements

### Functional

- Send and receive 1:1 text messages between buyer and seller, scoped to a listing
- Real-time delivery to online recipients; push notification to offline
- Sidebar inbox: recent conversations sorted by `last_message_at`
- Per-conversation unread count + total unread badge
- Read receipts (delivered, read)
- Typing indicators
- Attachments (images, ≤10 MB) via signed URLs to object storage
- Message history with infinite scroll
- Search within and across conversations
- Block / report user
- **Seller SLA + drop-off mitigation**: nudge slow sellers, fallback paths for buyers (the proptech-specific part)

### Non-functional

| Attribute | Target |
|---|---|
| **Message send → delivered to online recipient p99** | < 300 ms |
| **Message durability** | No message loss after server ack |
| **Per-conversation ordering** | Strict |
| **Read availability** | 99.95% |
| **Write availability** | 99.9% (degraded mode acceptable: queue + deliver later) |
| **Inbox load p99** | < 200 ms |
| **Privacy** | Only participants + admins (audit-gated) see content |

## Capacity estimation

```
Users: 50M registered, 1M DAU
Assume avg 20 messages per DAU per day  → 20M messages/day
                                       → ~230 messages/sec average
Peak factor 5x                          → ~1.2K messages/sec peak

Active conversations: ~3M (DAU × avg open threads)
Concurrent WebSocket connections at peak: ~150K
  (DAU × ~15% open at peak hour)

Message size avg ~500 B (text + metadata)
Daily storage: 20M × 500 B ≈ 10 GB/day
Yearly: ~3.6 TB/year (messages only, before replication)

Inbox reads: each DAU opens app ~5x → 5M sidebar loads/day → ~60 RPS avg, ~300 peak
Unread count reads: every app foreground → ~10M/day → 120 RPS avg, ~600 peak
```

These numbers are modest. The interesting design problems are **shape**, not raw scale: real-time delivery, ordering, unread accuracy, the SLA pipeline, and WebSocket operations.

## High-level architecture

```mermaid
graph TD
    subgraph Clients
        Web[Web app]
        iOS[iOS app]
        Android[Android app]
    end

    Clients --> ALB[ALB / API Gateway]
    ALB --> REST[REST API<br/>chat-api service]
    ALB --> WS[WebSocket Gateway<br/>chat-ws service]

    REST --> Auth[Auth / Identity]
    REST --> ConvDB[(Conversations<br/>Postgres)]
    REST --> MsgDB[(Messages<br/>DynamoDB)]
    REST --> Cache[(Redis<br/>unread + inbox + presence)]
    REST --> S3[(S3<br/>attachments)]

    WS <--> Cache
    WS --> Bus[Redis Pub/Sub<br/>cross-pod fanout]
    Bus --> WS

    REST -->|message events| Kafka[Kafka]
    Kafka --> Nudge[Nudge / SLA service<br/>Temporal workflows]
    Kafka --> Search[Search indexer<br/>OpenSearch]
    Kafka --> Analytics[Analytics → warehouse]
    Kafka --> NotifSvc[Notification service]

    Nudge --> NotifSvc
    NotifSvc --> SNS[SNS / FCM / APNs]
    NotifSvc --> Email[SES]

    AI[AI assistant service] -.optional reply.-> REST
    Nudge -.escalate.-> AI
```

The split into **chat-api** (request/response) and **chat-ws** (long-lived) is intentional. Stateless REST scales differently from stateful WebSockets; mixing them in one pod makes the WS deployment story painful.

## Component breakdown

| Service | Responsibility | Stateful? |
|---|---|---|
| **chat-api** | REST: send message, list conversations, mark read, presigned URL for attachments | Stateless |
| **chat-ws** | WebSocket gateway: maintain connections, push events to clients | Stateful (connection registry) |
| **presence-svc** | Track who's online; backed by Redis with TTL keys | Stateless |
| **nudge-svc** | Temporal workflows: SLA timers, escalation ladder | Stateless (state in Temporal) |
| **notification-svc** | Send push/email; manages tokens, quiet hours, dedup | Stateless |
| **search-indexer** | Consume Kafka → index to OpenSearch | Stateless |
| **moderation-svc** | Async toxicity / spam / scam detection on each message | Stateless |
| **ai-assistant** (optional) | Auto-acknowledgment, FAQ, hand-off summaries | Stateless |

## Data model + storage choices

This is the section interviewers care about most. Every choice has a reason.

### Conversations metadata → **PostgreSQL**

```sql
CREATE TABLE conversations (
    id              UUID PRIMARY KEY,
    listing_id      UUID NOT NULL REFERENCES listings(id),
    buyer_id        UUID NOT NULL REFERENCES users(id),
    seller_id       UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,
    status          TEXT NOT NULL DEFAULT 'active',  -- active|archived|blocked
    sla_state       TEXT,                            -- ok|nudged|escalated|abandoned
    UNIQUE (listing_id, buyer_id, seller_id)
);
CREATE INDEX ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX ON conversations (seller_id, last_message_at DESC);
```

**Why Postgres:**

- Conversation metadata is **relational** (joins to users, listings) and modestly sized (a few hundred million rows max).
- Needs strong consistency: creating a conversation must be unique per (listing, buyer, seller); a NoSQL upsert with conditional write is doable but Postgres is simpler.
- Joinable to `listings` table for admin / reporting queries.
- The query "give me my last 50 conversations sorted by last_message_at" is a textbook indexed Postgres query.

**Why not put it in DynamoDB:** we'd lose joins, and we'd still need a unique constraint on (listing, buyer, seller).

### Messages → **DynamoDB** (alternative: Cassandra)

```
Table: messages
  Partition Key: conversation_id              (UUID)
  Sort Key:      message_id                   (ULID — time-sortable)

Item:
  conversation_id, message_id,
  sender_id, body, attachment_keys[],
  created_at, server_received_at,
  delivered_to[], read_by[],
  client_message_id   (idempotency)
```

**Why DynamoDB:**

- **Write-heavy, time-ordered, partitioned by conversation** — the textbook DynamoDB shape. Partition key gives natural sharding; sort key (ULID) gives chronological reads.
- Managed: no Cassandra cluster ops at our scale (3.6 TB/year is comfortable).
- **DynamoDB Streams** for free: feeds Kafka via Lambda → search indexer, analytics, nudge SLA, notifications.
- **TTL** for retention: set a TTL attribute = `created_at + 2y`; DynamoDB auto-expires. No nightly cleanup job.
- Conditional write on `client_message_id` gives free idempotency for retries.
- Pay-per-request mode handles peakiness naturally.

**Why not Postgres for messages:** at 7-10 GB/day growing, you'd need partitioning + a sharding strategy within a year. We'd be reinventing what DynamoDB already does.

**Why Cassandra is the alternative:** the classic FAANG choice (Discord, FB Messenger). Better for self-managed deployments, exact same access pattern. Pick Cassandra if you're already running it or want to avoid AWS lock-in. For this design — managed wins.

**Hot partition risk:** a celebrity seller's listing could become hot. Mitigation: cap conversations per listing, allow a sub-partition key (`conversation_id#bucket`) if a single conversation ever crosses ~3K writes/sec — not realistic for 1:1 chat.

### Unread counters → **Redis** (hash per user)

```
HKEY: user:{user_id}:unread
  field: {conversation_id} → integer

HKEY: user:{user_id}:unread_total → integer
```

**Why Redis:**

- Atomic `HINCRBY` (per conversation) + `INCR` (total) on every new message: sub-ms.
- Read on app foreground is the most frequent read in the system (every app open). Postgres would buckle under it; DynamoDB is fine but pricier and slower than Redis.
- **Rebuildable** from messages table if Redis is lost: this is the deciding factor — Redis is a cache for derived state, not source of truth.

**Persistence:** AOF every second + RDB snapshots; we tolerate seconds of count drift (rebuilt by background job).

### Inbox feed → **Redis Sorted Set** (with Postgres as authoritative source)

```
ZKEY: user:{user_id}:inbox
  score: last_message_at (epoch ms)
  member: conversation_id

ZRANGEBYSCORE for paging the sidebar — top 50 with newest first.
```

**Why:** sidebar load is hot path; Postgres can serve it but at 600 RPS for inbox + filters it's wasteful. Redis sorted set gives O(log N) inserts and O(log N + M) range reads. On cache miss, hydrate from Postgres.

### Attachments → **S3** (presigned URLs, CDN for delivery)

- Client requests presigned PUT URL from chat-api; uploads direct to S3.
- chat-api stores `attachment_keys[]` in the message.
- Read goes through CloudFront for delivery + signed URL with short TTL.
- Async scan via Lambda (image moderation, malware) before marking as deliverable.

### Connection registry (which WS pod a user is connected to) → **Redis**

```
SET KEY: presence:{user_id} → "pod-7"   TTL 60s, heartbeat refreshes
SET KEY: pod:{pod_id}:users  → SADD users
```

**Why Redis:** WS pod lookups happen on every message routing. Has to be hot. TTL gives us automatic GC when a pod dies.

### Async event backbone → **Kafka**

Topics:

- `chat.message.created` — every new message; consumers: notifications, nudge, indexer, analytics
- `chat.message.read` — read receipts; consumers: nudge (cancels SLA timers), analytics
- `chat.conversation.created` — for analytics
- `chat.sla.event` — nudges/escalations emitted by nudge-svc

**Why Kafka:** ordered per partition (per conversation), durable, replayable for backfilling new consumers, multiple decoupled consumers. See [Event Streaming Maturity](../messaging/event-streaming-maturity.md).

### Search → **OpenSearch**

- Indexed from `chat.message.created` Kafka topic
- Per-user ACL filter at query time
- 90-day search window (older is rare, costly to keep indexed)

### Storage choice summary table

| Data | Store | Why this and not the others |
|---|---|---|
| Conversations metadata | Postgres | Relational, joins, modest size, ACID for participant uniqueness |
| Messages | DynamoDB | Conversation-partitioned, time-sorted, TTL, Streams, managed |
| Unread counters | Redis (hash) | Sub-ms reads, atomic increments, rebuildable from messages |
| Inbox feed | Redis (sorted set) + Postgres backup | Hot read path; Postgres for hydration |
| Attachments | S3 + CloudFront | Right tool; presigned URLs avoid proxying through API |
| Presence / connection map | Redis (TTL keys) | Routing lookups must be sub-ms; auto-GC via TTL |
| Async events | Kafka | Ordered per conv, durable, multi-consumer |
| Search | OpenSearch | Inverted index for FTS; fed from Kafka |
| SLA / workflow state | Temporal | Durable workflows with timers (alt: own scheduler) |

## Where clients actually connect (the networking story)

The high-level diagram says "Clients → ALB → chat-ws". That hides a lot. Two questions matter:

1. **Where does the WebSocket TCP connection actually terminate?** Not at the ALB — at one specific `chat-ws` pod.
2. **If user A is connected to pod-1 and user B is connected to pod-7, how does a message from A reach B?** Through a shared bus (Redis Pub/Sub in our design).

### VM deployment vs k8s deployment — what changes

```mermaid
graph TD
    subgraph VM["VM / self-managed (the simple mental model)"]
        C1[Client] -.WSS.-> LB1[Load Balancer<br/>HAProxy / NGINX / ALB]
        LB1 --> N1[node-1<br/>node app :3000]
        LB1 --> N2[node-2<br/>node app :3000]
    end

    subgraph K8S["Kubernetes (what really happens)"]
        C2[Client] -.WSS.-> ALB2[AWS ALB<br/>public endpoint]
        ALB2 --> IC[Ingress Controller<br/>or Service of type LoadBalancer<br/>backing the chat-ws Service]
        IC --> SVC[chat-ws Service<br/>ClusterIP + Endpoints]
        SVC --> PA[Pod A<br/>chat-ws:8080]
        SVC --> PB[Pod B<br/>chat-ws:8080]
        SVC --> PC[Pod C<br/>chat-ws:8080]
    end
```

In a plain VM deployment the LB picks a Node, the OS picks a process, and your Node.js app's `httpServer.on('upgrade', ...)` handles the WebSocket. Easy mental model.

In k8s, the **same thing happens**, but there are more layers between the client and your process:

| Layer | Role | What it does for WebSockets |
|---|---|---|
| **AWS ALB** (or NLB) | Public entrypoint, TLS termination | Holds the TLS, forwards HTTP/1.1 Upgrade to the target group |
| **Ingress / LoadBalancer Service** | k8s glue to the cloud LB | Tells AWS "send traffic to these pods on this port" |
| **chat-ws Service** (ClusterIP) | Stable virtual IP + list of pod IPs | The Service has an `Endpoints` (or `EndpointSlice`) list of pod IPs |
| **kube-proxy / CNI** | iptables or IPVS rules on each node | Routes the connection to one specific pod |
| **chat-ws pod (your Node.js app)** | Accepts the upgrade, holds the WebSocket | This is where the long-lived TCP socket actually lives |

The client thinks it's connected to `wss://chat.example.com`. The TCP socket is actually pinned to one specific pod's IP from the moment of the Upgrade. The ALB cannot move it later. **That's the whole reason cross-pod delivery has to exist.**

### The ALB and stickiness — what you must configure

```
- ALB target group: target type = "ip" (so it routes directly to pod IPs)
  → without this, ALB sees only Node IPs and double-hops via kube-proxy
- Listener: HTTPS:443 with TLS cert
- Protocol forwarded: HTTP/1.1 (WebSocket requires it; HTTP/2 is fine but
  ALB→target should be HTTP/1.1 for WS frames)
- Idle timeout: at least 300s (default is 60s — kills idle WS)
- Stickiness: app cookie OR target group stickiness (duration-based cookie)
  → reconnects land on the same pod when possible
```

Stickiness is a *latency optimization*, not a correctness requirement. The design works even if every reconnect lands on a different pod, because pods don't store anything you can't rebuild from Redis.

### How one pod knows about users on another pod

Two designs are common. We're using **(1)** because it's the simplest correct option at our scale.

```mermaid
graph LR
    subgraph Option1["Option 1: Redis Pub/Sub (broadcast)"]
        PA1[Pod A<br/>holds user A's WS] -->|PUBLISH conv:42| RP[Redis Pub/Sub]
        RP -->|fanout| PB1[Pod B<br/>holds user B's WS]
        RP -->|fanout| PC1[Pod C<br/>holds nobody for conv:42<br/>filters and drops]
    end

    subgraph Option2["Option 2: Presence-aware direct routing"]
        PA2[Pod A] -->|GET presence:userB → pod-B| Pres[(Redis presence)]
        PA2 -->|HTTP POST /push| PB2[Pod B<br/>holds user B's WS]
    end
```

| Option | Pros | Cons |
|---|---|---|
| **Pub/Sub (broadcast)** | Simple. Pods are stateless about peers. Naturally handles multiple recipients in a group convo. | Every event hits every pod; doesn't scale to 100K+ msgs/sec on Redis Pub/Sub |
| **Presence-aware** | Direct, no wasted fanout, scales further | Extra Redis lookup per message, harder when recipient connects to two devices on two pods, more failure modes |

At our scale (~1.2K msgs/sec peak), Redis Pub/Sub is fine. The switch point is around 50-100K msgs/sec on a single Redis node — at that point move to NATS, or to direct routing via gRPC between pods.

### Channel design for pub/sub

Pods don't subscribe to every channel that exists — that would be wasteful. They subscribe only to channels they have a local connection for.

```
Pod A holds WS for user_42
  → user_42 is in conversations: conv:100, conv:101, conv:200
  → Pod A: SUBSCRIBE conv:100  conv:101  conv:200

When user_42 disconnects (or moves to another pod after reconnect):
  → Pod A: UNSUBSCRIBE the channels no other local user needs
```

A `chat-ws` pod tracks two in-memory tables:

```
connections: { user_id → [WebSocket connection objects] }   // one user can be on 2 devices
channels:    { conv_id → ref_count }                        // how many local users care
```

On connect: load user's recent conversations from Postgres / Redis, increment `channels[conv_id]`, `SUBSCRIBE` if count went 0→1.
On disconnect: decrement, `UNSUBSCRIBE` if count went 1→0.

### Full path: user A on Pod 1 sends a message to user B on Pod 7

```mermaid
sequenceDiagram
    autonumber
    participant CA as Client A
    participant ALB as AWS ALB
    participant P1 as Pod 1 (chat-ws)
    participant API as chat-api pod
    participant DDB as DynamoDB
    participant R as Redis (counters + Pub/Sub)
    participant P7 as Pod 7 (chat-ws)
    participant CB as Client B

    Note over CA,P1: Connection setup (one time, persists)
    CA->>ALB: WSS handshake to chat.example.com
    ALB->>P1: HTTP/1.1 Upgrade (sticky pick)
    P1->>R: SUBSCRIBE conv:42 (user A is in conv 42)
    P1->>R: SET presence:userA → pod-1 EX 60
    P1-->>CA: 101 Switching Protocols ✅

    Note over CB,P7: User B does the same against Pod 7
    CB->>ALB: WSS handshake
    ALB->>P7: Upgrade (different pod)
    P7->>R: SUBSCRIBE conv:42
    P7->>R: SET presence:userB → pod-7 EX 60

    Note over CA,CB: Now user A sends a message
    CA->>P1: WS frame {conv:42, body:"Is this still available?"}
    P1->>API: gRPC SendMessage (or directly call domain svc)
    API->>DDB: PUT message (idempotent on client_msg_id)
    API->>R: HINCRBY unread:userB conv:42 +1; ZADD inbox:userB
    API->>R: PUBLISH conv:42 {message payload}
    R-->>P1: fanout (filtered: A is sender, skip)
    R-->>P7: fanout
    P7->>P7: lookup connections for users in conv:42 (user B)
    P7->>CB: WS frame {new_message}
    CB-->>P7: WS frame {read_receipt}
    P7->>API: POST /messages/.../read
    API->>R: HINCRBY unread:userB -1; PUBLISH conv:42 {read}
    R-->>P1: fanout
    P1->>CA: WS frame {read receipt for user A's UI}
```

### Why we don't put chat-api inside the chat-ws pod

Tempting — fewer hops. But:

- **chat-api is stateless and CPU-bound**; chat-ws is stateful and memory/connection-bound. They scale on different signals (CPU vs active connections).
- **Deployments** of chat-api should be fast and aggressive (rolling, every PR). Deployments of chat-ws need graceful drain windows of 30-60s. Mixing them means every chat-api change drops WS connections.
- **Blast radius** of a chat-api bug is the request; in a combined pod a bad chat-api change crashes the WS server too.

The pods communicate over the cluster network (gRPC or HTTP). One extra hop in exchange for two clean lifecycles.

### What "Service" actually means here

`chat-ws` is a **Service of type ClusterIP** (or a `headless` Service if you want to bypass kube-proxy). The **LoadBalancer Service** (or an Ingress with an ALB controller) is what gets a public AWS ALB.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: chat-ws
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: external
    service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: ip
    service.beta.kubernetes.io/aws-load-balancer-attributes: |
      idle_timeout.timeout_seconds=350
spec:
  type: LoadBalancer
  selector:
    app: chat-ws
  ports:
    - port: 443
      targetPort: 8080
      protocol: TCP
```

Or with an Ingress + AWS Load Balancer Controller (more idiomatic if you have many services):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: chat-ws
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=350
    alb.ingress.kubernetes.io/target-group-attributes: stickiness.enabled=true,stickiness.type=app_cookie
spec:
  rules:
    - host: chat.example.com
      http:
        paths:
          - path: /ws
            pathType: Prefix
            backend:
              service:
                name: chat-ws
                port:
                  number: 8080
```

### Graceful pod shutdown — the non-obvious part

When k8s rolls chat-ws (deploy or scale-in), it `SIGTERM`s a pod. If you do nothing, all WS connections drop instantly. Clients reconnect, but for a few seconds presence is wrong and messages are buffered.

The pattern:

```
1. preStop hook (or SIGTERM handler):
     - Mark pod NotReady (flip readiness gate → ALB stops sending new connections)
     - Wait grace period (~5s) for inflight Upgrade handshakes to settle
2. Close listening socket (refuse new Upgrades)
3. Send "please reconnect" close frame (code 1012 Service Restart) on every WS
4. Wait up to terminationGracePeriodSeconds (60s) for clients to reconnect
5. Exit
```

Set `terminationGracePeriodSeconds: 60` and have a `PodDisruptionBudget` so the autoscaler / cluster upgrades don't take everyone down at once.

### Sizing intuition for the WS layer

```
Per-pod connection cap (Node.js with ws library, t3.medium):
  ~30-50K idle WS connections   (memory-bound, ~100KB per conn including OS buffers)
  ~5-10K active (msgs/sec per pod)

At peak: 150K concurrent connections / 30K per pod = 5 pods minimum
Add 50% headroom + AZ spread (3 AZs)            = 9 pods sensible baseline

HPA on a custom metric: active_ws_connections / 25000   (target 80% of cap)
Not CPU — CPU is misleading for idle WS workloads.
```

## Key flows

### Send message (online recipient)

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (sender)
    participant API as chat-api
    participant DDB as DynamoDB
    participant Redis
    participant K as Kafka
    participant Bus as Redis Pub/Sub
    participant WS as chat-ws (recipient pod)
    participant R as Client (recipient)

    C->>API: POST /messages {conv_id, body, client_msg_id}
    API->>DDB: conditional put (idempotent on client_msg_id)
    API->>Redis: HINCRBY unread{recipient}; ZADD inbox{recipient}
    API-->>C: 200 {message_id, server_ts}
    API->>K: publish chat.message.created
    API->>Bus: publish to channel conv:{conv_id}
    Bus->>WS: deliver event
    WS->>R: WebSocket frame: new_message
    R->>API: POST /messages/{id}/read
    API->>Redis: HINCRBY unread{recipient} -1
    API->>K: publish chat.message.read
```

The client gets an ack from API (step 4) **before** Kafka publish or WS delivery. This is deliberate: we owe the sender durability (Dynamo write), not delivery — delivery is best-effort with retry semantics.

### Inbox load (open sidebar)

```mermaid
sequenceDiagram
    participant C as Client
    participant API as chat-api
    participant Redis
    participant PG as Postgres

    C->>API: GET /inbox?limit=50
    API->>Redis: ZREVRANGE inbox:{user_id} 0 49
    alt cache hit
        Redis-->>API: 50 conversation_ids
        API->>Redis: HGETALL unread:{user_id}
        API->>PG: SELECT conversations WHERE id IN (...)
        PG-->>API: rows
        API-->>C: list with previews + unread counts
    else miss
        API->>PG: SELECT 50 by last_message_at
        API->>Redis: rebuild sorted set
        API-->>C: list
    end
```

### Offline delivery (push notification path)

```mermaid
sequenceDiagram
    participant API as chat-api
    participant K as Kafka
    participant Notif as notification-svc
    participant Presence
    participant SNS

    API->>K: chat.message.created
    Notif->>Presence: is recipient online?
    alt online
        Notif->>Notif: noop (WS already delivered)
    else offline
        Notif->>Notif: dedupe + quiet-hours check
        Notif->>SNS: send to FCM/APNs tokens
    end
```

Push notification is a **wake signal + preview**, not transport. The actual message stays in DynamoDB and is fetched on app open. See [Mobile + Edge Specifics](../architecture/mobile-edge-specifics.md).

### Unread count consistency

- Source of truth: DynamoDB messages (read receipts).
- Fast counter: Redis hash.
- Drift detection: nightly job samples N users, recomputes from messages, alerts if drift > 1.
- Manual rebuild: replay `chat.message.created` + `chat.message.read` for affected user.

## The drop-off mechanic (proptech-specific)

Slow sellers cost the business buyers. The chat system has to *participate* in fixing that, not just deliver messages.

### Escalation ladder

```mermaid
graph TD
    Sent[Buyer sends message] --> T0[T+0: deliver via WS / push]
    T0 --> Wait{Seller<br/>responds?}
    Wait -->|yes| Done[SLA timers cancelled]
    Wait -->|no, T+5 min| Step1[Push reminder to seller]
    Step1 --> Wait
    Wait -->|no, T+30 min| Step2[Email reminder to seller]
    Step2 --> Wait
    Wait -->|no, T+2 h| Step3[Auto-reply to buyer<br/>'Seller notified, typical response 6h']
    Step3 --> Wait
    Wait -->|no, T+24 h| Step4[Suggest similar listings to buyer<br/>+ optional human/AI handoff]
    Step4 --> Wait
    Wait -->|no, T+72 h| Step5[Mark conversation abandoned<br/>notify ops dashboard]
```

### Implementation — Temporal workflows

Why Temporal: SLA logic is a long-running stateful process with timers, retries, and cancellation. Building it with cron + a table of "due nudges" works but is fragile (missed fires, double fires, no visibility). Temporal gives durable timers, replay-on-failure, and observable workflow state.

```python
@workflow.defn
class SellerSLAWorkflow:
    @workflow.run
    async def run(self, conv_id: str, seller_id: str, buyer_id: str):
        await workflow.sleep(timedelta(minutes=5))
        await workflow.execute_activity(push_reminder, seller_id, conv_id)

        await workflow.sleep(timedelta(minutes=25))
        await workflow.execute_activity(email_reminder, seller_id, conv_id)

        await workflow.sleep(timedelta(hours=1, minutes=30))
        await workflow.execute_activity(buyer_auto_reply, buyer_id, conv_id)

        await workflow.sleep(timedelta(hours=22))
        await workflow.execute_activity(suggest_alternatives, buyer_id, conv_id)

        await workflow.sleep(timedelta(hours=48))
        await workflow.execute_activity(mark_abandoned, conv_id)

    @workflow.signal
    def seller_responded(self):
        # Cancels remaining timers via workflow.wait_condition pattern
        ...
```

A consumer of `chat.message.created` starts a workflow when a buyer message has no seller reply within the conversation window. A consumer of `chat.message.read` + `chat.message.created` (sender=seller) signals the workflow to cancel.

### Why not just a cron / scheduled job table

| Cron / DB-of-pending-nudges | Temporal |
|---|---|
| Easy at small scale | Same complexity at any scale |
| Hard to express conditional cancellation | Native signals |
| Re-firing after crash is manual | Durable replay |
| Observability is a separate problem | Built-in UI per workflow |
| At-least-once is on you | Built-in |

For a small product I'd lean cron. At 1M DAU with this kind of multi-step business logic, Temporal pays for itself.

### AI assistant integration (optional, gated by feature flag)

At step 3 or 4, the system can:

- Generate a contextual auto-reply (FAQ: "Is this still available?" / "Schedule viewing?" → calendar deep link)
- Summarize the conversation when handing off to a broker
- Detect intent ("buyer wants viewing") and create a task

The chat path is **unchanged**: AI service produces a message, posted via the same `POST /messages` path with `sender_id = system` or `sender_id = ai-assistant`. No special rendering on the client beyond a badge.

## Deployment trade-offs

The interview prompt forces a choice. Each shape has implications for WebSockets.

### Layer-by-layer recommendation

| Layer | k8s | ECS Fargate | Cloud Run | Self-managed |
|---|---|---|---|---|
| **chat-api (REST)** | ✅ fine | ✅ fine | ✅ great (autoscale to zero) | ✅ fine |
| **chat-ws (WebSocket)** | ✅ best fit | ⚠️ works with caveats | ❌ unsuitable | ✅ classic choice |
| **Redis** | ❌ use ElastiCache | ❌ use ElastiCache | ❌ | ✅ if you must |
| **DynamoDB / Postgres / Kafka** | managed services regardless |

### Why Cloud Run is the wrong layer for WebSockets

- Cloud Run is request-scoped; max ~60 min per connection (raised limit) but instances scale down aggressively.
- Per-instance concurrency limits hurt long-lived connections.
- No durable membership in a routing topology — every reconnect can land anywhere.

Use Cloud Run / Lambda for **chat-api** if it fits your stack, but the WS layer wants a real long-running compute target.

### k8s as primary recommendation — what makes it work for WebSockets

```mermaid
graph TD
    ALB[ALB / NLB<br/>session affinity by cookie or IP hash]
    ALB --> Pod1[chat-ws pod 1]
    ALB --> Pod2[chat-ws pod 2]
    ALB --> Pod3[chat-ws pod 3]
    Pod1 -.heartbeat.-> Redis[(Redis<br/>presence)]
    Pod2 -.heartbeat.-> Redis
    Pod3 -.heartbeat.-> Redis
    Pod1 <-->|pub/sub| Bus[Redis Pub/Sub]
    Pod2 <--> Bus
    Pod3 <--> Bus
```

Things to set:

| Setting | Why |
|---|---|
| `terminationGracePeriodSeconds: 60` | Let in-flight messages drain |
| `preStop` lifecycle hook | Stop accepting new connections, broadcast "reconnect to peer" |
| Readiness gate that flips off before SIGTERM | Pull pod out of LB pre-drain |
| HPA on **active connections** + CPU | Pure CPU lies for WS workloads |
| `topologySpreadConstraints` across AZs | One AZ failure doesn't take down 50%+ of connections |
| Sticky routing (cookie or IP hash) | Reconnects land on same pod when possible (cache warmth) |
| Connection cap per pod | Bound resource use; horizontal scale rather than vertical |

### ECS Fargate is workable

- ALB supports WebSockets + session stickiness.
- Slightly less control over graceful shutdown than k8s (`stopTimeout` up to 120s).
- No daemonset patterns if you want sidecars per node.
- Fine if the org is ECS-first; not as good a fit as k8s for stateful long-lived workloads.

### Self-managed servers (EC2 + HAProxy / NGINX)

- Max control, simplest mental model.
- Pays the cost of: AMI building, autoscaling group config, blue-green or in-place deploys, your own observability bootstrapping.
- The "no Kubernetes" path is honest if the org doesn't want to operate k8s. Don't pretend it's free though.

### My recommended deployment

| Component | Where |
|---|---|
| chat-api | k8s (Deployment, HPA on CPU) |
| chat-ws | k8s (Deployment, HPA on active connections, PodDisruptionBudget, AZ spread) |
| presence-svc | k8s |
| nudge-svc workers | k8s |
| notification-svc | k8s |
| search-indexer | k8s |
| Redis | **ElastiCache for Redis** cluster mode |
| Messages | **DynamoDB** |
| Conversations | **RDS / Aurora Postgres** |
| Attachments | **S3 + CloudFront** |
| Kafka | **MSK** (or Confluent Cloud) |
| Temporal | Temporal Cloud, or self-hosted in k8s |
| Push | **SNS → FCM/APNs** |

## Failure modes & how the design handles them

| Failure | Behavior |
|---|---|
| DynamoDB throttling on hot conv | Burst capacity + retry; rare for 1:1 |
| Redis cluster failure | Counters serve stale or 0; rebuild from messages; degraded inbox order falls back to Postgres |
| WS pod crash | Client reconnect; presence TTL expires within 60s; messages buffered in Kafka if anyone needs replay |
| Kafka outage | chat-api still acks (DDB is source of truth); Kafka backlog drains when up; nudge timers may be delayed (Temporal independent) |
| Push token invalid | SNS feedback → notification-svc invalidates token |
| AZ failure | Multi-AZ Redis + DDB + RDS; WS pods spread across AZs; ALB reroutes |
| Region failure | Active-passive DR; DynamoDB global tables for messages; Postgres async replica; estimated RTO 15-30 min |
| Misbehaving client (spam) | Rate limit at chat-api per user; moderation-svc flags repeated abuse |
| Buyer/seller block | Block list checked at send time + before WS delivery |

## Scaling pinch points

- **WebSocket connection density per pod**: tune; ~50K connections per pod is achievable with Go/Erlang/Node, less with JVM-heavy stacks.
- **Redis pub/sub fan-out**: at very high message rates, pub/sub becomes the bottleneck. Replace with NATS or Kafka direct-to-WS-pod consumers when needed.
- **Hot conversation**: cap message rate per conv; if a "conversation" becomes a broadcast channel, that's actually a different product — separate it.
- **Inbox writes**: each message updates 2 inbox sorted sets (buyer + seller). At 1.2K msgs/sec peak that's 2.4K ZADDs/sec — comfortable.
- **Search indexing**: lags real-time by seconds; surface this in UX (don't claim "search includes the message you just sent").

## Anti-patterns (call these out in the interview)

| Anti-pattern | Why it hurts | What to do instead |
|---|---|---|
| Polling for new messages | Battery, server load, latency | WebSocket + push fallback |
| Storing messages in Postgres | Won't scale, vacuum pressure | DynamoDB / Cassandra |
| Putting message body in the push notification as the transport | Push is best-effort, dropped, reordered | Push = wake; app fetches via API |
| Mixing REST and WS in the same pod | Conflicting deployment / scaling needs | Two services |
| Counting unread by scanning messages on every app open | Slow + expensive | Redis counters maintained on write |
| Stateful WS on Cloud Run / Lambda | Connection lifetime constraints | k8s / ECS / self-managed |
| Cron table of "nudges to send" | Race conditions, missed fires, manual recovery | Temporal workflows |
| Single primary region for global product | Cross-region latency for half your users | Multi-region with regional message stores |

## Quick reference

| Concern | Choice | One-line reason |
|---|---|---|
| Conversations | Postgres | Relational, joinable, modest size |
| Messages | DynamoDB | Conversation-partitioned, time-sorted, TTL, Streams |
| Unread / inbox | Redis | Sub-ms hot path, rebuildable from messages |
| Attachments | S3 + CloudFront | Direct upload via presigned URL |
| Real-time | WebSocket on k8s | Stateful, long-lived, well-supported |
| Pub/sub fanout | Redis Pub/Sub (NATS at scale) | Cross-pod routing |
| Async events | Kafka / MSK | Ordered, durable, multi-consumer |
| SLA workflows | Temporal | Durable timers, signals, replay |
| Push | SNS → FCM/APNs | Managed fan-out |
| Search | OpenSearch | Inverted index, ACL-filtered |
| Compute | k8s for WS, anything for REST | WS needs long-lived stateful pods |

## Interview angle

!!! tip "What interviewers are testing"
    Three things: (1) Did you ask before designing? (2) Did you pick storage tech with reasons, not labels? (3) Did you engage with the *business* problem (slow sellers / drop-off), not just shovel messages from A to B?

**Strong answer pattern:**

1. Start with the 6-8 clarifying questions; pick defaults out loud
2. Capacity math first (so the rest is grounded)
3. Split REST vs WebSocket as a deliberate architectural choice
4. Walk through storage choices and **justify each** — interviewers wait specifically for this
5. Sequence diagram the send-message path; call out where you ack (DDB) vs where you fan out (WS, Kafka)
6. Spend real time on the **drop-off mechanic** — that's the proptech angle and most candidates skip it
7. Address deployment trade-offs deliberately: WS layer is the constraint, not the REST API

**Common follow-ups:**

- "Why DynamoDB and not Postgres?" — write rate, partition shape, retention TTL, Streams; Postgres would force you to invent sharding
- "What happens if Redis goes down?" — counters degrade, rebuilt from messages; system stays writable; UX shows stale unread until recovery
- "How do you guarantee per-conversation ordering?" — DynamoDB sort key (ULID) is server-assigned; client receives messages back with server timestamps; WS frames are pushed in commit order
- "How would you handle a celebrity seller with thousands of buyers?" — not 1:1 chat anymore; that's a broadcast/announcements feature; separate product
- "How do you reduce drop-off if the seller really is unreachable?" — escalation ladder + auto-reply + alternative-listings nudge + optional broker/AI handoff; measure drop-off rate as a product KPI tied to chat
- "Why not Cloud Run for the WebSocket gateway?" — request-scoped, ephemeral instances, connection limits; misuse of the platform
- "How do you protect against scams (sellers asking for off-platform payment)?" — moderation-svc runs on every message async; flagged conversations get warnings and rate limits; ML signal + keyword rules

## Related

- [Chat System](chat-system.md) — generic case study (this page builds on it with proptech constraints)
- [WebSockets & SSE](../networking/websockets-sse.md)
- [Event Streaming Maturity](../messaging/event-streaming-maturity.md) — Kafka + schema discipline
- [Idempotent Consumers](../messaging/idempotent-consumers.md) — for the SLA / nudge consumers
- [Mobile + Edge Specifics](../architecture/mobile-edge-specifics.md) — push, offline, version skew
- [Key-Value Stores](../storage/key-value-stores.md) — DynamoDB + Redis usage patterns
- [Notification Service](notification-service.md) — push delivery architecture
- [Multi-Tenancy](../architecture/multi-tenancy.md) — relevant if same chat infra serves multiple proptech brands
