# Distributed Systems: Zero → Hero

A single ordered route through everything in the [Distributed Systems](../distributed/index.md) section — from "why is this so hard?" to the impossibility results and Byzantine protocols that sit at the deep end. This is a companion to the [system-design Curriculum](curriculum.md) and the [AI Engineer Path](ai-engineer.md): one spine, each step building on the last, a checkpoint per level.

**Why a dedicated path?** The section's pages are organized as a reference catalogue. This page puts them in *learning order*. Distributed systems is the one area where reading topics out of order genuinely hurts — you can't reason about consensus before you understand why clocks lie, and you can't appreciate quorum before you've felt the pain in the fallacies. Follow the spine top to bottom your first time.

!!! tip "What deep distributed-systems knowledge signals in senior+ interviews"
    This is the section that separates "I've used Kafka" from "I understand why Kafka makes the trade-offs it does." Interviewers probe it because you can't fake it — the answers fall apart under one follow-up if you only memorized them. What they're listening for:

    - **You reach for the impossibility result unprompted.** *"We can't distinguish a slow node from a dead one, so…"* or *"FLP says we can't guarantee termination, so we add a timeout and accept a liveness risk."* Naming the constraint **before** the solution is the senior tell.
    - **You quantify quorums.** Not "use a majority" but *"N=5, W=3, R=3, survives 2 failures."* The math, on the spot.
    - **You default to avoiding distributed transactions.** A staff engineer's first instinct is to redesign the boundary so 2PC isn't needed — sagas, idempotency, single-writer ownership — and only reaches for cross-node atomicity when truly forced.
    - **You know when *not* to.** Byzantine fault tolerance, strict linearizability, global consensus — each carries a real cost, and knowing the cheaper escape hatch is the judgment that gets tested.

    Memorizing the pages gets you a junior pass. Internalizing the four recurring ideas below gets you the senior one.

## The four ideas that recur at every level

Distributed systems looks like two dozen unrelated topics. It's really four ideas, each reappearing in a new costume per level. Spot them and the section collapses into something you can actually hold in your head.

| The idea | First bites you at | Reappears as |
|---|---|---|
| **You can't tell "crashed" from "slow."** No timeout is correct; every failure detector trades false positives against detection time. | L0 — Failure detection | Leader election (did the leader die?), split-brain (both think the other died), 2PC (did the participant ack, or is it just slow?) |
| **Truth needs a majority.** No single node is authoritative; a quorum is. Overlapping read/write sets (R+W>N) is what makes a read see the latest write. | L2 — Consensus | Quorum reads/writes (L4), Raft commit *and* election (L2), why an even node count buys you nothing |
| **Make the unsafe operation idempotent, then fence it.** You can't prevent duplicate deliveries or stale actors; you can make them harmless. | L3 — Fencing tokens | Exactly-once-as-dedup (L5), at-least-once delivery everywhere, retry safety |
| **Coordination is expensive — trade it away.** Every round of agreement costs latency and availability. The craft is needing less of it. | L4 — Quorum tuning | CRDTs (merge without coordinating, L7), gossip (converge without a coordinator, L6), saga over 2PC (L5) |

When a checkpoint stumps you, ask which of these four it's really testing. It's almost always one of them.

!!! info "Before you start — the properties this path assumes"
    This path covers distributed-systems **mechanisms** (the *how*). It assumes you already have the **properties** they exist to provide. If these aren't solid, read them first — they're one tab over in Foundations:

    - [CAP Theorem](../fundamentals/cap-theorem.md) — the consistency/availability choice under partition
    - [Consistency Models](../fundamentals/consistency-models.md) — strong → eventual and everything between
    - [ACID vs BASE](../fundamentals/acid-vs-base.md) — the two transactional worldviews
    - [Fault Tolerance](../fundamentals/fault-tolerance.md) & [Failure Modes](../fundamentals/failure-modes.md) — what "failure" actually means

!!! tip "Interactive roadmap"
    Every node and chip below is a link. Numbered nodes are the levels — click to jump to that level's detail and checkpoint. Chips are the pages for that level. Chips marked advanced are the deep-end / hero-tier topics; skip them on a first pass.

## The roadmap

<div class="roadmap">
  <div class="rm-head">
    <span class="h">🧭 Distributed Systems: Zero → Hero</span>
    <span class="legend">
      <i><span class="sw core"></span>level</i>
      <i><span class="sw opt"></span>topic</i>
      <i><span class="sw adv"></span>hero / advanced</i>
    </span>
  </div>
  <p class="rm-sub">Eight levels top to bottom — each builds on the last. Numbered nodes are the levels (click to jump to detail + checkpoint); the chips are that level's pages. Advanced chips are the deep-end topics — skip them your first pass.</p>
  <div class="rm-track">
    <div class="rm-stop">
      <a class="rm-node" href="#level-0"><span class="n">0</span>Why it's hard</a><div class="rm-branch right"><a class="rm-chip" href="../../distributed/fallacies/">The 8 Fallacies</a><a class="rm-chip" href="../../distributed/failure-detection/">Failure Detection</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="../../distributed/clocks/">Clocks &amp; Ordering</a><a class="rm-chip adv" href="../../distributed/advanced-clocks/">Advanced Clocks (HLC &amp; TrueTime)</a></div><a class="rm-node" href="#level-1"><span class="n">1</span>Time &amp; ordering</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="#level-2"><span class="n">2</span>Agreement &amp; consensus</a><div class="rm-branch right"><a class="rm-chip" href="../../distributed/consensus/">Consensus (Raft &amp; Paxos)</a><a class="rm-chip" href="../../distributed/leader-election/">Leader Election</a><a class="rm-chip adv" href="../../distributed/flp-impossibility/">FLP Impossibility</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="../../distributed/distributed-locks/">Distributed Locks</a><a class="rm-chip" href="../../distributed/split-brain/">Split Brain &amp; Fencing</a></div><a class="rm-node" href="#level-3"><span class="n">3</span>Coordination &amp; safety</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="#level-4"><span class="n">4</span>Replication &amp; partitioning</a><div class="rm-branch right"><a class="rm-chip" href="../../patterns/replication/">Replication</a><a class="rm-chip" href="../../distributed/quorum/">Quorum (R+W&gt;N)</a><a class="rm-chip adv" href="../../distributed/chain-replication/">Chain Replication</a><a class="rm-chip" href="../../fundamentals/partitioning-fundamentals/">Partitioning</a><a class="rm-chip" href="../../patterns/sharding/">Sharding</a><a class="rm-chip" href="../../patterns/consistent-hashing/">Consistent Hashing</a><a class="rm-chip" href="../../fundamentals/hot-partitions/">Hot Partitions</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="../../distributed/distributed-transactions/">Distributed Transactions</a><a class="rm-chip" href="../../distributed/two-phase-commit/">Two-Phase Commit</a><a class="rm-chip" href="../../distributed/exactly-once/">Exactly-Once Semantics</a></div><a class="rm-node" href="#level-5"><span class="n">5</span>Distributed transactions</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="#level-6"><span class="n">6</span>Membership &amp; dissemination</a><div class="rm-branch right"><a class="rm-chip" href="../../distributed/gossip/">Gossip Protocol</a><a class="rm-chip" href="../../distributed/service-discovery/">Service Discovery</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="../../distributed/crdts/">CRDTs</a><a class="rm-chip adv" href="../../distributed/byzantine-fault-tolerance/">Byzantine Fault Tolerance</a><a class="rm-chip" href="../../distributed/distributed-primitives/">Distributed Primitives</a></div><a class="rm-node adv" href="#level-7"><span class="n">7</span>Hero tier</a>
    </div>
  </div>
</div>

---

## Level 0 — Why distributed systems are hard *(~half a week)* { #level-0 }

**The question**: what changes the moment a system spans more than one machine?

Everything in this section exists because one comforting assumption from single-machine programming turns out to be false on a network. Start here or the rest won't land.

1. [The 8 Fallacies of Distributed Computing](../distributed/fallacies.md) — the false assumptions (the network is reliable, latency is zero, bandwidth is infinite, the topology never changes…) behind *every* class of distributed failure. Every later topic maps back to one of these.
2. [Failure Detection](../distributed/failure-detection.md) — the first practical consequence of "the network is unreliable": you cannot tell a dead node from a slow one. Heartbeats, timeouts, phi-accrual, and the cost of false positives. This single problem echoes all the way up to consensus.

*In production*: every outage postmortem you've read traces back to a fallacy — the "it works in staging" latency cliff (*latency is zero*), the retry storm that took down the very service it was retrying (*the network is reliable*), the cross-AZ data-transfer bill nobody forecast (*bandwidth is infinite / transport cost is zero*). The fallacies aren't a history lesson; they're a checklist for reading your own incident channel.

??? question "Checkpoint — can you answer these without looking?"

    - Pick three of the eight fallacies and name a real outage each one causes.
    - Why can a perfect failure detector not exist in an asynchronous network?
    - What does a false-positive failure detection (declaring a healthy node dead) cost you?

## Level 1 — Time & ordering *(~1 week)* { #level-1 }

**The question**: if there's no global clock, what does "happened before" even mean?

1. [Clocks & Ordering](../distributed/clocks.md) — why wall clocks lie, the happens-before relation, and the logical clocks (Lamport, vector) that capture causality without a shared clock.
2. [Advanced Clocks: HLC & TrueTime](../distributed/advanced-clocks.md) *(advanced)* — the hero-tier sequel: Hybrid Logical Clocks combine physical time with a logical counter; Google's TrueTime exposes an explicit uncertainty interval and uses commit-wait to get external consistency in Spanner. How CockroachDB approximates it without atomic clocks.

*In production*: Cassandra's last-write-wins resolution uses wall-clock timestamps — under clock skew it has silently *dropped* the write that actually happened later, the canonical "clocks lie" data-loss bug. Spanner spends real latency (commit-wait, deliberately waiting out the uncertainty interval) precisely to never have that bug. That contrast — pay latency or risk losing data — is the whole level in one sentence.

??? question "Checkpoint"

    - Why isn't a synchronized wall clock (NTP) enough to order events across machines?
    - What can a vector clock tell you that a Lamport clock can't?
    - What does TrueTime's "commit-wait" buy you, and what does it cost in latency?

## Level 2 — Agreement & consensus *(~1-2 weeks)* { #level-2 }

**The question**: how do nodes agree on a single value when any of them can fail and the network can drop messages?

This is the heart of the section. Take your time here.

1. [Consensus (Raft & Paxos)](../distributed/consensus.md) — how a group agrees on an ordered log despite failures. Raft for intuition, Paxos for the foundation.
2. [Leader Election](../distributed/leader-election.md) — the most common application of consensus: pick one coordinator, detect its death, elect a new one without electing two.
3. [FLP Impossibility](../distributed/flp-impossibility.md) *(advanced)* — the theoretical ceiling: in a fully asynchronous system, no deterministic protocol can *guarantee* consensus terminates if even one node may crash. Why that's true, and the three escape hatches (partial synchrony / timeouts, randomization, failure detectors) every real system uses.

*In production*: you almost never *implement* consensus — you configure it and live with its quorum math. etcd and Consul **are** Raft; ZooKeeper is ZAB (a Paxos cousin); Kafka's controller, Kubernetes' control plane, and most "leader" abstractions you lean on bottom out in one of these. Knowing the protocol matters less than knowing its failure envelope: how many nodes you need, how many you can lose, and what happens during an election.

*The bridge worth seeing*: consensus on an **ordered log** is the same problem as **total-order broadcast**, and a replicated log driving identical state machines is **state-machine replication** — that's the leap from "nodes agree on one value" to "we have a replicated database." Once you see it, etcd, a Kafka partition, and a Raft-backed SQL store are all the same idea wearing different clothes. (`consensus.md` makes this explicit.)

??? question "Checkpoint"

    - Why does Raft need a majority quorum to commit an entry *and* to elect a leader?
    - If FLP says consensus can't be guaranteed, how do Raft and Paxos work in practice?
    - What goes wrong if two nodes both believe they're the leader?

## Level 3 — Coordination & safety *(~1 week)* { #level-3 }

**The question**: how do I safely give exactly one process the right to act — and stop a second one from sneaking in?

1. [Distributed Locks](../distributed/distributed-locks.md) — mutual exclusion across machines, lease-based locks, why a lock without a fencing token is unsafe, and the clock-skew trap.
2. [Split Brain & Fencing](../distributed/split-brain.md) — when a partition leaves two nodes both believing they're in charge, both accepting writes. Fencing tokens and how they make stale lock-holders harmless.

*In production*: the famous "is a Redis-based lock safe?" Redlock debate is this entire level compressed into one argument. Martin Kleppmann's fencing-token critique of Redlock is required reading; the short answer is *"not without a monotonic fencing token the resource itself checks — and even then, mind the clock."* If you take one habit from this level, it's: a lock you don't fence is a lock you don't have.

??? question "Checkpoint"

    - A node acquires a lock, pauses for a long GC, and wakes up after its lease expired. How does a fencing token prevent it from corrupting data?
    - What is split brain, and which CAP choice does *tolerating* it imply?
    - Why is a distributed lock built on a single Redis node not safe?

## Level 4 — Replication & partitioning *(~2 weeks)* { #level-4 }

**The question**: one node can't hold all the data or serve all the traffic — how do I spread data across many machines, and keep the copies in agreement?

This is the level the original spine under-served, and it's half of all distributed *data* design. Hold two **orthogonal** axes in your head:

- **Replication** = the *same* data on N nodes. Buys availability, read scaling, and durability. The cost is keeping copies in agreement.
- **Partitioning (sharding)** = *different* data on N nodes. Buys write throughput and capacity beyond one machine. The cost is routing, rebalancing, and cross-partition queries.

Real systems do **both** — DynamoDB hashes the key to pick a partition *and* replicates each partition three ways. Pick a partition key for spread; pick a replication factor for durability. They're independent decisions.

**Replication — keeping copies in agreement:**

1. [Replication](../patterns/replication.md) — the topologies you'll actually choose between: **single-leader** (the default — one writer, async/sync followers), **multi-leader** (write anywhere, conflict resolution required), and **leaderless** (Dynamo-style). Plus sync vs async and the replication-lag anomalies it creates: stale reads, read-your-writes violations, non-monotonic reads. This is the everyday workhorse the rest of the level specializes.
2. [Quorum (R+W>N)](../distributed/quorum.md) — the tunable knob inside leaderless replication: when read and write sets overlap, reads see the latest write. How Dynamo-style systems dial consistency vs availability per query.
3. [Chain Replication](../distributed/chain-replication.md) *(advanced)* — replicas form a chain, writes flow head→tail, the tail serves linearizable reads. Strong consistency *and* high throughput; the CRAQ variant for read scaling.

**Partitioning — splitting the data:**

4. [Partitioning Fundamentals](../fundamentals/partitioning-fundamentals.md) — key-range vs hash partitioning, why the choice dictates which queries are cheap, the routing problem (who knows which node has key K?), and rebalancing without a full reshuffle.
5. [Sharding](../patterns/sharding.md) & [Consistent Hashing](../patterns/consistent-hashing.md) — partitioning applied in production: choosing a shard key, and the consistent-hashing trick that moves only `1/N` of the keys when a node joins or leaves (instead of nearly all of them).
6. [Hot Partitions](../fundamentals/hot-partitions.md) — the failure mode partitioning *creates*: one shard gets all the traffic (the celebrity user, the trending key) while the rest sit idle. Detection and the fixes (key salting, splitting, request coalescing).

*In production*: this pairing **is** the architecture of every large data store. DynamoDB and Cassandra partition by hash of the key and replicate each partition (RF=3 typically); the per-query `QUORUM`/`ONE` knob (R/W/N math) is replication, the partition key is partitioning, and a badly chosen partition key gives you a hot shard no amount of replication fixes. Get these two axes straight and "design a system that stores 50 TB and 1 M writes/sec" stops being intimidating.

??? question "Checkpoint"

    - Replication and partitioning are orthogonal. Explain what each buys you, and why a system usually needs both.
    - Single-leader vs leaderless replication — what's the consistency/availability trade-off, and name a system in each camp.
    - With N=5, what R and W give you strong consistency, and how many failures does it tolerate?
    - Your shard key is `user_id` and one celebrity user generates 40% of writes. What broke, and what are two ways to fix it?
    - Why does consistent hashing move only ~1/N of keys on a node change, where naive `hash(key) % N` moves almost all of them?

## Level 5 — Distributed transactions *(~1-2 weeks)* { #level-5 }

**The question**: how do I make several nodes (or services) commit *together*, all-or-nothing — and what do I do when that's too expensive?

1. [Distributed Transactions](../distributed/distributed-transactions.md) — atomicity across multiple participants, the full picture, and why it's the thing you avoid when you can.
2. [Two-Phase Commit](../distributed/two-phase-commit.md) — the classic atomic-commit protocol, its blocking failure mode (coordinator dies mid-commit), and why it's a poor fit for microservices.
3. [Exactly-Once Semantics](../distributed/exactly-once.md) — at-most-once / at-least-once / "exactly-once" — what's actually achievable, and how idempotency + dedup gets you the effect without the myth.

*In production*: this is *why* microservices reach for the [saga pattern](../patterns/saga-pattern.md), the [transactional outbox](../patterns/outbox.md), and idempotency keys instead of 2PC. The payment you "charged exactly once" is really at-least-once delivery plus a dedup key on the processor's side — the delivery layer retried, and the idempotency key swallowed the duplicate. Internalize that and half of payments/ordering design stops being mysterious.

??? question "Checkpoint"

    - Why does two-phase commit *block* if the coordinator crashes after PREPARE, and what does that do to availability?
    - "Exactly-once delivery is impossible, but exactly-once *processing* is achievable." Explain.
    - Why do microservice architectures prefer the saga pattern over 2PC?

## Level 6 — Membership & dissemination *(~1 week)* { #level-6 }

**The question**: in a cluster where nodes come and go, how does everyone learn who's alive and where things are?

1. [Gossip Protocol](../distributed/gossip.md) — epidemic dissemination: each node periodically syncs with a few random peers; information spreads in O(log N) rounds without any central coordinator. Powers Cassandra/Consul membership and anti-entropy repair.
2. [Service Discovery](../distributed/service-discovery.md) — how services find each other in a world of ephemeral IPs: registries, health-checked endpoints, client-side vs server-side discovery.

*In production*: Cassandra, Consul, and Serf gossip their membership; ScyllaDB and Dynamo-style stores gossip for anti-entropy repair. Service discovery is the etcd/Consul registry your service mesh reads on every deploy and the health-check loop that pulls a dying pod out of rotation. Both answer the same question — *"who's alive, and where?"* — one by epidemic spread, one by a queried registry.

??? question "Checkpoint"

    - Why does gossip scale to thousands of nodes where a central registry struggles?
    - What's the trade-off between gossip's eventual convergence and a strongly-consistent membership view?
    - Client-side vs server-side service discovery — what moves, and what are the failure implications?

## Level 7 — Hero tier *(advanced — come back when the rest is solid)* { #level-7 }

**The question**: what's at the deep end — conflict-free convergence, adversarial nodes, and the space-efficient structures that make planet-scale systems possible?

1. [CRDTs](../distributed/crdts.md) — Conflict-free Replicated Data Types: data structures that merge automatically and converge without coordination or conflict resolution. The math behind collaborative editing and multi-leader replication.
2. [Byzantine Fault Tolerance](../distributed/byzantine-fault-tolerance.md) *(advanced)* — when nodes don't just crash but *lie*. Why crash-fault consensus (Raft/Paxos) doesn't defend against malicious nodes, the 3f+1 quorum math, PBFT, and the modern BFT (Tendermint, HotStuff) behind blockchains — plus the judgment call that most systems should *not* use it.
3. [Distributed Primitives](../distributed/distributed-primitives.md) — the probabilistic structures (Bloom filter, Merkle tree, HyperLogLog, Count-Min Sketch) that power deduplication, anti-entropy, and cardinality estimation at scale.

*In production*: CRDTs power collaborative editors (Figma's multiplayer, Notion-style docs) and multi-leader stores (Redis CRDTs, Riak). Byzantine fault tolerance lives almost entirely in blockchains and a handful of cross-org systems — which is exactly the lesson: if you're not building one, you almost certainly **don't** need it, and saying so is the senior answer. The probabilistic primitives, by contrast, are everywhere quietly: Bloom filters skip disk reads in Cassandra/RocksDB, Merkle trees drive anti-entropy repair, HyperLogLog counts uniques in Redis.

??? question "Checkpoint — the deep end"

    - What property must an operation have for a CRDT to merge it safely, and why does that guarantee convergence?
    - Why does Byzantine fault tolerance need 3f+1 nodes where crash-fault consensus needs only 2f+1?
    - You need to know "have I probably seen this key before?" across a huge dataset with tiny memory. Which primitive, and what's the catch?

## How to use this path

| You have... | Do this |
|---|---|
| A week | Levels 0-2 — fallacies, clocks, consensus. The conceptual core everything else hangs off. |
| A month | Levels 0-5 — adds coordination, the two data-distribution axes (replication + partitioning), and transactions: enough to reason about almost any real system. |
| Going for depth | All of it, including the advanced chips and Level 7. This is staff-interview and design-review territory. |

The two levels people skip and regret: **Level 0** (the fallacies feel obvious until you've shipped the bug) and **Level 2's FLP** (it reframes every "why can't we just…" question you'll ever ask about consensus).

## Beyond the path — what proficiency actually takes

Be honest about what this path is: it gives you the **vocabulary, the failure model, and the trade-off instincts** — enough to read any design, hold your own in a senior+ interview, and know which mechanism a problem calls for. That is most of the battle, but it is not the same as having *built* distributed systems. Three things turn this knowledge into proficiency, and none of them are reading:

1. **Build one and break it.** Implement a toy Raft (the [Raft paper](https://raft.github.io/) + a weekend), or a sharded key-value store with a replication factor and a quorum read. Then inject failures — kill the leader mid-write, partition the network, skew a clock — and watch which guarantee bends. Reading about split-brain is not the same as having caused one. Tools like Jepsen exist precisely because correct-looking systems fail under partition.
2. **Apply it under constraints.** Take the mechanisms here into a real design problem — the [Case Studies](../case-studies/index.md) are graded practice. "Design a URL shortener / news feed / chat system" forces you to *choose* a partition key, a replication strategy, and a consistency level and defend them against follow-ups. That synthesis is the actual skill interviews and architecture reviews test.
3. **Read the primary sources.** This path summarizes; the canon goes deeper. *Designing Data-Intensive Applications* (Kleppmann) is the single best companion — its replication and partitioning chapters are exactly Level 4. Then the [Raft paper](https://raft.github.io/), the Dynamo paper, the Spanner paper, and the [Jepsen analyses](https://jepsen.io/analyses) of databases you actually use.

A useful self-test for "am I proficient?": can you take a blank page and design a system that stores 50 TB with 1 M writes/sec across a region, justify every replication/partition/consistency choice, and answer "what happens when *this* node dies?" for any node you drew? If yes, the reading did its job. If not, you know which level to revisit.

## Related

- [Distributed Systems (section catalogue)](../distributed/index.md) — the same pages, organized as reference
- [The Curriculum: Zero → Staff](curriculum.md) — the broader system-design backbone this fits inside
- [Reliability & Consistency Theory](../fundamentals/index.md#reliability-consistency-theory) — the properties (CAP, consistency models) these mechanisms provide
- [Replication](../patterns/replication.md) · [Sharding](../patterns/sharding.md) · [Consistent Hashing](../patterns/consistent-hashing.md) · [Partitioning Fundamentals](../fundamentals/partitioning-fundamentals.md) — the data-distribution pages woven into Level 4
- [Saga Pattern](../patterns/saga-pattern.md) · [Transactional Outbox](../patterns/outbox.md) — the applied alternatives to 2PC from Level 5
- [Case Studies](../case-studies/index.md) — apply the whole path to concrete system designs
