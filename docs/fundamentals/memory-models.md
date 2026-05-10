# Memory Models & Cache Coherency

Why is concurrent code so hard to write correctly? Because the program you wrote is not the program your CPU runs. Compilers reorder instructions; CPUs reorder memory operations; multi-core caches lie to each other. The "memory model" is the formal contract that lets you reason about concurrent code despite all that.

---

## The illusion of sequential execution

The naive mental model:

```c
// Thread A
x = 1;
y = 2;

// Thread B
print(y);    // sees 2
print(x);    // sees 1?
```

Without synchronisation, Thread B might see `y = 2` and **still see `x = 0`**. Why?

1. **Compiler reordering**: the compiler sees `x = 1; y = 2;` are independent and may reorder them
2. **CPU reordering**: even with a fixed instruction order, the CPU may execute them out of order
3. **Cache lag**: A's writes hit its local cache before propagating to B's cache

All three effects are invisible on a single thread (the hardware preserves single-thread semantics) but absolutely visible across threads.

---

## Cache coherency (MESI)

Multi-core CPUs maintain consistent caches via the **MESI protocol** (Modified, Exclusive, Shared, Invalid). Each cache line is in one of four states:

| State | Meaning |
|---|---|
| **M (Modified)** | This core's cache has the only valid copy; writes back to RAM eventually |
| **E (Exclusive)** | Only this core has it cached; matches RAM |
| **S (Shared)** | Multiple cores have it cached; matches RAM |
| **I (Invalid)** | Cached copy is stale; must re-read |

When core A writes to a cache line in S state, it broadcasts an **invalidate** message to other cores. They mark their copies I; A transitions to M.

This is correctness-preserving but adds **coherency traffic** — bytes flowing between cores. It's also the mechanism behind [false sharing](memory-hierarchy.md): two threads writing to different variables in the *same cache line* trigger constant invalidation.

---

## Memory ordering

Modern CPUs (especially x86 vs ARM) differ in how aggressively they reorder memory operations:

| CPU | Default ordering |
|---|---|
| **x86 / x86_64** | Strong: writes seen in order; reads can reorder past writes |
| **ARM, POWER, RISC-V** | Weak: both reads and writes can reorder freely |

ARM's weak model means code that "works" on x86 may fail on ARM (Apple Silicon, Graviton, Snapdragon). This is why portable concurrent code uses explicit memory barriers.

---

## Happens-before

The memory model defines a partial order called **happens-before**: if event A happens-before event B, then B sees A's effects.

Sequential code: A happens-before B if A is written before B in the source.

Across threads: **only** synchronisation operations create happens-before relationships:

- Mutex unlock happens-before subsequent lock of the same mutex
- Atomic store with release ordering happens-before subsequent atomic load with acquire ordering on the same variable
- Thread spawn happens-before the start of the spawned thread
- Thread end happens-before the corresponding join

Without an explicit happens-before edge, threads can see each other's writes in any order — or not at all.

---

## Memory barriers (fences)

Instructions that constrain reordering:

| Barrier | Effect |
|---|---|
| **Acquire** | Loads after the barrier cannot move before it |
| **Release** | Stores before the barrier cannot move after it |
| **AcqRel** | Both — used for read-modify-write |
| **SeqCst** (sequential consistency) | All threads see all SeqCst operations in the same order |

Most languages expose these as parameters to atomic operations:

```cpp
// C++
std::atomic<int> x{0};
x.store(1, std::memory_order_release);
int v = x.load(std::memory_order_acquire);
```

```rust
// Rust
use std::sync::atomic::{AtomicI32, Ordering};
let x = AtomicI32::new(0);
x.store(1, Ordering::Release);
let v = x.load(Ordering::Acquire);
```

```java
// Java
volatile int x;       // implies acquire/release on each access
AtomicInteger y;      // explicit ordering via methods
```

```go
// Go
import "sync/atomic"
atomic.StoreInt32(&x, 1)
v := atomic.LoadInt32(&x)
// Go uses sequential consistency for atomics — simpler but slower
```

The right memory order is rarely SeqCst. Acquire-release is the right choice for most lock-free patterns. SeqCst when you genuinely need a global order across all threads.

---

## The classic example: double-checked locking

Once-broken pattern from Java:

```java
class Singleton {
    static Singleton instance;
    
    static Singleton getInstance() {
        if (instance == null) {                     // 1: read
            synchronized (Singleton.class) {
                if (instance == null) {              // 2: re-check
                    instance = new Singleton();      // 3: write
                }
            }
        }
        return instance;
    }
}
```

The bug: step 3 is not atomic. The compiler/CPU may:
1. Allocate memory
2. Assign the pointer to `instance`
3. Run the constructor

Another thread reads `instance` between steps 2 and 3 — gets a non-null pointer to a half-initialised object.

Fix: declare `instance` `volatile` (Java's `volatile` includes acquire/release semantics; not the same as C's `volatile`!).

Modern equivalent: use `Holder` idiom (lazy class initialisation) or a proper synchronised init block.

---

## Atomic operations

Operations the hardware guarantees indivisible:

| Operation | Notes |
|---|---|
| Load / store of aligned word-sized values | Guaranteed atomic on most CPUs |
| **CAS** (Compare-And-Swap) | Foundation of lock-free algorithms |
| **Fetch-and-add**, **fetch-and-or** | Lock-free counters and bit flags |
| **DCAS** (Double-CAS) | Two atomic ops in one — rare in modern hardware |

Compare-and-Swap:

```
atomic_compare_exchange(addr, expected, new):
   if *addr == expected:
       *addr = new
       return true
   else:
       expected = *addr
       return false
```

CAS is the building block for spinlocks, lock-free queues, optimistic concurrency. It's also expensive — every CAS requires exclusive cache-line ownership (E state in MESI), so contention causes cache-line ping-pong.

---

## Lock-free data structures

Algorithms that avoid mutexes by using atomics + memory barriers:

```c
// Lock-free counter
atomic_int counter = 0;
void inc() { atomic_fetch_add(&counter, 1); }
```

| Property | Mutex | Lock-free |
|---|---|---|
| Correctness under preemption | Slow but correct | No starvation possible |
| Worst-case latency | Unbounded (lock holder dies) | Bounded |
| Throughput under contention | Drops sharply | Generally better |
| Implementation difficulty | Easy | Very hard |

Lock-free isn't always faster — uncontended mutexes are very fast in modern OSes (futex on Linux). Lock-free shines when:

- Worst-case latency matters (real-time)
- Lock holder might be preempted (signal handlers)
- Hot path with high contention

Don't write your own lock-free queue — use `crossbeam` (Rust), `java.util.concurrent` structures, `boost::lockfree`, or similar audited libraries.

---

## Volatile is not what you think

In C/C++:

```c
volatile int x;     // tells compiler not to optimise away reads/writes
```

`volatile` does **not** provide thread synchronisation in C/C++. It prevents compiler reordering of accesses to the volatile variable, but does **not** provide cross-thread visibility or memory barriers. Use `<atomic>` instead.

In Java:

```java
volatile int x;     // implies acquire on read, release on write
```

Java's `volatile` is closer to a memory barrier. Different semantics, same keyword — confusing.

Rule: in C/C++, never use `volatile` for thread sync. Use `std::atomic`.

---

## Compiler reordering

Even before the CPU sees it, compilers reorder code aggressively:

```c
// You wrote:
ready_data = compute();
ready_flag = 1;

// Compiler might emit:
ready_flag = 1;             // moved earlier; appears innocent
ready_data = compute();
```

Result: a reader sees `ready_flag = 1` before `ready_data` is valid.

Memory barriers force the compiler (and CPU) to respect the ordering. With C11/C++11 atomics, you express intent and the compiler+CPU cooperate.

---

## Practical guidance

```
1. Default to mutexes. Modern OSes make them fast.
   Lock-free is a specialised tool, not the default.

2. If you use atomics:
   - Use the language's standard library (atomic, AtomicInteger, sync/atomic)
   - Pick the right memory ordering — usually acquire-release
   - Don't reach for SeqCst unless you understand why

3. Never write your own lock-free data structure.
   Use audited libraries.

4. Test on the weakest target architecture.
   ARM exposes bugs that x86 hides.

5. Beware false sharing in concurrent counters.
   Pad to cache-line boundaries.

6. When in doubt, profile. 
   Concurrency optimisation without measurement is theology.
```

---

## When this knowledge matters

- Writing concurrent data structures from scratch (databases, queues, schedulers)
- Debugging "works on my machine but fails in production" race conditions
- Porting code between x86 and ARM
- Tuning hot paths in latency-sensitive systems
- Reading any nontrivial concurrent code (you'll see `Acquire`, `Release`, memory ordering parameters)

For application-level code, the right answer is almost always: **use a mutex, or a proven concurrent collection, and move on**. Memory models become first-class concerns at the runtime / library / database layer.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand that "concurrent correctness" is more than just adding `synchronized`.

**Strong answer pattern:**
1. Compilers and CPUs reorder; single-thread semantics preserved, multi-thread guarantees only via synchronisation
2. MESI keeps caches coherent; coherency traffic is the cost
3. happens-before is the formal model; created by mutex unlock/lock, atomic release/acquire, etc.
4. Memory orders: acquire, release, AcqRel, SeqCst — use the weakest correct one
5. Mutexes are usually fine; lock-free for very specific reasons

**Common follow-up:** *"What's the difference between atomic and volatile in C++?"*
> `volatile` only restricts compiler optimisations on accesses — does not provide thread synchronisation, memory barriers, or cross-thread visibility. `std::atomic` provides all three. The C++ standard explicitly says `volatile` is for memory-mapped I/O and signal handlers, not threading. The keyword exists in both C and Java with overlapping but different meanings, which is a frequent source of confusion.

---

## Related topics

- [Concurrency & Locking](concurrency.md) — higher-level synchronisation primitives
- [Memory Hierarchy](memory-hierarchy.md) — cache lines, false sharing
- [Operating System Concepts](os-concepts.md) — threads scheduled by the kernel
- [Distributed: Clocks & Ordering](../distributed/clocks.md) — happens-before extends to distributed systems
