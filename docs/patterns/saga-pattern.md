---
tags:
  - interview-critical
  - applied
---

# Saga Pattern

## What it is

The Saga pattern manages distributed transactions across multiple services — each service has its own database, so traditional ACID transactions don't work. A saga is a sequence of local transactions, where each transaction publishes an event or sends a command to trigger the next step. If any step fails, compensating transactions undo the previous steps.

## You'll see this when...

- Order placed but payment never charged (or vice versa) — multi-step transaction fell apart mid-way
- "We need a distributed transaction across services" — usually saga is the answer
- Workflow with reservation → charge → ship steps, each in its own service
- Compensating actions like `refund()`, `cancelReservation()`, `releaseInventory()` exist
- Tools like Temporal, AWS Step Functions, Camunda, Cadence are in the stack
- An orchestrator service drives a multi-step business process across teams
- Code has explicit "rollback" logic that runs forward (not DB rollback)

## The problem it solves

```
Monolith (easy):
  BEGIN TRANSACTION
    deduct_inventory()
    charge_payment()
    create_order()
  COMMIT  ← all or nothing

Microservices (hard):
  Order Service (own DB)
  Payment Service (own DB)
  Inventory Service (own DB)
  
  No single transaction can span all three.
  If payment succeeds but inventory fails → inconsistent state
```

## Saga vs 2PC

| | Saga | 2PC |
|---|---|---|
| Coordination | Choreography or orchestration | Central coordinator |
| Consistency | Eventually consistent with compensation | ACID (blocking) |
| Availability | High (no blocking) | Low (coordinators block) |
| Failure recovery | Compensating transactions | Coordinator restart |
| Coupling | Low (events) | High (coordinator knows all) |
| Performance | Fast (async) | Slow (synchronous rounds) |

Sagas are the preferred approach for microservices. 2PC is appropriate only within a single database or when strict ACID is unavoidable.

## Implementations

### Choreography (event-based)

Each service listens for events from the previous step and publishes events for the next:

```mermaid
sequenceDiagram
    participant OS as Order Service
    participant PS as Payment Service
    participant IS as Inventory Service
    participant NS as Notification Service

    OS->>OS: Create order (PENDING)
    OS->>+PS: Event: OrderCreated
    PS->>PS: Reserve payment
    PS->>IS: Event: PaymentReserved
    IS->>IS: Reserve inventory
    IS->>NS: Event: InventoryReserved
    NS->>NS: Send confirmation
    NS->>OS: Event: OrderConfirmed
    OS->>OS: Update order → CONFIRMED
```

**On failure (e.g., inventory fails):**
```mermaid
sequenceDiagram
    participant PS as Payment Service
    participant IS as Inventory Service
    participant OS as Order Service

    PS->>IS: Event: PaymentReserved
    IS->>IS: Inventory check fails
    IS->>PS: Event: InventoryFailed
    PS->>PS: Compensate: release payment
    PS->>OS: Event: PaymentReleased
    OS->>OS: Update order → FAILED
```

**Pros:** No central coordinator, services fully decoupled  
**Cons:** Hard to track overall saga state, circular dependencies can emerge, difficult to debug

### Orchestration (command-based)

A central saga orchestrator sends commands to each service and receives responses:

```mermaid
sequenceDiagram
    participant O as Saga Orchestrator
    participant PS as Payment Service
    participant IS as Inventory Service
    participant NS as Notification Service

    Note over O: Order Saga started
    O->>PS: Command: ReservePayment
    PS-->>O: PaymentReserved
    O->>IS: Command: ReserveInventory
    IS-->>O: InventoryReserved
    O->>NS: Command: SendConfirmation
    NS-->>O: NotificationSent
    Note over O: Saga complete → mark order CONFIRMED
```

**On failure:**
```mermaid
sequenceDiagram
    participant O as Saga Orchestrator
    participant PS as Payment Service
    participant IS as Inventory Service

    O->>PS: Command: ReservePayment
    PS-->>O: PaymentReserved
    O->>IS: Command: ReserveInventory
    IS-->>O: InventoryFailed (out of stock)
    
    Note over O: Compensation phase
    O->>PS: Command: ReleasePayment (compensate)
    PS-->>O: PaymentReleased
    Note over O: Saga failed → mark order FAILED
```

**Pros:** Clear central view of saga state, easier to debug, single place for business logic  
**Cons:** Orchestrator is a central coupling point, can become a god class

## Compensating transactions

Compensation undoes the effect of a previous step — not a rollback (which is impossible across services), but a semantic undo:

| Step | Forward transaction | Compensating transaction |
|---|---|---|
| Reserve payment | Deduct from available balance | Release back to available balance |
| Reserve inventory | Mark units as reserved | Release reservation |
| Create shipment | Create shipment record | Cancel shipment |
| Send email | Send email | (Cannot undo — idempotency instead) |

**Some operations are non-compensatable** (email sent, push notification). For these, design for idempotency and accept they may be sent even if the saga ultimately fails. The order may fail, but the "order received" email was already sent — design the email to not commit to success.

## Saga state persistence

The orchestrator must persist its state so it can resume after crash:

```python
class OrderSaga:
    def __init__(self, order_id):
        self.order_id = order_id
        self.state = 'started'
        
    def handle_event(self, event):
        if self.state == 'started' and event == 'PaymentReserved':
            self.state = 'payment_reserved'
            self.save()
            self.send_command('ReserveInventory')
        
        elif self.state == 'payment_reserved' and event == 'InventoryReserved':
            self.state = 'inventory_reserved'
            self.save()
            self.send_command('SendConfirmation')
        
        elif self.state == 'payment_reserved' and event == 'InventoryFailed':
            self.state = 'compensating'
            self.save()
            self.send_command('ReleasePayment')
        
        # ...
    
    def save(self):
        db.execute("UPDATE sagas SET state=%s WHERE id=%s", 
                   (self.state, self.order_id))
```

**Saga log:** Store each step + status in a persistent store. On recovery, replay from last committed step.

## Handling partial failures and idempotency

Services may receive duplicate commands (at-least-once delivery). All saga participants must be idempotent:

```python
# Payment service: handle duplicate ReservePayment commands
def reserve_payment(order_id, amount):
    existing = db.get("SELECT * FROM reservations WHERE order_id=%s", order_id)
    if existing:
        # Already processed — return success (idempotent)
        return {'status': 'already_reserved', 'reservation_id': existing.id}
    
    # Process new reservation
    reservation = create_reservation(order_id, amount)
    return {'status': 'reserved', 'reservation_id': reservation.id}
```

## Saga vs Outbox pattern

Sagas are often paired with the [Outbox Pattern](outbox.md):

```
Service publishes saga event atomically with local DB write:
  1. Local transaction: INSERT order + INSERT saga_event (outbox table)
  2. Outbox poller: reads events, publishes to Kafka
  
Guarantees event is published if DB write succeeded.
Prevents: "DB committed but event not published."
```

## AWS implementation

```
Saga orchestrator options on AWS:
  - AWS Step Functions (Express Workflows)
    Managed state machine, visual workflow, supports compensation
  
  - Custom orchestrator on ECS/Lambda + DynamoDB (state store)
  
  - Apache Conductor or Temporal on EKS
```

**AWS Step Functions for sagas:**
```json
{
  "StartAt": "ReservePayment",
  "States": {
    "ReservePayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:PaymentService",
      "Catch": [{
        "ErrorEquals": ["PaymentFailed"],
        "Next": "OrderFailed"
      }],
      "Next": "ReserveInventory"
    },
    "ReserveInventory": {
      "Type": "Task",
      "Catch": [{
        "ErrorEquals": ["InventoryFailed"],
        "Next": "ReleasePaymentCompensation"
      }],
      "Next": "SendConfirmation"
    },
    "ReleasePaymentCompensation": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:ReleasePayment",
      "Next": "OrderFailed"
    }
  }
}
```

## Interview angle

!!! tip "What interviewers are testing"
    Any system design with microservices + money/inventory/orders needs saga or 2PC. They want to see you choose saga and explain compensation.

**Strong answer pattern:**
1. Identify the distributed transaction need — order + payment + inventory
2. Choose saga over 2PC — better availability, async, no blocking
3. Choose orchestration over choreography — easier to trace and debug for complex flows
4. Define compensating transactions for each step
5. Pair with outbox pattern for reliable event publishing
6. Mention idempotency — all participants must handle duplicate commands

## Related topics

- [Distributed Transactions](../distributed/distributed-transactions.md) — why 2PC is avoided
- [Event-Driven Architecture](../architecture/event-driven.md) — choreography uses events
- [Outbox Pattern](outbox.md) — reliable event publishing from DB write
- [Idempotency](idempotency.md) — required for saga compensation
- [CQRS](cqrs.md) — often used alongside saga
- [Durable Workflows](durable-workflows.md) — Temporal / Step Functions as orchestrators for sagas
