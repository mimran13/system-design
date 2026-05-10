# Pipelines: GitHub Actions, GitLab CI, CircleCI, Jenkins

The major CI/CD tools all do the same thing — run pipelines triggered by Git events — but their ergonomics, ecosystems, and operational models differ. This page compares the dominant tools with concrete examples.

---

## The landscape

| Tool | Hosted | Self-hosted | Pipeline-as-code | Marketplace | Best for |
|---|---|---|---|---|---|
| **GitHub Actions** | Yes | Yes (runners) | Yes (.yml in repo) | Vast | GitHub-hosted code |
| **GitLab CI** | Yes (GitLab.com) | Yes (full GitLab) | Yes (.gitlab-ci.yml) | Catalog | GitLab-hosted code |
| **CircleCI** | Yes | Self-hosted runners | Yes (.circleci/config.yml) | Orbs | Cross-platform builds |
| **Jenkins** | No | Yes only | Jenkinsfile (Groovy) | Vast (plugins) | Legacy, on-prem |
| **AWS CodePipeline** | Yes (AWS) | No | YAML / Terraform | AWS-native | AWS-only stacks |
| **Buildkite** | Hybrid (control plane hosted, agents self-hosted) | Yes | YAML | Plugins | High-scale, customised |
| **Drone / Woodpecker** | Self-hosted | Yes | YAML | Plugins | Self-hosting on a budget |
| **Tekton** | Self-hosted | Yes only | K8s CRDs | Tekton Hub | K8s-native, GitOps |

Most modern teams pick from the top three based on where their code lives.

---

## GitHub Actions

Native to GitHub. Pipeline-as-code in `.github/workflows/`.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  id-token: write
  pull-requests: write

env:
  IMAGE_NAME: order-service

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r requirements-dev.txt
      - run: ruff check .

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: password
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 5s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: pytest tests/ --cov=src --cov-fail-under=80
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/postgres

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123:role/ci-role
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ env.IMAGE_NAME }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Strengths

- **Built into GitHub** — no separate signup, accounts, integration
- **Marketplace** with thousands of actions (build/test/deploy/scan)
- **Free for public repos**, generous free tier for private
- **OIDC** to AWS, GCP, Azure, HashiCorp Vault
- **Environments** with required reviewers (built-in approval gates)
- **Reusable workflows** for cross-repo composition

### Weaknesses

- Older `actions/checkout@v3` etc. need ongoing upgrade
- Pinning third-party actions to SHA is verbose but necessary for security
- Large monorepos can hit job-count limits
- YAML doesn't compose well — limited DRY

### Reusable workflows

```yaml
# .github/workflows/build-image.yml (reusable)
on:
  workflow_call:
    inputs:
      image-name:
        required: true
        type: string

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # ...

# .github/workflows/ci.yml (caller)
jobs:
  build:
    uses: ./.github/workflows/build-image.yml
    with:
      image-name: order-service
```

Reduces duplication across repos.

---

## GitLab CI

Built into GitLab. `.gitlab-ci.yml` in repo root.

```yaml
# .gitlab-ci.yml
image: python:3.11-slim

stages:
  - validate
  - test
  - build
  - deploy

variables:
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.pip-cache"

cache:
  paths:
    - .pip-cache

before_script:
  - pip install --cache-dir=$PIP_CACHE_DIR -r requirements.txt -r requirements-dev.txt

lint:
  stage: validate
  script:
    - ruff check .

test:
  stage: test
  services:
    - postgres:15
  variables:
    POSTGRES_PASSWORD: password
    DATABASE_URL: postgresql://postgres:password@postgres:5432/postgres
  script:
    - pytest tests/ --cov=src --cov-fail-under=80
  coverage: '/(?i)total.*? (\d+(?:\.\d+)?)%$/'

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build --cache-from $CI_REGISTRY_IMAGE:latest -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

deploy_staging:
  stage: deploy
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  environment:
    name: staging
    url: https://staging.example.com
  script:
    - kubectl set image deployment/order-service order-service=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

deploy_production:
  stage: deploy
  rules:
    - if: $CI_COMMIT_TAG
  environment:
    name: production
    url: https://example.com
  when: manual
  script:
    - kubectl set image deployment/order-service order-service=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
```

### Strengths

- **Tightly integrated** with GitLab issues, merge requests, container registry, Kubernetes integration
- **Auto DevOps** — out-of-the-box pipelines for many languages
- **Includes / extends** for DRY pipeline definition
- **Self-hosted GitLab** is fully supported (more polished than self-hosted GitHub Enterprise CI)
- **Built-in container registry, package registry**
- **Environment management** with deploy targets

### Weaknesses

- Smaller marketplace than GitHub Actions
- More complex pipeline syntax for advanced cases
- GitLab.com runners are slower / shared in free tier

### Includes (composition)

```yaml
include:
  - project: 'group/templates'
    ref: main
    file: 'python-template.yml'

  - local: '/ci/security-scans.yml'
```

Better DRY than GitHub Actions reusable workflows for some patterns.

---

## CircleCI

Cloud-first CI/CD. `.circleci/config.yml`.

```yaml
# .circleci/config.yml
version: 2.1

orbs:
  python: circleci/python@2.1
  aws-ecr: circleci/aws-ecr@9.0

executors:
  python-executor:
    docker:
      - image: cimg/python:3.11

jobs:
  test:
    executor: python-executor
    steps:
      - checkout
      - python/install-packages:
          pkg-manager: pip
      - run:
          name: Run tests
          command: pytest tests/ --cov=src --cov-fail-under=80

  build-and-push:
    machine:
      image: ubuntu-2204:current
    steps:
      - checkout
      - aws-ecr/build_and_push_image:
          repo: order-service
          tag: ${CIRCLE_SHA1},latest
          region: us-east-1
          role-arn: arn:aws:iam::123:role/circleci-deploy

workflows:
  ci:
    jobs:
      - test
      - build-and-push:
          requires:
            - test
          filters:
            branches:
              only: main
          context: aws-credentials
```

### Strengths

- **Orbs** — reusable, versioned config packages (similar to GitHub Actions but more structured)
- **Macros / parameters** in YAML — better DRY than GitHub Actions
- **Resource classes** — pick CPU/memory per job
- **Nice UI** with insights, parallelism visualisation
- **Approval workflows**, hold jobs

### Weaknesses

- Pricing can be steep at scale
- Smaller community than GitHub / GitLab
- Less native to any one Git host

CircleCI tends to be picked when you want pipeline ergonomics over hosting integration.

---

## Jenkins

The veteran. Self-hosted, plugin-driven. Jenkinsfile in repo:

```groovy
// Jenkinsfile
pipeline {
  agent any
  
  environment {
    REGISTRY = 'ghcr.io/myorg'
    IMAGE_NAME = 'order-service'
  }
  
  stages {
    stage('Lint') {
      steps {
        sh 'ruff check .'
      }
    }
    
    stage('Test') {
      steps {
        sh 'pytest tests/ --cov=src --cov-fail-under=80'
      }
      post {
        always {
          junit 'reports/*.xml'
        }
      }
    }
    
    stage('Build') {
      when { branch 'main' }
      steps {
        sh "docker build -t ${REGISTRY}/${IMAGE_NAME}:${env.GIT_COMMIT} ."
        sh "docker push ${REGISTRY}/${IMAGE_NAME}:${env.GIT_COMMIT}"
      }
    }
    
    stage('Deploy Staging') {
      when { branch 'main' }
      steps {
        sh "kubectl set image deployment/order-service order-service=${REGISTRY}/${IMAGE_NAME}:${env.GIT_COMMIT}"
      }
    }
    
    stage('Approve Production') {
      when { branch 'main' }
      steps {
        input message: 'Deploy to production?'
      }
    }
    
    stage('Deploy Production') {
      when { branch 'main' }
      steps {
        sh "kubectl --context=production set image deployment/order-service order-service=${REGISTRY}/${IMAGE_NAME}:${env.GIT_COMMIT}"
      }
    }
  }
  
  post {
    failure {
      slackSend channel: '#deploys', message: "Build failed: ${env.BUILD_URL}"
    }
  }
}
```

### Strengths

- **Massive plugin ecosystem** — virtually any tool integrates
- **Fully self-hosted** — control everything
- **Mature** — decades of patterns documented
- **Free** (open source)

### Weaknesses

- **Operational burden** — you run it, you patch it, you scale it
- **Plugin sprawl** — security risk; old plugins, incompatibilities
- **UI feels dated** — although Blue Ocean improved this
- **Master/agent architecture** — single master can bottleneck
- **Groovy DSL** — power but obscure for newcomers
- **Configuration drift** — UI changes diverge from Jenkinsfile

Jenkins is in maintenance mode at most modern teams. Migrations to GitHub Actions / GitLab CI / CircleCI are common.

---

## Tekton

Kubernetes-native. Pipelines are CRDs.

```yaml
apiVersion: tekton.dev/v1
kind: Pipeline
metadata:
  name: ci-pipeline
spec:
  params:
    - name: repo-url
    - name: revision
  
  workspaces:
    - name: source
  
  tasks:
    - name: fetch-source
      taskRef:
        name: git-clone
      workspaces:
        - name: output
          workspace: source
      params:
        - name: url
          value: $(params.repo-url)
        - name: revision
          value: $(params.revision)
    
    - name: run-tests
      runAfter: [fetch-source]
      taskRef:
        name: pytest
      workspaces:
        - name: source
          workspace: source
    
    - name: build-image
      runAfter: [run-tests]
      taskRef:
        name: kaniko
      workspaces:
        - name: source
          workspace: source
      params:
        - name: IMAGE
          value: ghcr.io/myorg/order-service:$(params.revision)
```

### Strengths

- **Cloud-native** — runs on Kubernetes; pipelines are first-class K8s objects
- **GitOps-friendly** — pipelines version-controlled as YAML
- **Composable Tasks** reusable across pipelines
- **No separate CI cluster** — uses your existing K8s
- **Audit, RBAC** via standard K8s mechanisms

### Weaknesses

- **Steep learning curve** — many CRDs (Pipeline, PipelineRun, Task, TaskRun, EventListener, etc.)
- **No native UI** — Tekton Dashboard is bolt-on
- **Verbose** for simple pipelines
- **Smaller community** than GitHub Actions / GitLab CI

Used at K8s-heavy shops. Often paired with ArgoCD (config repo) and Argo Events (triggers).

---

## Comparison

### Pipeline-as-code expressiveness

```
Jenkins (Groovy)         ── full programming language, most powerful
Tekton (CRDs)            ── declarative, composable, verbose
GitLab CI (YAML)         ── good DRY via includes/extends
CircleCI (YAML)          ── good DRY via orbs/parameters
GitHub Actions (YAML)    ── reusable workflows, less elegant DRY
CodePipeline (JSON/IaC)  ── least expressive; works via Terraform/CDK
```

### Ecosystem

```
Jenkins         ── plugins for everything (also: plugin maintenance hell)
GitHub Actions  ── marketplace dominant for modern stacks
GitLab CI       ── catalog smaller but well-maintained
CircleCI        ── orbs for most common tasks
Tekton          ── Tekton Hub; reuse via Tasks
CodePipeline    ── built-in AWS actions; limited beyond
```

### Cost

```
Jenkins         ── free software, expensive to operate (servers, ops)
GitHub Actions  ── free for OSS, $0.008/min Linux paid
GitLab CI       ── free tier; paid scales with users + minutes
CircleCI        ── free tier; paid per-user + per-minute
Tekton          ── free; you provide K8s
CodePipeline    ── ~$1/active pipeline/month + CodeBuild minutes
```

### Operational burden

```
GitHub Actions / GitLab.com / CircleCI   ── essentially zero (hosted)
Self-hosted runners (any tool)            ── moderate (provision, scale, patch)
Jenkins / GitLab self-hosted / Tekton     ── high (full ownership)
```

---

## Picking a tool

```mermaid
graph TD
    A[Where does code live?] --> B{GitHub?}
    B -->|yes| C[GitHub Actions]
    A --> D{GitLab?}
    D -->|yes| E[GitLab CI]
    A --> F{Bitbucket / multi-Git?}
    F -->|yes| G{Heavy K8s?}
    G -->|yes| H[Tekton]
    G -->|no| I[CircleCI]
    A --> J{AWS-only, IAM-heavy?}
    J -->|yes| K[CodePipeline + CodeBuild]
    A --> L{Locked in to Jenkins?}
    L -->|yes, but want migration| M[Plan migration to above]
```

**Default for new teams**: GitHub Actions or GitLab CI based on Git host.

**Migrating from Jenkins**: GitHub Actions or GitLab CI; Jenkins's plugin coverage doesn't justify the operational cost in 2026.

**Heavy K8s**: Tekton + ArgoCD + Argo Rollouts is a credible cloud-native stack, but learning curve is real.

---

## Self-hosted vs hosted runners

### Hosted (cloud-provided)

- Zero ops
- Cold start each job (no shared cache between jobs)
- Limited compute classes
- Public IP egress (some compliance issues)
- Pay per minute

### Self-hosted runners

- Custom hardware (GPU, ARM, large instances)
- Persistent cache, faster builds
- Inside private network (access to private resources)
- Need to provision, scale, patch
- Pay infrastructure cost only

Hybrid: hosted for most, self-hosted for specific needs (heavy builds, GPU, private VPC access).

```yaml
# GitHub Actions example
jobs:
  build:
    runs-on: [self-hosted, linux, x64, gpu]   # custom runner labels
```

---

## Pipeline patterns that translate across tools

Regardless of tool:

```yaml
✓ Cache dependencies
✓ Parallel jobs
✓ Path filters (skip on doc-only changes)
✓ Conditional jobs (branch, tag)
✓ Approval gates for production
✓ OIDC / IAM auth (no stored credentials)
✓ Artifact promotion (build once, deploy many)
✓ Notification on failure
✓ Pipeline-as-code in the repo
✓ Branch protection enforces required checks
```

Tool-specific syntax differs; concepts don't.

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've used multiple tools and understand they solve the same problem with different ergonomics.

**Strong answer pattern:**
1. GitHub Actions / GitLab CI dominate; pick based on Git host
2. Jenkins is in maintenance mode at most modern teams; migration is a recurring project
3. Tekton for K8s-native shops; high ceiling, steep learning curve
4. Self-hosted runners for specialised needs; hosted for default
5. Pipeline patterns are tool-agnostic — caching, parallelism, OIDC, gates

**Common follow-up:** *"What would you migrate Jenkins to and why?"*
> Depends where the code is. GitHub → GitHub Actions. GitLab → GitLab CI. Both eliminate the operational burden of running Jenkins. Migration is a multi-month project: convert pipelines, retrain team, rebuild custom plugin equivalents. Worth it for the ops cost reduction and modern features (OIDC, marketplace, branch protection integration).

---

## Related topics

- [Fundamentals](fundamentals.md) — concepts that translate across tools
- [Build and Test](build-and-test.md) — what runs in pipelines
- [GitOps](gitops.md) — alternative for K8s deploys
- [AWS CodePipeline](aws-codepipeline.md) — AWS-native deep dive
- [Security in CI/CD](security-in-cicd.md) — what to scan
