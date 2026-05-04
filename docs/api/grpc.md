# gRPC

## What it is

gRPC (Google Remote Procedure Call) is a high-performance RPC framework that uses HTTP/2 for transport and Protocol Buffers (protobuf) as the interface definition language and serialization format. It generates type-safe client and server code in 11+ languages from a single `.proto` file.

```
Client (Go)                               Server (Java)
   │                                          │
   │  order_client.CreateOrder(req)           │
   │  ←── generated stub (type-safe) ───      │
   │                                          │
   │  ─── HTTP/2 binary frame ──────────────► │
   │  ◄── HTTP/2 binary frame ──────────────  │
   │                                          │
   │  return *CreateOrderResponse             │
```

No JSON parsing. No HTTP path routing. No SDK to maintain per language — protoc generates it.

## Protocol Buffers

### Defining a service

```protobuf
// order.proto
syntax = "proto3";

package order.v1;

option go_package = "github.com/example/gen/order/v1";

service OrderService {
  rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse);
  rpc GetOrder(GetOrderRequest) returns (Order);
  rpc ListOrders(ListOrdersRequest) returns (stream Order);  // server streaming
  rpc UpdateOrderStatus(stream UpdateStatusRequest) returns (UpdateStatusResponse);  // client streaming
  rpc TrackOrder(TrackOrderRequest) returns (stream TrackOrderEvent);  // bidi streaming
}

message CreateOrderRequest {
  string user_id = 1;
  repeated OrderItem items = 2;
  Address shipping_address = 3;
}

message CreateOrderResponse {
  Order order = 1;
}

message Order {
  string id = 1;
  string user_id = 2;
  repeated OrderItem items = 3;
  OrderStatus status = 4;
  google.protobuf.Timestamp created_at = 5;
}

message OrderItem {
  string product_id = 1;
  int32 quantity = 2;
  int64 price_cents = 3;
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_CONFIRMED = 2;
  ORDER_STATUS_SHIPPED = 3;
  ORDER_STATUS_DELIVERED = 4;
}

message Address {
  string street = 1;
  string city = 2;
  string country_code = 3;
}
```

### Code generation

```bash
# Install protoc and plugins
brew install protobuf
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Generate Go code
protoc \
  --go_out=gen \
  --go-grpc_out=gen \
  --proto_path=proto \
  order.proto

# Generated files:
#   gen/order/v1/order.pb.go        ← message types
#   gen/order/v1/order_grpc.pb.go   ← client/server interfaces
```

### Wire format comparison

```
JSON (REST):
{"user_id":"usr_123","items":[{"product_id":"p_500","quantity":2}]}
→ 65 bytes, requires parsing

Protobuf (gRPC):
[binary blob ~20 bytes] → already structured in memory
→ ~70% smaller, ~5-10x faster to serialize/deserialize
```

Field numbers (1, 2, 3...) in the `.proto` file are what gets encoded — not field names. This is what makes the binary format compact.

## Four streaming modes

| Mode | Pattern | Use case |
|---|---|---|
| Unary | Request → Response | Most RPCs (CRUD) |
| Server streaming | Request → stream of Responses | Real-time updates, large result sets |
| Client streaming | stream of Requests → Response | File upload, bulk insert |
| Bidirectional | stream ↔ stream | Chat, real-time collaboration |

### Server streaming example

```go
// Server (Go)
func (s *OrderServer) ListOrders(req *pb.ListOrdersRequest, stream pb.OrderService_ListOrdersServer) error {
    orders, err := s.db.QueryOrders(req.UserId)
    if err != nil {
        return status.Errorf(codes.Internal, "query failed: %v", err)
    }
    
    for _, order := range orders {
        if err := stream.Send(order); err != nil {
            return err  // client disconnected
        }
    }
    return nil
}

// Client (Go)
stream, err := client.ListOrders(ctx, &pb.ListOrdersRequest{UserId: "usr_123"})
if err != nil {
    log.Fatal(err)
}

for {
    order, err := stream.Recv()
    if err == io.EOF {
        break  // stream complete
    }
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(order.Id)
}
```

### Bidirectional streaming example

```go
// Real-time order tracking
stream, err := client.TrackOrder(ctx)

// Send tracking requests
go func() {
    for _, orderID := range orderIDs {
        stream.Send(&pb.TrackOrderRequest{OrderId: orderID})
    }
    stream.CloseSend()
}()

// Receive events
for {
    event, err := stream.Recv()
    if err == io.EOF {
        break
    }
    fmt.Printf("Order %s: %s\n", event.OrderId, event.Status)
}
```

## HTTP/2 transport

gRPC runs exclusively on HTTP/2, which gives it:

```
HTTP/1.1 (REST):
  Connection 1: [request1] → wait → [response1]
  Connection 2: [request2] → wait → [response2]
  → Multiple TCP connections, head-of-line blocking

HTTP/2 (gRPC):
  Single connection:
    Stream 1: [request1] ─────────────── [response1]
    Stream 3: [request2] ──── [response2]
    Stream 5: [request3] ─────────────────── [response3]
  → Multiplexed, no HOL blocking, connection reuse
```

**gRPC framing:**
```
HTTP/2 HEADERS frame:
  :method: POST
  :path: /order.v1.OrderService/CreateOrder
  :scheme: https
  content-type: application/grpc
  grpc-timeout: 5S

HTTP/2 DATA frame:
  [5-byte length-prefixed protobuf message]

HTTP/2 HEADERS frame (trailers):
  grpc-status: 0
  grpc-message: ""
```

## Error handling

gRPC uses status codes, not HTTP status codes:

```go
import "google.golang.org/grpc/codes"
import "google.golang.org/grpc/status"

// Server returns errors
func (s *OrderServer) GetOrder(ctx context.Context, req *pb.GetOrderRequest) (*pb.Order, error) {
    order, err := s.db.FindOrder(req.Id)
    if err == sql.ErrNoRows {
        return nil, status.Errorf(codes.NotFound, "order %s not found", req.Id)
    }
    if err != nil {
        return nil, status.Errorf(codes.Internal, "database error: %v", err)
    }
    if !s.hasAccess(ctx, order) {
        return nil, status.Errorf(codes.PermissionDenied, "access denied")
    }
    return order, nil
}

// Client handles errors
resp, err := client.GetOrder(ctx, &pb.GetOrderRequest{Id: "ord_123"})
if err != nil {
    st := status.FromError(err)  // always succeeds
    switch st.Code() {
    case codes.NotFound:
        // handle not found
    case codes.PermissionDenied:
        // handle auth error
    default:
        // unexpected error
    }
}
```

**gRPC status codes:**

| Code | Meaning | HTTP equivalent |
|---|---|---|
| OK (0) | Success | 200 |
| CANCELLED (1) | Client cancelled | 499 |
| INVALID_ARGUMENT (3) | Bad request | 400 |
| NOT_FOUND (5) | Resource not found | 404 |
| ALREADY_EXISTS (6) | Duplicate | 409 |
| PERMISSION_DENIED (7) | Not authorized | 403 |
| RESOURCE_EXHAUSTED (8) | Rate limit / quota | 429 |
| FAILED_PRECONDITION (9) | State conflict | 400 |
| UNAVAILABLE (14) | Server down | 503 |
| UNAUTHENTICATED (16) | Not authenticated | 401 |
| INTERNAL (13) | Server error | 500 |

### Rich error details

```protobuf
// google.rpc.Status with details
import "google/rpc/error_details.proto";
```

```go
// Return validation errors with field details
st, _ := status.New(codes.InvalidArgument, "validation failed").
    WithDetails(&errdetails.BadRequest{
        FieldViolations: []*errdetails.BadRequest_FieldViolation{
            {Field: "items[0].quantity", Description: "must be > 0"},
            {Field: "shipping_address.country_code", Description: "must be ISO 3166-1 alpha-2"},
        },
    })
return nil, st.Err()
```

## Interceptors (middleware)

Interceptors are the gRPC equivalent of HTTP middleware. They run before/after RPCs.

### Unary interceptor

```go
// Logging interceptor
func loggingInterceptor(
    ctx context.Context,
    req interface{},
    info *grpc.UnaryServerInfo,
    handler grpc.UnaryHandler,
) (interface{}, error) {
    start := time.Now()
    
    resp, err := handler(ctx, req)
    
    st, _ := status.FromError(err)
    log.Printf(
        "method=%s status=%s duration=%s",
        info.FullMethod,
        st.Code(),
        time.Since(start),
    )
    return resp, err
}

// Auth interceptor
func authInterceptor(
    ctx context.Context,
    req interface{},
    info *grpc.UnaryServerInfo,
    handler grpc.UnaryHandler,
) (interface{}, error) {
    md, ok := metadata.FromIncomingContext(ctx)
    if !ok {
        return nil, status.Error(codes.Unauthenticated, "no metadata")
    }
    
    tokens := md.Get("authorization")
    if len(tokens) == 0 {
        return nil, status.Error(codes.Unauthenticated, "no token")
    }
    
    claims, err := validateJWT(tokens[0])
    if err != nil {
        return nil, status.Error(codes.Unauthenticated, "invalid token")
    }
    
    ctx = context.WithValue(ctx, "user_id", claims.Subject)
    return handler(ctx, req)
}

// Register interceptors (chain)
server := grpc.NewServer(
    grpc.ChainUnaryInterceptor(
        authInterceptor,
        loggingInterceptor,
        recoveryInterceptor,
    ),
)
```

### Popular interceptor libraries

```go
import "github.com/grpc-ecosystem/go-grpc-middleware/v2"

// go-grpc-middleware provides:
// - Recovery (panic → INTERNAL)
// - Auth
// - Logging (zap, logrus, slog)
// - Retry
// - Validator (proto-level validation)
// - Rate limiting
```

## Deadlines and cancellation

gRPC propagates deadlines across service boundaries automatically:

```go
// Client sets deadline
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

resp, err := client.CreateOrder(ctx, req)
// If CreateOrder calls payment-service internally,
// the remaining deadline propagates to that call too
```

```go
// Server respects deadline
func (s *OrderServer) CreateOrder(ctx context.Context, req *pb.CreateOrderRequest) (*pb.CreateOrderResponse, error) {
    // Check if client already gave up
    if ctx.Err() != nil {
        return nil, status.FromContextError(ctx.Err()).Err()
    }
    
    // Payment service call inherits remaining deadline
    payResp, err := s.paymentClient.Charge(ctx, chargeReq)
    // ...
}
```

**Why this matters:** If a user's browser times out after 3s, the entire call chain gets cancelled — no wasted work in downstream services.

## gRPC-Web and gRPC-Gateway

Browsers can't use gRPC directly (no HTTP/2 trailer support). Two solutions:

### gRPC-Web

Translates gRPC to a browser-compatible format. Requires an Envoy proxy in front.

```
Browser ──gRPC-Web──► Envoy proxy ──gRPC──► gRPC server
```

### gRPC-Gateway

Generates a REST reverse-proxy from your `.proto` annotations:

```protobuf
import "google/api/annotations.proto";

service OrderService {
  rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse) {
    option (google.api.http) = {
      post: "/v1/orders"
      body: "*"
    };
  }
  
  rpc GetOrder(GetOrderRequest) returns (Order) {
    option (google.api.http) = {
      get: "/v1/orders/{id}"
    };
  }
}
```

```bash
# Generate REST gateway
protoc \
  --grpc-gateway_out=gen \
  --proto_path=proto \
  order.proto
```

```
REST client ──► gRPC-Gateway ──► gRPC server
               (auto-generated
                HTTP proxy)
```

Result: one `.proto` file serves both gRPC (internal services) and REST (external clients).

## Service reflection and tooling

```bash
# grpcurl: curl for gRPC
grpcurl -plaintext localhost:50051 list
# → order.v1.OrderService
# → grpc.reflection.v1alpha.ServerReflection

grpcurl -plaintext localhost:50051 describe order.v1.OrderService
# → service definition

grpcurl -plaintext \
  -d '{"user_id":"usr_123"}' \
  localhost:50051 \
  order.v1.OrderService/CreateOrder
```

```bash
# evans: interactive gRPC client (like Postman for gRPC)
evans --proto order.proto repl
```

Enable reflection on server (required for grpcurl without .proto):

```go
import "google.golang.org/grpc/reflection"

server := grpc.NewServer()
pb.RegisterOrderServiceServer(server, &OrderServer{})
reflection.Register(server)  // enables grpcurl discovery
```

## AWS context

| Need | Solution |
|---|---|
| gRPC on ECS/EKS | NLB (not ALB) — ALB doesn't support gRPC trailers for server streaming |
| ALB for gRPC | ALB supports gRPC unary calls with `protocol-version: GRPC` target |
| Service mesh | AWS App Mesh or Istio — manage gRPC traffic, mTLS, retries |
| API Gateway | HTTP API Gateway supports gRPC-Web; not native gRPC |
| Client access | Use gRPC-Gateway or gRPC-Web + Envoy sidecar |

```yaml
# ECS task with Envoy sidecar for gRPC-Web
services:
  app:
    image: myapp:latest
    ports: []  # no direct exposure
  
  envoy:
    image: envoyproxy/envoy:latest
    ports:
      - "8080:8080"  # REST/gRPC-Web
      - "9090:9090"  # native gRPC
    volumes:
      - ./envoy.yaml:/etc/envoy/envoy.yaml
```

## Interview angle

!!! tip "When gRPC comes up"
    Usually in "internal service communication" or "why not REST for microservices?"

**Strong answer pattern:**
1. Use gRPC for internal service-to-service — protobuf is faster, streaming is native, deadlines propagate
2. REST for external/public APIs — universal browser support, easier to debug, tooling everywhere
3. gRPC-Gateway if you need both from one proto definition
4. gRPC requires HTTP/2 — NLB on AWS for full streaming support; ALB for unary only
5. Interceptors = middleware — auth, logging, retry at the framework level

## Related topics

- [REST](rest.md) — the external-facing alternative
- [REST vs gRPC vs GraphQL](comparison.md) — decision guide
- [Protocol Buffers](https://protobuf.dev) — the IDL and serialization format
- [Load Balancing](../networking/load-balancing.md) — gRPC needs L7 or L4 LB considerations
- [Service Mesh](../infrastructure/service-mesh.md) — Istio/Envoy manage gRPC traffic
