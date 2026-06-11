# System Design Encyclopedia

Personal MkDocs Material reference site for system design concepts, patterns, and interview prep. Content lives in `docs/`, nav in `mkdocs.yml`.

## Commands

- `mkdocs serve -a 127.0.0.1:8000 --dirty` — dev server (use `--dirty` — full rebuilds take ~40s because of the git-revision-date plugin)
- `mkdocs build --strict` — what CI runs; warnings fail the build
- Deploy: push to `main` → GitHub Actions builds and publishes to GitHub Pages. Never commit `site/` (gitignored).

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
