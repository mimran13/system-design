# AI Agent Fundamentals

An AI agent is a system that perceives its environment, reasons about what to do, takes actions, and iterates until it achieves a goal. Unlike a single LLM call (input → output), an agent runs in a loop: it can use tools, observe results, and decide what to do next — autonomously.

---

## The agent loop

The simplest mental model:

```
┌─────────────────────────────────────────────────────┐
│                    Agent Loop                       │
│                                                     │
│   Goal/Task                                         │
│       ↓                                             │
│   [Think] → What should I do next?                  │
│       ↓                                             │
│   [Act]   → Call a tool, write code, search web     │
│       ↓                                             │
│   [Observe] → What did that return?                 │
│       ↓                                             │
│   [Think] → Did I achieve the goal?                 │
│       ↓           ↓                                 │
│   [Act again]   [Done → Return answer]              │
└─────────────────────────────────────────────────────┘
```

This Think → Act → Observe cycle is called **ReAct** (Reasoning + Acting). The agent maintains a running context of the conversation, tool results, and its own reasoning — and loops until the task is complete.

```python
# Pseudocode of the agent loop
def run_agent(goal: str, tools: list[Tool]) -> str:
    messages = [{"role": "user", "content": goal}]

    while True:
        response = llm.call(messages, tools=tools)

        if response.stop_reason == "end_turn":
            return response.text   # agent decided it's done

        if response.stop_reason == "tool_use":
            # Execute the tool(s) the agent called
            tool_results = []
            for tool_call in response.tool_calls:
                result = execute_tool(tool_call.name, tool_call.inputs)
                tool_results.append({"tool_use_id": tool_call.id, "content": result})

            # Feed results back to the agent
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})
            # Loop continues...
```

---

## Four core components

Every agent has these building blocks:

```
┌─────────────────────────────────────────────────────┐
│                     Agent                           │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   │
│  │  Memory  │   │  Tools   │   │   Planning   │   │
│  │          │   │          │   │              │   │
│  │ Context  │   │ Search   │   │ ReAct / CoT  │   │
│  │ Chat hist│   │ Code exec│   │ Reflection   │   │
│  │ Vector DB│   │ APIs     │   │ Self-critique│   │
│  └──────────┘   └──────────┘   └──────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │               LLM (Brain)                   │   │
│  │  Reads memory + tool results → decides       │   │
│  │  what to do next                             │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 1. Memory

| Type | What it stores | Duration | Implementation |
|---|---|---|---|
| **Working memory** | Current conversation + tool results | Single run | LLM context window |
| **Episodic memory** | Past conversations and outcomes | Long-term | Vector database |
| **Semantic memory** | Domain knowledge, facts | Long-term | RAG / vector search |
| **Procedural memory** | How to perform tasks | Long-term | System prompt, fine-tuning |

### 2. Tools

What the agent can do beyond text generation:
- **Information retrieval** — web search, vector search, SQL queries
- **Code execution** — run Python, shell commands
- **External APIs** — send email, create tickets, call REST APIs
- **File I/O** — read/write files
- **Browser** — navigate web pages, click, fill forms

### 3. Planning

How the agent decides what to do next:
- **ReAct** — Reason then Act, interleaved in a single response
- **Chain of Thought** — think step-by-step before acting
- **Reflection** — critique own output and improve
- **Tree of Thought** — explore multiple reasoning paths

### 4. The LLM

The brain. It reads the full context (memory + tool results) and decides:
- What tool to call next
- Whether the task is complete
- How to format the final answer

---

## Types of agents

### Reflex agent
No memory, reacts to current input only. Simplest form.
```
Input → [LLM + tools] → Output
```
Use case: Single-turn classification, extraction, simple Q&A.

### Conversational agent
Maintains conversation history. Can ask clarifying questions.
```
Input + History → [LLM + tools] → Output + Updated history
```
Use case: Customer support, tutoring, multi-turn assistants.

### Autonomous agent
Given a goal, plans and executes multi-step tasks independently.
```
Goal → [Plan → Execute → Observe → Revise] loop → Final result
```
Use case: Research assistant, code generation, data analysis.

### Multi-agent system
Multiple specialized agents collaborate, coordinated by an orchestrator.
```
Task → [Orchestrator] → [Agent A] [Agent B] [Agent C] → [Orchestrator] → Result
```
Use case: Complex workflows, parallel processing, specialized expertise.

---

## What makes an agent different from a chatbot

| | Chatbot | Agent |
|---|---|---|
| Execution | Single LLM call | Multiple LLM calls in a loop |
| Actions | Text only | Real-world actions via tools |
| Autonomy | Reactive | Proactive — pursues goals |
| Memory | Optional conversation history | Working + long-term memory |
| Duration | Milliseconds | Seconds to minutes (or longer) |
| Errors | None (just text) | Real consequences — must handle failures |

---

## The context window is the agent's workspace

Everything the agent knows at any moment lives in the context window: the original goal, conversation history, tool call results, and its own prior reasoning.

```
Context window (200K tokens for Claude):
  ├── System prompt (instructions, persona, tools)
  ├── Original task/goal
  ├── Tool call 1 → result 1
  ├── Tool call 2 → result 2
  ├── Agent reasoning (CoT)
  └── ... up to context limit
```

**Context management is a core engineering concern:**
- Summarize old steps when context grows large
- Use RAG to store/retrieve long-term context
- Prune irrelevant tool results

---

## When to use an agent

Not everything needs an agent. Use the simplest approach that works.

| Approach | When to use |
|---|---|
| Single LLM call | Fixed task, input → output, no external data needed |
| LLM + retrieval (RAG) | Need current or domain-specific information |
| LLM + one tool call | Simple lookup — get weather, query DB once |
| Agent (multi-step) | Open-ended goal requiring multiple steps, decisions, and tools |
| Multi-agent | Task naturally decomposes into parallel or specialized subtasks |

**Agents add complexity** — latency (multiple LLM calls), cost (more tokens), and failure modes. Don't use an agent when a prompt + one tool call is sufficient.

---

## Interview / design angle

!!! tip "Agents in system design"
    - *"What is an AI agent?"* → A system that runs an LLM in a loop with access to tools, memory, and planning — iterating until it completes a goal.
    - *"How is an agent different from just calling an LLM?"* → Agents have autonomy — they can decide to call multiple tools, observe results, revise their approach. A single LLM call is reactive; an agent is proactive.
    - *"What's the hardest part of building agents?"* → Reliability — agents can get stuck in loops, call wrong tools, hallucinate tool inputs, or run up cost. Production agents need timeouts, budget limits, human-in-the-loop checkpoints, and robust error handling.

## Related topics

- [Function Calling & Tool Use](function-calling.md) — how to give agents tools
- [Planning & Reasoning](../ai/agents-and-tool-use.md) — ReAct, CoT, reflection
- [Building Agents](building-agents.md) — practical implementation
- [Multi-Agent Systems](multi-agent-systems.md) — coordinating multiple agents
- [Agent Reliability](agent-reliability.md) — production safety
