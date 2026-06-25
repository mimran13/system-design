# System Design Encyclopedia

Personal MkDocs Material reference site for system design concepts, patterns, and interview prep. Content lives in `docs/`, nav in `mkdocs.yml`.

## Commands

- `mkdocs serve -a 127.0.0.1:8000 --dirty` — dev server (use `--dirty` — full rebuilds take ~40s because of the git-revision-date plugin)
- `mkdocs build --strict` — what CI runs; warnings fail the build
- The site is **local-only** (viewed via `mkdocs serve`). CI runs the strict build as a link-check gate but does not deploy. Never commit `site/` (gitignored).
- **Deploying to GitHub Pages later**: the workflow at `.github/workflows/deploy.yml` contains a commented-out, ready-to-go Pages deploy (artifact upload + deploy job). Enable via repo Settings → Pages → Source "GitHub Actions", then uncomment the marked blocks. Caveat: Pages on a free-plan private repo makes the site public.

## Page contract

Every concept page follows this structure, in order:

1. YAML frontmatter with `tags`
2. `# Title`
3. `## You'll see this when...` — bulleted real-world symptoms for recognition
4. Main content — Mermaid diagrams, code examples, comparison tables
5. `## Anti-patterns` — table: `| Anti-pattern | Why it hurts | Better |`
6. `## Quick reference` — table: `| Need | Reach for |`
7. `## Interview angle` — `!!! tip "What interviewers are testing"` admonition, then `**Strong answer pattern:**` numbered list, then `**Common follow-ups:**` Q&A bullets
8. `## Test yourself` — 5 collapsible `??? question "..."` blocks (blank line after the question line, 4-space-indented answer)
9. `## Related` — links to neighbouring pages using relative `.md` paths

Older pages may use `## What it is` as the opener instead of "You'll see this when..." — both are accepted; new pages prefer the latter.

## Tag taxonomy (use only these six)

| Tag | Meaning |
|---|---|
| `interview-critical` | Likely in senior+ system design interviews |
| `applied` | Practical/scenario pages |
| `boring-tech` | "Choose boring technology" alignment |
| `aws-native` | AWS picker/mapping pages |
| `for-saas` | SaaS-product relevance |
| `for-scale` | Multi-region / beyond-single-service scale |

## Conventions

- New pages must be added to the `nav:` in `mkdocs.yml` — orphans fail `--strict`
- Cross-link generously in `## Related`; relative `.md` paths only
- Mermaid via ```` ```mermaid ```` fences; diagrams get zoom/fullscreen automatically from `docs/javascripts/diagrams.js`
- Clickable flowchart nodes: add a `<div class="sd-mermaid-links" data-links='{"Node label": "../relative/url/"}'></div>` to the page (see `docs/reference/decision-flowcharts.md`)
- Custom theming lives in `docs/stylesheets/extra.css` (layered chrome/content palette, Geist fonts, brand-matched Mermaid colors)
- Numbers/benchmarks: order-of-magnitude accuracy, state assumptions
- Tone: direct, practitioner-to-practitioner, no marketing language; "the boring option" is named explicitly when it's the right default

## Project state (handoff — last updated 2026-06-23)

What this repo is: a personal, **local-only** system-design + AI-engineering reference site. Beyond the original encyclopedia of concept pages, recent work added entire new sections, a full readability/IA redesign, and several leveled learning paths. Work is committed on `main`; pushing to `origin/main` goes through the user (see the protected-branch note in gotchas).

### What's been built recently (most recent first)

- **Distributed Systems promoted to a top-level nav tab** — moved out from under Foundations into its own headline tab (between Foundations and Architecture in `mkdocs.yml`). Also: the Zero→Hero path now has a **card on the Start Here landing page** (`docs/paths/index.md`), and the path itself was **deepened** (`docs/paths/distributed-systems.md`): an interview-signal callout, a "four recurring ideas" mental-model table, per-level *in production* anchors, **Level 4 expanded to "Replication & partitioning"** (weaves in the existing `patterns/replication.md`, `patterns/sharding.md`, `consistent-hashing.md`, `fundamentals/partitioning-fundamentals.md` + `hot-partitions.md` — no renumber, anchors intact), a consensus→state-machine bridge note, and a "what proficiency actually takes" closer (build/break, case-study practice, DDIA/Raft/Jepsen).
- **New case study: CLI Browser Login** (`docs/case-studies/cli-device-auth.md`) — the OAuth 2.0 Device Authorization Grant (RFC 8628) behind `gh auth login` / `aws sso login` / npm / smart-TV codes. Full contract + 4 Mermaid diagrams (actor graph, two `autonumber` sequence diagrams incl. the AWS SSO-token→STS twist, a polling `stateDiagram-v2`), device-code-phishing deep dive. Wired into nav + index card (Medium group).
- **Distributed Systems: Zero → Hero path** (`docs/paths/distributed-systems.md`) — new leveled learning path in the "Start Here" tab, 8 levels (L0 Why it's hard → L7 Hero tier) with per-level detail + checkpoints, threading all 19 `docs/distributed/` pages in pedagogical order (bespoke CSS roadmap spine). Distributed-section-scoped; links out to CAP/consistency in Fundamentals as prerequisites. Plus **4 new `docs/distributed/` concept pages** (full page contract): `chain-replication.md` (head→tail chain, tail reads, CRAQ), `advanced-clocks.md` (Hybrid Logical Clocks, TrueTime, commit-wait, Spanner/CockroachDB), `flp-impossibility.md` (FLP + escape hatches, Two Generals, CAP-as-impossibility), `byzantine-fault-tolerance.md` (3f+1, PBFT, Tendermint/HotStuff, "you probably don't need it"). All wired into nav + section catalogue.
- **AI Engineer path reframed** (`docs/paths/ai-engineer.md`) — retargeted from generic "zero→production" to **backend engineer → staff AI engineer**: a "what you already bring vs what's net-new" table, a "what staff AI roles screen for" callout (JD-derived, generalized — no company names), and "skim" flags on what a backend eng already owns. Added 3 items to the 9-level spine: **MCP** under L2, **AI Security & Governance** under L7, and a new **L8 Staff scope** (where-AI-fits judgment, architecture under ambiguity, platform thinking, raising the bar). MCP and AI-security currently live as **in-page anchor sections** (`#mcp`, `#ai-security`) with "gap on the roadmap" notes — the planned next step is promoting them to full `docs/ai/mcp.md` and `docs/ai/ai-security-governance.md` pages.
- **Readability & IA overhaul (shipped to `main`)** — the big `docs/readability-overhaul` branch (41 commits) merged. Pixel-matched the bespoke HTML mockups (`.mockups/`) in real MkDocs Material via custom CSS: blue chrome (`#2563eb` header / `#1d4ed8` tabs), system fonts, white sidebar with active-blue + full-height content separator, padded content, breadcrumbs. New **"Start Here" tab** (`docs/paths/index.md`). All ~20 section `index.md` roadmaps + the curriculum & AI-engineer path roadmaps converted from Mermaid to the **bespoke CSS spine** (`.roadmap`/`.rm-node`/`.rm-chip`/`.rm-branch` + legend). IA moves: sharding/partitioning into the Data tab. *(Update: Distributed Systems was later promoted from under Foundations to its own top-level tab — see the most-recent entry above.)* Plan/spec at `specs/2026-06-19-readability-and-ia-overhaul.md`.
- **AI Engineer learning path** (`docs/paths/ai-engineer.md`) — see "reframed" entry above; originally an ordered zero→production route, 8 levels + Specialize + Build.
- **3 AI gap pages**: `docs/ai/ml-literacy.md` (pre-LLM ML foundation), `docs/ai/working-with-llm-apis.md` (playground→production using **current** Claude SDK patterns: Opus 4.8 default, `messages.parse`/`messages.stream`, tool loop, adaptive thinking + effort, prompt caching, `count_tokens`), `docs/ai/llm-frameworks.md` (LangChain/LangGraph/etc. landscape + "start raw, adopt selectively").
- **Zero→Staff Curriculum** (`docs/paths/curriculum.md`) — single system-design spine, 6 levels (L0 Bedrock → L5 Staff), clickable Mermaid roadmap with per-level ordered lists + checkpoints + time estimates. (Companion to the AI path.)
- **Fintech section** (`docs/fintech/`): `index.md`, `card-payments-fundamentals.md` (four-party model, auth/capture/settlement, interchange, chargebacks), `3ds-flow.md` (answers the "Amazon popup + Revolut notification" 3DS2 case — AReq/ARes/CReq/CRes, ACS, frictionless vs challenge, liability shift), `glossary.md` (~90 grouped fintech terms). New top-level nav tab.
- **Proptech buyer↔seller chat case study** (`docs/case-studies/proptech-chat.md`) — full end-to-end design with justified storage choices (Postgres conversations / DynamoDB messages / Redis presence+unread / S3+CloudFront attachments / Kafka backbone / Temporal SLA / OpenSearch), capacity math, the seller-SLA escalation ladder, deployment trade-offs, and a deep "where clients actually connect" networking section (VM vs k8s, ALB/Ingress, Redis Pub/Sub cross-pod fanout, graceful drain).
- **Durable workflows page** (`docs/patterns/durable-workflows.md`) — Temporal vs AWS Step Functions, durable-execution/replay model, determinism constraint. Cross-linked from saga-pattern + choreography-vs-orchestration.
- **UI/UX upgrades**: `docs/javascripts/diagrams.js` (fullscreen pan/zoom overlay for Mermaid, clickable node link-maps via `canon()` matching, reading-time injection) + matching `docs/stylesheets/extra.css` (reading-ergonomics 75ch prose cap, diagram toolbar, node-link styles, full Mermaid brand theming light+dark). Self-test + "suggested reading order" blocks added across many pages.

### Known gotchas / environment quirks

- **Dev server can hang at "Building documentation…"** — the `git-revision-date-localized` plugin sometimes stalls on a git subprocess. Workaround: `mkdocs build` once, then serve the static build with `cd site && python3 -m http.server 8000 --bind 127.0.0.1` (fast, no live reload). Always use `--dirty` with `mkdocs serve`.
- **Roadmaps are now the bespoke CSS spine, not Mermaid.** All section + path roadmaps use `.roadmap`/`.rm-track`/`.rm-stop`/`.rm-node`/`.rm-chip`/`.rm-branch` markup (in `md_in_html`). Level nodes link to in-page `#level-N` anchors (added via `attr_list` `{ #level-0 }`); chips link to pages. Path pages live at `/paths/x/`, so chips use `../../section/page/` (two levels up) and markdown-body links use `../section/page.md`. Verify both anchors and chip targets resolve after edits.
- **`main` is a protected branch — a `moonspec` hook refuses agent `git commit` AND `git push` on `main`.** Workflow that works: commit on a feature branch, `git checkout main && git merge --ff-only <branch>` (local merge is allowed), then the **user** runs `! git push origin main` from the prompt (the `!` path bypasses the hook). Don't try to push to `main` from the agent shell — it hard-refuses.
- **Remaining Mermaid is only content diagrams** (decision-flowcharts.md, a few concept diagrams) — these still use `sd-mermaid-links`/`canon()` clickable maps where applicable: quote colons in labels (`D12["Consensus: Raft and Paxos"]`), and `canon()` = lowercased alphanumerics-only of rendered text must match `data-links` keys.
- Verify changes with `mkdocs build --strict` (clean = no broken links/orphans). New pages MUST be wired into `mkdocs.yml` nav. The boxed "Warning from the Material for MkDocs team" notice during build is upstream noise, not a build failure — check the exit code.
- Local preview: `cd site && python3 -m http.server 8000 --bind 127.0.0.1` after `mkdocs build` (static, no live reload — rebuild + refresh after edits). This avoids the `mkdocs serve` git-plugin hang.

### Likely next steps (not yet requested)

- **Promote the two AI-path gap sections to full pages**: `docs/ai/mcp.md` (Model Context Protocol) and `docs/ai/ai-security-governance.md` — currently in-page anchor sections in `ai-engineer.md` flagged "gap on the roadmap". When written, update the roadmap chip hrefs from `#mcp`/`#ai-security` to the real pages and add to `mkdocs.yml` nav + `docs/ai/index.md`.
- Other directions the user has gestured at: more case studies, deeper fintech flows, deeper per-topic content on the distributed/AI paths, or enabling the GitHub Pages deploy (currently disabled — site is intentionally local-only).
