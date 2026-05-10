# TCP/UDP Deep Dive

Most networking complexity in distributed systems comes from things TCP does (or doesn't) do for you. Understanding the three-way handshake, slow start, congestion control, and head-of-line blocking explains why connections are slow to establish, why long-fat-pipe links underperform, and why HTTP/2 to HTTP/3 was a generational shift.

---

## TCP vs UDP at a glance

| | TCP | UDP |
|---|---|---|
| Connection-oriented | Yes (handshake) | No |
| Reliable delivery | Yes (retransmit) | No |
| Ordering | Yes | No |
| Flow control | Yes (window) | No |
| Congestion control | Yes | No |
| Header overhead | 20+ bytes | 8 bytes |
| Use cases | HTTP, SSH, databases, gRPC | DNS, NTP, streaming, gaming, QUIC |

TCP gives you a stream-like abstraction; UDP gives you packets and gets out of the way.

---

## The three-way handshake

```
Client                                  Server
  │                                       │
  │ ──── SYN (seq=x) ──────────────────► │   1
  │                                       │
  │ ◄─── SYN-ACK (seq=y, ack=x+1) ────── │   2
  │                                       │
  │ ──── ACK (ack=y+1) ────────────────► │   3
  │                                       │
  │ ═══ connection established ═══════════ │
```

Three messages = **1 round-trip time (RTT) before any data**.

```
Client in Frankfurt → server in Virginia (~85 ms RTT)
Handshake adds 85 ms before the first byte of HTTP request

If you also need TLS:
  TCP handshake:    1 RTT
  TLS 1.2 handshake: 2 RTTs
  Then send request: 1 RTT
  Total before first byte: 4 RTTs = 340 ms

TLS 1.3:           1 RTT (saves one round trip)
QUIC + 0-RTT:      0 RTT for resumed connections (data with handshake)
```

This is why connection reuse (keepalive, connection pooling) is so important — the handshake is amortised across many requests.

---

## TCP segments and sequence numbers

TCP doesn't see "messages." It sees a byte stream. Each byte has a sequence number; segments carry ranges.

```
App writes:  "Hello, World!"   13 bytes
TCP sends:   [seq=1000, len=13, data="Hello, World!"]

Receiver acks:  [ack=1013]   "next byte I expect is 1013"
```

Segments may be split or coalesced. Boundaries don't survive — the receiver just gets bytes in order. This is the **byte stream** abstraction.

Implication for protocol design:

- **Length-prefixed** framing: each message starts with a length header (gRPC, RESP, most binary protocols)
- **Delimiter-based** framing: messages end with a sentinel (HTTP/1.x with `\r\n\r\n`)
- **Self-describing** protocols (HTTP, JSON streams) handle framing in the protocol

Without framing, you can't know where one message ends and the next begins.

---

## Flow control — the receive window

The receiver tells the sender how much it can buffer:

```
Receiver: "I have 64 KB free; send up to 64 KB more"
   ↓ (rwnd = 65536)
Sender:    sends 64 KB
   ↓
Receiver: app drains buffer, advertises new window
```

If the receiver is slow (app not reading fast enough), the window shrinks. The sender stalls. This is **back-pressure** — TCP's natural mechanism.

Implication: a slow consumer slows the producer through TCP without any application-level signalling. This is one reason TCP is the default for gRPC, databases, etc.

---

## Congestion control — slow start

The network has unknown capacity. TCP probes carefully:

```
1. Start with cwnd = 10 segments (~14 KB)
2. Every successful ack: cwnd doubles per RTT (slow start)
3. Until ssthresh: cwnd grows 1 MSS per RTT (congestion avoidance)
4. On packet loss: halve cwnd (or more aggressive backoff)
5. Resume from there
```

`cwnd` (congestion window) caps how much unacked data can be in flight. The actual send rate = `min(cwnd, rwnd) / RTT`.

```
RTT 100 ms, cwnd 1 MB:  effective bandwidth = 10 MB/s = 80 Mbps
RTT 100 ms, cwnd 10 MB: effective bandwidth = 100 MB/s = 800 Mbps
```

The bandwidth-delay product (BDP) sets the ceiling. On long-fat-pipe links (high RTT × high bandwidth), default TCP buffers are too small to fill the pipe.

---

## Variants of TCP congestion control

Modern Linux defaults to **CUBIC** (rapid recovery from loss). Other algorithms suit different conditions:

| Algorithm | Profile |
|---|---|
| **CUBIC** | Default; aggressive on high BDP links |
| **Reno / NewReno** | Classic conservative |
| **BBR** | Models bandwidth and RTT; ignores loss as congestion signal |
| **BBRv2/BBRv3** | Refined BBR; better fairness |
| **Vegas** | Latency-based; backs off before loss |

BBR shines on lossy mobile networks and long links. Google deployed BBR on YouTube and saw significant throughput gains. Netflix uses BBR on their CDN.

---

## TCP retransmissions

If an ack doesn't arrive within the **retransmission timeout (RTO)**, the sender retransmits.

```
RTO ≈ smoothed RTT + 4 × RTT variance
Initial RTO: 1 second
Doubles on each retransmit (exponential backoff)
```

Retransmits are expensive: they signal congestion, halve `cwnd`, and stall the connection. Modern TCP also uses **fast retransmit** (3 duplicate acks → retransmit immediately, don't wait for timeout).

---

## Head-of-line blocking

TCP delivers in order. If segment N is lost, segments N+1, N+2, ... wait in the receiver's buffer until N is retransmitted and arrives.

```
Multiplexed protocol over TCP (HTTP/2 streams):
  Stream A: segments 1-5
  Stream B: segments 6-10 (independent of A)
  Loss of segment 3 (Stream A) blocks delivery of all B streams too
```

This is **head-of-line blocking** at the transport layer. HTTP/2 multiplexes streams over one TCP connection — any loss blocks all streams.

QUIC fixes this: each stream is independent at the transport layer, so loss in stream A doesn't affect stream B.

---

## Nagle's algorithm and `TCP_NODELAY`

To avoid sending tiny packets, TCP buffers small writes:

```
write(fd, "G", 1);   // 1 byte
write(fd, "E", 1);   // wait — coalesce
write(fd, "T", 1);
flush after delay or full segment
```

Saves bandwidth on chatty protocols, but adds latency. Most servers disable Nagle:

```c
int flag = 1;
setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));
```

Common in: HTTP servers, gRPC, databases.

---

## Keep-alive

TCP keep-alive sends periodic probes to detect dead connections (e.g., NAT timeout, peer crash):

```bash
# Linux defaults
net.ipv4.tcp_keepalive_time = 7200      # idle 2h before first probe
net.ipv4.tcp_keepalive_intvl = 75       # 75s between probes
net.ipv4.tcp_keepalive_probes = 9       # 9 probes before declaring dead
```

For long-lived connections (database pools, message brokers), tune these to detect failures faster.

---

## SO_REUSEADDR and TIME_WAIT

When you close a TCP connection, the closing side enters **TIME_WAIT** for ~60-120 seconds. This prevents stray packets from a defunct connection confusing a new connection on the same port.

```
$ ss -t | grep TIME-WAIT | wc -l
12453
```

High-throughput servers may accumulate 10,000+ TIME_WAIT sockets. `SO_REUSEADDR` allows reusing the port; `SO_REUSEPORT` (Linux) allows multiple processes to listen on the same port (load balancing).

---

## UDP

No handshake, no reliability, no ordering. You send packets; they arrive (or not).

```
sendto(fd, data, len, 0, addr, addrlen);
recvfrom(fd, buf, len, 0, addr, &addrlen);
```

Use cases:

- **DNS**: small request/response, retry on timeout
- **NTP**: time sync; loss is OK
- **Voice/video streaming**: better to drop a packet than retransmit
- **Gaming**: low latency > reliability
- **QUIC**: builds reliability + flow control + crypto on top of UDP

---

## QUIC — TCP for the modern era

Google designed QUIC (now an IETF standard) to fix TCP's limitations:

| Feature | TCP+TLS | QUIC |
|---|---|---|
| Handshake RTTs | 1 (TCP) + 2 (TLS) = 3 | 1 (combined), 0 on resume |
| Head-of-line blocking | Yes | No (per-stream) |
| Connection migration | No (NAT change = new conn) | Yes (connection ID survives IP change) |
| User-space implementation | No (kernel TCP) | Yes (rapid iteration) |
| Encryption | Optional | Mandatory |

HTTP/3 = HTTP over QUIC. Adopted by Google, Meta, Cloudflare, Akamai. Major performance win on lossy mobile networks.

See [HTTP Versions](../networking/http-versions.md).

---

## Practical tuning levers

| Lever | When to tune |
|---|---|
| `TCP_NODELAY` | Latency-sensitive RPC, HTTP servers |
| Larger `tcp_rmem` / `tcp_wmem` | Long-fat-pipe (high BDP) links |
| BBR congestion control | Lossy networks, high BDP |
| Lower keepalive intervals | Detect dead peers faster |
| `SO_REUSEPORT` | Multi-process accept load balancing |
| Connection pooling | Avoid handshake on every request |

For most web services, keep defaults and use connection pooling. Tune only after profiling.

---

## Common failure modes

| Symptom | Likely cause |
|---|---|
| First request slow, rest fast | TCP+TLS handshake; use connection pooling |
| Throughput plateaus far below bandwidth | Receive window or BDP limit; bigger buffers, BBR |
| Random connection drops on long-idle conns | NAT timeout; keepalive |
| One slow stream blocks others | Head-of-line blocking; consider HTTP/3 |
| Many TIME_WAIT sockets | Short-lived connections; reuse or pool |
| Unexpected `RST` packets | Misconfigured load balancer, half-open conns |

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you can explain why TCP-level details affect application performance — not just "TCP is reliable, UDP is not."

**Strong answer pattern:**
1. TCP handshake costs 1 RTT; TLS adds 1-2; pool connections to amortise
2. Slow start + congestion window cap throughput; tune for high BDP
3. Head-of-line blocking is why HTTP/2 over TCP can underperform vs HTTP/3 over QUIC
4. UDP for low latency or where reliability is custom (DNS, gaming, QUIC)
5. `TCP_NODELAY` for latency-sensitive small messages

**Common follow-up:** *"Why is HTTP/3 over QUIC faster for mobile users?"*
> Mobile networks have packet loss and connection migration. TCP head-of-line blocking means a single lost packet stalls all multiplexed streams. QUIC streams are independent at the transport layer — loss affects only the affected stream. Plus, QUIC's connection ID survives IP address changes (cellular → WiFi), so you don't redo the handshake. The combination is significantly faster on lossy or roaming networks.

---

## Related topics

- [Networking Basics](networking-basics.md) — IP, ports, OSI layers
- [TLS and Certificates](tls-certificates.md) — what runs on top of TCP
- [HTTP Versions](../networking/http-versions.md) — HTTP/1.1, /2, /3
- [Latency vs Throughput](latency-throughput.md) — bandwidth-delay product
- [Numbers Every Engineer Should Know](numbers-to-know.md) — RTT and bandwidth references
