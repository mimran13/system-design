# Data Encoding & Serialization

Serialization is the process of converting in-memory data structures into a format that can be stored or transmitted. Every time a service talks to another service, data is serialized and deserialized. Your choice of format affects performance, schema evolution, and interoperability.

---

## Why it matters

```
Service A (Python object) → serialize → bytes → network → deserialize → Service B (Java object)
```

The serialization format determines:
- **Payload size** → bandwidth and latency
- **Parse speed** → CPU cost per request
- **Schema evolution** → can you add fields without breaking clients?
- **Human readability** → debuggability vs efficiency

---

## JSON

The lingua franca of web APIs. Human-readable, universally supported.

```json
{
  "user_id": 12345,
  "name": "Alice",
  "email": "alice@example.com",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Strengths:**
- Human-readable — easy to debug with `curl` and browser DevTools
- Language-agnostic — every language has a JSON library
- Schema-flexible — add fields without a registry

**Weaknesses:**
- Verbose — field names repeated in every message
- No types — `"42"` vs `42`, no distinction between int32/int64
- No binary — images/blobs must be base64 encoded (33% overhead)
- Slow parsing — text parsing is slower than binary
- No schema enforcement — typos silently pass through

**Typical size:** 100–300 bytes for a user record

---

## Protocol Buffers (Protobuf)

Google's binary serialization format. Used in gRPC, internal Google services, and high-throughput systems.

```protobuf
// user.proto
syntax = "proto3";

message User {
  uint64 user_id  = 1;
  string name     = 2;
  string email    = 3;
  int64  created_at = 4;  // Unix timestamp
}
```

Generated code handles serialization:
```python
user = User(user_id=12345, name="Alice", email="alice@example.com")
bytes_data = user.SerializeToString()   # compact binary
user2 = User.FromString(bytes_data)     # deserialize
```

**Strengths:**
- ~3-10× smaller than JSON, ~5-10× faster to parse
- Strongly typed — field types enforced at compile time
- Schema evolution — add new fields with new numbers; old clients ignore unknown fields
- Generated code — serialization is never hand-rolled

**Weaknesses:**
- Not human-readable — requires tooling to inspect (`protoc --decode`)
- Schema required — both sides must have the `.proto` file
- Schema registry needed in large orgs

**Typical size:** 20–50 bytes for a user record

### Schema evolution rules

```protobuf
// v1
message User {
  uint64 user_id = 1;
  string name    = 2;
}

// v2 — safe additions
message User {
  uint64 user_id   = 1;
  string name      = 2;
  string email     = 3;   // NEW — old clients just ignore it
  // NEVER reuse field number 1 or 2 — wire format breaks
}
```

**Safe changes:** Add new optional fields, rename fields (number is the wire identity)  
**Breaking changes:** Change field type, reuse a field number, remove a required field

---

## Apache Avro

Schema-based binary format popular in the Kafka / Hadoop ecosystem.

```json
{
  "type": "record",
  "name": "User",
  "fields": [
    {"name": "user_id", "type": "long"},
    {"name": "name",    "type": "string"},
    {"name": "email",   "type": ["null", "string"], "default": null}
  ]
}
```

**Key difference from Protobuf:** Schema is stored with the data (or in a schema registry), not compiled into code.

```python
import fastavro

schema = fastavro.parse_schema(json.loads(schema_json))

# Write
with open("users.avro", "wb") as f:
    fastavro.writer(f, schema, [{"user_id": 1, "name": "Alice", "email": "alice@example.com"}])

# Read — schema inferred from file header
with open("users.avro", "rb") as f:
    for record in fastavro.reader(f):
        print(record)
```

**Strengths:**
- Schema stored in the message (or registry) — reader doesn't need to know schema in advance
- Excellent for schema evolution with reader/writer schema resolution
- Native support for nullable fields via union types
- First-class support in Kafka Schema Registry

**Weaknesses:**
- Schema always needed at read time (not fully self-describing without registry)
- Less IDE/tooling support than Protobuf

---

## MessagePack

Binary JSON — same structure as JSON but encoded as binary. Minimal friction migration from JSON.

```python
import msgpack

data = {"user_id": 12345, "name": "Alice"}
packed = msgpack.packb(data)    # ~25 bytes vs ~40 bytes JSON
unpacked = msgpack.unpackb(packed, raw=False)
```

Good for: internal APIs where you want JSON semantics with better performance, without adopting Protobuf's schema tooling.

---

## Comparison

| | JSON | Protobuf | Avro | MessagePack |
|---|---|---|---|---|
| Format | Text | Binary | Binary | Binary |
| Size (vs JSON) | 1× | ~0.3× | ~0.3× | ~0.5× |
| Parse speed | Slow | Fast | Fast | Medium |
| Human-readable | Yes | No | No | No |
| Schema required | No | Yes (.proto) | Yes (JSON schema) | No |
| Schema evolution | Manual | Excellent | Excellent | Manual |
| Language support | Universal | Good | Good (JVM-heavy) | Good |
| Best for | Public APIs, debugging | gRPC, high-throughput internal | Kafka, Hadoop | Simple binary upgrade |

---

## Schema Registry

In event-driven systems, producers and consumers evolve independently. A schema registry stores versioned schemas and enforces compatibility.

```
Producer (v2 schema) → Confluent Schema Registry
                     ← schema_id=42

Consumer (v1 schema) → Registry: "is v2 backward-compatible with v1?"
                     ← yes → consumer reads v2 data with v1 schema

Compatibility modes:
  BACKWARD:  new schema can read old data (consumer upgrades first)
  FORWARD:   old schema can read new data (producer upgrades first)
  FULL:      both directions safe
```

---

## Text vs Binary: when to choose what

```
Public REST API:          JSON — debuggability and interoperability trump performance
Internal microservices:   Protobuf — performance, type safety, schema evolution
Kafka event streaming:    Avro + Schema Registry — schema evolution at scale
Config files:             YAML / TOML — human-readable, hand-editable
High-throughput metrics:  Binary (Protobuf, custom) — nanosecond parse time matters
```

---

## Encoding pitfalls

**Floating-point precision:**
```python
# JSON has no distinction between 32-bit and 64-bit floats
# 0.1 + 0.2 ≠ 0.3 in IEEE 754
# Use strings for money, Decimal in Python, or integers (cents)
{"price": "19.99"}    # correct
{"price": 19.99}      # dangerous — floating-point representation
```

**Large integers:**
```json
// JavaScript max safe integer: 2^53 - 1 = 9007199254740991
// 64-bit IDs exceed this — JavaScript silently truncates
{"user_id": 9007199254740993}  // JS reads this as 9007199254740992
// Fix: send as string
{"user_id": "9007199254740993"}
```

**Time zones:**
```python
# Always serialize timestamps as UTC ISO 8601 or Unix epoch
{"created_at": "2024-01-15T10:30:00Z"}     # correct (UTC explicit)
{"created_at": "2024-01-15T10:30:00"}      # ambiguous timezone
{"created_at": 1705314600}                 # Unix timestamp (unambiguous)
```

---

## Compression

Serialization format and compression are independent choices:

| Format | With gzip | With zstd |
|---|---|---|
| JSON 1000 bytes | ~200 bytes | ~150 bytes |
| Protobuf 300 bytes | ~180 bytes | ~130 bytes |

Protobuf + zstd ≈ 8× smaller than raw JSON. Use compression at the transport layer (HTTP `Content-Encoding: gzip`) or storage layer (S3 object compression) without changing the serialization format.

---

## Interview angle

!!! tip "Serialization questions in system design"
    - *"What format would you use for your API?"* → Public API: JSON for interoperability. Internal high-throughput: Protobuf for size and type safety. Kafka: Avro with schema registry for evolution.
    - *"How do you handle breaking schema changes without downtime?"* → Additive changes only (new optional fields). Deploy consumers before producers (backward compatibility). Use feature flags. Schema registry enforces compatibility rules.
    - *"Why not just use JSON everywhere?"* → JSON is fine at low volume. At 100k req/s, Protobuf's 5× parse speed and 3× smaller payload meaningfully reduce CPU and bandwidth costs.

## Related topics

- [API Design: gRPC](../api/grpc.md) — Protobuf over HTTP/2
- [Messaging: Kafka](../messaging/kafka.md) — Avro + schema registry in practice
- [API Design: REST](../api/rest.md) — JSON APIs
- [Networking: HTTP Versions](../networking/http-versions.md) — transport layer for serialized data
