# AI Engineering

This section covers everything a backend engineer needs to design, build, and operate production AI systems — from understanding how LLMs work to building reliable agentic pipelines at scale.

## What is an AI / LLM / Agentic Engineer?

These roles overlap but have different emphasis:

| Role | Core focus |
|---|---|
| **LLM Engineer** | Integrating LLM APIs, prompt engineering, RAG pipelines, fine-tuning |
| **AI Engineer** | Full-stack AI product: models + backends + infra + evaluation |
| **Agentic Engineer** | Multi-step reasoning systems, tool use, agent orchestration |
| **ML Engineer** | Model training, data pipelines, hardware optimization (less covered here) |

As a backend engineer, your edge is **systems thinking** — you already know databases, APIs, distributed systems, and observability. AI Engineering layers LLM primitives on top of those skills.

---

## The AI Engineering stack

```
┌─────────────────────────────────────────────────────────┐
│                     Applications                         │
│         Chatbots · Copilots · Autonomous Agents          │
├─────────────────────────────────────────────────────────┤
│                  Orchestration Layer                      │
│     Agent loops · Tool routing · Memory · Planning       │
├──────────────────┬──────────────────────────────────────┤
│   Retrieval      │         LLM APIs                      │
│   Vector DBs     │   OpenAI · Anthropic · Gemini         │
│   RAG pipelines  │   Self-hosted (vLLM, Ollama)          │
├──────────────────┴──────────────────────────────────────┤
│                  Foundation Models                        │
│     GPT-4 · Claude · Gemini · Llama · Mistral            │
├─────────────────────────────────────────────────────────┤
│               Infrastructure & LLMOps                    │
│   Evals · Observability · Cost management · CI/CD        │
└─────────────────────────────────────────────────────────┘
```

---

## Topics in this section

<div class="grid cards" markdown>

-   :material-brain:{ .lg .middle } **LLM Fundamentals**

    ---

    Transformers, tokens, context window, temperature, sampling strategies

    [:octicons-arrow-right-24: Read](llm-fundamentals.md)

-   :material-comment-text-outline:{ .lg .middle } **Prompt Engineering**

    ---

    System prompts, few-shot, chain-of-thought, structured output, prompt injection

    [:octicons-arrow-right-24: Read](prompt-engineering.md)

-   :material-vector-line:{ .lg .middle } **Embeddings & Vector Search**

    ---

    Embedding models, similarity metrics, HNSW, IVF, approximate nearest neighbour

    [:octicons-arrow-right-24: Read](embeddings-vector-search.md)

-   :material-file-search-outline:{ .lg .middle } **RAG (Retrieval-Augmented Generation)**

    ---

    Chunking, retrieval pipelines, reranking, hybrid search, advanced RAG patterns

    [:octicons-arrow-right-24: Read](rag.md)

-   :material-robot-outline:{ .lg .middle } **Agents & Tool Use**

    ---

    ReAct loop, function calling, planning, agent architectures

    [:octicons-arrow-right-24: Read](agents-and-tool-use.md)

-   :material-graph-outline:{ .lg .middle } **Agentic Patterns**

    ---

    Orchestrator-worker, parallelization, reflection, multi-agent coordination

    [:octicons-arrow-right-24: Read](agentic-patterns.md)

-   :material-memory:{ .lg .middle } **Memory Systems**

    ---

    In-context, external, episodic, and semantic memory for long-running agents

    [:octicons-arrow-right-24: Read](memory-systems.md)

-   :material-tune:{ .lg .middle } **Fine-tuning**

    ---

    SFT, LoRA, RLHF, DPO — when to fine-tune vs RAG vs prompting

    [:octicons-arrow-right-24: Read](fine-tuning.md)

-   :material-server-outline:{ .lg .middle } **LLM Inference & Serving**

    ---

    KV cache, continuous batching, quantization, speculative decoding, vLLM

    [:octicons-arrow-right-24: Read](llm-inference.md)

-   :material-clipboard-check-outline:{ .lg .middle } **Evaluation**

    ---

    Evals, RAGAS, benchmarks, model-as-judge, regression testing

    [:octicons-arrow-right-24: Read](evaluation.md)

-   :material-shield-alert-outline:{ .lg .middle } **Guardrails & Safety**

    ---

    Prompt injection, hallucination mitigation, content moderation, output validation

    [:octicons-arrow-right-24: Read](guardrails-safety.md)

-   :material-wrench-outline:{ .lg .middle } **LLMOps**

    ---

    Model versioning, cost management, observability, CI/CD for AI systems

    [:octicons-arrow-right-24: Read](llmops.md)

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
