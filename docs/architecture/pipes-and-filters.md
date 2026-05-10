# Pipes and Filters Architecture

A pipes-and-filters architecture decomposes a system into a chain of independent **filters** (processors) connected by **pipes** (channels). Each filter does one thing; pipes carry data between them. This is the architectural style behind Unix shell pipelines, ETL workflows, stream processing, and many CI/CD systems.

---

## The pattern

```
Source ──► Filter 1 ──► Filter 2 ──► Filter 3 ──► Sink
       pipe         pipe         pipe         pipe
```

Each filter:
- Reads from its input pipe
- Transforms / filters / aggregates
- Writes to its output pipe
- Knows nothing about other filters

Each pipe:
- Carries data between filters
- May buffer
- May fan out / fan in

---

## Classic example: Unix pipeline

```bash
cat access.log \
  | grep "POST /api" \
  | awk '{ print $7 }' \
  | sort \
  | uniq -c \
  | sort -rn \
  | head -10
```

Six filters, five pipes. Each tool does one thing. The pipeline composes them.

This is the canonical example of pipes-and-filters as an architectural pattern. The same idea scales up to data warehouses and stream processing.

---

## Key properties

### Independence

Each filter operates on its input alone. No knowledge of upstream / downstream. Stateless or self-contained state.

### Composability

Filters can be reordered, swapped, added, removed. New behaviour by combining existing filters.

### Concurrency

Filters can run in parallel — each on its own thread or process. Pipes provide back-pressure naturally (filter blocks on full output pipe).

### Reusability

A filter built for one pipeline can be used in others. `grep`, `sort`, `uniq` are reusable across thousands of pipelines.

---

## Variations

### Linear pipeline

Simplest form: A → B → C → D.

### Branching pipeline

```
        ┌── Filter B ──┐
A ──────┤              ├── E
        └── Filter C ──┘
        └── Filter D ──┘
```

A's output fans out to multiple filters. Outputs may merge later.

### Acyclic graph (DAG)

Workflow systems (Airflow, Dagster, Prefect, GitHub Actions) execute filters arranged as DAGs. Each node = filter; edges = pipes (often files / S3 objects).

### Push vs pull

| | Push | Pull |
|---|---|---|
| Direction | Producer drives | Consumer drives |
| Back-pressure | Producer slows when consumer is slow | Consumer requests more |
| Examples | Kafka producers, reactive streams | Generators, lazy streams |

Streaming systems mix both — Kafka is pull internally (consumers fetch), but appears push to applications.

---

## Examples in real systems

### ETL / ELT pipelines

```
Source DB ──► Extract ──► Transform ──► Load ──► Data warehouse
              (filter)    (filters)     (filter)
```

Tools: Apache Airflow, dbt, Apache Beam, AWS Glue, Fivetran.

Each step is a filter; data passes through stages until landed in the warehouse. ELT inverts: load raw, transform inside the warehouse.

### Stream processing

```
Kafka topic A ──► Stream processor ──► Kafka topic B
```

Kafka Streams, Apache Flink, Spark Streaming. Each operator is a filter; topics are pipes.

```scala
// Kafka Streams example
val orders = builder.stream[String, Order]("orders")
val highValue = orders.filter(_.totalCents > 100000)
val withTax = highValue.mapValues(addTax)
withTax.to("high-value-orders-with-tax")
```

This is a 3-filter pipeline.

### Build pipelines

```
Source code ──► Compile ──► Test ──► Package ──► Deploy
```

CI/CD platforms (GitHub Actions, GitLab CI, CircleCI) implement this. Each stage is a filter; artifacts flow between them.

### Image / video processing

```
Raw image ──► Resize ──► Compress ──► Watermark ──► CDN
```

Used in CDNs, image services, video transcoding (FFmpeg pipeline).

### Logging / observability pipelines

```
App logs ──► Collector ──► Parser ──► Enricher ──► Sink (ES, S3)
```

Fluentd, Vector, Logstash all implement this pattern.

---

## Implementing pipes and filters

### In-process

Generators or async iterators in Python:

```python
def read_lines(path):
    with open(path) as f:
        for line in f:
            yield line

def grep(pattern, lines):
    for line in lines:
        if pattern in line:
            yield line

def take(n, items):
    for i, item in enumerate(items):
        if i >= n: break
        yield item

# Compose
result = take(10, grep("ERROR", read_lines("app.log")))
for line in result:
    print(line)
```

Each generator is a filter. The pipeline is lazy — only as much computation as needed.

### Streams in Java / Node

```java
List<String> result = Files.lines(Path.of("app.log"))
    .filter(line -> line.contains("ERROR"))
    .map(String::trim)
    .limit(10)
    .collect(Collectors.toList());
```

```typescript
// Node async iterators
async function* readLines(path) { ... }
async function* grep(pattern, lines) { ... }
for await (const line of grep("ERROR", readLines("app.log"))) {
  console.log(line);
}
```

### Distributed: message queues

```
Producer ──► Topic A ──► Consumer/Producer ──► Topic B ──► Consumer
                          (filter as service)
```

Kafka topics are pipes; consumer applications are filters. Each filter is a separate service that scales independently.

### Workflow engines

```python
# Airflow DAG
extract = PythonOperator(task_id="extract", python_callable=extract_fn)
transform = PythonOperator(task_id="transform", python_callable=transform_fn)
load = PythonOperator(task_id="load", python_callable=load_fn)

extract >> transform >> load
```

Each operator is a filter; the DAG defines the pipes.

---

## Strengths

**1. Composability.** Build complex behaviour by combining simple filters. Test each filter in isolation.

**2. Parallel execution.** Independent stages run concurrently. Throughput = bottleneck filter's throughput.

**3. Easy to reason about.** Each filter has clear inputs/outputs. State is mostly local.

**4. Easy to scale.** Slow filter? Add replicas behind it. The pipe absorbs the imbalance.

**5. Easy to evolve.** Add a new transform between existing filters; remove one; swap implementations. Each is a localised change.

**6. Natural back-pressure.** Pipes block when full; producers slow naturally.

---

## Weaknesses

**1. Latency overhead per filter.** Each pipe transition has serialisation / queue / scheduler cost. Many small filters can be slow.

**2. Difficult error handling.** When filter 5 fails, what about data already passed by filters 1-4? Various strategies (DLQ, checkpointing, idempotency) — none simple.

**3. Stateful operations are awkward.** Aggregations, joins, dedup across filters need state stores or windowing concepts.

**4. Schema evolution.** Each pipe carries data with an implicit schema. Changing it propagates effects.

**5. Hard to debug.** "Where did this record disappear?" requires tracing through N filters.

**6. Operational sprawl.** N services / processes to monitor, deploy, scale.

---

## Pipes and filters vs event-driven

Both pass data through stages. Differences:

| | Pipes & filters | Event-driven |
|---|---|---|
| Mental model | Stream processing | Discrete event reactions |
| Coupling | Pipeline-shaped | Topology of arbitrary subscribers |
| State | Often stateless | Often stateful (aggregations) |
| Fan-out | Possible but explicit | Pub/sub natural |
| Examples | ETL, ffmpeg pipeline, kafka streams | Event sourcing, microservices choreography |

Stream processing systems (Kafka Streams, Flink) blend both — events flow through filter-like operators with stateful state stores.

See [Event-Driven Architecture](event-driven.md).

---

## Stateless vs stateful filters

```
Stateless filter:
  output = f(input)
  Each record processed independently
  Easy to parallelise, restart, replicate
  Examples: filter, map, transform

Stateful filter:
  state = update(state, input)
  output = f(state, input)
  Requires durable state store, checkpointing
  Examples: aggregation, deduplication, joining, windowing
```

Most pipelines have both. Stream processors (Flink, Kafka Streams) make stateful operations practical with managed state stores and exactly-once semantics.

---

## Backpressure

When a filter is slower than its upstream:

```
Producer ──► [██████████] ──► Slow filter
              full pipe
              
Producer must slow down or drop messages
```

Strategies:

- **Bounded buffers + block**: TCP-style; producer blocks (rare in distributed systems)
- **Drop**: shed load when overwhelmed
- **Spill to disk**: extend buffer beyond memory
- **Scale the slow filter**: add replicas
- **Apply rate limit upstream**: prevent buildup

See [Backpressure](../messaging/backpressure.md).

---

## Idempotency and exactly-once

If a filter is retried (crash recovery, network issue), processing the same record twice should be safe:

```
Idempotent filter:
  Input "X" → output "Y" — repeating produces same result

Non-idempotent filter:
  Input "X" → counter += 1 — repeating doubles the count
```

Patterns:

- Use idempotency keys (request IDs)
- Use upserts instead of inserts
- Track processed offsets (Kafka consumer offset)
- Use exactly-once semantics where the system supports it (Kafka transactions, Flink checkpoints)

See [Exactly-Once Semantics](../distributed/exactly-once.md), [Idempotency](../patterns/idempotency.md).

---

## Schema management

Pipes carry data; the data has structure. Changes break consumers.

```
Producer adds new field to events
Older filters ignore unknown fields → OK
But: filter expecting field X may break if removed
```

Use schema registries (Confluent Schema Registry, Avro / Protobuf with versioning). Make schema evolution explicit.

---

## When to choose pipes-and-filters

```
✓ Workflow has clear stages with data flowing one direction
✓ Each stage is independent (no tight coupling)
✓ Stages may scale at different rates
✓ Stages developed and operated by different teams
✓ Replay-ability matters (re-process past data)
✓ Composing different pipelines from common stages

✗ Tight, transactional coupling between stages
✗ Random / dynamic flow between stages
✗ Latency-sensitive stages where queue overhead matters
✗ Tiny scale where complexity exceeds benefit
```

---

## Examples by domain

| Domain | Pipeline |
|---|---|
| ETL | Source → Extract → Validate → Transform → Load → Warehouse |
| Stream processing | Topic → Filter → Map → Aggregate → Topic |
| Image service | Upload → Validate → Resize → Compress → Watermark → CDN |
| Logging | App → Agent → Parser → Enricher → Storage → Index |
| ML training | Raw data → Clean → Feature engineer → Train → Validate → Deploy |
| Build | Source → Compile → Test → Package → Sign → Publish |
| Search indexing | Source → Tokenize → Stem → Index → Replicate |

Same architectural style across very different problems.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you recognise pipes-and-filters as a style applicable beyond shell scripting.

**Strong answer pattern:**
1. Decompose into independent filters connected by pipes
2. Filters are composable, parallelisable, reusable
3. Stateful operations need durable state stores (stream processors)
4. Back-pressure flows naturally through bounded pipes
5. Idempotency and schema management are operational must-haves
6. Trade-offs: latency overhead per stage, debugging difficulty, operational sprawl

**Common follow-up:** *"How does pipes-and-filters relate to microservices?"*
> Microservices can be a pipes-and-filters topology when services form a clear pipeline. But microservices often form arbitrary graphs (request fan-out / fan-in) that aren't pipelines. Stream processing systems (Kafka Streams, Flink) are specifically designed for pipes-and-filters; general microservices are more flexible but lose some of the simplicity. The pattern shines in data and event pipelines, less in synchronous request handling.

---

## Related topics

- [Event-Driven Architecture](event-driven.md) — broader event-based style
- [Lambda & Kappa Architectures](lambda-kappa-architectures.md) — big-data variants
- [Backpressure](../messaging/backpressure.md) — flow control between filters
- [Exactly-Once Semantics](../distributed/exactly-once.md) — idempotency in pipelines
- [Kafka Deep Dive](../messaging/kafka.md) — pipes implementation
