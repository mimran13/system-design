# The AI Engineer Path: Backend Engineer → AI Engineer

A single ordered route for an experienced backend engineer becoming an AI engineer — from "I ship reliable backend systems" to "I ship reliable *AI* systems." This is the AI-engineering companion to the [system-design Curriculum](curriculum.md): one spine, each step building on the last, checkpoints per level.

You are not starting from zero. You already own most of what makes AI systems *production-grade* — APIs, distributed systems, auth, observability, deployment. What's new is a thin-but-deep layer on top: how the model behaves, how to make it *act*, how to ground it in your data, and how to know it's any good. This path is weighted toward that net-new layer and skips lightly over what you already have.

!!! tip "What staff-level AI roles actually screen for"
    Read a dozen Staff AI Engineer job descriptions and the same bar repeats — it is almost entirely *engineering judgment*, not model trivia:

    - **Production AI at scale** — agentic workflows and RAG pipelines built on LLM APIs, not notebooks. Testing, observability, cost control, rollback.
    - **Agent frameworks + MCP** — hands-on with an orchestration framework (e.g. LangGraph) and the [Model Context Protocol](#mcp) for tool/data integration.
    - **Judgment about where AI fits** — *"where AI adds value and where it's overkill."* This single line appears in almost every staff JD. Knowing when **not** to use an LLM is a senior signal.
    - **Secure handling of auth and data** — SSO, OAuth, RBAC, GDPR — applied to AI systems (see [AI Security & Governance](#ai-security)).
    - **Technical leadership** — set the bar for what "done" means, review architecture, grow other engineers.

    Notice what's *not* on the list: training models from scratch, deriving attention, beating benchmarks. Staff AI engineering is software engineering with an LLM in the critical path.

## What you already bring (and what's net-new)

If you're coming from a staff/senior backend role, most of the hard-won production skills transfer directly. Don't re-learn them — re-point them.

| You already own | How it maps to AI engineering | Net-new part |
|---|---|---|
| APIs, services, Python | Calling LLM APIs is just another integration — retries, timeouts, idempotency all apply | Streaming, tool-call loops, token/cost as a first-class budget |
| Distributed systems & queues | Agentic workflows are orchestration: steps, retries, compensation, durable state | Non-determinism — the same input can take a different path |
| Observability & SLOs | You already monitor latency, errors, saturation | Tracing *prompts/responses*, eval scores, hallucination & drift |
| Auth: SSO, OAuth, RBAC | Securing an AI feature reuses every bit of this | Prompt injection, data exfiltration via tools, per-user retrieval scoping |
| Testing & CI/CD | The discipline carries over | Evals replace unit tests for probabilistic output |
| Cloud, Docker, deployment | Serving an AI service is still a service | GPU/inference economics, self-host vs API |

The biggest mindset shift: **outputs are probabilistic**. You stop asserting `==` and start measuring distributions. Everything downstream — testing, monitoring, rollback — bends around that one fact.

!!! tip "Interactive roadmap"
    Every node and chip below is a link — click to open that page. Levels jump to their detail section. Items marked *skim* are things you likely already know as a backend engineer.

## The roadmap

<div class="roadmap">
  <div class="rm-head">
    <span class="h">🧭 Backend → AI Engineer roadmap</span>
    <span class="legend">
      <i><span class="sw core"></span>level</i>
      <i><span class="sw opt"></span>topic</i>
      <i><span class="sw adv"></span>net-new / staff</i>
    </span>
  </div>
  <p class="rm-sub">Nine levels top to bottom, then specialize and build — each step builds on the last. Numbered nodes are the levels (click to jump to detail + checkpoint); the chips are that level's topics. Chips marked advanced are the net-new or staff-scope additions for an experienced backend engineer.</p>
  <div class="rm-track">
    <div class="rm-stop">
      <a class="rm-node" href="#level-0"><span class="n">0</span>Foundations</a><div class="rm-branch right"><a class="rm-chip" href="../../software-design/">Programming (skim)</a><a class="rm-chip adv" href="../../ai/ml-literacy/">ML &amp; AI Literacy</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="../../ai/llm-fundamentals/">LLM Fundamentals</a><a class="rm-chip" href="../../ai/prompt-engineering/">Prompt Engineering</a><a class="rm-chip" href="../../ai/working-with-llm-apis/">Working with LLM APIs</a></div><a class="rm-node" href="#level-1"><span class="n">1</span>LLM core</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="#level-2"><span class="n">2</span>The agent loop</a><div class="rm-branch right"><a class="rm-chip" href="../../agents/agent-fundamentals/">Agent Fundamentals</a><a class="rm-chip" href="../../agents/function-calling/">Function Calling &amp; Tool Use</a><a class="rm-chip" href="../../ai/agents-and-tool-use/">Agents &amp; Tool Use</a><a class="rm-chip" href="../../ai/memory-systems/">Memory Systems</a><a class="rm-chip adv" href="#mcp">Model Context Protocol</a><a class="rm-chip" href="../../agents/building-agents/">Building Agents</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="../../ai/embeddings-vector-search/">Embeddings &amp; Vector Search</a><a class="rm-chip" href="../../ai/rag/">RAG</a></div><a class="rm-node" href="#level-3"><span class="n">3</span>Retrieval</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="#level-4"><span class="n">4</span>Agentic workflows &amp; orchestration</a><div class="rm-branch right"><a class="rm-chip" href="../../agents/multi-agent-systems/">Multi-Agent Systems</a><a class="rm-chip" href="../../ai/agentic-patterns/">Agentic Patterns</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="../../ai/llm-frameworks/">LLM Frameworks (LangGraph)</a></div><a class="rm-node" href="#level-5"><span class="n">5</span>Frameworks</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="#level-6"><span class="n">6</span>Evaluation &amp; quality</a><div class="rm-branch right"><a class="rm-chip" href="../../ai/evaluation/">Evaluation</a><a class="rm-chip" href="../../agents/agent-reliability/">Agent Reliability</a><a class="rm-chip" href="../../ai/guardrails-safety/">Guardrails &amp; Safety</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="../../ai/llmops/">LLMOps</a><a class="rm-chip" href="../../ai/ml-in-production/">ML in Production (skim)</a><a class="rm-chip" href="../../ai/llm-inference/">LLM Inference &amp; Serving</a><a class="rm-chip adv" href="#ai-security">AI Security &amp; Governance</a></div><a class="rm-node" href="#level-7"><span class="n">7</span>Production engineering</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node adv" href="#level-8"><span class="n">8</span>Staff scope</a><div class="rm-branch right"><a class="rm-chip adv" href="#staff-judgment">Where AI fits vs overkill</a><a class="rm-chip adv" href="#staff-architecture">Architecture under ambiguity</a><a class="rm-chip adv" href="#staff-platform">Platform thinking</a><a class="rm-chip adv" href="#staff-leadership">Raising the bar</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="../../ai/fine-tuning/">Fine-Tuning</a><a class="rm-chip" href="../../ai/rag/">RAG depth</a><a class="rm-chip" href="../../agents/building-agents/">Building Agents</a><a class="rm-chip" href="../../ai/llm-inference/">LLM Inference &amp; Serving</a></div><a class="rm-node" href="#specialize">Specialize</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="#build">Build</a><div class="rm-branch right"><a class="rm-chip" href="../../agents/example-research-agent/">Research Agent</a><a class="rm-chip" href="../../agents/example-data-agent/">Data Analysis Agent</a><a class="rm-chip" href="../../agents/example-customer-support-agent/">Customer Support Agent</a></div>
    </div>
  </div>
</div>

---

## Level 0 — Foundations *(~half a week for a backend eng)* { #level-0 }

**The question**: before any LLM, what is a model, and when do you even need ML?

1. [Programming Foundations](../software-design/index.md) — **skim.** You can already code, call APIs, use git, write tests. Python fluency is assumed; if you're a JVM/Go person, the gap is idiom, not concepts. Spend an afternoon, not a week.
2. [ML & AI Literacy](../ai/ml-literacy.md) — **the net-new bit.** What a model *is* (a function with learned weights), training vs inference, supervised/unsupervised/RL, what "evaluation" means, and — crucially — when a rule or a SQL query beats a model. This is where the *"where AI is overkill"* judgment starts.

??? question "Checkpoint — can you answer these without looking?"

    - What's the difference between training and inference, and why does it matter for cost and architecture?
    - When would you *not* reach for ML/an LLM at all? Give two examples from your own backend work.
    - What does "7B parameters" mean, roughly?

## Level 1 — LLM core *(~1-2 weeks)* { #level-1 }

**The question**: how does the model behave, and how do I call it from real code?

This is your real starting line. Everything before it you mostly had.

1. [LLM Fundamentals](../ai/llm-fundamentals.md) — tokens, context windows, sampling, why models hallucinate; the mental model everything else needs
2. [Prompt Engineering](../ai/prompt-engineering.md) — the highest-leverage skill once you know how LLMs work. Treat prompts as code: versioned, reviewed, tested.
3. [Working with LLM APIs](../ai/working-with-llm-apis.md) — the SDK in practice: structured output, streaming, tool calls, prompt caching, cost levers, retries. This is where your backend instincts (idempotency, timeouts, backoff) pay off immediately.

??? question "Checkpoint"

    - The same prompt works in the chat UI but truncates in your code. Two likely causes?
    - How do you get reliable JSON out of a model instead of parsing prose?
    - What's the cheapest lever for cutting cost on requests that share a big system prompt?

## Level 2 — The agent loop *(~2 weeks)* { #level-2 }

**The question**: how does an LLM *do things* — call tools, take multiple steps, remember?

1. [Agent Fundamentals](../agents/agent-fundamentals.md) — what makes something an "agent" vs a single call
2. [Function Calling & Tool Use](../agents/function-calling.md) — the mechanic that lets a model act
3. [Agents & Tool Use](../ai/agents-and-tool-use.md) — the ReAct loop: reason → act → observe → repeat
4. [Memory Systems](../ai/memory-systems.md) — short-term context vs long-term memory across sessions
5. **[Model Context Protocol (MCP)](#mcp)** — the standard for exposing tools and data to models *(net-new — see below)*
6. [Building Agents](../agents/building-agents.md) — putting the loop together into something that works

??? question "Checkpoint"

    - Walk the tool-use loop: what does the model return, and what do you send back?
    - Why is the API stateless, and what does that mean for "memory"?
    - When does a task justify an agent versus a single well-prompted call?
    - What problem does MCP solve that hand-rolled function calling doesn't?

### Model Context Protocol (MCP) { #mcp }

!!! note "Net-new topic — gap on the roadmap"
    MCP is named explicitly in staff AI-engineer job descriptions and has no dedicated page on this site yet. This section is the working summary; a full `ai/mcp.md` page is the next "add the info" step. The current Claude/Anthropic SDKs and most agent frameworks speak MCP natively.

**What it is.** The Model Context Protocol is an open standard (introduced by Anthropic, now broadly adopted) for connecting LLM applications to **tools, data sources, and prompts** through a uniform interface. Think of it as *"USB-C for AI tools"*: instead of every app hand-wiring every integration, an MCP **server** exposes capabilities and any MCP **client** (your agent, an IDE, a chat app) consumes them the same way.

**The mental model for a backend engineer.** MCP is to tool integration what a well-defined RPC contract is to microservices. You already know why you don't let every service reach into every other service's database — you put an interface in front. MCP is that interface, standardized, for the model↔world boundary.

**The three primitives an MCP server exposes:**

| Primitive | What it is | Backend analogy |
|---|---|---|
| **Tools** | Functions the model can call (with JSON-schema inputs) | RPC endpoints / actions |
| **Resources** | Read-only data the model can pull into context (files, rows, docs) | GET endpoints / read models |
| **Prompts** | Reusable, parameterized prompt templates the server offers | Stored procedures / canned queries |

**Transport.** MCP runs over **stdio** (local subprocess — great for desktop/IDE tools) or **HTTP + Server-Sent Events / streamable HTTP** (remote servers). Auth on remote servers is typically OAuth 2.1 — which is exactly why your existing auth knowledge transfers (see [AI Security & Governance](#ai-security)).

**Why it matters at staff level.** Without a standard, every team rebuilds the same Jira/GitHub/Postgres/Slack connectors with subtly different auth, error handling, and schemas. MCP lets you build a connector **once** as a server and reuse it across every agent and every framework. That "build the shared capability once, set the standard for the team" move *is* the staff mandate. The flip side — and the staff judgment — is knowing when an MCP server is overkill versus a three-line direct function call.

**Where it fits the rest of this path:** MCP is the productionized, standardized form of [Function Calling & Tool Use](../agents/function-calling.md). Learn raw function calling first (so you understand what MCP abstracts), then adopt MCP when you have more than a couple of integrations or want to share them across apps.

## Level 3 — Retrieval *(~1-2 weeks)* { #level-3 }

**The question**: how do I ground the model in *my* data instead of just its training?

1. [Embeddings & Vector Search](../ai/embeddings-vector-search.md) — turning meaning into vectors; ANN search; the retrieval primitive
2. [RAG](../ai/rag.md) — retrieval-augmented generation: chunking, retrieval, reranking, and the failure modes (the most common production LLM pattern)

??? question "Checkpoint"

    - Why does chunking strategy make or break a RAG system?
    - What does reranking add on top of vector search, and when is it worth it?
    - "The model cited the wrong document." Where in the pipeline do you look?

## Level 4 — Agentic workflows & orchestration *(~1-2 weeks)* { #level-4 }

**The question**: when one agent isn't enough, how do several coordinate — and how do I make the whole thing durable?

This is where your distributed-systems background is a genuine edge. An agentic workflow is orchestration: steps, retries, compensation, durable state, idempotency. You've built this before — for deterministic services. Now the steps are non-deterministic.

1. [Multi-Agent Systems](../agents/multi-agent-systems.md) — coordinator/worker, delegation, when multi-agent helps vs adds chaos
2. [Agentic Patterns](../ai/agentic-patterns.md) — planning, decomposition, reflection, and the reusable shapes
3. Connect it back to [Durable Workflows](../patterns/durable-workflows.md) — Temporal/Step Functions give agentic pipelines the durable-execution backbone that makes them recoverable.

??? question "Checkpoint"

    - When does splitting work across agents help, and when does it just add coordination cost?
    - What's the difference between a planner that decomposes upfront and one that adapts as it goes?
    - How would you make a 12-step agentic workflow survive a process crash at step 8?

## Level 5 — Frameworks *(~1 week)* { #level-5 }

**The question**: should I use LangChain/LangGraph, or the raw SDK plus thin helpers?

1. [LLM Frameworks](../ai/llm-frameworks.md) — the landscape (LangChain, **LangGraph**, LlamaIndex, DSPy, and friends), what they give you, the abstraction-tax critique, and the "start raw, adopt selectively" stance.

LangGraph specifically comes up in staff JDs because it models agentic flows as an explicit **graph of state transitions** — which is exactly how a backend engineer already thinks about workflows. You reach Level 5 *after* the agent loop deliberately: a framework is much easier to judge once you know what it's abstracting. If you start here, you can't tell a helpful abstraction from a leaky one.

??? question "Checkpoint"

    - What does LangGraph's graph model give you that a linear chain doesn't?
    - Name two situations where you'd skip the framework and go raw-SDK.

## Level 6 — Evaluation & quality *(~2 weeks)* { #level-6 }

**The question**: is it actually any good — and how would I know if it regressed?

1. [Evaluation](../ai/evaluation.md) — eval harnesses, measuring correctness, LLM-as-judge, offline vs online
2. [Agent Reliability](../agents/agent-reliability.md) — retries, validation, failure handling for non-deterministic systems
3. [Guardrails & Safety](../ai/guardrails-safety.md) — input/output filtering, jailbreak resistance, reducing hallucination

This level is what separates a demo from a product, and it's the clearest staff signal in the whole path. A flashy agent with no evals is a liability; a boring one with a solid eval harness ships. Evals are your replacement for unit tests — build them early, not at the end.

??? question "Checkpoint"

    - How do you evaluate a system whose output is different every run?
    - What's the trap with checking your eval metric every day and stopping at the first good number?
    - Name two concrete ways to reduce hallucination in a deployed system.

## Level 7 — Production engineering *(~2-3 weeks)* { #level-7 }

**The question**: how do I run this reliably, observably, affordably — and securely?

1. [LLMOps](../ai/llmops.md) — observability, cost control, prompt/version management, caching
2. [ML in Production](../ai/ml-in-production.md) — **skim the generic-serving parts** (you know monitoring and deployment); focus on drift, A/B testing models, and the ML-specific failure modes
3. [LLM Inference & Serving](../ai/llm-inference.md) — latency, throughput, batching, self-hosting vs API
4. **[AI Security & Governance](#ai-security)** — auth, RBAC, data handling, GDPR for AI systems *(net-new framing of skills you already have — see below)*

??? question "Checkpoint"

    - Your LLM bill doubled with no traffic change. First thing you check?
    - What would you monitor to catch a silently degrading RAG system?
    - When does self-hosting inference beat calling an API?
    - A RAG system retrieves documents — how do you stop user A from seeing user B's data through it?

### AI Security & Governance { #ai-security }

!!! note "Net-new framing — gap on the roadmap"
    Staff JDs ask for *"secure handling of auth and data — SSO, OAuth, RBAC, GDPR."* You already know these primitives cold; what's new is the AI-specific attack surface and data-flow. This is the working summary; a full `ai/ai-security-governance.md` page is a planned "add the info" step.

**The reframe.** You don't need to learn OAuth or RBAC — you need to learn where LLMs *break* the assumptions those controls rely on. Three new things move:

**1. The model is a confused deputy.** An LLM with tool access will do what the *prompt* says, including a malicious instruction smuggled into a retrieved document or a tool result (**indirect prompt injection**). Your authZ can't live only at the API edge anymore — every tool the agent can call must enforce the *end user's* permissions, not the agent's service credentials. Pass user identity down the call chain; never give an agent broader scope than the user it acts for.

**2. Retrieval leaks across tenants.** A naive RAG index mixes every user's documents into one vector store. Vector search has no notion of "tenant" unless you build it in. You enforce isolation with metadata filters, per-tenant namespaces/indexes, or row-level security on the source — and you test it as an eval (*"can user A ever retrieve user B's row?"*).

**3. Data residency & PII (GDPR).** Prompts and completions are *data*, often containing PII, and they flow to a third-party model provider. The governance questions: Is the provider a sub-processor in your DPA? Is data used for training (opt out)? How long are prompts/logs retained? Can you honor a deletion request that includes prompt logs and a fine-tuned model trained on the user's data? Redact/tokenize PII *before* it hits the model where you can.

| Control you already know | What's new for AI |
|---|---|
| OAuth 2.1 / SSO | MCP remote servers and tool calls authenticate this way — reuse it |
| RBAC | Must propagate to *every tool and retrieval call*, scoped to the end user |
| Input validation | Add prompt-injection defenses; treat retrieved content as untrusted input |
| Audit logging | Log prompts, tool calls, and completions — for incident review and compliance |
| Secrets management | Plus: never let the model see secrets it could echo back into a response |

**Staff move:** make these defaults — a secure-by-default agent scaffold, a tenant-isolation eval in CI, a PII-redaction layer in the shared platform — so the whole team inherits them instead of re-deciding per project. Cross-links: [Guardrails & Safety](../ai/guardrails-safety.md), [Authentication & Authorization](../security/authn-authz.md), [Enterprise Auth (SSO)](../security/enterprise-auth.md), and [LLMOps](../ai/llmops.md) for the logging/observability side.

## Level 8 — Staff scope *(ongoing — this is the job, not a phase)* { #level-8 }

**The question**: it's not "can I build it" anymore — it's "should we, what's the right shape, and how do I make the whole team better at this?"

Levels 0-7 make you a capable AI engineer. Level 8 is what the *staff* title actually pays for, and it maps directly to the responsibilities in staff JDs. None of it is a tutorial you finish; it's judgment you accumulate. The four threads:

### Where AI fits vs where it's overkill { #staff-judgment }

The most-repeated line in staff AI JDs is *"judgement about where AI adds value and where it's overkill."* The senior reflex is to reach for the simplest thing that works:

- A regex, a SQL query, or a deterministic rule beats an LLM when the logic is knowable and stable. LLMs earn their cost on ambiguity, language, and long-tail variety.
- A single well-prompted call beats an agent when there's no genuine branching or tool use.
- Retrieval beats fine-tuning when the problem is *knowledge*, not *behavior*.

Being the person who says "this doesn't need AI" is a staff signal, not a failure to deliver. See [ML & AI Literacy](../ai/ml-literacy.md) for the "when not to use ML" foundation.

### Architecture under ambiguity { #staff-architecture }

Staff engineers own *"the most complex, ambiguous problems — the ones without a clear playbook."* For AI systems that means: choosing the boundary between deterministic code and the model, deciding what's an eval vs a guardrail vs a test, sequencing a migration from a prototype to a productionized system, and making the build-vs-buy call on models and platforms. Your [system-design](curriculum.md) judgment is the transferable core here — apply it with the new constraint that one component is probabilistic.

### Platform thinking { #staff-platform }

*"Shape the direction of shared infrastructure."* The patterns you set on your own project should become shared capabilities: a common eval harness, an MCP server registry, a PII-redaction layer, prompt/version management, cost dashboards. Feed production pain back into the platform. This is where the [MCP](#mcp) "build the connector once" mindset scales to the whole org.

### Raising the bar { #staff-leadership }

*"Define what 'done' means; actively develop other engineers."* Concretely: a definition-of-done for AI features (auth, error handling, monitoring, rollback, evals, docs), architecture reviews that ask "where's the eval?", pairing and design feedback that builds others' judgment, and representing what AI *can and can't* do in cross-functional roadmap discussions. The technical skill is necessary; the multiplier is making the team around you better at all of the above.

??? question "Checkpoint — the staff bar"

    - Give a recent example where the right answer was *not* to use an LLM. How did you make that call?
    - What's your definition of "done" for shipping an AI feature to production?
    - You're handed an ambiguous AI product with no playbook. What are your first three architecture decisions?
    - What shared capability would most raise your team's AI velocity, and why?

## Specialize — pick a depth { #specialize }

You can't be expert at everything. After Level 7, go deep on one:

- **Fine-tuning & model adaptation** → [Fine-Tuning](../ai/fine-tuning.md)
- **RAG systems** → [RAG](../ai/rag.md) + [Embeddings & Vector Search](../ai/embeddings-vector-search.md) at depth
- **Applied agents** → [Building Agents](../agents/building-agents.md) + [Multi-Agent Systems](../agents/multi-agent-systems.md)
- **Platform / inference infra** → [LLM Inference & Serving](../ai/llm-inference.md) + [ML in Production](../ai/ml-in-production.md)

## Build — prove it { #build }

Knowledge that hasn't built anything is trivia. Work the three end-to-end examples — attempt each yourself before reading the walkthrough:

- [Research Agent](../agents/example-research-agent.md) — multi-step tool use + synthesis
- [Data Analysis Agent](../agents/example-data-agent.md) — code execution + structured output
- [Customer Support Agent](../agents/example-customer-support-agent.md) — RAG + guardrails + escalation

## How this relates to the system-design curriculum

| Path | Relationship |
|---|---|
| [The Curriculum (Zero → Staff)](curriculum.md) | The system-design backbone — distributed systems, storage, scaling. As a backend engineer you've largely walked this; it's the foundation your AI edge sits on, and the source of your "architecture under ambiguity" judgment. |
| [Building a SaaS](building-saas.md) | If your AI feature lives inside a product, this covers the product scaffolding around it. |

Honest estimate for an experienced backend engineer: **6-10 weeks at ~1 hour/day** for Levels 0-7 (faster than a beginner — you skip most of Level 0 and a lot of Level 7), then Level 8 and specialization are ongoing. The fastest way to stall is to skip Level 1 (the API) and Level 6 (evals) — the two least glamorous levels and the two that matter most in production.
