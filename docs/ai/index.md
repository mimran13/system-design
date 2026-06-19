# AI Engineering

<div class="sec-hero" markdown>
<span class="ey">AI · LLM engineering</span>
Everything a backend engineer needs to design, build, and operate production AI systems — from how LLMs work to building reliable agentic pipelines at scale. Your edge is systems thinking; this section layers LLM primitives on top of it.
</div>

## Roadmap

<div class="roadmap">
  <div class="rm-head">
    <span class="h">🧭 AI Engineering roadmap</span>
    <span class="legend">
      <i><span class="sw core"></span>core path</i>
      <i><span class="sw opt"></span>read as needed</i>
      <i><span class="sw adv"></span>advanced / later</i>
    </span>
  </div>
  <p class="rm-sub">Follow the spine top-to-bottom your first time. Branches hang off the topic they support — grab them when you need them.</p>
  <div class="rm-track">
    <div class="rm-stop">
      <a class="rm-node" href="llm-fundamentals/"><span class="n">1</span>LLM Fundamentals</a>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="fine-tuning/">Fine-tuning</a></div>
      <a class="rm-node" href="prompt-engineering/"><span class="n">2</span>Prompt Engineering</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="embeddings-vector-search/"><span class="n">3</span>Embeddings &amp; Vector Search</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="rag/"><span class="n">4</span>RAG</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="agents-and-tool-use/"><span class="n">5</span>Agents &amp; Tool Use</a>
      <div class="rm-branch right"><a class="rm-chip" href="guardrails-safety/">Guardrails &amp; Safety</a></div>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="llmops/">LLMOps</a></div>
      <a class="rm-node" href="evaluation/"><span class="n">6</span>Evaluation</a>
    </div>
  </div>
</div>

## What is an AI / LLM / Agentic Engineer?

These roles overlap but have different emphasis:

| Role | Core focus |
|---|---|
| **LLM Engineer** | Integrating LLM APIs, prompt engineering, RAG pipelines, fine-tuning |
| **AI Engineer** | Full-stack AI product: models + backends + infra + evaluation |
| **Agentic Engineer** | Multi-step reasoning systems, tool use, agent orchestration |
| **ML Engineer** | Model training, data pipelines, hardware optimization (less covered here) |

As a backend engineer, your edge is **systems thinking** — you already know databases, APIs, distributed systems, and observability. AI Engineering layers LLM primitives on top of those skills.

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [LLM Fundamentals](llm-fundamentals.md) — tokens, context windows, sampling: the mental model everything else relies on
2. [Prompt Engineering](prompt-engineering.md) — the highest-leverage skill once you know how LLMs work
3. [Embeddings & Vector Search](embeddings-vector-search.md) — the retrieval primitive that powers RAG
4. [RAG (Retrieval-Augmented Generation)](rag.md) — the most common production LLM pattern, built on embeddings
5. [Agents & Tool Use](agents-and-tool-use.md) — LLMs that act: the ReAct loop and function calling

**Advanced — come back later:** [Fine-tuning](fine-tuning.md), [LLM Inference & Serving](llm-inference.md), [Evaluation](evaluation.md), [Guardrails & Safety](guardrails-safety.md), [LLMOps](llmops.md), [ML in Production](ml-in-production.md), [Memory Systems](memory-systems.md), [Agentic Patterns](agentic-patterns.md)

## Foundations

The mental model and the highest-leverage skill on top of it.

<div class="pcards">
<a class="pcard" href="ml-literacy/"><span class="t">ML Literacy</span><span class="d">Pre-LLM ML foundation: what you need before the LLM layer</span></a>
<a class="pcard" href="llm-fundamentals/"><span class="t">LLM Fundamentals</span><span class="d">Transformers, tokens, context window, temperature, sampling strategies</span></a>
<a class="pcard" href="prompt-engineering/"><span class="t">Prompt Engineering</span><span class="d">System prompts, few-shot, chain-of-thought, structured output, prompt injection</span></a>
<a class="pcard" href="working-with-llm-apis/"><span class="t">Working with LLM APIs</span><span class="d">Playground → production: SDK patterns, streaming, tools, caching</span></a>
</div>

## Retrieval & RAG

The retrieval primitive and the production pattern built on it.

<div class="pcards">
<a class="pcard" href="embeddings-vector-search/"><span class="t">Embeddings & Vector Search</span><span class="d">Embedding models, similarity metrics, HNSW, IVF, approximate nearest neighbour</span></a>
<a class="pcard" href="rag/"><span class="t">RAG (Retrieval-Augmented Generation)</span><span class="d">Chunking, retrieval pipelines, reranking, hybrid search, advanced RAG patterns</span></a>
</div>

## Agents

LLMs that act, the patterns that coordinate them, and how they remember.

<div class="pcards">
<a class="pcard" href="agents-and-tool-use/"><span class="t">Agents & Tool Use</span><span class="d">ReAct loop, function calling, planning, agent architectures</span></a>
<a class="pcard" href="agentic-patterns/"><span class="t">Agentic Patterns</span><span class="d">Orchestrator-worker, parallelization, reflection, multi-agent coordination</span></a>
<a class="pcard" href="memory-systems/"><span class="t">Memory Systems</span><span class="d">In-context, external, episodic, and semantic memory for long-running agents</span></a>
<a class="pcard" href="llm-frameworks/"><span class="t">LLM Frameworks</span><span class="d">LangChain/LangGraph landscape — start raw, adopt selectively</span></a>
</div>

## Production & Operations

Fine-tuning, serving, evaluation, safety, and operating it all.

<div class="pcards">
<a class="pcard" href="fine-tuning/"><span class="t">Fine-tuning</span><span class="d">SFT, LoRA, RLHF, DPO — when to fine-tune vs RAG vs prompting</span></a>
<a class="pcard" href="llm-inference/"><span class="t">LLM Inference & Serving</span><span class="d">KV cache, continuous batching, quantization, speculative decoding, vLLM</span></a>
<a class="pcard" href="evaluation/"><span class="t">Evaluation</span><span class="d">Evals, RAGAS, benchmarks, model-as-judge, regression testing</span></a>
<a class="pcard" href="guardrails-safety/"><span class="t">Guardrails & Safety</span><span class="d">Prompt injection, hallucination mitigation, content moderation, output validation</span></a>
<a class="pcard" href="llmops/"><span class="t">LLMOps</span><span class="d">Model versioning, cost management, observability, CI/CD for AI systems</span></a>
<a class="pcard" href="ml-in-production/"><span class="t">ML in Production</span><span class="d">Serving, monitoring, and drift for ML systems in production</span></a>
</div>

---

## Learning path for backend engineers

```
Week 1-2: Foundations
  → LLM Fundamentals
  → Prompt Engineering
  → Embeddings & Vector Search

Week 3-4: Core Patterns
  → RAG (the most common production pattern)
  → Agents & Tool Use
  → Evaluation (critical — build this early)

Week 5-6: Production Readiness
  → Guardrails & Safety
  → LLMOps
  → LLM Inference (if self-hosting)

Week 7-8: Advanced
  → Agentic Patterns
  → Memory Systems
  → Fine-tuning
```

## Key mental shifts from backend to AI engineering

| Backend mindset | AI engineering mindset |
|---|---|
| Deterministic outputs | Probabilistic outputs — same input may give different results |
| Unit test everything | Evals over distributions — no single correct answer |
| Optimize for latency | Balance latency, cost, and quality — all three move together |
| Scale by adding nodes | Scale by better prompts, RAG, or smaller models |
| Errors are exceptions | Errors are gradients — failures inform improvement |
| API contract is fixed | Model behavior shifts with every version update |
