# Event Streaming

## What it is

Event streaming is a pattern where events are written to a durable, ordered, replayable log. Unlike message queues (messages are consumed and deleted), stream records persist and can be replayed, re-processed, and consumed by multiple independent consumers — each maintaining their own position in the stream.

## Stream vs Queue

```
Message Queue:
  Producer → [M1, M2, M3] → Consumer A gets M1, then it's gone
                           → Consumer A processes M2, M3...
  
  Messages are consumed once and deleted.
  Consumer must be online to process.

Event Stream:
  Producer → [E1, E2, E3, E4, E5, E6]
                    ↑             ↑
              Consumer A       Consumer B
              (offset: 3)     (offset: 5)
  
  Events persist. Each consumer tracks their own offset.
  Consumer can replay from any point.
```

## Why event streaming

| Capability | Description |
|---|---|
| **Replay** | Re-process historical events (debug, backfill, new consumer) |
| **Multiple independent consumers** | Each at their own pace, own offset |
| **Event sourcing** | Stream is the source of truth — rebuild state from events |
| **Time travel** | Process events as of a specific point in time |
| **Audit log** | Immutable record of everything that happened |
| **CDC** | Capture database changes as events for downstream consumers |

## Apache Kafka

The dominant event streaming platform. Built for high throughput, durability, and horizontal scale.

### Core concepts

```
Kafka Cluster
  └── Topic: "orders"
        ├── Partition 0: [E0, E1, E2, E3, ...]  (ordered within partition)
        ├── Partition 1: [E0, E1, E2, E3, ...]
        └── Partition 2: [E0, E1, E2, E3, ...]

Each partition:
  - Ordered, immutable sequence
  - Stored on disk, replicated
  - Assigned to one broker (leader)
  - Assigned to one consumer per consumer group
```

**Offset:** Position of a consumer within a partition. Consumers commit offsets to Kafka (not delete messages).

### Partitions and parallelism

```
Topic "orders" with 3 partitions:
Consumer Group "email-service" (3 consumers):
  Consumer A → Partition 0
  Consumer B → Partition 1
  Consumer C → Partition 2

Consumer Group "analytics-service" (1 consumer):
  Consumer X → Partition 0, 1, 2 (all partitions — one consumer)
```

**Parallelism = number of partitions.** Adding more consumers than partitions = some consumers idle.

**Partition key:** Determines which partition a message goes to.
```python
# Same user_id always goes to same partition (ordering preserved per user)
producer.send('orders', key=user_id.encode(), value=order_bytes)

# Round-robin (no key) → load-balanced but no ordering guarantee
producer.send('orders', value=order_bytes)
```

### Replication

Each partition has a leader broker + N replica brokers:

```
Partition 0:
  Leader: Broker 1 (receives all reads and writes)
  Replica: Broker 2
  Replica: Broker 3

Broker 1 fails → Broker 2 or 3 elected as new leader (via ZooKeeper / KRaft)
```

**ISR (In-Sync Replicas):** Replicas that are caught up with the leader. `acks=all` requires all ISRs to acknowledge.

### Producer acknowledgment levels

```python
# acks=0: Fire-and-forget. Fastest, possible data loss
producer = KafkaProducer(acks=0)

# acks=1: Leader acknowledges. Possible data loss if leader fails before replication
producer = KafkaProducer(acks=1)

# acks=all (-1): All ISRs acknowledge. No data loss. Slowest
producer = KafkaProducer(acks='all', min_insync_replicas=2)
```

### Consumer groups

```python
consumer = KafkaConsumer(
    'orders',
    group_id='email-service',          # consumer group
    auto_offset_reset='earliest',      # start from beginning if no committed offset
    enable_auto_commit=False,          # manual commit (safer)
    bootstrap_servers=['kafka:9092']
)

for message in consumer:
    try:
        process(message)
        consumer.commit()               # commit offset after success
    except Exception:
        # Don't commit → message will be reprocessed
        log_error(message)
```

**Group rebalance:** When a consumer joins/leaves a group, partitions are redistributed. During rebalance, no messages are processed. Use incremental cooperative rebalancing to minimize pause.

### Retention

```
# Keep messages for 7 days (default: 7 days)
retention.ms = 604800000

# Keep messages up to 1 GB per partition
retention.bytes = 1073741824

# Compact: keep only latest value per key (not time-based)
cleanup.policy = compact
```

**Log compaction:** For topics that represent current state (not event history). Only the latest message per key is retained. Enables materializing a key-value store from a topic.

### Exactly-once semantics

```python
# Idempotent producer (deduplicates retries)
producer = KafkaProducer(enable_idempotence=True)

# Transactional producer (atomic write to multiple topics/partitions)
producer.init_transactions()
producer.begin_transaction()
producer.send('topic-a', key, value)
producer.send('topic-b', key, value)
producer.commit_transaction()  # atomic or nothing
```

Exactly-once end-to-end: Kafka Streams or transactional producers + consumers.

### Kafka Streams / ksqlDB

Stream processing on top of Kafka — stateful transformations, aggregations, joins without a separate processing cluster:

```java
// Kafka Streams: count orders per user in 5-minute windows
KStream<String, Order> orders = builder.stream("orders");
KTable<Windowed<String>, Long> counts = orders
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
    .count();
```

### AWS equivalents

| Kafka concept | AWS equivalent |
|---|---|
| Kafka | Amazon MSK (Managed Streaming for Kafka) |
| Kafka (serverless) | MSK Serverless |
| Simpler streaming | Amazon Kinesis Data Streams |
| Kinesis → S3/Redshift | Amazon Kinesis Firehose |

## Amazon Kinesis

AWS's native streaming service. Similar model to Kafka but simpler operations.

```
Kinesis Data Stream:
  Shards (like Kafka partitions)
  1 shard = 1 MB/s write, 2 MB/s read

Kinesis Firehose:
  Managed delivery → S3, Redshift, Elasticsearch
  No consumer code needed

Kinesis Data Analytics:
  SQL queries over streams (Apache Flink under the hood)
```

**Kinesis vs Kafka (MSK):**
- Kinesis: simpler, AWS-native, less control, 24hr default retention (up to 365 days)
- MSK: full Kafka, more control, longer retention, consumer groups, compaction

## Event streaming patterns

### CDC (Change Data Capture)

```
PostgreSQL WAL → Debezium → Kafka topic (per table)
                              → Elasticsearch indexer
                              → Analytics consumer
                              → Cache invalidation
```

Every database write becomes an event that any number of consumers can react to without any change to the application writing to the DB.

### Event-sourcing with Kafka

```
User action → Command → Event (immutable) → Kafka
                                         ↓ (consumers rebuild state)
                                   User Service → DB (current state)
                                   Audit Service → Audit log
                                   Search Service → Elasticsearch
```

### CQRS read model population

```
Write DB (PostgreSQL) → CDC → Kafka → Read model builder → Read DB (DynamoDB)
                                                           → Search index (ES)
```

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you distinguish streaming from queueing and use streams when replay, ordering, or multiple consumers matter.

**Strong answer pattern:**
1. Choose streaming when: multiple independent consumers need the same events, replay is needed, order matters within a partition
2. Choose queues when: one consumer, message processed once, no replay needed
3. For Kafka: explain partition count = parallelism, consumer group = independent consumers
4. Mention CDC pipeline as the standard approach for keeping secondary stores in sync
5. On AWS: MSK for Kafka, Kinesis for simpler streaming, Firehose for delivery to S3/Redshift

## Related topics

- [Message Queues](message-queues.md) — simpler, no replay
- [Pub/Sub](pub-sub.md) — fan-out, ephemeral
- [Kafka Deep Dive](kafka.md) — full Kafka internals
- [Event-Driven Architecture](../architecture/event-driven.md) — streaming as architectural foundation
- [CQRS](../patterns/cqrs.md) — streaming to populate read models
