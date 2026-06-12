# Messaging & Streaming

Synchronous request/response breaks under three conditions: the downstream is slow, the downstream is unavailable, or load spikes beyond what the downstream can absorb. Messaging decouples producers from consumers in time and space — the producer doesn't wait, the consumer processes when it's ready, and the broker absorbs bursts.

---

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [Message Queues](message-queues.md) — the simplest async building block: point-to-point delivery
2. [Pub/Sub](pub-sub.md) — extends the queue model to fan-out: many consumers per message
3. [Event Streaming](event-streaming.md) — the replayable log model and how it differs from queues
4. [Kafka Deep Dive](kafka.md) — the dominant streaming platform: partitions, consumer groups, offsets
5. [Idempotent Consumers](idempotent-consumers.md) — at-least-once delivery means duplicates; this is the fix

**Advanced — come back later:** [Backpressure](backpressure.md), [Event Payload Design](event-payload-design.md), [Event Schema Evolution](event-schema-evolution.md), [Event Streaming Maturity](event-streaming-maturity.md)

---

## Sync vs async — the core trade-off

```
Synchronous (REST/gRPC):
  Client ──request──► Service ──response──► Client
  Client blocks until done.
  Failure: client gets an error immediately.
  Latency: sum of all downstream latencies.

Asynchronous (messaging):
  Producer ──message──► Broker ──message──► Consumer
  Producer returns immediately.
  Failure: consumer retries, producer is unaffected.
  Latency: decoupled — consumer processes on its own schedule.
```

**Use async when:** processing takes long, load is bursty, producer and consumer need different availability, or work can be parallelized across multiple consumers.

---

## Topics in this section

| Topic | What it covers | When it matters |
|---|---|---|
| [Message Queues](message-queues.md) | Point-to-point async delivery, SQS, RabbitMQ, visibility timeout | Task queues, job processing, decoupling services |
| [Pub/Sub](pub-sub.md) | Fan-out to multiple consumers, SNS, Google Pub/Sub | Event notifications, broadcasting state changes |
| [Event Streaming](event-streaming.md) | Replayable, ordered log — Kafka vs SQS conceptual difference | Audit trails, CDC, event sourcing, analytics pipelines |
| [Kafka Deep Dive](kafka.md) | Topics, partitions, consumer groups, offsets, exactly-once | High-throughput streaming, durable event log |
| [Backpressure](backpressure.md) | What happens when consumers are slower than producers | Any async pipeline — preventing OOM and queue blowup |

---

## Concept map

```
Point-to-point (Queue)
  Producer → [Queue] → One consumer
  Examples: SQS, RabbitMQ queues, Celery tasks
  Use for: task distribution, load leveling

Pub/Sub (Fan-out)
  Publisher → [Topic] → Many consumers (each gets a copy)
  Examples: SNS, Redis Pub/Sub, Google Pub/Sub
  Use for: event notifications, broadcasting

Event Streaming (Log)
  Producers → [Partitioned log] → Many consumer groups (each at own offset)
  Examples: Kafka, Kinesis, Azure Event Hubs
  Use for: durable event log, replay, multiple independent consumers

Delivery semantics (applies to all)
  At-most-once  → fire and forget, may lose messages
  At-least-once → retry on failure, may duplicate (default)
  Exactly-once  → dedup + idempotent consumer = effectively once
```

---

## Choosing between Queue, Pub/Sub, and Streaming

| Criterion | Queue | Pub/Sub | Event Streaming |
|---|---|---|---|
| **Consumers** | One consumer per message | Many consumers per message | Many independent consumer groups |
| **Replay** | No (consumed = gone) | No | Yes (retain log, seek to offset) |
| **Ordering** | Usually FIFO per queue | No ordering guarantee | Strict ordering per partition |
| **Throughput** | Moderate | High (fan-out) | Very high (parallelized partitions) |
| **Best for** | Task queues, job workers | Notifications, broadcasts | Analytics, CDC, audit logs |
| **AWS service** | SQS | SNS | Kinesis / MSK (Kafka) |

---

## Interview shortlist

| Question | Key answer |
|---|---|
| *"Why use a message queue instead of direct API calls?"* | Decouples availability (producer works even if consumer is down), absorbs traffic spikes, enables retries without client involvement. |
| *"SQS vs Kafka — when to use each?"* | SQS: simple task queue, managed, no replay. Kafka: event log, replay, multiple independent consumer groups, strict ordering per partition. |
| *"How do you handle duplicate messages from a queue?"* | Idempotent consumers: use a dedup key (`ON CONFLICT DO NOTHING`), check-then-act in a transaction, or use Kafka EOS. |
| *"What is backpressure and why does it matter?"* | When consumers are slower than producers, queues fill and eventually OOM. Fix: bound queue size, apply flow control, scale consumers, or shed load. |
| *"How does a consumer group work in Kafka?"* | Partitions assigned to consumer instances. Each partition read by exactly one consumer in the group. Add consumers to parallelize (up to partition count). |

---

## Related topics

- [Patterns: Outbox Pattern](../patterns/outbox.md) — guaranteed exactly-once event publishing
- [Distributed Systems: Exactly-Once Semantics](../distributed/exactly-once.md) — delivery guarantees in depth
- [Architecture: Event-Driven Architecture](../architecture/event-driven.md) — system design with events
- [Patterns: Saga Pattern](../patterns/saga-pattern.md) — distributed transactions via async messaging
- [AWS: Messaging](../aws/messaging.md) — SQS, SNS, EventBridge, Kinesis on AWS
