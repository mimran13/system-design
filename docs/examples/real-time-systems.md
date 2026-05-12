# Real-Time Systems — Practical Examples

Scenarios where the key constraint is **users seeing updates fast and reliably** — chat, presence, live notifications, collaborative editing. The common thread: **persistent connections**, **ordering**, and **fan-out at scale**.

---

## Scenario 1: Build a chat feature for a SaaS product

**Concrete situation**: A B2B collaboration tool needs in-app chat — direct messages and group channels. ~50K active users at peak; ~100 messages/sec. Messages must be delivered to recipients in <500ms with offline message storage.

### Reasoning

- **Persistent connection** to push messages instantly: WebSocket or SSE.
- **Server can't keep 50K WebSocket connections cheaply on one box** — connections must shard across servers.
- **Recipient might not be online** — messages must persist until delivered.
- **Ordering matters within a conversation** but not across conversations.
- **Reliability**: don't lose messages if a server restarts.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [WebSockets & SSE](../networking/websockets-sse.md) | The persistent-connection mechanism |
| [Pub/Sub](../messaging/pub-sub.md) | Fan-out a message to all conversation participants connected to *any* server |
| [Sharding](../patterns/sharding.md) | Connection state spread across N servers |
| [Idempotency](../patterns/idempotency.md) | Mobile retries shouldn't duplicate messages |
| [Outbox Pattern](../patterns/outbox.md) | Persisting + publishing must be atomic |
| [Event Sourcing](../patterns/event-sourcing.md) | Optional: messages-as-events for full history |

### Sketch

```
Client (web/mobile) ──WebSocket──► WS Gateway (autoscaling)
                                          │
                                          │ subscribe to user_id channel
                                          ▼
                                    Redis Pub/Sub
                                          ▲
                                          │ publish on send
                                          │
Sender ─POST /messages─► API ─INSERT─► Postgres (messages table)
                              ─publish─► Redis Pub/Sub
                                          │
                                          ▼
                            Recipients' WS gateway picks up
                                          │
                                          ▼
                                  Push to recipient socket
```

### Trade-offs

- **What you gain**: sub-100ms delivery for online users; persistent storage covers offline; horizontal scaling on connection count
- **What you give up**: complexity (multiple stores), eventual consistency on read history (recent messages might be in Redis but not yet ack'd to DB)
- **Cost**: WS gateways are sticky-session; increases LB complexity; Redis cluster needed for pub/sub at scale

### Anti-patterns to avoid

- ❌ Polling every 1 second for new messages → 50K req/s for nothing 99% of the time
- ❌ Keeping all 50K connections on one box → memory exhaustion, single-point-of-failure
- ❌ Direct point-to-point: API → looks up which server has recipient → forwards → assumes server is alive
- ❌ Storing messages only in Redis → lose them on flush; persistence must be durable

### Variations

- **End-to-end encryption**: Signal protocol; server sees only ciphertext
- **Massive group channels (Slack with 10K members)**: fan-out becomes the bottleneck — see scenario 3 below
- **Read receipts**: separate pub/sub for typing/read events; can drop without correctness loss

---

## Scenario 2: Online/offline presence — show "active now" badge

**Concrete situation**: Show 1.5M users a green dot if their friend is online (active in the last 5 minutes). Updates within 30 seconds. List of friends per user is up to 500.

### Reasoning

- **Last-seen timestamps in DB** seems simple — but reading 500 timestamps per page load × 1.5M users = expensive.
- **Pushing every "still online" heartbeat to all friends** doesn't scale either.
- **The right answer mixes**: store presence in fast in-memory store; clients query for the friends-they-care-about; push events on transitions only.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Distributed cache (Redis)](../caching/distributed-caching.md) | In-memory store of `user_id → last_seen_timestamp` |
| [TTL-based expiration](../caching/eviction-policies.md) | Auto-mark offline if no heartbeat in 5 min |
| [Pub/Sub](../messaging/pub-sub.md) | Notify subscribers when someone goes from offline → online |
| [Backpressure / batching](../messaging/backpressure.md) | Heartbeat every 60s; not every action |
| [Sharding](../patterns/sharding.md) | If single Redis can't hold all 1.5M; shard by user_id |

### Sketch

```
Client heartbeat (every 60s while active)
   │
   ▼
PUT /presence/heartbeat ──► Redis: SET user:{id}:online "1" EX 300
                                │
                                ▼
                       (TTL 5 min — auto-offline)

Client requesting friend statuses:
   GET /friends/online ──► API:
     friends = [f1, f2, ..., f500]
     statuses = MGET user:f1:online, user:f2:online, ...    (single Redis call)
     return statuses

Online → offline transition:
   On TTL expiry, no automatic event
   Alternative: app polls; or use Redis keyspace notifications + pub/sub
```

### Trade-offs

- **What you gain**: ~1ms presence lookup for any user; scales to millions; no DB hit
- **What you give up**: 5-min granularity (last-seen could be up to 5 min stale); no event when someone goes offline (TTL silent)
- **Alternative for hard real-time**: WebSocket connection itself = presence indicator; closes when user disconnects

### Anti-patterns to avoid

- ❌ Storing presence in Postgres `last_seen_at` column → table hammered with writes
- ❌ Heartbeat every 5 seconds → 1.5M × 12 = 18M req/min just for "I'm still here"
- ❌ Push every heartbeat to all friends → 750K connections × 500 friends = absurd fan-out
- ❌ Trusting client-claimed online state → "I'm online" lies bypass server checks

---

## Scenario 3: Live notifications — fan-out to 50K members of a channel

**Concrete situation**: Slack-like product where a message in a channel must be delivered to all members. Some channels have 10-50K members; some are 1:1. ~5K messages/sec across the whole product.

### Reasoning

- **Naive fan-out** at write-time: 1 message → look up 50K members → publish to each → 50K reads + 50K pushes for ONE message. Doesn't scale.
- **Pull model** at read-time: members query "what's new since I last checked" → no fan-out at write, but every active member polling = different scaling problem.
- **Hybrid (push for active, pull for inactive)** is what real systems use.
- **Channel size matters**: small channels (~50 members) = push fine; mega-channels (50K) = pull or hybrid.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [Hot Partitions](../fundamentals/hot-partitions.md) | A 50K-member channel is a hot key |
| [Pub/Sub vs message queues](../messaging/pub-sub.md) | Topic-per-channel; subscribers connect to topic |
| [Push vs Pull tradeoffs](../messaging/event-streaming.md) | Active users get push; inactive users pull on next open |
| [Caching strategies](../caching/caching-strategies.md) | Cache last N messages per channel |
| [Sharding](../patterns/sharding.md) | Channel state sharded by channel_id |

### Sketch

```
Message arrives:
   POST /messages { channel_id, content } ──► API
                                                │
                                                ├─► persist (Postgres / Cassandra by channel_id)
                                                ├─► append to channel_recent (Redis list, last 50 messages)
                                                └─► publish to channel:{id} pub/sub topic
                                                                    │
                                                                    ▼
                                                       WS Gateway subscribes per active member
                                                       Forwards to their socket

User opens app (was offline):
   GET /channels/{id}/messages?since=... ──► API:
     fetch from channel_recent (Redis) — fast hit for last 50
     fetch from Postgres for older
     return
```

### Trade-offs

- **What you gain**: fast delivery to active users; doesn't melt down on mega-channels (only fan-out to who's connected)
- **What you give up**: missed-while-offline must be reconstructed via pull; complexity of two paths

### Anti-patterns to avoid

- ❌ Naive: fan out at write-time to all 50K members regardless of online status
- ❌ Single Postgres table holding all messages, single index by channel_id (hot partition)
- ❌ "Just use Kafka, one topic per channel" → 1M channels = 1M topics; Kafka isn't that
- ❌ Polling for new messages every second → see chat scenario

---

## Scenario 4: Collaborative document editor (Google Docs-style)

**Concrete situation**: Multi-user editing of a document. Edits should appear in collaborators' views in <100ms. Concurrent edits must merge without conflicts. Up to 50 simultaneous editors per document.

### Reasoning

- **Last-write-wins is wrong** — losing user input to a race is unacceptable.
- **Locking the document** prevents concurrency — defeats the purpose.
- **Operational Transformation (OT)** or **CRDTs** are the two known solutions for collaborative editing.
- **CRDTs** are conceptually cleaner; OT is more battle-tested but harder to extend.
- **Network reliability**: every edit must be acknowledged; offline edits must merge when reconnected.

### Applicable concepts

| Concept | Why it fits |
|---|---|
| [CRDTs](../distributed/crdts.md) | Operations that can be applied in any order, converge to same state |
| [WebSockets](../networking/websockets-sse.md) | Bidirectional stream of edit ops |
| [Event Sourcing](../patterns/event-sourcing.md) | Document state = sum of all edit operations |
| [Eventual consistency](../fundamentals/consistency-models.md) | Acceptable: brief moments of divergence, then merge |
| [Optimistic concurrency](../fundamentals/isolation-levels.md) | Apply locally, send to server, receive remote ops |

### Sketch

```
Each client:
  Local CRDT state (e.g., Yjs, Automerge)
  Edits applied locally first (instant UX)
  Edits sent to server as ops
  Receives remote ops; merges into local CRDT (commutative)

Server:
  WebSocket connection per client per document
  Forwards ops to all other clients on the document
  Persists ops to log (replay-able)
  Optionally periodically snapshots state to S3

Persistence:
  Document = (snapshot at T) + (ops since T)
  Open doc = load snapshot + replay ops
```

### Trade-offs

- **What you gain**: real-time collaboration without locking; offline edits merge automatically; never lose user input
- **What you give up**: CRDT data structures are complex (use a library); document size grows with op log; storage overhead
- **Library choices**: Yjs (production-ready, JS), Automerge (Rust core, multi-platform), proprietary (Google Docs uses OT)

### Anti-patterns to avoid

- ❌ Locking document during edit → kills collaboration
- ❌ Last-write-wins → loses concurrent edits
- ❌ Building CRDT from scratch → research-grade work; use Yjs or Automerge
- ❌ Sending whole document state on every edit → bandwidth catastrophe

---

## Common pitfalls across real-time scenarios

| Pitfall | Mitigation |
|---|---|
| WebSocket connection limit on app server | Sharded WS gateway tier; connection count != app count |
| Mobile network drops kill WebSocket | Auto-reconnect with backoff; replay missed events on reconnect |
| Pushing every event to every user | Filter at server; subscribe model; backpressure |
| Lost messages during server restart | Persist to durable store *before* publishing |
| Out-of-order delivery | Per-channel sequence numbers; client reorders |
| Browser tab inactive → connection drops | Heartbeat / ping-pong to keep alive; or treat as offline |

---

## Related

- [WebSockets & SSE](../networking/websockets-sse.md)
- [Pub/Sub](../messaging/pub-sub.md)
- [Hot Partitions](../fundamentals/hot-partitions.md)
- [CRDTs](../distributed/crdts.md)
- [Distributed Caching](../caching/distributed-caching.md)
