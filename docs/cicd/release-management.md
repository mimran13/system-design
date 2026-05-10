# Release Management

Release management is the process of coordinating, communicating, and recovering from production changes. Modern teams aim to make releases boring — small, frequent, automated — so that "release management" becomes mostly a labelling and notification exercise. But the discipline of versioning, changelogs, and rollback plans never goes away.

---

## Versioning schemes

### Semantic Versioning (SemVer)

```
MAJOR.MINOR.PATCH
   │     │     └─ Bug fixes (backwards compatible)
   │     └─────── New features (backwards compatible)
   └───────────── Breaking changes
```

Examples:
- `1.2.3 → 1.2.4` — bug fix
- `1.2.3 → 1.3.0` — new feature
- `1.x → 2.0.0` — breaking change (consumers must migrate)

Pre-release / build metadata:
- `1.2.3-rc.1` — release candidate
- `1.2.3-alpha.5` — alpha
- `1.2.3+20240101` — build metadata (ignored for ordering)

SemVer is essential for **libraries and APIs** consumed by others. They depend on you to communicate compatibility.

### Calendar Versioning (CalVer)

```
YYYY.MM.PATCH
2026.05.1
```

Or `YY.MM`, `YYYY.MM.DD`, etc. Used by:

- Ubuntu (24.04, 24.10)
- Python pipenv
- Many SaaS products

Pros: dates communicate freshness. Cons: doesn't communicate compatibility.

### Build identifiers (commit SHA)

```
v1.2.3+abc1234
```

For internal services where SemVer doesn't matter — the deployable artifact is a SHA. Adding a tag (v1.2.3) is for human reference, not consumer compatibility.

### When to use which

| Type | Recommended scheme |
|---|---|
| Library / SDK / API | SemVer |
| Internal service (no external consumers) | SHA, optionally with sprint version |
| Browser app shipped to users | SemVer or CalVer |
| Infrastructure component (server, OS) | CalVer or SemVer |
| CLI tool | SemVer |

---

## Tagging in Git

```bash
# Annotated tag (preferred — has metadata)
git tag -a v1.2.3 -m "Release 1.2.3 — adds search v2"

# Sign the tag (provenance)
git tag -s v1.2.3 -m "Release 1.2.3"

# Push the tag
git push origin v1.2.3

# Push all tags
git push --tags
```

Annotated tags have:
- Tagger name + email
- Tag message
- Optional GPG signature

Lightweight tags (just `git tag v1.2.3`) lack these and are discouraged for releases.

---

## Triggering release on tag

```yaml
# .github/workflows/release.yml
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # need full history for changelog
      
      - name: Build artifact
        run: ./build.sh
      
      - name: Generate changelog
        id: changelog
        run: |
          previous_tag=$(git describe --tags --abbrev=0 HEAD^)
          changelog=$(git log --pretty=format:"- %s (%h)" $previous_tag..HEAD)
          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          echo "$changelog" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          body: ${{ steps.changelog.outputs.changelog }}
          files: dist/*.tar.gz
```

Tag → workflow → publish artifact + release notes.

---

## Conventional Commits

Standard commit message format that drives changelogs and SemVer automatically:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat` — new feature (minor bump)
- `fix` — bug fix (patch bump)
- `docs` — documentation
- `style` — formatting, no logic change
- `refactor` — code restructure, no behaviour change
- `perf` — performance improvement
- `test` — test additions/changes
- `chore` — tooling, dependencies
- `ci` — CI/CD config changes

Breaking change:
```
feat!: drop support for Node 16

BREAKING CHANGE: Node 16 reached EOL; minimum is Node 18.
```

The `!` or `BREAKING CHANGE:` footer triggers a major bump.

### Tools

- **commitlint** — enforce format on commit
- **commitizen** — interactive commit message helper
- **standard-version** / **release-please** — auto-bump version, generate CHANGELOG.md
- **semantic-release** — fully automated releases from conventional commits

```yaml
# semantic-release in CI
- name: Release
  run: npx semantic-release
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Reads commits since last tag → determines next version → publishes to npm + creates GitHub release + updates CHANGELOG.

---

## Changelogs

A changelog tells users what changed and why they should care.

```markdown
# Changelog

## [1.5.0] - 2026-05-01

### Added
- Search v2 with relevance ranking
- Bulk export endpoint (`POST /api/export`)

### Changed
- Default rate limit raised from 100 to 1000 req/min

### Deprecated
- `GET /api/v1/users/list` — use `/api/v2/users` instead. Removed in v2.0.

### Fixed
- Race condition in order cancellation under high load

### Security
- Updated `requests` to 2.31.0 (CVE-2023-32681)

## [1.4.2] - 2026-04-15
...
```

Convention: [Keep a Changelog](https://keepachangelog.com).

Sections:
- **Added** — new features
- **Changed** — changes to existing functionality
- **Deprecated** — features going away
- **Removed** — features removed
- **Fixed** — bug fixes
- **Security** — security fixes

The changelog is **for users**, not engineers. Skip refactors and internal changes; explain user-visible impact.

---

## Release notes

Often written with the changelog but published separately (more polished, marketing-aware).

```markdown
# v1.5.0 — Search v2 is here

## Highlights

**Search v2** — ranking and filtering rebuilt for sub-50ms responses across 10M docs.
Try the new `?ranking=relevance` parameter on `/api/search`.

**Bulk exports** — finally, you can export your entire dataset in one API call instead
of paginating. See [docs](https://...) for usage.

## Breaking changes

None this release. The `/users/list` endpoint is deprecated but still works.

## Migration guide

If you're on v1.4 or earlier and using the search API, the response shape adds a new
`relevance_score` field. It's additive — no client changes needed unless you want to use it.

## Full changelog

See [CHANGELOG.md](CHANGELOG.md) for the complete list.
```

---

## Release checklist

For coordinated releases (less common with continuous delivery, still useful for major versions):

```
Pre-release:
  ☐ Code freeze on main
  ☐ Release branch created (release/1.5.0)
  ☐ All planned features merged
  ☐ Full test suite green on release branch
  ☐ Performance benchmarks compared to previous release
  ☐ Security scan clean
  ☐ Dependency audit clean
  ☐ Changelog drafted and reviewed
  ☐ Release notes drafted (marketing/product input)
  ☐ Migration guide written if breaking changes
  ☐ Documentation updated
  ☐ Demo / training prepared if needed

Release:
  ☐ Tag commit (v1.5.0)
  ☐ CI builds and publishes artifacts
  ☐ Deploy to staging
  ☐ Smoke tests pass
  ☐ Deploy to production (canary or blue/green)
  ☐ Monitor metrics for 1-4 hours
  ☐ Publish release notes
  ☐ Announcement (Slack, email, blog)

Post-release:
  ☐ Backport critical fixes to release branches
  ☐ Update internal trackers/tickets
  ☐ Retro on the release process
  ☐ Bump version on main for next release (1.6.0-dev)
```

For continuous delivery: most of this is automated; the human steps are review and announcement.

---

## Hotfix releases

A critical bug in production v1.5.0 needs a fix without merging unrelated work-in-progress on main.

### Trunk-based / GitHub Flow

```bash
# Branch from main, fix, merge fast
git checkout -b hotfix/critical-bug main
# ... fix ...
# Open PR → CI → merge
git tag v1.5.1
git push --tags
```

Same as any change. Speed comes from small PR + fast pipeline.

### Git Flow

```bash
git checkout -b hotfix/1.5.1 main
# ... fix ...
git checkout main && git merge --no-ff hotfix/1.5.1
git tag v1.5.1
git checkout develop && git merge --no-ff hotfix/1.5.1   # propagate fix
```

Hotfix branched from `main` (the deployed version), merged back to both `main` and `develop`.

---

## Rollback playbooks

Every release should have a documented rollback path **before** the release.

### For container deploys

```
Rollback steps:
  1. Run: kubectl rollout undo deployment/order-service -n production
     OR: argocd app sync order-service-prod --revision <previous-sha>
  2. Verify: pods Running, healthchecks passing
  3. Verify: error rate returned to baseline
  4. Notify: #incidents Slack with rollback complete
  5. Post-mortem: schedule within 48h
```

### For database changes

```
Rollback strategy:
  - Schema additions (new column, new table) → safe to leave; deploy v1 reads/writes v1 schema
  - Schema removal → AVOID in deploy that adds; remove in subsequent release
  - Data migrations → must be reversible (forward + reverse migration scripts)
```

Use **expand-contract** pattern:

```
Phase 1 (release N):    Add new column. Both old and new code read/write both.
Phase 2 (release N+1):  Remove old code paths. New column only.
Phase 3 (release N+2):  Drop old column.
```

Each phase is independently rollback-able.

### For feature-flagged rollouts

```
Rollback:
  1. Flip flag to OFF (instant, no deploy)
  2. Verify users see old behaviour
  3. Investigate
```

Feature flags make rollback near-instant. The deployed code stays; only behaviour changes.

---

## Communication

### Internal

- **Pre-release announcement**: Slack message in dev channel with what's launching
- **Deploy notification**: Slack bot posts when deploy starts/finishes
- **Failure alert**: PagerDuty for critical deploy failures
- **Release Slack channel**: persistent log of all deploys for the team

### External (customers)

- **Status page**: Statuspage, Atlassian Status, Better Stack — live status during deploys
- **Release notes / changelog**: published with every release
- **Blog post**: for major features
- **In-app notification**: for breaking or visible changes
- **Email**: for paid customers, breaking changes, deprecations

---

## Deprecation

Removing a feature or API should follow a structured timeline:

```
Phase 1: Announce
  - Documentation marked deprecated
  - Changelog includes deprecation notice
  - Email/blog post to users
  - Replacement documented

Phase 2: Warn
  - API returns Deprecation HTTP header (RFC 8594)
  - Logs deprecation warnings
  - Customer dashboards show usage flags

Phase 3: Sunset
  - Hard removal date communicated (3-12 months from announce)
  - Reminder emails leading up to date
  - Final deprecation banner in API responses

Phase 4: Remove
  - Feature gone
  - Returns 410 Gone for removed APIs
  - Migration guide remains available
```

For internal-only services, timelines compress to weeks. For public APIs with paying customers, 12+ months is normal.

---

## Release frequency

Modern targets:

- **High-performing teams**: multiple deploys per day per service
- **Mid-tier**: weekly to daily
- **Lower-tier**: monthly to quarterly

DORA metrics (DevOps Research and Assessment):

| Metric | Elite | High | Medium | Low |
|---|---|---|---|---|
| Deployment frequency | On demand (multiple/day) | Daily-weekly | Weekly-monthly | Monthly-bi-yearly |
| Lead time (commit → prod) | < 1 hour | 1 day - 1 week | 1 week - 1 month | > 1 month |
| Change failure rate | 0-15% | 16-30% | 16-30% | 16-30% |
| Time to restore | < 1 hour | < 1 day | 1 day - 1 week | > 1 week |

Higher deployment frequency tends to **reduce** failure rate — small changes, fast feedback, recent context. Big bang releases concentrate risk.

---

## Anti-patterns

| Anti-pattern | Why it breaks |
|---|---|
| "Big bang" quarterly releases | Concentrates risk; reverting is impossible |
| Hand-edited release notes | Drift from actual changes; conventional commits + auto-gen |
| Tagging without testing | Tag should follow successful CI, not precede |
| No rollback plan | Rollback gets invented during the incident — too late |
| Changelogs written for engineers | Confusing for users; rewrite for the audience |
| Deprecating without timelines | Users don't act until they're forced |
| Skipping CHANGELOG entries | History lost; future debugging harder |
| Versioning without tags | Hard to bisect, reproduce, audit |

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you understand release as a coordinated communication discipline, not just `git tag`.

**Strong answer pattern:**
1. SemVer for libraries; SHA-based for internal services
2. Conventional commits drive automated versioning + changelogs
3. Every release has a rollback path documented in advance
4. Expand-contract pattern for DB changes (each phase independently rollbackable)
5. Feature flags decouple deploy from release for instant rollback
6. DORA metrics — frequency, lead time, failure rate, restore time

**Common follow-up:** *"How would you roll back a database migration?"*
> Don't — design migrations to be reversible *forward*. Add columns instead of changing them; deploy code that handles both old and new schema; remove old in a later release. Each step is independently rollback-able. If you've already broken this and need to roll back, you may need to restore from backup or write a custom reverse migration — but it's a sign of process failure, not just a bug.

---

## Related topics

- [Branching Strategies](branching-strategies.md) — release tagging in different flows
- [Deployment Strategies](deployment-strategies.md) — how releases reach production
- [Progressive Delivery](progressive-delivery.md) — automated rollout/rollback
- [GitOps](gitops.md) — release = config repo update
- [Incident Management](../observability/incident-management.md) — what happens when releases go wrong
