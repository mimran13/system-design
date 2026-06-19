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

## Project state (handoff — last updated 2026-06-19)

What this repo is: a personal, **local-only** system-design + AI-engineering reference site. Beyond the original encyclopedia of concept pages, recent work added entire new sections and structure. Everything below is committed and pushed to `origin/main` (working tree clean, in sync).

### What's been built recently (most recent first)

- **AI Engineer learning path** (`docs/paths/ai-engineer.md`) — one ordered zero→production route, 8 levels (L0 Foundations → L7 Production) + Specialize + Build, with a clickable Mermaid roadmap (`sd-mermaid-links` map). Maps an 11-step AI-engineer progression the user defined.
- **3 AI gap pages**: `docs/ai/ml-literacy.md` (pre-LLM ML foundation), `docs/ai/working-with-llm-apis.md` (playground→production using **current** Claude SDK patterns: Opus 4.8 default, `messages.parse`/`messages.stream`, tool loop, adaptive thinking + effort, prompt caching, `count_tokens`), `docs/ai/llm-frameworks.md` (LangChain/LangGraph/etc. landscape + "start raw, adopt selectively").
- **Zero→Staff Curriculum** (`docs/paths/curriculum.md`) — single system-design spine, 6 levels (L0 Bedrock → L5 Staff), clickable Mermaid roadmap with per-level ordered lists + checkpoints + time estimates. (Companion to the AI path.)
- **Fintech section** (`docs/fintech/`): `index.md`, `card-payments-fundamentals.md` (four-party model, auth/capture/settlement, interchange, chargebacks), `3ds-flow.md` (answers the "Amazon popup + Revolut notification" 3DS2 case — AReq/ARes/CReq/CRes, ACS, frictionless vs challenge, liability shift), `glossary.md` (~90 grouped fintech terms). New top-level nav tab.
- **Proptech buyer↔seller chat case study** (`docs/case-studies/proptech-chat.md`) — full end-to-end design with justified storage choices (Postgres conversations / DynamoDB messages / Redis presence+unread / S3+CloudFront attachments / Kafka backbone / Temporal SLA / OpenSearch), capacity math, the seller-SLA escalation ladder, deployment trade-offs, and a deep "where clients actually connect" networking section (VM vs k8s, ALB/Ingress, Redis Pub/Sub cross-pod fanout, graceful drain).
- **Durable workflows page** (`docs/patterns/durable-workflows.md`) — Temporal vs AWS Step Functions, durable-execution/replay model, determinism constraint. Cross-linked from saga-pattern + choreography-vs-orchestration.
- **UI/UX upgrades**: `docs/javascripts/diagrams.js` (fullscreen pan/zoom overlay for Mermaid, clickable node link-maps via `canon()` matching, reading-time injection) + matching `docs/stylesheets/extra.css` (reading-ergonomics 75ch prose cap, diagram toolbar, node-link styles, full Mermaid brand theming light+dark). Self-test + "suggested reading order" blocks added across many pages.

### Known gotchas / environment quirks

- **Dev server can hang at "Building documentation…"** — the `git-revision-date-localized` plugin sometimes stalls on a git subprocess. Workaround: `mkdocs build` once, then serve the static build with `cd site && python3 -m http.server 8000 --bind 127.0.0.1` (fast, no live reload). Always use `--dirty` with `mkdocs serve`.
- **Mermaid labels with colons must be quoted**: `D12["Consensus: Raft and Paxos"]` — an unquoted colon breaks the parse and silently kills clickable-node mapping for the whole diagram.
- **Clickable-node maps** match on `canon()` = lowercased alphanumerics-only of the node's rendered text. Keep `data-links` keys matching the node label's visible text.
- `git push` has intermittently hung from the agent shell (credential prompt). If it hangs, the user runs `! git push origin main` from the prompt.
- Verify changes with `mkdocs build --strict` (clean = no broken links/orphans). New pages MUST be wired into `mkdocs.yml` nav.

### Likely next steps (not yet requested)

- Nothing outstanding. Possible future directions the user has gestured at: more case studies, deeper fintech flows, or enabling the GitHub Pages deploy (currently disabled — site is intentionally local-only).
