# Architectural Decision Records (ADRs)

ADRs are short, numbered, version-controlled documents that capture significant architectural decisions and the context, alternatives, and consequences behind them. They're how senior architects leave a useful trail for future engineers — and for their future selves who forgot why they chose what they chose.

---

## What an ADR is

A single Markdown file (typically) that records:

- **The decision** — what we chose
- **The context** — what problem we were solving, what constraints applied
- **The alternatives considered** — what else we looked at, why we rejected them
- **The consequences** — what's now true (and harder) because of this decision

A few hundred words. Not a design document. Not a specification.

---

## A minimal ADR template

```markdown
# ADR-0017: Use PostgreSQL for the orders database

Date: 2026-05-09
Status: Accepted

## Context

The orders service needs a transactional database. We need:
- ACID transactions across multiple rows
- Sub-100ms p99 reads at 10K QPS
- Data retention: 5 years online, 7 years offline
- Strong consistency (no eventual consistency surprises)
- Mature ecosystem for our team (Python/SQLAlchemy)

We expect 50M orders/year initially, growing 50% YoY for 3 years.

## Decision

We will use PostgreSQL 16 as the primary datastore for the orders service.

## Alternatives Considered

### MySQL
- Pro: similar capabilities; team familiarity
- Con: weaker JSON support; less flexible indexing for our query patterns
- Verdict: viable backup if Postgres becomes problematic

### DynamoDB
- Pro: fully managed; no operational overhead
- Con: no joins; complex multi-attribute queries become awkward
- Con: cost at our scale exceeds RDS Postgres
- Verdict: rejected — query model doesn't fit

### CockroachDB
- Pro: distributed Postgres-compatible; scales horizontally
- Con: operational complexity exceeds team capacity
- Con: not needed at our 3-year projected scale
- Verdict: revisit if scale exceeds RDS comfortably

## Consequences

### Positive
- Mature ecosystem, well-known operations
- Single-node scale-up to ~100K QPS available; read replicas for further reads
- Rich SQL for analytics and ad-hoc queries

### Negative
- Single-region single-primary writes — multi-region requires future migration
- Vacuum operations require operational attention
- Schema changes need careful planning at scale

### Neutral
- We commit to learning vacuum, replication, and Postgres-specific operations
- We accept ongoing minor-version upgrade work
```

That's the entire ADR. ~250 words.

---

## Why ADRs work

**1. Context decays.** Six months from now, nobody remembers why DynamoDB was rejected. The ADR is the answer to "why didn't we just use DynamoDB?"

**2. Reviews focus the thinking.** Writing an ADR forces explicit reasoning. "Just chose Postgres because we knew it" is different from "we evaluated three options and Postgres fit the constraints."

**3. They're searchable.** When deciding the next service's database, search for "PostgreSQL" in `docs/adrs/` and reuse what's known.

**4. They survive churn.** Engineers leave. The ADR doesn't. Future engineers can change the decision (with a new ADR) but understand what was considered before.

**5. They're cheap.** ~250 words, ~30 minutes to write. No specialised tooling.

---

## When to write an ADR

Decisions that:

- Affect more than one team or service
- Are hard to reverse (database choice, language choice, framework)
- Involve picking among genuine alternatives
- Will be questioned in 6 months by someone unfamiliar
- Concern cross-cutting concerns (auth, logging, deployment, observability)

Decisions you don't need an ADR for:

- Trivial daily code choices ("use this library function")
- Reversible-in-an-hour changes
- Decisions inherently scoped to one PR

A good signal: "if someone joining the team in 3 months asked 'why X?', is the answer obvious?" If not, write an ADR.

---

## ADR statuses

```
Proposed  ─→ Accepted  ─→ Deprecated
              ↓
            Superseded by ADR-0042
```

| Status | Meaning |
|---|---|
| Proposed | Under review |
| Accepted | Decision is in effect |
| Deprecated | No longer the right answer; not yet replaced |
| Superseded | Replaced by another ADR (link to it) |

When you change your mind, write a *new* ADR that supersedes the old one. Don't edit the original — it's history.

---

## Repository structure

```
docs/
└── adrs/
    ├── README.md                                 # index
    ├── 0001-record-architecture-decisions.md
    ├── 0002-use-postgresql-for-orders.md
    ├── 0003-event-driven-between-services.md
    ├── 0004-monorepo.md
    ├── 0005-typescript-for-frontend.md
    └── ...
```

Numbered sequentially. Filename matches the decision title. No deletions — superseded ADRs stay.

The README lists all ADRs with status, briefly:

```markdown
# Architecture Decision Records

| # | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-use-postgresql-for-orders.md) | Use PostgreSQL for orders | Accepted |
| [0003](0003-event-driven-between-services.md) | Event-driven communication between services | Accepted |
| [0004](0004-monorepo.md) | Adopt a monorepo for backend services | Superseded by 0019 |
| ...
```

---

## ADRs vs design documents

| | ADR | Design doc |
|---|---|---|
| Length | ~250-500 words | 5-30 pages |
| Audience | Future engineers | Reviewers, stakeholders |
| Scope | One decision | An entire feature / system |
| Updates | Append new ADRs | Edit until shipped, then archive |
| Lifespan | Forever (status changes) | Active until launch |

Design docs are for "how will we build this feature?" ADRs are for "why did we pick this technology / pattern?"

A design doc may *cite* ADRs ("See ADR-0017 for our database choice") and may *produce* ADRs as part of its review process.

---

## Tooling

### `adr-tools`

CLI for creating, listing, superseding ADRs:

```bash
brew install adr-tools

adr init docs/adrs
adr new "Use PostgreSQL for orders database"
adr supersede 4 "Adopt polyrepo per service"
adr list
adr generate toc > docs/adrs/README.md
```

Optional. Plain Markdown files work fine.

### Static site generators

MkDocs / Docusaurus pick up ADRs naturally. Search across them.

---

## Common pitfalls

**1. Writing too late.** ADRs after the fact are rationalisations, not decisions. Write while alternatives are still in play.

**2. Writing too long.** A 5-page ADR is a design doc, not an ADR. Keep them focused.

**3. Skipping alternatives.** "We chose X" without listing what was rejected is half an ADR. The rejected options are usually more informative than the chosen one.

**4. Hidden constraints.** "We chose Postgres" without "team has 5 years of Postgres ops experience" hides the real reason. Make the constraints explicit.

**5. Editing accepted ADRs.** Once accepted, don't change. Write a new one that supersedes.

**6. ADRs as policy.** "We will use Postgres for everything" is a policy / standard, not a decision record. Different document type.

---

## A more advanced template

For decisions with significant trade-offs, a longer template helps:

```markdown
# ADR-XXXX: [Title]

Date: YYYY-MM-DD
Status: Proposed | Accepted | Deprecated | Superseded by ADR-YYYY
Tags: [database, security, performance]
Authors: [@alice, @bob]
Reviewers: [@carol, @dave]

## Context
What problem are we solving? What constraints apply? What's the domain?

## Decision
What did we decide? Be specific.

## Alternatives Considered
- Option A: [pros] [cons] [verdict]
- Option B: [pros] [cons] [verdict]
- Option C: [pros] [cons] [verdict]

## Consequences
- Positive: [outcomes we expect]
- Negative: [trade-offs we accept]
- Neutral: [things we now own]

## Compliance / Security Considerations
[If relevant]

## Cost Implications
[If relevant]

## Migration / Rollout Plan
[For decisions with implementation impact]

## Future Reconsideration Triggers
What conditions would cause us to revisit this decision?
```

Use this when the decision is high-stakes. For most ADRs, the minimal template is enough.

---

## Examples of good ADRs to learn from

- [Spotify Backstage ADRs](https://backstage.io/docs/architecture-decisions/) — public ADRs from a well-known platform
- [GitHub Engineering blog ADRs](https://github.blog/) — decisions explained
- [thoughtworks/adr-tools sample ADRs](https://github.com/joelparkerhenderson/architecture-decision-record) — template library

Reading other teams' ADRs is one of the fastest ways to absorb how senior architects think.

---

## ADRs in your daily workflow

```
Architectural choice arises
   ↓
Draft ADR (status: Proposed)
   ↓
Open PR with ADR + any supporting design doc
   ↓
Team reviews; debate happens in PR comments and meetings
   ↓
Approved → merge with status Accepted
   ↓
Implementation work proceeds
   ↓
6 months later: someone asks "why X?" → ADR answers
   ↓
Years later: condition changes → new ADR supersedes
```

The PR review of the ADR is often more valuable than the ADR itself — that's where the debate gets recorded.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you record decisions or treat architecture as oral tradition.

**Strong answer pattern:**
1. ADR = numbered, short, version-controlled record of context + decision + alternatives + consequences
2. Write before/during the decision, not after
3. Mature teams have folder of dozens; junior teams have none
4. Status lifecycle: Proposed → Accepted → (Deprecated | Superseded)
5. Cheap to write, valuable for years

**Common follow-up:** *"How is an ADR different from a design doc?"*
> Length and scope. ADR is ~250-500 words capturing one decision and its alternatives. Design doc is multiple pages describing a whole feature or system. ADRs are written once and live forever (with status changes); design docs are written, edited until launch, then archived. A design doc may produce ADRs as outputs — "we picked Postgres for orders, see ADR-0017." Both have their place; neither replaces the other.

---

## Related topics

- [Fitness Functions](fitness-functions.md) — automated checks ADRs imply
- [Evolutionary Architecture](evolutionary-architecture.md) — ADRs document the evolution
- [Quality Attributes](quality-attributes.md) — what ADRs typically discuss
- [Twelve-Factor App](twelve-factor.md) — many practices ADR-worthy
