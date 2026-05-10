# Operating System Concepts

The OS is the layer between your code and the hardware. A senior engineer's intuition for "why is this slow" / "why does this hang" rests on a working model of processes, threads, syscalls, the page cache, and file descriptors.

---

## Processes and threads

```
Process: an isolated execution context
  ├── own virtual address space
  ├── own file descriptors
  ├── own environment variables
  └── one or more threads

Thread: a lightweight execution path inside a process
  ├── shared memory with sibling threads
  ├── own stack
  ├── own register state
  └── own scheduling state
```

| | Process | Thread |
|---|---|---|
| Memory | Isolated | Shared |
| Creation cost | High (~1 ms) | Low (~10 µs) |
| Communication | IPC (pipes, sockets, shared mem) | Direct memory access |
| Crash isolation | Strong | Weak (one thread crash = process crash) |
| Scheduling unit | Yes | Yes |

Modern apps mix:

- **Postgres**: process per connection — strong isolation
- **Nginx**: process per worker, many connections per worker — middle ground
- **Java app server**: one process, many threads — efficient memory sharing
- **Go / Rust async**: one process, M:N threads:goroutines/tasks — minimal overhead

---

## Context switching

When the OS scheduler swaps the running thread:

```
1. Save current thread's registers + state
2. Update memory mappings (if process change)
3. Flush some CPU caches (TLB)
4. Load new thread's registers + state
5. Resume execution
```

Cost: ~1-10 µs. Not free, especially under high context-switch rates (CPU-bound work mixed with frequent I/O).

The kernel context-switches when:
- Thread's time slice expires (~1-10 ms quantum)
- Thread blocks on I/O / syscall / lock
- Higher-priority thread becomes runnable
- Thread voluntarily yields

---

## Syscalls

A syscall transitions from user mode to kernel mode to invoke a kernel service (read/write file, send packet, allocate memory).

```c
read(fd, buffer, 1024);
  ↓ trap (interrupt) into kernel
  ↓ kernel validates fd, copies data
  ↓ return to user mode
```

Cost: ~100 ns to 1 µs minimum. For high-throughput servers, syscall overhead dominates.

Optimisation strategies:

- **Batching**: `readv` / `writev` (scatter-gather), `sendmmsg` (send multiple)
- **Async I/O**: `epoll`, `io_uring` (Linux), `kqueue` (BSD/macOS)
- **Zero-copy**: `sendfile`, `splice` — kernel moves data without copying through user space
- **Memory-mapped files**: `mmap` — file appears as memory; lazy paged in

Modern high-performance servers minimise syscalls per request: HTTP/3 over QUIC, io_uring-based servers, kernel-bypass networking (DPDK, eBPF).

---

## Virtual memory

Each process sees a private address space (e.g., 48-bit on x86_64 = 256 TB virtual). The kernel maps virtual pages to physical pages on demand.

```
Process address space (virtual):
  0x000000000000  ─── code, data, heap, mmap'd files, stack ─── 0x7fffffffffff

Physical memory (real):
  Backed by RAM pages, swap, or file (mmap)
```

Key concepts:

- **Page**: typically 4 KB unit of mapping
- **Page table**: kernel structure mapping virtual → physical
- **Page fault**: access an unmapped or swapped-out page; kernel loads it on demand
- **Lazy allocation**: `malloc` reserves virtual address space; physical pages allocated only on first write
- **Copy-on-write (COW)**: `fork` shares memory until either side writes; then page is copied

Why it matters:

- `malloc(1 GB)` is essentially free; first byte written causes physical alloc
- Memory-mapped databases (LMDB, MongoDB historically) lean on the kernel page cache
- Swap thrashing — pages constantly swapped to disk — kills performance

See [Memory Hierarchy](memory-hierarchy.md) for the TLB and access cost details.

---

## Page cache

The kernel caches recently-read disk blocks in unused RAM:

```
$ free -h
              total       used       free     shared  buff/cache
Mem:          32G         12G        8G       500M    11G   ← 11G of cached disk pages
```

Implications:

- Reading a frequently-accessed file is "free" after the first read
- Cold start of a database is slow; warm cache is fast
- `O_DIRECT` bypasses the page cache (databases do this when managing their own buffer pool)
- `posix_fadvise(POSIX_FADV_DONTNEED)` hints "I won't read this again" — frees cache for hotter data

---

## File descriptors

A file descriptor is an integer pointing to a kernel-managed object:

```
fd 0:  stdin
fd 1:  stdout
fd 2:  stderr
fd 3:  open("data.txt")
fd 4:  socket(AF_INET, ...)
fd 5:  pipe()
```

Files, sockets, pipes, eventfd, signalfd, timerfd — all are file descriptors, all support `read` / `write` / `select` / `poll` / `epoll`. This uniform interface is one of UNIX's most powerful ideas.

### Limits

```bash
ulimit -n     # current process FD limit (often 1024 or 65535)
```

High-connection servers (proxies, message brokers) need millions of FDs. Bump with `ulimit` or systemd unit files. Each FD costs ~1 KB kernel memory.

---

## I/O models

Three patterns for handling I/O concurrency:

### Blocking (one thread per connection)

```c
int fd = accept(server, ...);
read(fd, buf, ...);   // thread blocks until data arrives
```

Simple, but doesn't scale — 10 K connections = 10 K threads = ~10 GB stack memory + context-switch overhead.

### Non-blocking + readiness notification (epoll/kqueue)

```c
int epfd = epoll_create1(0);
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

while (1) {
    int n = epoll_wait(epfd, events, max_events, timeout);
    for (int i = 0; i < n; i++) {
        // handle ready FDs
    }
}
```

One thread, many connections. The kernel notifies which FDs are ready. Foundation of nginx, Node.js, Go's runtime.

### Async I/O (io_uring, IOCP)

```c
// Submit a read operation; kernel completes it in background
io_uring_prep_read(sqe, fd, buf, len, offset);
io_uring_submit(ring);

// Later: poll for completion
io_uring_wait_cqe(ring, &cqe);
```

True async: kernel performs the operation and notifies on completion. Best throughput; complex API.

Linux progression: `select` (1980s) → `poll` → `epoll` (2002) → `io_uring` (2019).

---

## Signals

Kernel-delivered async notifications:

```
SIGTERM:  graceful shutdown request
SIGKILL:  force kill (uncatchable)
SIGINT:   interrupt (Ctrl+C)
SIGSEGV:  segfault
SIGPIPE:  write to closed pipe
SIGCHLD:  child process status change
```

Handlers run on the main thread, interrupting whatever was running. Async-signal-safe: severe restrictions on what handlers can do (no `malloc`, no `printf`).

Modern Linux exposes signals as file descriptors via `signalfd` — same uniform interface as everything else.

---

## Process lifecycle

```
fork()   → child starts as exact copy of parent (COW memory)
exec()   → replace process image with a new program
exit()   → terminate; status delivered to parent
wait()   → parent collects child status

Without wait(): zombie processes accumulate
Without parent: child becomes orphan, adopted by init (PID 1)
```

Containers add a twist: PID 1 inside the container has special responsibility (reaping zombies). This is why `tini` or proper init handling matters in Docker images.

---

## Cgroups and namespaces — what containers actually are

Containers aren't a kernel feature; they're a combination of two:

| Feature | What it does |
|---|---|
| **Namespaces** | Per-container view of PIDs, network, mount points, hostnames, users |
| **Cgroups** | Per-container CPU, memory, I/O limits |

Plus a layered filesystem (overlayfs) for image isolation.

```bash
unshare --pid --net --mount /bin/bash    # spawn a shell in new namespaces
```

The "container" is just a process with cgroups + namespaces applied. Docker, containerd, runc package this with images, networking, and CLI ergonomics.

---

## Scheduling

The Linux scheduler (CFS — Completely Fair Scheduler) splits CPU time fairly across runnable threads:

```
runnable threads: A, B, C
  CFS gives each ~1/3 of CPU over time
  Threads with shorter sleeps get a small priority boost
  
nice value (-20 to 19): user-controllable priority hint
real-time scheduler classes: SCHED_FIFO, SCHED_RR, SCHED_DEADLINE
```

For latency-sensitive code:

- Pin threads to specific cores (`taskset`, `pthread_setaffinity`)
- Use real-time scheduling classes carefully (can starve everything else)
- Disable SMT/Hyperthreading on cache-sensitive workloads (databases sometimes do this)

---

## Inter-process communication (IPC)

| Mechanism | Use |
|---|---|
| **Pipes** | Parent-child one-way streams |
| **Named pipes (FIFOs)** | Unrelated processes, persistent path |
| **Unix domain sockets** | Local-only sockets, bidirectional |
| **TCP loopback** | Network sockets on localhost (slower than UDS) |
| **Shared memory (`shm_open`, `mmap`)** | Highest throughput; needs synchronisation |
| **Message queues (POSIX, SysV)** | Structured async messages |
| **Signals** | Lightweight notifications |

Shared memory + a small lock-free ring buffer is the typical pattern for low-latency IPC. Database clients usually use UDS or TCP for safety/portability.

---

## Practical implications

| Symptom | Likely OS-layer cause |
|---|---|
| High CPU but low throughput | Context-switch storm; too many threads |
| High `iowait` in `top` | Disk I/O bottleneck |
| Memory `free` shows little, but `available` is high | Page cache is doing its job (good) |
| `swap` heavily used | Out of RAM; thrashing — fix or add RAM |
| Connection failures with "too many open files" | FD limit too low; raise `ulimit -n` |
| Unexpected process kills with no log | OOM killer; check `dmesg` |
| Process hangs after parent crash | Orphaned, no one is `wait()`ing |

Familiarity with `top`, `vmstat`, `iostat`, `strace`, `ss`, `lsof`, `dmesg` is the practical complement to this knowledge.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether your mental model of the system has an OS layer, or whether everything below your language runtime is "magic."

**Strong answer pattern:**
1. Process = isolated address space; thread = shared memory unit; cost differs by 100×
2. Syscalls cost ~µs; batch them, use async I/O for high concurrency
3. Page cache makes hot reads ~free; databases either use it or bypass it
4. epoll/io_uring scales single-thread to millions of connections
5. Containers = namespaces + cgroups; not magic, just kernel features

**Common follow-up:** *"Why are coroutines / goroutines / async tasks faster than threads?"*
> Threads cost ~10 µs to create and ~1-10 µs per context switch (kernel involvement). Coroutines run in user space — the runtime schedules them on M underlying threads. Switching is 10-100 ns. For I/O-heavy work where you'd otherwise have one thread per connection blocked on read(), coroutines amortise to one thread per CPU core handling thousands of in-flight operations. Less memory (no 1 MB stacks), no kernel involvement on switches.

---

## Related topics

- [Memory Hierarchy](memory-hierarchy.md) — what processes contend for at the cache level
- [Concurrency & Locking](concurrency.md) — primitives built on top of OS threads
- [Disk and SSD Internals](disk-ssd-internals.md) — what the page cache and `fsync` cache or skip
- [Networking Basics](networking-basics.md) — sockets are file descriptors
- [Containers](../infrastructure/containers.md) — the namespace + cgroup story
