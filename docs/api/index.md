# API Design

How services expose and consume functionality. API design decisions have long lifetimes — they're hard to change once clients depend on them.

| Topic | One-liner |
|---|---|
| [REST](rest.md) | Constraints, HTTP semantics, resource modeling |
| [gRPC](grpc.md) | Protobuf, HTTP/2, streaming — when REST isn't enough |
| [GraphQL](graphql.md) | Client-driven queries, N+1 problem, subscriptions |
| [REST vs gRPC vs GraphQL](comparison.md) | Decision framework with tradeoffs |
| [Webhooks](webhooks.md) | Push-based event delivery to external systems |
| [API Versioning](versioning.md) | URI, header, and content-type strategies |
| [Pagination](pagination.md) | Offset, cursor, keyset — and why cursor wins at scale |
