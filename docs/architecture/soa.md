# Service-Oriented Architecture

## What it is

Service-Oriented Architecture (SOA) is an architectural style where software is composed of loosely coupled, interoperable services that communicate over a network. Each service represents a distinct business function and exposes a standard interface.

SOA predates microservices (2000s enterprise architecture). Microservices are a refinement of SOA principles.

## SOA vs Microservices

The distinction is often blurry, but the philosophy differs:

| | SOA | Microservices |
|---|---|---|
| **Service size** | Large, enterprise-scale | Small, single-purpose |
| **Communication** | Enterprise Service Bus (ESB) | Direct HTTP/gRPC or lightweight messaging |
| **Data** | Shared enterprise database or schema | Each service owns its own data |
| **Governance** | Centralized (ESB, shared schemas) | Decentralized (teams own their services) |
| **Deployment** | Often shared infrastructure | Independent deployment |
| **Technology** | Standardized (XML/SOAP/WSDL) | Polyglot |
| **Organization** | Enterprise-wide | Team-sized |

## Enterprise Service Bus (ESB)

The core of traditional SOA. A centralized middleware that handles communication, transformation, and orchestration:

```
Service A → ESB → Service B
             ↕
          Message transformation
          Protocol conversion
          Routing
          Orchestration
          Security enforcement
          Logging
```

**ESB examples:** MuleSoft, IBM MQ, Apache ServiceMix, Oracle SOA Suite

**Criticism:** ESB becomes a bottleneck and single point of failure. Complex logic embedded in middleware rather than services. "Smart pipes, dumb endpoints" vs microservices' "smart endpoints, dumb pipes."

## SOA principles still relevant today

SOA introduced principles that microservices refined and retained:

**Service contract:** Explicitly define inputs, outputs, and behaviors (WSDL then, OpenAPI/Protobuf now).

**Loose coupling:** Services should have minimal knowledge of each other's internals.

**Abstraction:** Hide implementation details behind the service interface.

**Reusability:** Services designed to be used in multiple contexts.

**Statelessness:** Services don't retain client state between calls.

**Discoverability:** Services can be found by other services (service registry then, service discovery now).

**Composability:** Complex functionality built by composing simpler services.

## SOAP vs REST vs gRPC

SOA initially used SOAP (Simple Object Access Protocol). REST and gRPC emerged as simpler alternatives.

| | SOAP | REST | gRPC |
|---|---|---|---|
| **Protocol** | XML over HTTP/SMTP | HTTP | HTTP/2 |
| **Format** | XML | JSON (typically) | Protobuf (binary) |
| **Contract** | WSDL (strict) | OpenAPI (optional) | .proto file (strict) |
| **Tooling** | Heavy | Lightweight | Code generation |
| **Performance** | Slow (XML verbose) | Medium | Fast (binary) |
| **Type safety** | Strong | Weak | Strong |
| **Streaming** | No | Limited | Yes (bidirectional) |

SOAP is largely replaced, but some enterprise/banking systems still use it. Know how to integrate with it (usually via ACL adapters).

## Service registry and discovery

SOA introduced service registries — catalogues of available services:

**Traditional (Eureka, Consul, ZooKeeper):**
```
Service A starts → registers with Service Registry { name: "payment", url: "http://10.0.1.5:8080" }
Service B needs payment service → query Registry → gets URL → calls directly
```

**Modern Kubernetes (DNS-based):**
```
Service A → kube-dns → ClusterIP of payment-service → any payment pod
```

See [Service Discovery](../distributed/service-discovery.md) for full coverage.

## SOA in practice today

Modern enterprise architectures often use SOA concepts with contemporary tooling:

```
API Management layer (Apigee, Kong, AWS API Gateway):
  - Service catalog
  - Versioning
  - Auth/security enforcement
  - Rate limiting
  - Analytics

Event backbone (Kafka):
  - Async communication between services
  - Event-driven integration

Microservices (deployed in Kubernetes):
  - Independent services with their own data
  - Standard REST/gRPC interfaces
```

This is effectively "modern SOA" or "microservices" depending on who you ask — the lines are blurry.

## Interview angle

!!! tip "When SOA comes up"
    Usually in context of "designing for an enterprise" or "integrating with legacy systems." Know the ESB pattern and why microservices moved away from it.

**Key points:**
1. SOA = right principles, ESB = wrong implementation
2. Microservices refined SOA: removed ESB, made services smaller and fully independent
3. Integration with legacy SOAP services → use ACL (Anticorruption Layer) to translate
4. Service registry is still a thing — just built into Kubernetes/service mesh now

## Related topics

- [Monolith vs Microservices](monolith-vs-microservices.md) — microservices as evolved SOA
- [API Design](../api/index.md) — REST, gRPC, GraphQL as modern alternatives to SOAP
- [Service Discovery](../distributed/service-discovery.md) — the modern service registry
- [Service Mesh](../infrastructure/service-mesh.md) — modern cross-cutting concerns layer
