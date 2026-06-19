# Infrastructure as Code (IaC)

<div class="sec-hero" markdown>
<span class="ey">Delivery · infra as code</span>
Infrastructure as Code is the practice of defining and managing infrastructure (servers, networks, databases, load balancers, IAM, DNS) through declarative or imperative code rather than manual provisioning. The goal: infrastructure becomes versioned, reviewable, reproducible, and recoverable — exactly like application code.
</div>

## Roadmap

<div class="roadmap">
  <div class="rm-head">
    <span class="h">🧭 IaC roadmap</span>
    <span class="legend">
      <i><span class="sw core"></span>core path</i>
      <i><span class="sw opt"></span>read as needed</i>
      <i><span class="sw adv"></span>advanced / later</i>
    </span>
  </div>
  <p class="rm-sub">Follow the spine top-to-bottom your first time. Branches hang off the topic they support — grab them when you need them.</p>
  <div class="rm-track">
    <div class="rm-stop">
      <a class="rm-node" href="fundamentals/"><span class="n">1</span>Fundamentals</a>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="cdk/">AWS CDK</a></div>
      <a class="rm-node" href="terraform/"><span class="n">2</span>Terraform</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="state-management/"><span class="n">3</span>State Management</a>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="drift-detection/">Drift Detection</a></div>
      <a class="rm-node" href="terraform-cicd-lifecycle/"><span class="n">4</span>Terraform in CI/CD</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="modules-and-structure/"><span class="n">5</span>Modules and Structure</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="secrets-in-iac/"><span class="n">6</span>Secrets in IaC</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="best-practices/"><span class="n">7</span>Best Practices</a>
      <div class="rm-branch right"><a class="rm-chip" href="testing-iac/">Testing IaC</a></div>
    </div>
  </div>
</div>

## Core IaC topics

First principles, the dominant tool, and how to run it safely as a team.

<div class="pcards">
<a class="pcard" href="fundamentals/"><span class="t">Fundamentals</span><span class="d">Declarative vs imperative, mutable vs immutable, state, idempotency</span></a>
<a class="pcard" href="terraform/"><span class="t">Terraform</span><span class="d">HCL, providers, resources, modules, the dominant multi-cloud tool</span></a>
<a class="pcard" href="terraform-cicd-lifecycle/"><span class="t">Terraform in CI/CD Lifecycle</span><span class="d">End-to-end: PR → plan → review → apply → drift → rollback</span></a>
<a class="pcard" href="state-management/"><span class="t">State Management</span><span class="d">Remote state, locking, workspaces, state surgery, migration</span></a>
<a class="pcard" href="modules-and-structure/"><span class="t">Modules & Repository Structure</span><span class="d">Module design, monorepo vs polyrepo, environment layout</span></a>
<a class="pcard" href="secrets-in-iac/"><span class="t">Secrets in IaC</span><span class="d">Reference don't embed; Secrets Manager, Vault, SOPS, SSM</span></a>
<a class="pcard" href="best-practices/"><span class="t">Best Practices</span><span class="d">Tagging, versioning, blast radius, environment isolation</span></a>
</div>

## Tools & reference

The other tools and the practices that keep reality in sync with code.

<div class="pcards">
<a class="pcard" href="cdk/"><span class="t">AWS CDK</span><span class="d">Define infra in TypeScript/Python, AWS-native abstractions</span></a>
<a class="pcard" href="cloudformation/"><span class="t">CloudFormation</span><span class="d">AWS native IaC, deeply integrated with AWS services</span></a>
<a class="pcard" href="pulumi-and-alternatives/"><span class="t">Pulumi & Alternatives</span><span class="d">Pulumi, Crossplane, Ansible — when to pick each</span></a>
<a class="pcard" href="drift-detection/"><span class="t">Drift Detection</span><span class="d">What drift is, how to detect and prevent it</span></a>
<a class="pcard" href="testing-iac/"><span class="t">Testing IaC</span><span class="d">terraform validate, tflint, Checkov, Terratest, OPA, Sentinel</span></a>
</div>

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [Fundamentals](fundamentals.md) — declarative vs imperative, state, idempotency: the concepts behind every tool
2. [Terraform](terraform.md) — the dominant multi-cloud tool; makes the fundamentals concrete
3. [State Management](state-management.md) — the most failure-prone part of Terraform; learn it early
4. [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md) — how teams actually run plan/review/apply safely
5. [Modules & Repository Structure](modules-and-structure.md) — organising IaC once it grows beyond one file
6. [Secrets in IaC](secrets-in-iac.md) — the security non-negotiable: reference, don't embed
7. [Best Practices](best-practices.md) — tagging, blast radius, environment isolation; ties it all together

**Then, as needed (reference):** [AWS CDK](cdk.md), [CloudFormation](cloudformation.md), [Pulumi & Alternatives](pulumi-and-alternatives.md)

**Advanced — come back later:** [Drift Detection](drift-detection.md), [Testing IaC](testing-iac.md)

---

## Why IaC matters

```
Manual provisioning (the old world):
  Click through cloud console → inconsistent, unrepeatable
  "What did I configure?" → tribal knowledge in someone's head
  Recreate environment → days of work, never exactly the same
  Disaster recovery → painful, slow, often incomplete

IaC (the modern default):
  Define infra in code → committed to Git
  Apply: tool reconciles desired state with reality
  Any environment → identical (dev = staging = prod minus scale)
  Audit: git log shows every infra change with author + reason
  Disaster recovery: re-apply to rebuild from scratch in minutes
  Drift detection: scheduled plan reveals manual changes
```

The shift is the same one that happened to application code in the 90s — from "build it manually each time" to "version-controlled artifacts" — applied to infrastructure.

---

## Topics in this section

| Topic | What it covers | When it matters |
|---|---|---|
| [Fundamentals](fundamentals.md) | Declarative vs imperative, mutable vs immutable, state, idempotency | First principles for any IaC tool |
| [Terraform](terraform.md) | HCL, providers, resources, modules, the dominant multi-cloud tool | Most teams choose Terraform first |
| [Terraform in CI/CD Lifecycle](terraform-cicd-lifecycle.md) | End-to-end lifecycle: PR → plan → review → apply → drift → rollback | Running IaC safely as a team |
| [State Management](state-management.md) | Remote state, locking, workspaces, state surgery, migration | The most failure-prone part of Terraform |
| [Modules & Repository Structure](modules-and-structure.md) | Module design, monorepo vs polyrepo, environment layout | Scaling IaC across teams |
| [AWS CDK](cdk.md) | Define infra in TypeScript/Python, AWS-native abstractions | AWS-heavy shops who prefer real code |
| [CloudFormation](cloudformation.md) | AWS native IaC, deeply integrated with AWS services | AWS-only with no extra tooling |
| [Pulumi & Alternatives](pulumi-and-alternatives.md) | Pulumi, Crossplane, Ansible — when to pick each | Picking the right tool for the team |
| [Drift Detection](drift-detection.md) | What drift is, how to detect and prevent it | Keeping reality in sync with code |
| [Secrets in IaC](secrets-in-iac.md) | Reference don't embed; Secrets Manager, Vault, SOPS, SSM | Security non-negotiable |
| [Testing IaC](testing-iac.md) | `terraform validate`, tflint, Checkov, Terratest, OPA, Sentinel | Catching bad infra before apply |
| [Best Practices](best-practices.md) | Tagging, versioning, blast radius, environment isolation | What separates beginners from senior IaC engineers |

---

## How IaC fits with everything else

```
IaC is the foundation, not a silo:

  ┌─────────────────────────────────────────────┐
  │ Application code (your service)             │
  └─────────────────────────────────────────────┘
                      ▲
                      │ deployed by
                      │
  ┌─────────────────────────────────────────────┐
  │ CI/CD pipeline                              │
  │  - Builds and tests app                     │
  │  - Runs `terraform plan` on infra changes   │
  │  - Applies infra changes via OIDC auth      │
  └─────────────────────────────────────────────┘
                      ▲
                      │ uses
                      │
  ┌─────────────────────────────────────────────┐
  │ IaC (Terraform / CDK / CloudFormation)      │
  │  - VPC, subnets, security groups            │
  │  - Compute (ECS, Lambda, EC2)               │
  │  - Databases, queues, caches                │
  │  - IAM roles, secrets, DNS, certificates    │
  └─────────────────────────────────────────────┘
                      │
                      ▼
  ┌─────────────────────────────────────────────┐
  │ Cloud provider (AWS, GCP, Azure)            │
  └─────────────────────────────────────────────┘
```

---

## Mental model: declarative reconciliation

Almost all modern IaC is **declarative**: you describe the *desired state*, the tool figures out the *actions* needed to reach it.

```
1. You write: "I want 3 EC2 instances, this VPC, these IAM roles"
2. Tool reads current state (from cloud or state file)
3. Tool computes diff: what to create, update, destroy
4. Tool shows you the plan
5. You approve → tool applies the actions
6. State file updated to match reality
```

This is the same pattern Kubernetes uses — and for the same reasons: convergence is more robust than orchestration scripts that assume a starting point.

---

## Interview shortlist

| Question | Key answer |
|---|---|
| *"Why IaC instead of console clicking?"* | Reproducibility (rebuild prod in DR), auditability (git blame for infra), consistency (envs identical), speed (apply in minutes), review (PR before change). |
| *"What's the role of the state file in Terraform?"* | Maps your code (logical resources) to real cloud resources (by ID). Required for diffs, planning, and concurrent-safe apply. Must be remote with locking for teams. |
| *"How do you handle secrets in IaC?"* | Never embed. Reference Secrets Manager / Vault / SOPS. State file should be encrypted at rest because secrets *do* end up there. |
| *"Terraform vs CloudFormation vs CDK?"* | Terraform: multi-cloud, large ecosystem. CloudFormation: AWS-native, no extra tooling. CDK: real programming language, AWS-only (CDK for Terraform exists). Pick based on team and cloud. |
| *"How do you prevent two engineers applying at once?"* | Remote state with locking — S3 + DynamoDB for Terraform; built-in for Terraform Cloud / Spacelift / Atlantis. |
| *"What is drift, and how do you handle it?"* | Drift = real infra differs from IaC because someone changed it manually. Detect with scheduled `terraform plan`. Either revert or re-import into code. |

---

## Related sections

- [CI/CD](../cicd/index.md) — IaC is applied by the pipeline, not by humans on laptops
- [Containers](../infrastructure/containers.md) — what IaC provisions runs containers
- [Kubernetes](../infrastructure/kubernetes.md) — Helm and Kustomize as IaC for K8s
- [Secrets Management](../security/secrets-management.md) — reference, don't embed
- [AWS Mapping](../aws/index.md) — what each Terraform resource maps to
