# Concurrency & Locking

Concurrency is one of the hardest problems in system design. Most production bugs — data corruption, deadlocks, race conditions — come from incorrect concurrent access to shared state.

## Concurrency vs Parallelism

```
Concurrency:  dealing with many things at once (structure)
Parallelism:  doing many things at once (execution)

Single-core CPU:   concurrent but not parallel
                   (context-switches between tasks)

Multi-core CPU:    concurrent AND parallel
                   (multiple cores run simultaneously)
```

A server handling 10,000 concurrent requests on 4 cores is concurrent but only parallel on 4 at a time.

---

## Processes vs Threads vs Coroutines

| | Process | Thread | Coroutine / Green Thread |
|---|---|---|---|
| Memory | Separate address space | Shared address space | Shared (same thread) |
| Isolation | Strong — crash doesn't affect parent | Weak — bug corrupts shared memory | None — single thread |
| Context switch cost | High (~μs, kernel) | Medium (kernel) | Very low (user-space) |
| Creation cost | High | Medium | Very low |
| Communication | IPC (pipes, sockets, shared memory) | Shared memory (with locks) | Direct (same memory) |
| Use case | Isolated workers, multi-core compute | High-throughput shared-state work | High-concurrency I/O |

**Examples by language:**

| Language | Concurrency primitive |
|---|---|
| Python | `asyncio` coroutines, `multiprocessing` for CPU work |
| Go | Goroutines (green threads) + channels |
| Java | JVM threads (OS threads) |
| Node.js | Single-threaded event loop + async callbacks |
| Rust | OS threads + `async/await` |

---

## The Race Condition

A race condition occurs when the result depends on the interleaving of operations from multiple threads.

```python
# UNSAFE: balance = 1000, two threads each withdraw 200
def withdraw(amount):
    balance = get_balance()   # Thread A reads 1000
                              # Thread B reads 1000
    new_balance = balance - amount
    set_balance(new_balance)  # Thread A writes 800
                              # Thread B writes 800 ← overwrites A!
# Expected: 600. Actual: 800. Money disappeared into a race condition.
```

**Fix:** Read-modify-write must be atomic.

```sql
-- Database-level atomic update
UPDATE accounts SET balance = balance - 200 WHERE id = 1;
```

---

## Locks (Mutual Exclusion)

A **mutex** (mutual exclusion lock) ensures only one thread executes a critical section at a time.

```python
import threading

lock = threading.Lock()
balance = 1000

def withdraw(amount):
    with lock:               # acquire — only one thread enters
        global balance
        balance -= amount    # critical section
                             # release — next thread can enter
```

### Lock types

| Type | Behavior | Use case |
|---|---|---|
| **Mutex** | One writer, blocks all | General-purpose critical section |
| **Read-Write Lock** | Many readers OR one writer | Read-heavy shared state |
| **Spin Lock** | Busy-waits instead of sleeping | Very short critical sections (kernel) |
| **Optimistic Lock** | No lock; retry on conflict | Low-contention reads (DB `version` column) |
| **Pessimistic Lock** | Lock before reading | High-contention writes (`SELECT FOR UPDATE`) |

### Read-Write Lock

```python
import threading

rw_lock = threading.RLock()

# Multiple threads can read simultaneously
def read_data():
    with rw_lock:
        return data.copy()

# Only one thread can write, blocks all readers
def write_data(new_data):
    with rw_lock:
        data.update(new_data)
```

---

## Deadlock

A deadlock occurs when two or more threads wait for each other indefinitely.

```
Thread A holds Lock 1, wants Lock 2
Thread B holds Lock 2, wants Lock 1
→ Both wait forever
```

```python
# Classic deadlock
def transfer(from_account, to_account, amount):
    with from_account.lock:       # Thread A locks account 1
        with to_account.lock:     # Thread A wants account 2
            # Thread B has already locked account 2
            # and is waiting for account 1 → DEADLOCK
            pass
```

**Prevention strategies:**

1. **Lock ordering** — always acquire locks in the same global order
   ```python
   # Always lock lower ID first
   first, second = sorted([a, b], key=lambda x: x.id)
   with first.lock:
       with second.lock:
           pass
   ```

2. **Lock timeout** — give up waiting after N ms
3. **Try-lock** — acquire or bail immediately, retry later
4. **Single lock** — coarsen the lock (simpler but less concurrent)

---

## Blocking vs Non-Blocking I/O

The choice between blocking and non-blocking I/O is foundational to how servers handle concurrency.

### Blocking (traditional thread-per-request)

```
Client 1 → Thread 1 → [reads DB...waits...] → responds
Client 2 → Thread 2 → [reads DB...waits...] → responds
Client N → Thread N → [all threads blocked waiting for I/O]
```

- Thread stack: ~1-8MB each
- 10,000 concurrent connections = 10–80GB RAM in stacks alone
- Context switching between thousands of threads is expensive

### Non-Blocking / Async I/O (event loop)

```
Single thread → starts DB call (non-blocking) → handles other requests
              → DB result arrives → resumes the original handler
```

```python
# Async Python: 10,000 concurrent requests on one thread
import asyncio

async def handle_request(query):
    result = await db.query(query)   # yields control while waiting
    return result

# While db.query() is in flight, the event loop handles other requests
```

- No thread-per-connection overhead
- One thread can handle 100k+ concurrent I/O-bound requests
- **Caveat:** CPU-bound work blocks the event loop — offload to a thread pool

### Comparison

| | Thread-per-request | Async / Event Loop |
|---|---|---|
| Concurrency model | Parallelism via threads | Multiplexing on one thread |
| Memory | High (MB per thread) | Low (single stack) |
| CPU-bound work | Good (threads parallelize) | Bad (blocks event loop) |
| I/O-bound work | OK (threads block) | Excellent (non-blocking) |
| Complexity | Low (sequential code) | Medium (callbacks/async) |
| Examples | Java servlet, Django | Node.js, Go, Python asyncio |

---

## Atomicity & Compare-and-Swap (CAS)

An **atomic** operation completes entirely or not at all — no intermediate state visible to other threads.

```c
// Compare-and-Swap: set value to new_val only if it equals expected
bool CAS(int* ptr, int expected, int new_val) {
    if (*ptr == expected) {
        *ptr = new_val;
        return true;
    }
    return false;
}
```

CAS is the foundation of **lock-free data structures** and optimistic concurrency:

```python
# Optimistic locking in a database
def update_balance(account_id, amount):
    while True:
        row = db.get(account_id)                  # read current state + version
        new_balance = row.balance - amount
        updated = db.update(
            "UPDATE accounts SET balance=?, version=? WHERE id=? AND version=?",
            new_balance, row.version + 1, account_id, row.version
        )
        if updated == 1:
            break   # success — no conflict
        # retry — someone else modified it first
```

---

## Concurrency in Distributed Systems

Single-machine concurrency primitives don't work across nodes. Distributed systems need:

| Problem | Single-machine solution | Distributed solution |
|---|---|---|
| Mutual exclusion | Mutex | Distributed lock (Redis SETNX, ZooKeeper) |
| Counter increment | Atomic integer | CRDT counter, Redis INCR |
| Leader election | Single thread wins a lock | Raft, ZooKeeper election |
| Ordering events | Shared clock | Lamport clocks, vector clocks |

See [Distributed Locks](../distributed/distributed-locks.md) for production implementations.

---

## Interview angle

!!! tip "Concurrency questions in system design"
    - *"How do you handle concurrent writes to the same record?"* → Optimistic locking with version columns, or pessimistic `SELECT FOR UPDATE` for high-contention accounts (e.g., payment system)
    - *"How does Node.js handle 100k concurrent connections if it's single-threaded?"* → Non-blocking I/O + event loop. I/O waits are handled by the OS; the event loop resumes callbacks when data arrives. CPU-bound work is offloaded to a thread pool.
    - *"What's the difference between a race condition and a deadlock?"* → Race: result depends on timing. Deadlock: circular wait that never resolves.

## Related topics

- [Distributed Locks](../distributed/distributed-locks.md) — extending mutual exclusion across nodes
- [ACID vs BASE](acid-vs-base.md) — atomicity at the database level
- [Consistency Models](consistency-models.md) — what "correct" means in concurrent systems
- [Patterns: Idempotency](../patterns/idempotency.md) — safe retries for concurrent operations
