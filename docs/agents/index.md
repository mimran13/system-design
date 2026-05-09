# AI Agents

A practical guide to understanding, building, and running AI agents in production. This section takes you from first principles to working end-to-end examples you can adapt and run.

## Concepts

| Topic | What you'll learn |
|---|---|
| [Agent Fundamentals](agent-fundamentals.md) | The agent loop, four core components, types of agents, when to use one |
| [Function Calling & Tool Use](function-calling.md) | How to give agents tools, tool design principles, parallel calls |

## Building

| Topic | What you'll learn |
|---|---|
| [Building Agents](building-agents.md) | Agent class from scratch, memory, structured output, framework comparison |
| [Multi-Agent Systems](multi-agent-systems.md) | Orchestrator/worker, pipelines, critic loops, CrewAI, AutoGen |
| [Agent Reliability](agent-reliability.md) | Budget limits, HITL, prompt injection defense, sandboxing, observability |

## End-to-End Examples

| Example | What it demonstrates |
|---|---|
| [Research Agent](example-research-agent.md) | Web search + synthesis → structured report. Run it in 5 minutes. |
| [Data Analysis Agent](example-data-agent.md) | Natural language → SQL + Python → insights + charts |
| [Customer Support Agent](example-customer-support-agent.md) | Order lookup, refunds, escalation to human — full conversation flow |

---

## Learning path

```
1. Agent Fundamentals     ← what an agent is and when to use one
2. Function Calling       ← how tools work (the core mechanism)
3. Building Agents        ← write your first agent from scratch
4. Run: Research Agent    ← see a real agent working end-to-end
5. Run: Data Agent        ← agents with code execution
6. Multi-Agent Systems    ← coordinate multiple agents
7. Run: Support Agent     ← agent with escalation and safety
8. Agent Reliability      ← making agents production-safe
```

---

## What you need to run the examples

```bash
pip install anthropic requests

# For research agent
export ANTHROPIC_API_KEY="sk-ant-..."
export TAVILY_API_KEY="tvly-..."    # free tier at tavily.com

# For data agent
pip install pandas matplotlib

# All examples run with Python 3.10+
```

---

## Relationship to AI Engineering

The [AI Engineering](../ai/index.md) section covers LLM concepts broadly — RAG, embeddings, fine-tuning, evaluation. This **AI Agents** section is narrowly focused on building and running agents with practical, working code. Cross-references:

- [Agentic Patterns](../ai/agentic-patterns.md) — advanced patterns (reflection, ToT, self-consistency)
- [Memory Systems](../ai/memory-systems.md) — long-term memory for agents
- [Guardrails & Safety](../ai/guardrails-safety.md) — input/output safety for agent pipelines
- [LLMOps](../ai/llmops.md) — monitoring agent costs and quality in production
