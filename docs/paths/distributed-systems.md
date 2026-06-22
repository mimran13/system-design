# Distributed Systems: Zero → Hero

A single ordered route through everything in the [Distributed Systems](../distributed/index.md) section — from "why is this so hard?" to the impossibility results and Byzantine protocols that sit at the deep end. This is a companion to the [system-design Curriculum](curriculum.md) and the [AI Engineer Path](ai-engineer.md): one spine, each step building on the last, a checkpoint per level.

**Why a dedicated path?** The section's pages are organized as a reference catalogue. This page puts them in *learning order*. Distributed systems is the one area where reading topics out of order genuinely hurts — you can't reason about consensus before you understand why clocks lie, and you can't appreciate quorum before you've felt the pain in the fallacies. Follow the spine top to bottom your first time.

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
      <a class="rm-node" href="#level-4"><span class="n">4</span>Replication &amp; quorum</a><div class="rm-branch right"><a class="rm-chip" href="../../distributed/quorum/">Quorum (R+W&gt;N)</a><a class="rm-chip adv" href="../../distributed/chain-replication/">Chain Replication</a></div>
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

??? question "Checkpoint — can you answer these without looking?"

    - Pick three of the eight fallacies and name a real outage each one causes.
    - Why can a perfect failure detector not exist in an asynchronous network?
    - What does a false-positive failure detection (declaring a healthy node dead) cost you?

## Level 1 — Time & ordering *(~1 week)* { #level-1 }

**The question**: if there's no global clock, what does "happened before" even mean?

1. [Clocks & Ordering](../distributed/clocks.md) — why wall clocks lie, the happens-before relation, and the logical clocks (Lamport, vector) that capture causality without a shared clock.
2. [Advanced Clocks: HLC & TrueTime](../distributed/advanced-clocks.md) *(advanced)* — the hero-tier sequel: Hybrid Logical Clocks combine physical time with a logical counter; Google's TrueTime exposes an explicit uncertainty interval and uses commit-wait to get external consistency in Spanner. How CockroachDB approximates it without atomic clocks.

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

??? question "Checkpoint"

    - Why does Raft need a majority quorum to commit an entry *and* to elect a leader?
    - If FLP says consensus can't be guaranteed, how do Raft and Paxos work in practice?
    - What goes wrong if two nodes both believe they're the leader?

## Level 3 — Coordination & safety *(~1 week)* { #level-3 }

**The question**: how do I safely give exactly one process the right to act — and stop a second one from sneaking in?

1. [Distributed Locks](../distributed/distributed-locks.md) — mutual exclusion across machines, lease-based locks, why a lock without a fencing token is unsafe, and the clock-skew trap.
2. [Split Brain & Fencing](../distributed/split-brain.md) — when a partition leaves two nodes both believing they're in charge, both accepting writes. Fencing tokens and how they make stale lock-holders harmless.

??? question "Checkpoint"

    - A node acquires a lock, pauses for a long GC, and wakes up after its lease expired. How does a fencing token prevent it from corrupting data?
    - What is split brain, and which CAP choice does *tolerating* it imply?
    - Why is a distributed lock built on a single Redis node not safe?

## Level 4 — Replication & quorum *(~1-2 weeks)* { #level-4 }

**The question**: I need more than one copy of the data — how do the copies stay consistent, and how many must agree?

1. [Quorum (R+W>N)](../distributed/quorum.md) — the tunable knob: when read and write sets overlap, reads see the latest write. How Dynamo-style systems dial consistency vs availability per query.
2. [Chain Replication](../distributed/chain-replication.md) *(advanced)* — an alternative to primary-backup and quorum: replicas form a chain, writes flow head→tail, the tail serves linearizable reads. Strong consistency *and* high throughput; the CRAQ variant for read scaling.

??? question "Checkpoint"

    - With N=5, what R and W give you strong consistency, and how many failures does it tolerate?
    - In chain replication, why can the tail serve strongly-consistent reads without contacting other nodes?
    - When would you reach for chain replication over a quorum (Dynamo-style) design?

## Level 5 — Distributed transactions *(~1-2 weeks)* { #level-5 }

**The question**: how do I make several nodes (or services) commit *together*, all-or-nothing — and what do I do when that's too expensive?

1. [Distributed Transactions](../distributed/distributed-transactions.md) — atomicity across multiple participants, the full picture, and why it's the thing you avoid when you can.
2. [Two-Phase Commit](../distributed/two-phase-commit.md) — the classic atomic-commit protocol, its blocking failure mode (coordinator dies mid-commit), and why it's a poor fit for microservices.
3. [Exactly-Once Semantics](../distributed/exactly-once.md) — at-most-once / at-least-once / "exactly-once" — what's actually achievable, and how idempotency + dedup gets you the effect without the myth.

??? question "Checkpoint"

    - Why does two-phase commit *block* if the coordinator crashes after PREPARE, and what does that do to availability?
    - "Exactly-once delivery is impossible, but exactly-once *processing* is achievable." Explain.
    - Why do microservice architectures prefer the saga pattern over 2PC?

## Level 6 — Membership & dissemination *(~1 week)* { #level-6 }

**The question**: in a cluster where nodes come and go, how does everyone learn who's alive and where things are?

1. [Gossip Protocol](../distributed/gossip.md) — epidemic dissemination: each node periodically syncs with a few random peers; information spreads in O(log N) rounds without any central coordinator. Powers Cassandra/Consul membership and anti-entropy repair.
2. [Service Discovery](../distributed/service-discovery.md) — how services find each other in a world of ephemeral IPs: registries, health-checked endpoints, client-side vs server-side discovery.

??? question "Checkpoint"

    - Why does gossip scale to thousands of nodes where a central registry struggles?
    - What's the trade-off between gossip's eventual convergence and a strongly-consistent membership view?
    - Client-side vs server-side service discovery — what moves, and what are the failure implications?

## Level 7 — Hero tier *(advanced — come back when the rest is solid)* { #level-7 }

**The question**: what's at the deep end — conflict-free convergence, adversarial nodes, and the space-efficient structures that make planet-scale systems possible?

1. [CRDTs](../distributed/crdts.md) — Conflict-free Replicated Data Types: data structures that merge automatically and converge without coordination or conflict resolution. The math behind collaborative editing and multi-leader replication.
2. [Byzantine Fault Tolerance](../distributed/byzantine-fault-tolerance.md) *(advanced)* — when nodes don't just crash but *lie*. Why crash-fault consensus (Raft/Paxos) doesn't defend against malicious nodes, the 3f+1 quorum math, PBFT, and the modern BFT (Tendermint, HotStuff) behind blockchains — plus the judgment call that most systems should *not* use it.
3. [Distributed Primitives](../distributed/distributed-primitives.md) — the probabilistic structures (Bloom filter, Merkle tree, HyperLogLog, Count-Min Sketch) that power deduplication, anti-entropy, and cardinality estimation at scale.

??? question "Checkpoint — the deep end"

    - What property must an operation have for a CRDT to merge it safely, and why does that guarantee convergence?
    - Why does Byzantine fault tolerance need 3f+1 nodes where crash-fault consensus needs only 2f+1?
    - You need to know "have I probably seen this key before?" across a huge dataset with tiny memory. Which primitive, and what's the catch?

## How to use this path

| You have... | Do this |
|---|---|
| A week | Levels 0-2 — fallacies, clocks, consensus. The conceptual core everything else hangs off. |
| A month | Levels 0-5 — adds coordination, replication, and transactions: enough to reason about almost any real system. |
| Going for depth | All of it, including the advanced chips and Level 7. This is staff-interview and design-review territory. |

The two levels people skip and regret: **Level 0** (the fallacies feel obvious until you've shipped the bug) and **Level 2's FLP** (it reframes every "why can't we just…" question you'll ever ask about consensus).

## Related

- [Distributed Systems (section catalogue)](../distributed/index.md) — the same pages, organized as reference
- [The Curriculum: Zero → Staff](curriculum.md) — the broader system-design backbone this fits inside
- [Reliability & Consistency Theory](../fundamentals/index.md#reliability-consistency-theory) — the properties (CAP, consistency models) these mechanisms provide
- [Patterns: Replication](../patterns/replication.md), [Saga Pattern](../patterns/saga-pattern.md) — where these ideas show up as applied patterns
