# Agents & Tool Use

!!! info "See also"
    This page is the LLM-engineering view of agents. For the full treatment — fundamentals, multi-agent systems, reliability, and worked examples — see the [AI Agents](../agents/index.md) section.

An AI agent is a system where an LLM drives a reasoning loop — deciding what actions to take, executing them via tools, observing results, and iterating until a goal is reached. Tool use (function calling) is the mechanism that connects the LLM's reasoning to the real world.

## What makes something an "agent"?

```
Not an agent:  User → Prompt → LLM → Answer
               (single inference, no action)

Agent:         User → Goal → LLM → Action → Tool → Observation
                                  ↑__________________________|
                                  (loop until goal reached or limit hit)
```

Three defining properties:
1. **Planning** — the LLM decides what to do next
2. **Tool use** — it can take actions (API calls, DB queries, code execution)
3. **Memory** — it retains context across steps

---

## Function Calling / Tool Use

Modern LLMs natively support tool use. You declare available tools as JSON schemas; the model decides when and how to call them.

```python
from openai import OpenAI

client = OpenAI()

# Define tools as JSON schemas
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a city",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "City name, e.g. 'London'"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"]
                    }
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_docs",
            "description": "Search internal documentation",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"}
                },
                "required": ["query"]
            }
        }
    }
]

def run_tool(name: str, args: dict) -> str:
    if name == "get_weather":
        return weather_api.get(args["city"], args.get("unit", "celsius"))
    elif name == "search_docs":
        return docs_search(args["query"])
    raise ValueError(f"Unknown tool: {name}")

def agent_turn(messages: list) -> str:
    while True:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tools,
            tool_choice="auto"   # or "required" to force tool use
        )

        msg = response.choices[0].message

        # No tool call → final answer
        if not msg.tool_calls:
            return msg.content

        # Execute tool calls
        messages.append(msg)
        for tool_call in msg.tool_calls:
            result = run_tool(
                tool_call.function.name,
                json.loads(tool_call.function.arguments)
            )
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result
            })
        # Loop: LLM sees tool results and decides next action
```

---

## The ReAct Pattern

ReAct (Reasoning + Acting) is the most common agent loop pattern. The model alternates between **Thought** (reasoning) and **Action** (tool call), then observes the result.

```
Thought: I need to find the current price of AAPL stock.
Action:  search_stock_price(symbol="AAPL")
Observation: AAPL is currently trading at $189.42

Thought: Now I need the P/E ratio to assess if it's overvalued.
Action:  get_financial_metric(symbol="AAPL", metric="pe_ratio")
Observation: P/E ratio is 28.5

Thought: AAPL is trading at $189.42 with a P/E of 28.5.
         Compared to the sector average of 25, it's slightly above average.
Final Answer: AAPL trades at $189.42 with a P/E ratio of 28.5...
```

```python
REACT_SYSTEM_PROMPT = """
You are a helpful assistant with access to tools.

For each step:
1. Think about what you need to do (Thought:)
2. Choose an action (use a tool or give a final answer)
3. Observe the result and repeat

Always think before acting. Stop when you have enough information to answer.
"""
```

ReAct is the default pattern for most agent frameworks (LangChain, LlamaIndex, CrewAI).

---

## Agent architectures

### Single Agent

One LLM drives the entire task loop.

```
User → Agent (LLM + tools) → Result
```

Best for: Simple tasks, focused domains, < 10 tool calls expected.

---

### Orchestrator + Workers

An orchestrator LLM delegates sub-tasks to specialised worker agents or tools.

```
User → Orchestrator
          ↓         ↓         ↓
      Research   Writer   Fact-Checker
      Agent      Agent    Agent
          ↓         ↓         ↓
       Results  →  Orchestrator  →  Final output
```

```python
# Orchestrator decides which worker to invoke
def orchestrator(task: str) -> str:
    plan = planner_llm.plan(task)
    results = {}
    for step in plan.steps:
        if step.type == "research":
            results[step.id] = research_agent.run(step.query)
        elif step.type == "write":
            results[step.id] = writer_agent.run(step.prompt, results)
        elif step.type == "verify":
            results[step.id] = fact_check_agent.run(results[step.source_id])
    return synthesise(results)
```

Best for: Complex multi-step tasks, tasks with distinct specialisations.

---

### Plan-and-Execute

Separate planning from execution. The LLM creates a full plan upfront, then executes each step.

```
Step 1: Plan     → LLM generates [step1, step2, step3, ...]
Step 2: Execute  → run each step deterministically or with LLM
Step 3: Re-plan  → if a step fails, re-plan from that point
```

**Pros:** Predictable, inspectable, easy to interrupt and resume.
**Cons:** Brittle if early assumptions are wrong (plan created before seeing results).

---

## Tool design principles

Tools are the interface between your agent and the world. Well-designed tools dramatically improve agent performance.

### Principle 1: One tool, one job

```python
# Bad: ambiguous multi-purpose tool
def database_tool(action: str, query: str) -> str:
    """Read or write to the database."""
    ...

# Good: separate, focused tools
def search_users(name: str) -> list[dict]:
    """Search users by name. Returns list of matching user records."""
    ...

def get_user_orders(user_id: str) -> list[dict]:
    """Get all orders for a specific user ID."""
    ...
```

### Principle 2: Rich descriptions

The model decides whether to call a tool based on the description alone. Write for the LLM, not for humans.

```python
{
    "name": "search_knowledge_base",
    "description": (
        "Search the internal knowledge base for technical documentation, "
        "runbooks, and architecture decisions. Use this when the user asks "
        "about internal systems, processes, or procedures. Do NOT use this "
        "for general knowledge questions."
    ),
    ...
}
```

### Principle 3: Return structured, parseable output

```python
# Bad: unstructured string
return "User Alice (ID: 123) has 5 orders totalling $450"

# Good: structured data
return json.dumps({
    "user": {"id": 123, "name": "Alice"},
    "order_count": 5,
    "total_value": 450.00
})
```

### Principle 4: Tools must be idempotent or clearly labelled

Classify your tools by side effect severity:

```python
# Read-only — safe to retry
def search_docs(query: str) -> list: ...
def get_user(user_id: str) -> dict: ...

# Write — should require confirmation or be idempotent
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email. This action cannot be undone."""
    ...

# Destructive — add safeguards
def delete_record(record_id: str) -> str:
    """DESTRUCTIVE: permanently deletes a record. Requires confirmation."""
    ...
```

### Principle 5: Limit the tool surface area

More tools = more opportunity for the model to choose the wrong one. Give only the tools needed for the task.

```python
# For a code review agent — only code-related tools
tools = [read_file, search_codebase, run_tests, post_comment]

# NOT: send_email, create_jira_ticket, deploy_to_prod, ...
```

---

## Agent loop control

### Max iterations

Always set a hard cap on loop iterations to prevent infinite loops and runaway costs.

```python
MAX_ITERATIONS = 10

def run_agent(task: str) -> str:
    messages = [{"role": "user", "content": task}]
    for iteration in range(MAX_ITERATIONS):
        response = llm.chat(messages, tools=tools)
        if not response.tool_calls:
            return response.content   # done
        # execute tools, append results
        messages = append_tool_results(messages, response)

    return "Max iterations reached. Partial answer: ..."
```

### Timeout per step

```python
import asyncio

async def run_tool_with_timeout(name: str, args: dict, timeout: float = 10.0):
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(run_tool, name, args),
            timeout=timeout
        )
    except asyncio.TimeoutError:
        return f"Tool {name} timed out after {timeout}s"
```

### Human-in-the-loop

For high-stakes actions, pause and request human confirmation before executing.

```python
HIGH_STAKES_TOOLS = {"send_email", "delete_record", "deploy", "make_payment"}

def execute_tool_call(tool_call) -> str:
    if tool_call.function.name in HIGH_STAKES_TOOLS:
        confirmed = ask_human(
            f"Agent wants to call {tool_call.function.name} "
            f"with args: {tool_call.function.arguments}\n"
            f"Approve? (y/n)"
        )
        if not confirmed:
            return "Action cancelled by user."
    return run_tool(tool_call.function.name, tool_call.function.arguments)
```

---

## Parallel tool calls

Modern models (GPT-4o, Claude 3.5) can call multiple tools in a single response when they're independent.

```python
# Model may return multiple tool calls at once
for tool_call in response.message.tool_calls:
    # Execute all in parallel
    futures = [executor.submit(run_tool, tc.name, tc.args)
               for tc in response.message.tool_calls]
    results = [f.result() for f in futures]
```

This significantly reduces total latency for agents that need to gather multiple pieces of information.

---

## Interview / design angle

!!! tip "What comes up in AI system design"
    - *"How do you prevent an agent from running forever?"* → max iterations, per-step timeout, circuit breaker on tool errors
    - *"How do you prevent an agent from taking dangerous actions?"* → human-in-the-loop, separate read/write tools, confirmation prompts, minimal tool surface
    - *"How do you make an agent reliable?"* → structured output from tools, retry on transient failures, re-plan on step failure

## Related topics

- [Agentic Patterns](agentic-patterns.md) — multi-agent coordination patterns
- [Memory Systems](memory-systems.md) — giving agents persistent memory
- [Prompt Engineering](prompt-engineering.md) — ReAct prompts, tool descriptions
- [Guardrails & Safety](guardrails-safety.md) — keeping agents safe
- [LLMOps](llmops.md) — observability for agent traces
