---
tags:
  - applied
---

# Architecture Politics — The Social Side of Technical Decisions

Most technical books skip this. Staff engineers spend half their time on it. This page covers the **human and organisational** side of architecture: how RFCs actually get accepted, how build-vs-buy is decided, how to navigate the politics of major migrations, and the dynamics that determine whether your technically-correct proposal actually gets adopted.

It's a different genre from the rest of the encyclopedia — less code, more "what to say in the meeting." Worth keeping somewhere because being right technically isn't enough.

---

## The reality

```
You write a 20-page architectural proposal.
It's correct. It's well-reasoned. It's clearly better than the status quo.
6 months later, nothing has changed.

Junior reaction: "People are stupid; they don't get it."
Senior reaction: "What did I miss about the social system?"
Staff reaction: "Here's how I structure proposals to actually land."
```

Technical correctness is necessary but not sufficient. Architecture happens in organisations of people with different incentives, history, and politics. Ignoring this means good ideas die.

---

## RFCs — how they actually work

RFC (Request for Comments) / design doc / architectural proposal — different names, same idea. A written proposal that goes through review.

### What makes an RFC succeed

Reviewing dozens of failed RFCs and successful ones, patterns emerge:

```
Failed RFC traits:
  ✗ Solution-first; doesn't explain the problem clearly
  ✗ One option presented; reader can't evaluate trade-offs
  ✗ Vague non-functional requirements
  ✗ No cost / time estimates
  ✗ Doesn't address known concerns (people sense avoidance)
  ✗ Author hasn't talked to affected teams beforehand
  ✗ Too long; reader gives up at page 3

Successful RFC traits:
  ✓ Problem stated first, clearly, with evidence (data, examples)
  ✓ Multiple options compared with explicit trade-offs
  ✓ Concrete non-functional requirements (latency, scale, cost)
  ✓ Realistic estimates including hidden costs
  ✓ Acknowledges drawbacks of the recommended option
  ✓ Pre-socialised with key stakeholders before formal review
  ✓ Concise; details in appendices
```

### A reusable RFC template

```markdown
# RFC-XXX: [Title]

**Author**: @you
**Status**: Draft / Under Review / Accepted / Rejected / Superseded
**Date**: 2026-05-18
**Discussion**: [link to comments / meeting notes]

## TL;DR

One paragraph. What we're proposing, why, expected impact.
Executives may read only this.

## Problem

What's broken or missing? Use evidence:
- Metrics ("p99 latency 800ms vs 200ms target")
- Incidents ("3 outages in 2 months traced to X")
- Velocity ("shipping feature Y took 6 weeks; should be 2")
- Quotes / data from affected teams

Don't skip this. The problem statement is half the argument.

## Goals and non-goals

Goals: what success looks like, specifically
Non-goals: what we're explicitly NOT trying to do (prevents scope creep)

## Options considered

### Option A: [Name]
- How it works
- Pros
- Cons
- Cost estimate

### Option B: [Name]
- ...

### Option C: Do nothing
- Pros (often: "no work, no risk")
- Cons (the cost of the status quo)

## Recommendation

Pick one. Explain why.

## Trade-offs

What we give up by choosing this.

## Risks

What could go wrong. Mitigation for each.

## Implementation plan

Phased rollout, milestones, owners.

## Cost / time

Honest estimate. Include:
- Engineering hours
- Infrastructure cost (monthly)
- Migration cost
- Ongoing operational cost
- Opportunity cost

## Open questions

Things you don't know. Inviting discussion.

## Appendices

Detailed diagrams, alternative analyses, performance data.
```

### Length guidance

```
TL;DR:              <100 words
Body:               1-3 pages (executives read this far)
Appendices:         however much needed
Total:              <10 pages (longer = unread)
```

A 30-page RFC is a sign of insecurity. Confidence is brevity.

### Pre-socialisation

The biggest predictor of RFC success: **how much pre-meeting work was done.**

```
Before publishing:
  1. 1:1 with each affected team's lead. Get their concerns.
  2. Update RFC to address concerns; cite them by name.
  3. 1:1 with senior architect / influential staff engineer.
  4. Adjust based on their input.
  5. Now publish the RFC.
  
By publication, half the audience already supports it.
```

Public review without pre-socialisation = guaranteed conflict. People are uncomfortable raising concerns in writing for the first time; they're easier raised in 1:1.

### Comment culture

```
Healthy: "I disagree because X. Could we address it by Y?"
Unhealthy: "This is a terrible idea." (no constructive path)

Healthy: "I think Option B is better because of Z."
Unhealthy: "Have you considered that Z exists?" (passive aggression)
```

If your team's RFC reviews are mostly the latter, you have a culture problem worth addressing separately from technical decisions.

### Decision authority

Who actually decides? Make it explicit.

```
Drawn from RFC frontmatter:
  Decision maker: @staff-architect
  Required approvers: @platform-lead, @security-lead
  Informed parties: @engineering-leads
```

Without this, RFCs drift. Months later, nothing decided, everyone "concerned."

The model: **author proposes; decision-maker decides; team executes.** Disagreement and commit. See Bezos's "disagree and commit" philosophy.

---

## Build vs buy

The recurring decision. The default heuristic is wrong.

### Wrong heuristic

```
"We could build it cheaper than the SaaS subscription"

Math: SaaS = $50K/year. Building takes 1 engineer 6 months = $100K.
Conclusion: build.

What's missed:
  - Ongoing maintenance: 10-20% of an engineer forever
  - Opportunity cost: that engineer could ship product features
  - Risk: bugs you'd never see in mature SaaS
  - Scale costs: SaaS handles 100× your traffic; you'd need to rebuild
  - Specialised features (compliance, integrations) you'd reinvent badly
```

### The real cost of building

```
Building cost = 
    initial development
  + 10-20% ongoing engineering (forever)
  + on-call rotation (2-3 engineers minimum)
  + infrastructure to host it
  + opportunity cost (these engineers could be building product)
  + risk premium (unknown bugs)
  + integration cost with your other systems
  + documentation / training for other engineers
```

For specialised problems (payment processing, email delivery, identity, monitoring), the SaaS option is almost always cheaper TCO unless you have a very specific reason.

### When to build

Real reasons to build:

```
✓ Core competitive advantage (search at Google; matching at Uber)
✓ Specialised compliance not available off-the-shelf
✓ Scale exceeds vendor capabilities (rare; most SaaS scales further than you think)
✓ Vendor lock-in too risky for this dependency
✓ Cost truly outweighs at your scale (validated, not assumed)
✓ Available SaaS is genuinely bad (rare in 2026)
```

When to buy:

```
✓ Solved problem (auth, payments, email, monitoring, error tracking)
✓ Not your competitive differentiator
✓ Vendor has 100× more engineers focused on it than you can spare
✓ Integration is straightforward (well-documented APIs)
✓ Cost is reasonable at your scale
```

### Build vs buy framework

For each major decision:

```markdown
| Dimension | Build | Buy |
|---|---|---|
| Initial cost | $X eng-hours | $Y/year |
| Ongoing cost | $Z eng-hours/year | $Y/year |
| Time to value | 6 months | 2 weeks |
| Risk | Unknown bugs; hire dependency | Vendor lock-in; outages |
| Scale ceiling | Limited by our team | Vendor handles it |
| Specialisation | Whatever we build | Specialised features |
| Strategic value | Owns the problem | Outsources the problem |
| Exit cost | Can keep / migrate | Migration cost |
```

Force yourself to fill this in. Numbers expose assumptions.

### The trap: free OSS

```
"It's free, so cost = 0"
Reality: free OSS still costs engineering hours to deploy + operate + patch + monitor
A managed SaaS version is often cheaper TCO
```

For databases especially: managed Postgres (RDS, Aurora) is almost always cheaper TCO than self-hosted unless you have specialised needs.

---

## Migration politics

Migrating to a new architecture is half technical, half political.

### Why migrations fail

```
Reasons cited:                            Real reasons:
"Technical complexity"                    Lack of executive sponsorship
"Resource constraints"                    Lack of incentive for teams to migrate
"Better priorities"                       No deadline; perpetual "next quarter"
"Risk concerns"                           No champion when sponsor leaves
"Compatibility issues"                    Politics between teams
```

Almost every failed migration I've seen failed on the right column, not the left.

### What successful migrations need

```
1. Executive sponsor
   Someone senior cares about it succeeding.
   When trade-offs arise, they get resolved in favour of the migration.

2. Champion (often the migration's tech lead)
   Single owner of the project.
   Reports progress, escalates blockers, maintains momentum.

3. Clear deadline
   "Migrate by end of Q3" makes things happen.
   "Migrate eventually" never finishes.

4. Carrots and sticks
   Carrot: new system is better in some way teams want (faster, cheaper, easier)
   Stick:  old system is sunset by date X

5. Team incentives aligned
   Migrating teams' goals include migration completion.
   Their performance evaluation reflects it.
```

Without all 5: migration won't complete.

### The 80/20 trap

```
First 80% of migration: 6 months
Last 20% (legacy edge cases, holdout teams): 2+ years
```

The end of a migration is always the hardest. Plan for it explicitly:

```
Phase 1: Build new system; migrate easy cases (greenfield, new features)
Phase 2: Migrate willing teams
Phase 3: Migrate medium-friction teams
Phase 4: Hard deadline. Old system shutting down. Migrate or lose feature.
```

Without phase 4, you'll have both old and new forever, doubling maintenance.

### Carrots and sticks examples

**Carrot**: new database has automatic backups + better tooling. Teams *want* to migrate.

**Carrot**: new RPC framework has built-in tracing. Engineers actively prefer it.

**Stick**: old system marked deprecated; new features can only be built on new system.

**Stick**: hard sunset date announced 6 months out; reminded monthly.

**Stick (rare)**: budget for old system cut; can't pay for hardware.

The best migrations have both — engineers want to move AND old system has a real end-of-life date.

### Migration anti-pattern: parallel forever

```
"We'll support both systems while teams migrate"
↓
"Both systems indefinitely"
↓
"Now we maintain two systems for everything"
↓
"Original system is now bigger because we kept building features in it 
   while saying we'd migrate"
```

This is the most common migration failure. Cure: hard deadline + executive sponsor.

---

## Tech radar

Companies need a way to communicate "what technologies are we using, considering, avoiding."

### The Thoughtworks model

```
Adopt:    "We use this and recommend it widely."
Trial:    "Worth a serious try on appropriate projects."
Assess:   "Worth exploring; don't bet on yet."
Hold:     "Avoid for new projects; existing usage understood."
```

Each technology is placed on the radar in one of four rings.

### Why have a tech radar

```
Without one:
  - Each team picks its own tools
  - 5 different ways to do the same thing
  - Hiring is hard (no consistent skill set)
  - Knowledge doesn't transfer between teams
  - Migration cost when one team's tool dies

With one:
  - Coordinated decisions
  - Clear answer for "what should I use?"
  - Shared expertise
  - Cleaner deprecations
```

### How to maintain it

```
Quarterly: Architecture review meeting
  - Add new entries (someone proposed a new tech)
  - Move existing entries (Trial → Adopt, or Adopt → Hold)
  - Remove obsolete entries

Outputs: 
  - Internal wiki page with current radar
  - Email / Slack announcement of changes
  - Reasoning documented (why this technology moved rings)
```

### Common mistakes

```
✗ Too prescriptive: "MUST use only these technologies"
  Reality: edge cases will require exceptions
  
✗ Too permissive: "everyone picks their own"
  Reality: no shared expertise; chaos
  
✗ Out of date: radar from 2022 still on intranet
  Reality: no one trusts it; ignored

✗ Never moving things to Hold
  Reality: tech debt of supporting too many things; nothing ever sunsets
```

The radar must be **maintained**. Set a calendar reminder; one person owns it.

---

## The "stop energy" problem

Coined by Adam Bosworth (and others). At staff level, senior engineers can stop initiatives by attrition — not technically blocking, but expressing enough concern that things slow to a halt.

```
"I'm not blocking, but I have concerns..."
Repeated in every review.
Project never moves forward.
```

### Signs of stop energy

```
Senior engineer:
  - Asks more questions each meeting (no answers good enough)
  - Says "have you considered X?" repeatedly
  - Suggests "we should think about this more"
  - Never explicitly approves
  - Never explicitly rejects

Result: nothing happens. They've blocked without taking responsibility.
```

### Why it happens

Often well-meaning:
- Risk aversion (something might go wrong)
- Sunk cost in the old system
- Genuine concern about quality

But the result is the same: change doesn't happen.

### Counters

**Explicit decision authority**: someone has the right to say "we're going forward." Then concerns become "OK, but here's how I'd mitigate X" not "we shouldn't proceed."

**"Disagree and commit"**: a culture norm. Once a decision is made, even those who disagreed work to make it succeed.

**Time-boxed concerns**: "Raise concerns by Friday; after that we proceed."

**Pre-mortem instead of post-mortem**: ask "if this fails, what would have caused it?" Brings concerns into the open early.

---

## Dealing with conflicting senior opinions

Common in larger orgs: two senior engineers / staff engineers have opposing views on an architectural direction.

```
Staff A: "We should use Kafka because of scale + replay."
Staff B: "SQS is enough; Kafka is over-engineering."

Both are partially right. How do you resolve?
```

### Bad resolution

- Pick the more senior one's view (rewards politics, not correctness)
- Build both (impossible)
- Compromise on a mixed approach (often the worst of both)

### Better resolution

```
1. Document both positions in detail
2. Identify the specific factual disagreements (not value disagreements)
   "Will we hit 100K events/sec? Will we need replay?"
3. Get data where possible
4. Identify the value differences (replay-ability vs operational simplicity)
5. Decision maker chooses based on data + values
6. Both staff engineers commit publicly to the choice
```

If they can't commit, escalate to their manager. **Unresolved senior disagreement paralyses teams.**

---

## Influence without authority

Staff engineers often don't have direct authority over the teams they need to influence. Tools that work:

### 1. Build credit before you need it

```
Help other teams' projects succeed.
Be the person who debugs production at 3am for someone else's service.
Review their RFCs thoughtfully.
Now when you ask for support, you have credit.
```

### 2. Make their problem your problem

```
Bad:  "Your team needs to use the new auth system."
Good: "Your team's auth is causing X pain. The new auth solves it. 
       Here's a migration guide I wrote. I'll do the first migration with you."
```

You can't push; you can pull.

### 3. Find the team's champion

```
Some engineer on the other team probably agrees with you.
Make them the internal advocate.
They'll influence their team more effectively than you can.
```

### 4. Use data, not feelings

```
"Your team should adopt X because it's better" → ignored
"Your team's database queries took 2 hours of investigation last month;
 X would have caught this in CI" → harder to ignore
```

Find evidence of pain. Show how your proposal addresses specific pain.

### 5. Offer to do the work

```
"You should migrate to the new system." (ignored)
"I'll do the migration with you. Here's my time blocked off." (accepted)
```

If the change is important enough, you commit to it personally.

---

## Career-impact awareness

Architecture decisions affect people's perceived performance, project ownership, and roadmaps. Staff engineers ignore this at their peril.

```
"Let's deprecate the system Bob built and is known for."
  → Bob will defend it. His identity is partly tied to it.
  → Even if he's logically right that it should be replaced,
    he's also defending his sphere.

"Let's adopt the framework Alice champions."
  → Alice's career is helped.
  → People who disagreed with Alice will resist.
```

This isn't dirty politics — it's how organisations actually work. Staff engineers who pretend it doesn't exist make worse decisions because they don't anticipate reactions.

### Practical implications

```
✓ Frame deprecations as graduations / next chapter
✓ Give credit publicly to the original builders
✓ Include affected engineers in planning the migration
✓ Don't propose changes that obviously diminish someone's role 
  without first talking to them privately
```

---

## Disagreement and commit (Amazon's term)

```
Phase 1: Disagreement
  Discuss openly. Bring data, alternatives, concerns.
  Stay until decision time.

Phase 2: Decision
  Decision-maker decides (possibly against the consensus).
  
Phase 3: Commit
  Everyone — including dissenters — works to make the decision succeed.
  Privately, you may have reservations. Publicly, you support.
```

The opposite is "lukewarm support": ostensibly agreeing while quietly working against the decision. Toxic in larger orgs.

If you genuinely can't commit, you have three options:

1. Continue to argue (with new information)
2. Escalate (boss, skip-level)
3. Stop working on this project

What you don't do: passive resistance, slow rolling, sabotage. Those poison the culture.

---

## Communicating up — making the technical case to non-technical leaders

Executives don't read 30-page RFCs. They listen for:

```
- What problem are we solving?
- What's the business impact (revenue, cost, risk)?
- What does the decision cost (money, time, opportunity)?
- What's the risk of doing nothing?
- What's the risk of doing this?
- When will it be done?
```

### Structure for executive communication

```
1. Problem in business terms (not technical jargon)
   "Customer payment success rate is 92%; should be 99.5%. 
    We're losing $X/month in failed checkouts."

2. Proposed solution in business terms
   "Adopt third-party fraud detection ($Y/month)."

3. Cost & timeline
   "$Y/month + 4 engineering weeks. Live by end of quarter."

4. Trade-offs
   "We commit to this vendor; switching cost is moderate."

5. Risk of inaction
   "Continued customer complaints; competitor adoption."
```

Three bullet points and three numbers. Not 30 pages of architecture.

### What to avoid

```
✗ Technical jargon executives don't follow
✗ Architecture diagrams without business context
✗ "We just need to do this for hygiene"
✗ Mixing strategic and tactical concerns
✗ Asking for resources without justification in their language
```

---

## Common conversations

### "We should rewrite this in [new technology]"

```
Senior engineer's actual question: "Why?"

Good answers:
  - Performance bottleneck data shows current tech can't handle projected scale
  - Security vulnerability impossible to fix in current tech
  - Team has critical mass of expertise; new tech is faster to maintain

Bad answers:
  - "It's modern"
  - "The community is bigger"
  - "I want to learn it"
```

Most rewrites fail. Default skepticism is justified. Bring evidence.

### "Microservices for our 5-person team"

```
Your answer: "What problem does this solve that modular monolith doesn't?"

If they have a good answer (different scaling profiles, specific compliance):
  consider it
If they don't ("microservices are best practice"):
  this is cargo culting; modular monolith is the right answer
```

See [Modular Monolith](modular-monolith.md), [Anti-Patterns](anti-patterns.md).

### "Why can't we just adopt Tool X?"

```
Layers of "just":
  - "Just" install: not just install; needs config, monitoring, alerting
  - "Just" use: needs training, integration, security review
  - "Just" maintain: forever; patches, upgrades, deprecation handling
  
"Just" hides 80% of the cost.
```

### "Let's just monkey-patch this"

```
Senior engineer hears: "tech debt in 6 months"

Better question: "What's the right way? If we can't do it now, when?"
```

---

## Architecture review boards (ARBs)

Larger orgs have an architecture review board: a committee that approves significant architectural decisions.

### When they help

```
✓ Coordinating decisions across many teams
✓ Maintaining tech radar
✓ Spotting cross-team patterns / problems
✓ Mentoring newer architects
✓ Resolving cross-team disputes
```

### When they hurt

```
✗ Becoming bottleneck (everything needs ARB approval)
✗ Out of touch with actual implementation
✗ Politics paralyse decisions
✗ Junior teams afraid to propose; senior teams skip the ARB
```

### Better practice

```
ARB as advisory, not gatekeeping
Decisions made by teams; ARB consulted for significant ones
ARB members rotate (no permanent committee)
ARB sets standards / patterns; teams implement within them
"Default approve unless explicit concern" — speed by default
```

ARBs that gatekeep everything ossify the organisation. ARBs that advise and standardise accelerate it.

---

## The 5 staff-engineer modes

(Drawing from Tanya Reilly's *The Staff Engineer's Path*.)

```
1. Tech Lead
   Leads one team's technical direction.
   Most hands-on; most coding.

2. Architect
   Multi-team or multi-system technical leadership.
   Bridges teams; sets standards.

3. Solver
   Drops into the hardest problems.
   Often expert-debugger or expert-designer.

4. Right Hand
   Force-multiplier for an executive.
   Strategy-level technical work.

5. (Honorary: Coder)
   Continues to deliver substantial code.
   Less common at staff level; not "advanced" in the others.
```

Different modes need different politics:

```
Tech Lead:    earn trust within one team; deep code
Architect:    earn trust across teams; written communication
Solver:       earn trust on specific problems; reputation precedes
Right Hand:   earn trust with executive; business context
```

Identify which mode you're in (or want to be in). Different skills, different politics, different success metrics.

---

## Anti-patterns

| Anti-pattern | Better |
|---|---|
| Long RFC with no pre-socialisation | Short RFC after talking to stakeholders |
| Build always (because we can) | TCO analysis; default buy unless specific reason |
| Migration with no executive sponsor | Identify sponsor before starting |
| Migration with no deadline | Hard deadline; carrots + sticks |
| Solo decision then "ask for buy-in" | Involve affected parties early |
| Lukewarm support after decision | Disagree and commit |
| Senior engineer stops via attrition | Time-boxed concerns; explicit decision authority |
| Tech radar from 3 years ago | Quarterly maintenance |
| ARB as gatekeeper | ARB as advisor + standards-setter |
| Speaking to executives in jargon | Business outcomes + numbers |
| Public technical fights between staff engineers | Resolve privately first |

---

## What I wish I'd known at L4-L5

A few things I tell engineers transitioning to staff:

```
1. Being right matters less than being adopted.
   A correct-but-rejected proposal is worth zero.
   
2. Most architecture work is writing and conversation.
   Less code, more documents.
   
3. Pre-socialise before publishing.
   First public meeting = stakeholders already aligned.
   
4. Frame proposals in terms of the audience's pain.
   "Your team is feeling X; my proposal solves X."
   
5. Career capital is real.
   Help others' projects succeed before asking for support.
   
6. Disagree and commit is a superpower.
   Trying to be the smartest in the room paralyses decisions.
   
7. Migrations need executive sponsors.
   Without one, they will stall.
   
8. The status quo has inertia for a reason.
   Often it's "we tried that and it didn't work."
   Find out why before re-proposing.
   
9. Document decisions and reasoning.
   Future you will need this. Future others too.
   
10. The point is to ship working software at the team level,
    not to be intellectually pure.
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand staff-level work is mostly social, not technical.

**Strong answer pattern:**
1. RFCs need pre-socialisation; publish after stakeholders aligned
2. Build vs buy: TCO analysis; default buy for solved problems
3. Migrations need executive sponsor + champion + deadline
4. Influence without authority via credit, evidence, doing-the-work
5. Disagree and commit; lukewarm support is toxic
6. Communicating to executives in business terms, not jargon

**Common follow-up:** *"You proposed a migration to a new database. The team that owns the old one is resisting. What do you do?"*
> First, understand why. Their resistance is information. Maybe the old system has features I'm not aware of. Maybe there's history I missed. Maybe the migration impacts their roadmap. I'd 1:1 with their lead, listen, take notes. Then update my proposal to address concrete concerns and explicitly credit their team's expertise in shaping the new approach. If their concerns are valid, the proposal improves. If they're political (sunk cost, identity), I'd find a way to frame migration as a graduation rather than a deprecation — and bring in an executive sponsor whose backing makes the decision clear. If after all this they still resist, I'd escalate to their manager rather than fight publicly. Public fights between staff engineers are toxic.

---

## Related

- [ADRs](adrs.md) — formal decision records
- [Evolutionary Architecture](evolutionary-architecture.md) — change over time
- [Anti-Patterns](anti-patterns.md) — including organisational ones
- [Engineering Organisation](engineering-organisation.md) — team topologies, Conway's Law
- [Modular Monolith](modular-monolith.md) — often the answer to "let's go microservices"
- The Staff Engineer's Path (book by Tanya Reilly)
- Staff Engineer (book by Will Larson)
