---
tags:
  - applied
---

# Engineering Organisation

How you organise engineering teams determines what architecture you can have. Conway's Law isn't a curiosity — it's a constraint. This page covers Team Topologies, Conway's Law in practice, platform engineering as a discipline, and the recurring patterns in how engineering organisations succeed or fail at staff level.

---

## Conway's Law in practice

The original statement (Melvin Conway, 1967):

> "Organizations which design systems are constrained to produce designs which are copies of the communication structures of these organizations."

```
The communication structure of the org → the architecture of the systems
```

Examples:

```
Three teams, one in each timezone → 3 services with sync between them
One team owns "auth" → one auth service (even when split would be better)
Frontend team + backend team → REST API between them (with all that implies)
Five teams own one monolith → tangled module ownership inside
```

This isn't theory. It's observable in any engineering org. **System boundaries reflect team boundaries.**

### The inverse Conway maneuver

If Conway's Law constrains architecture, **change the organisation to enable the architecture**.

```
Want: microservices around domains
Need: teams aligned to domains, not technical layers

Want: shared platform
Need: dedicated platform team

Want: cell-based architecture
Need: cells as organisational units
```

This is **the inverse Conway maneuver**: design the org structure first to produce the architecture you want.

In practice: an architectural transformation often starts with a reorg.

---

## Team Topologies — the four team types

(From the book *Team Topologies* by Skelton and Pais.)

### 1. Stream-aligned team

Aligned to a flow of work: a product, a customer journey, a domain.

```
Examples:
  - "Checkout team" (owns the checkout flow end-to-end)
  - "Payments team" (owns the payment integration)
  - "Search team" (owns search experience)

Characteristics:
  Owns one stream of work fully
  Cross-functional (frontend + backend + sometimes data)
  Long-lived
  Goal: deliver value to users
```

Most engineering teams should be stream-aligned. This is **the default** team type.

### 2. Platform team

Provides internal services that reduce cognitive load for stream-aligned teams.

```
Examples:
  - Internal Kubernetes platform team
  - Observability platform team  
  - CI/CD platform team
  - Data platform team

Characteristics:
  Internal customers = stream-aligned teams
  Provides "products" (APIs, tools, templates)
  Doesn't directly deliver business features
  Goal: enable stream-aligned teams to ship faster
```

Critical at scale. Usually emerges when you have 50+ engineers.

### 3. Enabling team

Helps other teams acquire new capabilities. Temporary engagement.

```
Examples:
  - Performance optimisation specialists (drop in to help)
  - Security team (help others adopt secure patterns)
  - DevOps coaches (help teams adopt SRE practices)

Characteristics:
  Doesn't own systems long-term
  Engages with a team for weeks-months
  Goal: build capability in the other team, then leave
```

Often confused with platform teams (which own things) or with consultants (who don't transfer knowledge). Done right, enabling teams accelerate learning across the org.

### 4. Complicated-subsystem team

Owns a deeply specialised technical area requiring deep expertise.

```
Examples:
  - Machine learning research / models team
  - Real-time bidding engine team
  - Custom database team
  - Cryptography / security primitives team

Characteristics:
  Highly specialised; not easily distributed
  Long-lived
  Goal: keep one area excellent without burdening stream teams
```

Use sparingly. Most "complicated subsystems" should be either platform teams (if they serve many teams) or stream-aligned (if they serve a single product area).

---

## Interaction modes (also from Team Topologies)

How teams interact with each other matters as much as how they're organised.

### Collaboration

```
Two teams work together intensely on a problem.
Time-limited (weeks-months).
High communication; high knowledge transfer.

Use when: discovering, exploring, or solving novel problems.
```

### X-as-a-Service

```
One team provides a service; others consume.
Low communication needed once consumed.
Provider treats consumers as customers.

Use when: stable, well-understood capability that should be standardised.
```

### Facilitating

```
Enabling team helps another team.
Coaching / mentoring mode.

Use when: teaching a new practice or tool.
```

### Anti-patterns

```
✗ "All teams must constantly collaborate with all teams"
  Sounds great; impossible at scale; produces meeting hell

✗ "Platform team requires tickets for every change"
  Slow; consumers can't be self-service; bottleneck

✗ "Stream team needs collaboration with platform team for every deploy"
  Platform isn't really a platform; it's a dependency
```

Done right: stream teams use platforms self-service (X-as-a-Service); collaborate with platform teams only when *building* new platform features.

---

## Cognitive load — the real constraint

A team has finite cognitive capacity. The number of systems, technologies, and concepts they can hold in their head simultaneously is bounded.

```
Cognitive load types:
  Intrinsic:    inherent to the problem (e.g., compiler design is hard)
  Extraneous:   accidental complexity (poor tooling, bad docs)
  Germane:      learning new skills

Goal: minimise extraneous; manage intrinsic; reserve room for germane.
```

If a team is at cognitive saturation:

```
✗ Quality drops (no slack for thinking)
✗ Innovation stops (no time to learn)  
✗ Burnout rises
✗ Onboarding is hellish (new hires can't catch up)
```

### Symptoms of overloaded teams

```
"We're firefighting all the time"
"We can't keep up with bug reports"
"Our test suite is flaky and we don't have time to fix it"
"Onboarding takes 6 months"
"Engineers are leaving"
```

These aren't separate problems. They're symptoms of one: **too much cognitive load on the team.**

### Mitigations

```
✓ Reduce the team's owned surface (give some to a platform team)
✓ Standardise tools (less to learn per-project)
✓ Documentation and runbooks (offload from memory)
✓ Automation (reduce manual cognitive overhead)
✓ Hire more (sometimes the right answer)
✓ Split the team (reduce per-person scope)
```

Adding work to an overloaded team produces less, not more. Recognising overload is staff-level work.

---

## Service ownership models

Who owns a service determines everything: who's on-call, who makes architectural decisions, who fixes bugs.

### Single-owner model

```
One team owns one service end-to-end.
Includes: code, deployment, on-call, architecture.

Pros:  
  Clear accountability
  Team knows the system deeply
  Decisions made quickly

Cons:
  Tied to one team's roadmap
  Risk if team disbands
  Knowledge silos
```

Default for most stream-aligned teams.

### Shared ownership

```
Multiple teams contribute to one service.
Distributed maintenance.

Pros:
  Resilient to team changes
  Cross-team learning

Cons:
  No single accountability
  Slower decisions
  Quality drifts (no one "really" owns it)
```

In practice, often becomes "no one owns it." Avoid except for genuinely shared infrastructure.

### Inner-source model

```
Codebase is open within the company; multiple teams can contribute.
One team owns it (reviews PRs, sets direction).
Other teams contribute changes when they need features.

Pros: 
  Knowledge spreads
  Faster bug fixes (whoever notices fixes)
  Less politics for cross-team changes

Cons:
  Requires owner team's review bandwidth
  Quality requires discipline
```

Increasingly common at companies with strong engineering culture. Spotify, Microsoft, GitLab use variants.

---

## Service catalogues

At ~20+ services, you need a **service catalogue**: a registry of what exists, who owns it, how to find it.

### What a catalogue tracks

```
Per service:
  Name and description
  Owning team
  On-call rotation (link)
  Documentation (link)
  Source code (link)
  Deploy pipeline (link)
  Dashboards (link)
  SLO / SLA
  Production tier (T0 critical, T1 important, T2 internal)
  Dependencies (services this calls; services that call this)
  Tech stack
  Last commit / last deploy
```

### Tools

```
Backstage (Spotify; open-source):    most popular; CNCF-incubated
OpsLevel:                            commercial; rich features
Cortex:                              commercial
Port:                                commercial; flexible
Internal wikis (often the start):    OK to begin; outgrown quickly
```

### Why it matters

Without a catalogue:
```
"Who owns the payment service?"
"I think the platform team? Or maybe the checkout team?"
"Let me find someone who's been here longer..."
```

With a catalogue:
```
Search "payment-service" → owner team, on-call, deploys, dashboards.
30 seconds, not 30 minutes.
```

This is **engineering velocity at scale**. New hires onboard faster. Cross-team work happens easier.

---

## Platform engineering as a discipline

Platform engineering is the deliberate practice of building internal platforms that make stream teams faster.

### What a platform team builds

```
Compute platform:        Kubernetes / ECS abstractions with golden paths
CI/CD platform:          standardised pipelines; deploy as a service
Observability platform:  metrics, logs, tracing pre-configured
Data platform:           ingestion pipelines; warehouse access
Identity platform:       SSO, service-to-service auth
Internal Developer Portal: Backstage, Service catalog, docs
```

### The "golden path"

```
Stream team: "I want to deploy a new service."
Platform path: "Run `golden-path new-service`. Done."

That command:
  - Creates the repo
  - Sets up CI/CD
  - Configures observability  
  - Sets up health checks, deploys
  - Creates dashboards
  - Adds the service to the catalogue
  - Sets up DNS, certificates
  - Default on-call rotation
```

The golden path is the **paved road**. Off-road is possible but harder. Most teams take the paved road, which spreads consistency.

### Platform-team-as-product mindset

```
The platform team's customers are internal engineering teams.
Treat platform as a product:
  - User research (surveys, interviews of engineers)
  - Roadmap based on customer pain
  - Releases announced; changelogs
  - Onboarding materials
  - Support channels (Slack, office hours)
  - Metrics (adoption rate, satisfaction, time-to-deploy)
```

Many platform teams fail by treating their work as infrastructure ("we built it; figure it out"). The platforms that succeed treat engineers as customers.

### Pitfalls

```
✗ Platform built without consulting stream teams → unused
✗ Platform inflexible; corner cases force teams to bypass
✗ Platform team isolated from stream teams (no empathy)
✗ Platform team is a bottleneck (every change requires ticket)
✗ Platform built for "ideal" use cases, not actual
✗ Platform team measures own outputs (services run), not customer outcomes
```

The best platform teams **rotate engineers in from stream teams** to build empathy and ensure relevance.

---

## Engineering Productivity / DevEx

The discipline of measuring and improving the experience of building software at the company.

### Why measure DevEx

```
Engineers' time is the most expensive cost.
Slowdowns compound (5 minutes wasted per build × 1000 builds/day × 100 engineers).
Frustration drives attrition (the silent cost).
```

### Metrics

```
Build time:                  how long CI takes
Deploy time:                  commit to production
Lead time for changes (DORA): same idea, broader
Local dev environment setup:  time for new hire to be productive
Code review latency:          PR opened to merged
Test execution time:          full test suite
On-call burden:               pages per week per engineer
Tool friction surveys:        regular qualitative measurement
```

### DORA metrics (the four key ones)

From the State of DevOps reports:

```
1. Deployment Frequency
   How often you deploy to production
   Elite: multiple times per day
   Low: less than once per month

2. Lead Time for Changes
   Commit to production
   Elite: less than 1 hour
   Low: more than 1 month

3. Change Failure Rate
   % of deploys causing production issues
   Elite: 0-15%
   Low: 46-60%

4. Mean Time to Restore
   Time to recover from failure
   Elite: less than 1 hour  
   Low: 1 week to 1 month
```

Tracking these reveals whether the engineering org is improving over time. Most companies are around the "Medium" tier; "Elite" is rare and intentional.

### Improving DevEx

```
1. Survey engineers periodically (quarterly)
   Specific questions: "What slows you down most?"

2. Fix top-3 complaints
   Don't try to fix everything

3. Repeat
```

Simple loop, rarely done. The platform team often owns this work.

---

## Organisational anti-patterns

### The matrix nightmare

```
Engineers report to functional managers (e.g., "Backend Manager")
Also report to product teams (e.g., "Checkout Squad")
Multiple bosses, conflicting priorities, no clear ownership.
```

Common in larger organisations. Usually a sign of unclear strategy. Fix: clear primary reporting line; squads aren't matrix.

### Re-org as a substitute for hard decisions

```
"Things aren't working. Let's reorganise."
6 months later: still not working. Reorganise again.
```

Reorgs cost ~6 months of velocity. Justified when org structure is genuinely wrong. Not justified when the actual problem is different (strategy, leadership, tools).

### Premature platform team

```
20 engineers, 4 stream teams, no real platform yet.
"Let's start a platform team to standardise things."
Platform team builds opinionated tools; stream teams haven't experienced enough pain to use them.
Platform tools sit unused; stream teams continue as before.
```

Platform teams emerge from genuine pain. Premature ones produce shelf-ware.

### The infinite re-org

```
Every new VP / Director reorganises within 6 months.
Each reorg is "the right structure this time."
The org never stabilises long enough to actually optimise.
```

Stability matters. A "wrong but stable" structure often outperforms a perpetually-changing "ideal" one.

### Functional silos

```
Frontend team owns frontend.
Backend team owns backend.
Database team owns databases.

Every feature requires 3 teams to coordinate.
```

Conway's Law: this produces tightly-coupled architecture across the silos. Stream-aligned (cross-functional) teams produce loosely-coupled architecture.

### Distributed ownership of critical paths

```
The checkout flow touches 8 services owned by 6 different teams.
When checkout breaks: 6 teams convene to debug.
No single team owns the user experience.
```

Critical user-facing flows need primary owners. The owner coordinates dependencies during issues.

---

## Designing teams around domains

How to actually define team boundaries.

### Domain-driven design helps

Map your business domain into **bounded contexts**. Each context is a candidate for one team's ownership.

```
E-commerce business:
  Catalog context:       team catalog
  Order management:      team orders
  Payment processing:    team payments
  Fulfilment:            team fulfilment
  Customer accounts:     team accounts
  Pricing & promotions:  team pricing
  Search:                team search
```

Each team owns its context end-to-end: data, services, UI components.

### Team size

Amazon's "two-pizza team": small enough that two pizzas feed them.

```
Practical sizes:
  4-6 engineers:    smallest viable (covers on-call without burnout)
  6-9 engineers:    sweet spot
  10+ engineers:    split impending; coordination cost rising
```

Above ~9: communication overhead grows non-linearly. Below ~4: on-call burden + bus factor.

### When to split a team

```
Signs:
  - Team meetings have 12 people
  - Coordination overhead > productive work
  - Multiple distinct domains served (frontend AND backend AND data eng)
  - Different goals among sub-groups
  - Slow decision-making

Split along:
  - Different domains (orders vs pricing)
  - Different abstraction levels (UI vs API vs data)
  - Different user groups (B2B vs B2C)
```

A split is a reorg; pay the cost. Don't split casually.

### When to merge teams

```
Signs:
  - Two teams own related domains; constantly coordinate
  - Each team is too small for sustainable on-call
  - Cross-team work is the dominant work pattern
  - Domain boundary turned out to be wrong

Merging frees up coordination overhead. Often beneficial.
```

---

## The 1:1, the standup, the retro

Three rituals that determine team health.

### 1:1 between engineer and lead

```
Weekly or biweekly.
30 min.
Topics: career, blockers, feedback, well-being.
Not: project status (that's standup).

Most important conversation in engineering. Skip it and trust erodes.
```

### Standup (daily or weekly)

```
What's the team working on?
What are blockers?

Not: status report to manager.
Yes: surfacing impediments and coordination needs.

If standups feel like status reports, they're failing.
```

### Retrospective

```
After every sprint / month.
What went well, what didn't, what to change.

If retros consistently identify the same issues without resolution,
the team has deeper problems retros can't solve.
```

These rituals are the **mechanism** of team functioning. Skipping or doing them badly compounds.

---

## Knowledge management

How does knowledge spread across an organisation?

### Sources of knowledge

```
Tribal knowledge:    in heads; lost when people leave
Documentation:       wikis, READMEs, runbooks
Code as documentation: clear code, types, tests
ADRs:                why decisions were made
Postmortems:         what we learned from incidents
Catalogues:          what exists; who owns it
```

### Symptoms of bad knowledge management

```
"Ask Bob; he knows."
"Only Carol can deploy that."
"Last person who knew this left 2 years ago."
"Why does this code do X?" → silence
```

### Practical improvements

```
✓ READMEs in every repo (kept current via CI checks)
✓ ADRs for every non-trivial decision
✓ Postmortems published widely  
✓ Service catalogue maintained
✓ "Bus factor" of each system tracked (how many people could lose without losing it)
✓ Regular tech talks / lunch-and-learns
✓ Onboarding documents (kept current by next new hire)
```

Investment in knowledge management compounds over years. Especially valuable in distributed/remote orgs.

---

## Remote / distributed teams

If your org is remote (full or partial), the rules change.

### Async-first culture

```
Sync meetings: expensive (everyone present)
Async work: scales; allows deep focus

Default to async. Use sync for:
  - Decisions that need real-time discussion
  - Difficult interpersonal conversations
  - Pair programming / mentoring
  - Incidents
```

### Written communication norms

```
Decisions: in writing, in shared docs
Discussions: in threads, not DMs (visibility)
Status: dashboards, not standup
Knowledge: documented, not tribal
```

Remote orgs that don't internalise written culture struggle. Async culture isn't just "Slack instead of office" — it's a different way of working.

### Timezone considerations

```
Overlap windows matter.
4+ hours of overlap = workable.
2 hours = barely.
0 hours = "we're not really working together."

Patterns:
  - One team timezone (everyone in 3-4 hr band): easiest
  - Two clusters with overlap (US-EU, Asia-EU): workable with discipline
  - Follow-the-sun (24h coverage by handoff): hard; needs strong async
```

### Hiring impact

```
Remote-only: hire from anywhere; potentially huge candidate pool
Distributed: timezone constraints reduce pool
Hybrid: must define exactly what hybrid means (3 days office? 1 day?)
```

Many companies' "hybrid" policies are unclear, causing constant low-grade friction.

---

## Culture vs structure

Both matter. Some companies fix structure but ignore culture.

```
Structure tells you who reports to whom and what the org chart is.
Culture tells you what actually gets rewarded and how people behave.
```

### Culture symptoms

```
Healthy:
  ✓ Disagreement happens openly; decisions get made
  ✓ Mistakes are discussed without blame
  ✓ Engineers feel safe raising concerns to senior leadership
  ✓ Promotions are based on impact, not visibility
  ✓ Tech debt is recognised and prioritised

Unhealthy:
  ✗ Disagreement is suppressed; people grumble privately
  ✗ Incidents = blame; people hide mistakes
  ✗ Speaking up is career-limiting
  ✗ Promotions go to those who lobby loudest
  ✗ Tech debt accumulates indefinitely
```

Culture is downstream of leadership behaviour. Staff engineers shape it by example, not decree.

---

## Anti-patterns

| Anti-pattern | Better |
|---|---|
| Functional silos (FE / BE / DB teams) | Stream-aligned cross-functional teams |
| Premature platform team | Wait until pain is real and shared |
| Shared ownership of all things | Single owner per system; inner source for changes |
| Re-org as substitute for strategy | Address actual cause; reorg as last resort |
| Standups as status reports | Standups as blocker surfacing |
| Skipping 1:1s | Weekly minimum; protected time |
| Tribal knowledge as norm | Documentation, ADRs, runbooks |
| Architecture review gatekeeping all changes | ARB advisory; teams empowered |
| "All hands needed for every project" | Stream teams autonomous; platforms self-service |
| Cognitive overload ignored | Recognise; offload to platforms or reduce scope |

---

## Quick reference

```
"How big should a team be?"           4-9 engineers (two-pizza)
"When to add a platform team?"        ~50+ engineers; consistent platform pain
"Who owns a service?"                 One stream-aligned team; clear in catalogue
"How to structure a 100-engineer org?" 10-15 stream teams + 2-3 platform teams + 1 enabling
"How to reduce cognitive load?"        Platform offload, standardisation, automation
"DORA metrics target"                 Daily deploys, <1hr lead, <15% failure, <1hr MTTR
"Conway's Law implies"                 Org structure produces architecture; change org to change arch
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand engineering organisation as a system that constrains architecture.

**Strong answer pattern:**
1. Conway's Law: org structure shapes architecture
2. Team Topologies: stream-aligned (default), platform, enabling, complicated-subsystem
3. Stream teams cross-functional, end-to-end ownership
4. Platform teams emerge from real pain; treat platform as a product
5. Cognitive load is the real constraint; manage it deliberately
6. Service catalogue + ownership clear at scale

**Common follow-up:** *"Your CTO wants to move from monolith to microservices. The current org has frontend, backend, and database teams. What's your advice?"*
> You can't have microservices with functional silos. The org change must come first or in parallel. Specifically: reorganise into stream-aligned teams around business domains (orders, payments, etc.). Each team owns end-to-end: backend services, the relevant UI components, the data they store. Add a platform team if you need shared infrastructure capabilities (CI/CD, observability, K8s). The CTO should expect this transition to take 12-18 months and to feel like productivity drops for 6 months before improving. Without the org change, microservices will produce a distributed monolith where every change still requires the same three teams to coordinate.

---

## Related

- [Modular Monolith](modular-monolith.md) — often right answer for small orgs
- [Anti-Patterns](anti-patterns.md) — including organisational
- [Architecture Politics](architecture-politics.md) — the social side
- [Domain-Driven Design](ddd.md) — bounded contexts ↔ teams
- [Microservices Patterns](microservices-patterns.md) — what teams produce when organised right
- Team Topologies (book by Matthew Skelton & Manuel Pais)
- The Staff Engineer's Path (book by Tanya Reilly)
