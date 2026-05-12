# Event Sourcing

## What it is

Instead of storing the current state of an entity, event sourcing stores the sequence of events that led to that state. The current state is derived by replaying all past events. The event log is the source of truth, not the current state.

## You'll see this when...

- Audit / regulatory requirement: "show every change to this record over time"
- "What did the customer balance look like on March 5th at 2pm?" — temporal queries
- Need to rebuild a derived view (search index, analytics) from scratch
- Banking, healthcare, trading, government — domains where audit is mandatory
- EventStoreDB, Axon, or `events` table with append-only semantics in the codebase
- Bug discovered: replay events to reproduce production state in staging
- Complex domain with rich behaviour — DDD aggregate roots emit events

```
Traditional (state-based):
  accounts table: { id: 123, balance: 250 }
  UPDATE accounts SET balance = 250 WHERE id = 123

Event Sourced:
  events table:
    { account_id: 123, type: "Opened",    amount: 500,  at: 10:00 }
    { account_id: 123, type: "Withdrawn", amount: 100,  at: 11:00 }
    { account_id: 123, type: "Withdrawn", amount: 150,  at: 14:00 }
  
  Current balance = 500 - 100 - 150 = 250
```

## Benefits

| Benefit | Description |
|---|---|
| **Complete audit log** | Every change is recorded — who did what, when, and in what order |
| **Temporal queries** | "What was the balance at 12:00 yesterday?" — replay up to that point |
| **Bug recovery** | Replay events with the bug fixed to correct state |
| **CQRS read models** | Project any read model from the same event stream |
| **Event replay** | Add a new service and give it the full history |
| **Debugging** | Reproduce any past state exactly |

## Core concepts

### Event

An immutable record of something that happened. Always past tense. Contains the minimal data needed to describe the change.

```python
@dataclass(frozen=True)
class MoneyWithdrawn:
    account_id: str
    amount: Decimal
    currency: str
    timestamp: datetime
    initiated_by: str      # user or system
    transaction_ref: str   # idempotency key
```

**Immutable:** Events are never updated or deleted. The log only grows.

### Aggregate

The entity whose state is rebuilt from events. Responsible for business rules validation before emitting events.

```python
class BankAccount:
    def __init__(self, account_id: str):
        self.account_id = account_id
        self.balance = Decimal(0)
        self.status = 'closed'
        self.version = 0
        self._pending_events = []
    
    @classmethod
    def from_events(cls, account_id: str, events: List[Event]) -> 'BankAccount':
        """Rebuild state by replaying events"""
        account = cls(account_id)
        for event in events:
            account._apply(event)
        return account
    
    # Commands (validate → emit event)
    def withdraw(self, amount: Decimal, ref: str):
        if self.status != 'active':
            raise AccountInactiveError()
        if amount <= 0:
            raise InvalidAmountError()
        if amount > self.balance:
            raise InsufficientFundsError(f"Balance: {self.balance}, requested: {amount}")
        
        event = MoneyWithdrawn(
            account_id=self.account_id,
            amount=amount,
            currency='USD',
            timestamp=datetime.utcnow(),
            initiated_by='user',
            transaction_ref=ref
        )
        self._apply(event)
        self._pending_events.append(event)
    
    # Apply (update in-memory state from event)
    def _apply(self, event: Event):
        if isinstance(event, AccountOpened):
            self.balance = event.initial_deposit
            self.status = 'active'
        elif isinstance(event, MoneyDeposited):
            self.balance += event.amount
        elif isinstance(event, MoneyWithdrawn):
            self.balance -= event.amount
        elif isinstance(event, AccountClosed):
            self.status = 'closed'
        self.version += 1
    
    def uncommitted_events(self) -> List[Event]:
        return self._pending_events.copy()
    
    def mark_committed(self):
        self._pending_events.clear()
```

### Event Store

Append-only storage for events, with optimistic concurrency control:

```python
class EventStore:
    def load(self, aggregate_id: str) -> List[Event]:
        """Load all events for an aggregate"""
        return self.db.query(
            "SELECT event_data FROM events WHERE aggregate_id = ? ORDER BY version ASC",
            [aggregate_id]
        )
    
    def save(self, aggregate_id: str, events: List[Event], expected_version: int):
        """Save events with optimistic concurrency check"""
        current_version = self.db.query_scalar(
            "SELECT MAX(version) FROM events WHERE aggregate_id = ?", [aggregate_id]
        ) or 0
        
        if current_version != expected_version:
            raise ConcurrencyConflictError(
                f"Expected version {expected_version}, current is {current_version}"
            )
        
        for i, event in enumerate(events):
            self.db.execute(
                "INSERT INTO events (aggregate_id, version, event_type, event_data, occurred_at) "
                "VALUES (?, ?, ?, ?, ?)",
                [aggregate_id, expected_version + i + 1,
                 type(event).__name__, serialize(event), event.timestamp]
            )
        
        # Publish to event bus for projectors
        for event in events:
            self.event_bus.publish(event)
```

## Snapshots

Replaying 10,000 events to reconstruct an aggregate is expensive. Use snapshots to cache state at a version:

```python
class EventStoreWithSnapshots:
    def load(self, aggregate_id: str) -> List[Event]:
        # Check for recent snapshot
        snapshot = self.db.query(
            "SELECT state, version FROM snapshots WHERE aggregate_id = ? ORDER BY version DESC LIMIT 1",
            [aggregate_id]
        )
        
        if snapshot:
            # Load events after snapshot
            start_version = snapshot.version
            recent_events = self.db.query(
                "SELECT event_data FROM events WHERE aggregate_id = ? AND version > ? ORDER BY version",
                [aggregate_id, start_version]
            )
            return snapshot.state, recent_events
        else:
            all_events = self.db.query(
                "SELECT event_data FROM events WHERE aggregate_id = ? ORDER BY version",
                [aggregate_id]
            )
            return None, all_events
    
    def save_snapshot(self, aggregate: Aggregate):
        if aggregate.version % 100 == 0:  # snapshot every 100 events
            self.db.execute(
                "INSERT INTO snapshots (aggregate_id, version, state) VALUES (?, ?, ?)",
                [aggregate.id, aggregate.version, serialize(aggregate.state)]
            )
```

## Projections (read models)

Events are consumed to build denormalized read models:

```python
class AccountBalancesProjection:
    """Builds a fast-lookup table of current balances"""
    
    def on_account_opened(self, event: AccountOpened):
        self.db.execute(
            "INSERT INTO account_balances VALUES (?, ?)",
            [event.account_id, event.initial_deposit]
        )
    
    def on_money_withdrawn(self, event: MoneyWithdrawn):
        self.db.execute(
            "UPDATE account_balances SET balance = balance - ? WHERE account_id = ?",
            [event.amount, event.account_id]
        )
    
    def on_money_deposited(self, event: MoneyDeposited):
        self.db.execute(
            "UPDATE account_balances SET balance = balance + ? WHERE account_id = ?",
            [event.amount, event.account_id]
        )

class AuditTrailProjection:
    """Builds a queryable audit log"""
    
    def on_any_event(self, event: Event):
        self.db.execute(
            "INSERT INTO audit_log (account_id, event_type, details, occurred_at) VALUES (?, ?, ?, ?)",
            [event.account_id, type(event).__name__, serialize(event), event.timestamp]
        )
```

**Replay to rebuild:** If a projection has a bug or a new one is added, replay all events from the beginning:

```python
def rebuild_projection(projection: Projection, event_store: EventStore):
    """Replay all events to rebuild a projection from scratch"""
    all_events = event_store.get_all_events_ordered()
    projection.reset()  # clear current state
    for event in all_events:
        projection.handle(event)
```

## Event versioning (schema evolution)

Events are immutable and must remain readable forever. When the schema changes:

**Upcaster:** Transform old event format to new format at read time:

```python
class MoneyWithdrawnV1:
    account_id: str
    amount: float   # old: float

class MoneyWithdrawnV2:
    account_id: str
    amount: Decimal  # new: Decimal
    currency: str    # new: added field

def upcast_v1_to_v2(event: dict) -> dict:
    return {
        'account_id': event['account_id'],
        'amount': Decimal(str(event['amount'])),  # convert float → Decimal
        'currency': 'USD'   # default for old events
    }
```

## Event sourcing tradeoffs

| Pros | Cons |
|---|---|
| Complete audit log for free | More complex than state-based |
| Time travel / temporal queries | Rebuilding state from events can be slow without snapshots |
| No data loss — history preserved | Event schema evolution requires care |
| Multiple read models from same events | Eventual consistency of projections |
| Easy to add new projections retroactively | Higher storage (all events kept) |
| Debug any past state | Learning curve for team |

## When to use event sourcing

**Good fit:**
- Audit is critical: finance, healthcare, compliance
- Temporal queries needed: "what was the state at time T?"
- Complex domain: many state transitions, business rules
- CQRS-heavy system: many different read models needed

**Overkill:**
- Simple CRUD (user profiles, settings)
- No audit requirement
- Small team, tight deadline
- Querying historical state is never needed

## AWS implementation

```
Event Store: DynamoDB (aggregate_id + version as composite key)
             or PostgreSQL (with event_store table)
             or EventStoreDB (purpose-built)

Event Bus: Kinesis or Kafka (MSK)
  → DynamoDB Streams + Lambda (simpler, less control)

Projections: Lambda consumers
  → Read models in DynamoDB, OpenSearch, Redis
```

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you distinguish event sourcing from regular event-driven architecture — and know when it's worth the complexity.

**Strong answer pattern:**
1. Event sourcing = event log IS the source of truth (not a side effect)
2. Use it when: audit is required, time travel needed, complex domain
3. Always pair with CQRS — events build read models
4. Snapshots for performance after many events
5. Address the complexity cost — don't propose it for simple systems

**Distinguishing event sourcing from event-driven architecture:**
- Event-driven: services publish events to notify others — state still stored as current value in DB
- Event sourcing: events ARE the storage — state is derived by replaying them

## Related topics

- [CQRS](cqrs.md) — natural companion
- [Event Streaming](../messaging/event-streaming.md) — Kafka as the event log infrastructure
- [Saga Pattern](saga-pattern.md) — events triggering distributed transactions
- [Distributed Transactions](../distributed/distributed-transactions.md) — event sourcing as an alternative
