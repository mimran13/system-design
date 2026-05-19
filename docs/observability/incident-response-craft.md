---
tags:
  - applied
---

# Incident Response: The Craft

You have observability. You have alerts. The pager goes off at 3am — now what? This page covers the **practice** of running an incident: severity levels, the incident commander role, war-room dynamics, customer comms, the actual writing of postmortems, and the cultural patterns that distinguish learning organisations from blame ones.

For *observability fundamentals*, see [On-Call & Incident Management](incident-management.md). This page goes deeper into how senior engineers and SREs actually do this work.

---

## Why this is staff-level work

```
Junior engineer in an incident: panics, fixes whatever they see
Senior engineer in an incident: stabilises, communicates, leads to resolution  
Staff engineer in an incident: prevents the next one via process + design changes
```

Running incidents well is a learnable skill that compounds over a career. Doing it badly burns out teams and erodes customer trust. Most companies underinvest here until they have a major incident.

---

## Severity levels — define them once

Every team needs explicit severity definitions. Not optional.

```
SEV-1 (Critical):
  Impact:    Full outage; significant customer-facing failure;
             data loss; security breach; revenue impact
  Response:  Page immediately; war room; everyone hands on deck
  Comms:     Status page; customer support notified; possible CEO alert
  Examples:  Login broken for all users; payments failing; database down

SEV-2 (Major):
  Impact:    Significant degradation; subset of users affected;
             partial functionality lost; SLO breach in progress
  Response:  Page during business hours; on-call investigates;
             pull in others as needed
  Comms:     Status page if user-visible; team-internal updates
  Examples:  Search broken; 10% error rate; one region degraded

SEV-3 (Minor):
  Impact:    Limited; degraded experience; one feature affected;
             workaround exists
  Response:  Investigate next business day; track in ticket
  Comms:     Internal only; status page optional
  Examples:  Slow loading on one page; cosmetic bug; non-critical alert

SEV-4 (Low):
  Impact:    Internal only; affects engineering velocity; technical debt
  Response:  Triage in regular planning
  Comms:     None
  Examples:  Flaky test; CI sometimes slow; staging environment glitch
```

**The point of severity definitions**: knowing whether to wake someone up at 3am or wait until morning. Get this wrong and you either ignore real incidents or burn out the team.

### Common severity mistakes

```
✗ SEV-1 for "log spike" without user impact
✗ SEV-3 for partial outage that's actually SEV-2
✗ SEV-1 used as "this is important to me"
✗ No clear escalation if SEV-2 worsens
```

Severity is **defined by impact, not by who's worried about it**.

---

## The Incident Commander (IC) role

In any non-trivial incident, **one person is in charge**. Not the most senior. Not the most knowledgeable. The one explicitly designated.

### What an IC does

```
✓ Maintains the overall picture (what's broken, what's being tried)
✓ Decides what to do next (or who decides)
✓ Coordinates responders (who's investigating what)
✓ Handles communication (status updates, comms approval)
✓ Makes the call to escalate or de-escalate
✓ Does NOT debug or fix
```

The last point is crucial. An IC who's also debugging can't see the whole picture. **The IC is a coordinator, not a doer**.

### Role separation in larger incidents

```
Incident Commander:  decides direction, owns communication
Subject Matter Expert (SME): does the technical investigation
Scribe:              keeps timeline of actions and decisions
Comms Lead:          drafts customer-facing updates
Engineering Lead:    makes call on engineering trade-offs
Customer Liaison:    talks to specific affected customers (B2B)
```

For SEV-1: explicit role assignments. For SEV-2: IC + SMEs is usually enough. For SEV-3: one person handles it all.

### IC handoff during long incidents

For incidents lasting > 4-6 hours, hand off the IC role.

```
Outgoing IC: "Handing IC role to Bob. Current status: X, Y, Z. 
              Open questions: A, B. Next actions: C, D. Acknowledge?"
Incoming IC: "Acknowledged. Taking IC."
```

Recorded in the incident channel. Avoid IC fatigue → mistakes.

---

## The war room

War room = the synchronous communication channel where the incident is being worked.

### Tools

```
Slack incident channel (most common):
  Dedicated channel per incident (#incident-2026-05-18-payment-down)
  Bot creates channel + posts template
  Recording archive: #incident-archive

Video bridge (for SEV-1 or distributed teams):
  Zoom / Google Meet — always-on while incident active
  Saves chat-typing overhead
  Risks: people hear, but don't see actions; supplement with channel

Incident management tools:
  PagerDuty, Opsgenie, FireHydrant, Rootly, incident.io
  Manage the workflow: paging, roles, postmortem generation
```

### Channel hygiene

```
Pin: current status, IC, SMEs
Updates every 15-30 min from IC (even if no progress)
Replies stay focused; side conversations in DMs or threads
Code blocks for commands run; markdown for hypotheses
Use threads to keep debugging chatter separate from status
```

### Status pinning

The top of the channel should always show:

```
🔴 Status: investigating
🎯 IC: @alice
🛠 SMEs: @bob, @carol  
📋 Current theory: payment-service can't reach Stripe; possibly DNS
📊 Impact: ~10% of checkout requests failing since 14:23 UTC
📝 Last update: 14:55 UTC
🔗 Status page: posted, updating
```

Anyone joining the channel knows where things are in 5 seconds.

---

## Updates cadence

```
SEV-1: every 15 min, even if "still investigating"
SEV-2: every 30 min
SEV-3: every 1-2 hours

The point isn't new info every time — it's that people know the incident is being worked.
Silence = panic from observers.
```

Update template:

```
[14:55 UTC] Update #4
- Status: actively working
- What we know: payment-service errors increased starting 14:23 UTC.
                Logs show "connection timeout to api.stripe.com"
                Stripe status page shows no incident
- What we're trying: DNS lookup test (Carol); 
                     packet capture on egress (Bob)
- Theory: outbound NAT issue on our side; suspect recent VPC change
- Customer impact: ~10% of checkouts failing
- ETA: investigating; next update by 15:10 UTC
```

This structure works regardless of platform. The IC writes these.

---

## Recovery vs root cause

The single biggest skill in incident response: **separate "stop the bleeding" from "understand what happened."**

### Stop the bleeding first

```
"Why is this happening?" can wait.
"How do we stop user impact?" cannot.
```

Quick mitigations to consider:

```
- Rollback the last deploy (even if you're not sure it's the cause)
- Failover to backup region / replica
- Disable a feature flag
- Scale up affected service
- Block a misbehaving client
- Route around the broken component
```

**Don't optimise for elegant fixes during an incident.** A 30-second rollback that restores service is better than a 2-hour debug that finds the "real" cause.

### Then investigate

After service is restored:
- Keep evidence (don't restart everything; preserve state)
- Continue investigating the root cause
- File a follow-up to fix it properly

The mental shift: **incident response is not debugging. Debugging happens after**.

---

## Common incident patterns

### Pattern 1: Recent deploy correlation

```
Step 1: Did anything change in the last hour? (deploy, config, infra)
Step 2: If yes: rollback first, investigate second.
```

This catches ~60% of incidents. Look at deploy timestamps vs the start of the error.

### Pattern 2: Cascading failure

```
Service A is slow (or down)
  → Service B (which calls A) times out, threads pile up
  → Service C (which calls B) also fails
  → Database connections exhausted
  → Now everything is broken
```

Investigation: find the **first thing that broke**, not just the loudest symptom. Logs and traces with timestamps help.

Fix: stop the cascade. Circuit breaker, bulkhead, or kill the originating slow component.

### Pattern 3: External dependency failure

```
Stripe / Twilio / AWS itself is down.
You can't fix it.
```

What you can do:
- Degrade gracefully (cache, fallback, queue)
- Communicate with users
- Wait it out
- Prepare for when it comes back

The lesson: have a runbook for "X is down." See "What to put in runbooks" below.

### Pattern 4: The slow drift

```
Things were fine for months. Now they're broken.
Nothing changed today.
```

What changed gradually:
- Data volume crossed a threshold
- Memory leaked slowly until tipping point
- Cache hit rate degrading week over week
- Replication lag growing

Look at trends, not just current state. Often the cause is weeks ago.

### Pattern 5: Capacity exhausted

```
Traffic spike → throughput limit hit
Or: resource limit (connections, disk, file descriptors)
```

Fix: scale up immediately if possible; rate-limit at edge; investigate the cause of spike.

### Pattern 6: Bad data

```
A specific record causes a parser/processor to crash.
Every retry hits the same record → permanent failure for downstream.
```

Fix: identify the bad record; quarantine it; investigate.

### Pattern 7: Configuration

```
Config change deployed → wrong env var → service broken
```

Fix: rollback config. Investigate why review didn't catch it.

---

## Hypothesis-driven debugging

In a fire, structured thinking helps.

```
1. State the symptom: "Checkout returns 500 since 14:23"
2. State current hypothesis: "Payment service can't reach Stripe"
3. State the test: "Try to curl Stripe from payment-service host"
4. Run test. Observe result.
5. Either: hypothesis confirmed → fix
   Or:     hypothesis disproven → new hypothesis (back to 2)
```

Write each step in the war room. Future-you (and your scribe) will thank you.

### Common pitfall: confirmation bias

When you have a theory, your brain looks for evidence that supports it. Actively look for evidence that **contradicts** the theory.

```
Theory: "It's the deploy from 14:20"
Test: roll back deploy → 14:30 → if errors stop, confirmed
But: ALSO check, did errors actually start at 14:20 or 14:23?
                 Did the deploy touch the affected code path?
                 Is there other activity correlated with 14:23?
```

Wrong theories during incidents waste hours.

---

## Customer communication

Users are watching. Bad comms is sometimes worse than the actual incident.

### Status page updates

```
Bad:  "We are investigating an issue."
      (Vague. Useless. Read 3 times.)

Better: "Payment processing is currently failing for some users 
         (estimated ~10% of checkouts). We are investigating.
         Next update at 15:30 UTC."

Good:  "Investigating: Some users are unable to complete checkout 
         due to a payment processing error. Affected since 14:23 UTC.
         Mitigation in progress; we expect service restored within 
         30 minutes. Next update at 15:30 UTC."
```

Include:
- **What's affected** (specifically; not "the service")
- **Who's affected** (percentage or geography if known)
- **When it started**
- **What you're doing**
- **When you'll update next**

### The cadence of customer comms

```
Initial post:                    Within 5-10 min of confirmed user impact
Updates:                         Every 30 min during incident (even if no news)
Resolution post:                 When service is restored
Postmortem link:                 5-10 business days after
```

Updating "no news" matters. Silence reads as "they don't care" or "they don't know."

### Tone

```
Professional, clear, factual.
NOT:
  Defensive ("Our system was overwhelmed by your traffic")
  Blame-shifting ("Our cloud provider had an issue")
  Marketing ("We're committed to providing the best experience")
  
Just facts. What broke, what we did, what we'll do next.
```

### Subscriptions and notification channels

```
Status page:              Atlassian Status, Statuspage, Better Stack
Webhooks:                 For enterprise customers' own monitoring
Email:                    Critical updates; opt-in
Slack/Teams integration:  For embedded customer comms
In-app notification:      For user-visible issues
```

Customers should be able to subscribe in their preferred channel.

---

## The postmortem

The artefact after an incident. The **most valuable output** of incident response.

### Format

```markdown
# Incident: [Short Title]

**Date**: 2026-05-18
**Duration**: 14:23 - 15:47 UTC (1h 24m)
**Severity**: SEV-2
**Impact**: ~12% of checkout requests failed; estimated $X revenue impact;
            ~3000 customers affected
**Authors**: @alice (IC), @bob (Eng Lead)

## Summary

One-paragraph description for executives / others who don't read details.

## Timeline

| Time (UTC) | Event |
|---|---|
| 14:23 | Error rate alert fires on payment-service |
| 14:25 | On-call (Bob) acknowledges; investigates dashboards |
| 14:32 | Confirmed user impact via Sentry; declared SEV-2 |
| 14:34 | IC (Alice) assigned; war room established |
| 14:45 | Identified DNS resolution failure for api.stripe.com |
| 15:12 | Root cause: VPC route table change from 14:00 deploy |
| 15:18 | Rollback of route table change begins |
| 15:32 | Service restored for new requests |
| 15:47 | All affected requests retried or refunded; incident closed |

## Root cause

Concrete description of what actually broke.

Earlier today (14:00 UTC), we deployed an infrastructure change that 
modified VPC route tables to support a new private endpoint integration.
The change was meant to be additive but inadvertently removed the route 
that allowed outbound traffic from the payment-service subnet to the 
public internet. This caused all outbound HTTPS calls from payment-service
(including to api.stripe.com) to fail with DNS resolution timeouts.

[Diagram or code reference]

## What went well

- On-call response was fast (2 min to acknowledge)
- Customer comms posted within 15 min
- Bob spotted the deploy correlation quickly
- Stripe-side idempotency keys prevented double charges

## What went badly  

- Our infrastructure CI didn't catch the routing change as risky
- Our pre-deploy connectivity tests didn't run for VPC changes
- Took 27 minutes to identify root cause; could have rolled back sooner
- Status page wasn't updated until 14:42 (19 min in)

## Action items

| # | Action | Owner | Due |
|---|---|---|---|
| 1 | Add synthetic connectivity test to VPC change deploy gate | @carol | 2026-05-25 |
| 2 | Auto-rollback on route table changes that affect payment subnet | @dave | 2026-06-01 |
| 3 | Update on-call runbook with VPC change recovery steps | @bob | 2026-05-22 |
| 4 | Reduce time-to-status-page-post via automation | @alice | 2026-06-15 |

## Lessons

Concrete, generalisable insights. Not "we should be more careful."
- VPC route changes need explicit connectivity validation
- Recent infra deploys should be the first thing checked in incidents
- "Network unreachable" symptoms can look like DNS failures
```

### Blamelessness

Crucial cultural principle.

```
The question is: "What about our system allowed this to happen?"
Not: "Who screwed up?"

Bad: "Alice made a typo in the route table"
Good: "Our route table changes don't have automated validation,
       which allowed a typo to reach production"
```

**Mistakes are signals about the system, not about individuals.** A blameful postmortem culture leads to hidden mistakes; hidden mistakes become bigger incidents later.

### The 5 Whys (used right)

A debugging tool. Used wrong, becomes "find someone to blame."

```
Surface: Payment service couldn't reach Stripe
  Why? DNS resolution failed
  Why? Outbound traffic was blocked
  Why? VPC route was removed in a deploy
  Why? The deploy script's route changes were additive in intent but mutating in implementation
  Why? Our IaC tooling doesn't validate before apply
```

The 5th why is the actionable lesson. Don't stop at "human error" — keep asking why the system didn't catch it.

### Postmortem timing

```
Immediate (within 24h):
  Initial doc with timeline, what broke, immediate action items
  
Detailed (5-10 business days):
  Full postmortem, including action items, owners, due dates
  
Review:
  Engineering all-hands or postmortem review meeting
  Share lessons across teams
```

Don't wait weeks. Memories fade; lessons don't get learned.

### Action item tracking

The postmortem's value is in the **action items that actually get done**.

```
Track action items:
  - In a dedicated ticket / epic
  - With explicit owners
  - With due dates
  - Reviewed weekly until closed
  
Reviewing past postmortems' action items reveals:
  - Patterns of repeated mistakes
  - Whether the team is learning
  - Hidden systemic issues
```

Open postmortems with no action item progress = the team isn't learning, just documenting.

---

## Runbooks — preparation matters

Before incidents, write runbooks. During incidents, follow them (or note where they fail).

### A good runbook entry

```markdown
## Symptom: Payment service errors increasing

### Quick diagnostic

1. Check Datadog dashboard: [link]
2. Check Sentry for new errors: [link]  
3. Recent deploys: [link to deploys page]

### Most common causes (in order of likelihood)

1. **Stripe API issues**: check status.stripe.com
2. **DNS issue**: see "DNS troubleshooting" below
3. **Recent deploy**: rollback recent payment-service or infra deploys
4. **Database**: check payment-service DB at [link]

### Quick mitigations

- **Disable payment-via-stripe feature flag**: [link]
  This routes new orders to "save card for later" instead of immediate charge
- **Rollback recent deploy**: [link to rollback]
- **Scale up payment-service**: [link]

### Escalation

- Page payments-team-secondary if no resolution in 15 min
- Page eng-lead if SEV-1
- Customer team contact: #cs-urgent
```

Runbooks should be **actionable in 30 seconds at 3am**. No theory; just commands and links.

---

## Practising — game days and chaos engineering

The best way to be ready for incidents: practise them.

### Game days

```
Schedule: monthly or quarterly
Format: 
  1. SRE picks a scenario (e.g., "Postgres primary fails")
  2. Trigger the scenario in production (or near-production)
  3. On-call team responds as in real incident
  4. After: debrief; what worked, what didn't

Examples:
  - Region failover drill (kill us-east-1 traffic)
  - Database failover
  - Dependency outage (block Stripe)
  - Loss of single AZ
  - DNS flip
```

### Chaos engineering

Continuous variant of game days: small failures injected randomly.

```
Tools: 
  Litmus, Gremlin, Chaos Toolkit, AWS Fault Injection Simulator

Examples:
  Kill 1 pod in production cluster every 4 hours
  Inject 100ms latency on 1% of inter-service calls
  Simulate disk full on 1 cache node nightly

Pioneered by Netflix (Chaos Monkey).
```

The goal: **make sure your resilience patterns actually work** before a real incident proves they don't.

---

## On-call hygiene

Sustainable on-call practice prevents burnout.

### Rotation

```
Team size 6+: weekly rotation per engineer
Team size 3-5: every 2-3 weeks
Team size <3: hire more or share with another team — burnout coming

Pager coverage: primary + secondary (escalate after 10 min unack)
```

### Compensation

```
On-call should be paid time (some companies)
Or: explicit time off after on-call week
Or: rotating "no-meetings day" the week after on-call
```

If on-call is unpaid and uncompensated, attrition follows.

### Alert quality

```
Goal: < 5 actionable alerts per on-call week

If pager rings more often:
  - Either incidents are too common (fix the system)
  - Or alerts are too sensitive (tune them)

Both are real problems. Both must be addressed.
```

The **alert fatigue** killer: when alerts fire often without real action needed, on-call learns to ignore them. Then a real alert gets ignored.

### Alert classification

```
Page-able:        Real user impact RIGHT NOW
Email/Slack:      Notice; investigate next business day  
Dashboard only:   Trend; review in weekly meetings
```

Most alerts should be in the bottom two categories, not page-able.

---

## Anti-patterns

| Anti-pattern | Better |
|---|---|
| No IC; everyone debugs simultaneously | One IC; SMEs investigate; IC coordinates |
| Debugging in head; not in war room | Write hypotheses + tests in channel |
| Status page silence | Updates every 15-30 min even if no news |
| Optimising for elegant fix during incident | Stop bleeding first, fix elegantly later |
| Blameful postmortem | Blameless; focus on system, not individuals |
| Postmortem with no action items | Action items with owners + due dates |
| Action items unchecked weeks later | Review weekly until closed |
| No runbooks | Runbook per service / per common alert |
| No game days | Quarterly drills minimum |
| Page-able alerts > 10/week | Tune alerts; fix underlying issues |
| Incident manager fixed for hours | Hand off IC every 4-6 hours |

---

## The cultural pattern

Organisations that handle incidents well share traits:

```
✓ Blameless culture: focus on systems, not people
✓ Explicit roles: IC, SME, scribe, comms
✓ Documented severity definitions
✓ Postmortems for every SEV-1 and SEV-2 (sometimes SEV-3)
✓ Action items tracked and completed
✓ Game days / chaos engineering practised
✓ On-call rotated and compensated  
✓ Alert quality maintained (low noise)
✓ Runbooks for common scenarios
✓ Customer comms transparent and timely
```

Organisations that handle them badly:

```
✗ Blame culture: someone gets fired for incidents
✗ "Everyone help" chaos during fires
✗ Severity decided ad-hoc by who's loudest
✗ Postmortems skipped or rushed
✗ Action items never completed
✗ No practice between real incidents
✗ Same person on-call indefinitely
✗ 100 alerts/day; everyone ignores them
✗ Tribal knowledge instead of runbooks
✗ Customer comms reactive and defensive
```

The difference compounds over years. Good practice → calm, learning teams. Bad practice → burnout, attrition, more incidents.

---

## Putting it all together — a typical SEV-2

```
14:23: Alert fires (error rate on payment-service)
14:25: On-call (Bob) acknowledges in PagerDuty
14:27: Bob looks at dashboard, confirms user impact
14:29: Bob declares SEV-2 in #incident channel
14:30: Bot creates #incident-2026-05-18-payment-errors
14:31: Bob announces taking IC role (or pages someone else)
14:33: Scribe (Carol) joins, starts timeline
14:35: First status page update posted
14:37: SME (Dave) joins, investigates DNS theory
14:42: Hypothesis confirmed: VPC route change
14:45: Decision: roll back the deploy
14:50: Rollback initiated
15:02: Error rate dropping
15:12: Confirmed back to normal
15:15: Status page: monitoring (post-recovery)
15:30: Status page: resolved
16:00: Initial postmortem doc started
~5d:    Full postmortem published, action items assigned
~30d:   Action items implemented, follow-up in retro
```

Smooth incidents look like this. Bad ones don't.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've actually been on-call and run incidents — not just read SRE Book.

**Strong answer pattern:**
1. Severity defined by impact; documented
2. IC role separate from debugging
3. Stop the bleeding before understanding root cause
4. Updates every 15-30 min even if "still investigating"
5. Blameless postmortems with action items + owners + due dates
6. Game days / chaos engineering as practice
7. Alert quality matters; tune the noisy ones

**Common follow-up:** *"Your service is down. The on-call wakes you. Walk me through the next 30 minutes."*
> First, acknowledge the page so it doesn't keep firing. Open the runbook for the service. Check the dashboard for the obvious things: recent deploys, error rates, dependencies, infra changes. If user impact is confirmed, declare an incident in the team channel and post initial status page update — even "investigating, no details yet" is better than silence. Page secondary or relevant SMEs if needed. Become IC if I'm the senior; otherwise hand off the IC role explicitly. If a recent deploy is suspect, roll it back first; investigate after. Keep posting updates every 15 minutes. Once user impact is resolved, switch to "monitoring" status. Postmortem doc started within the day.

---

## Related

- [On-Call & Incident Management](incident-management.md) — broader concept
- [SLI, SLO & SLA](slo-sla.md) — what triggers incidents
- [Alerting](alerting.md) — alert quality
- [Failure Modes Catalogue](../fundamentals/failure-modes.md) — what to expect
- [Architecture Anti-Patterns](../architecture/anti-patterns.md) — what causes incidents
- [Unhappy-Path Engineering](../patterns/unhappy-path-engineering.md) — design for failure
