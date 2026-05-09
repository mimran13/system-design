# Function Calling & Tool Use

Function calling is the mechanism that turns an LLM into an agent. Instead of just generating text, the model can decide to call a function — and your code executes it, feeds the result back, and the model continues reasoning.

---

## How function calling works

```
1. You describe available tools (name, description, parameters) in the API request
2. The LLM decides whether to call a tool based on the task
3. If yes: the model returns a structured tool call (name + arguments)
4. Your code executes the actual function
5. You return the result to the model
6. The model continues with that information
```

```
User: "What's the weather in London and should I bring an umbrella?"

LLM thinks: I need weather data → call get_weather("London")
  ↓
Your code calls weather API → {"temp": 12, "condition": "rainy", "humidity": 90}
  ↓
LLM sees result → generates: "It's 12°C and rainy in London. Yes, bring an umbrella."
```

---

## Defining tools with the Anthropic SDK

Tools are described as JSON schemas. The model learns what each tool does from the description — write them clearly.

```python
import anthropic

client = anthropic.Anthropic()

tools = [
    {
        "name": "get_weather",
        "description": "Get current weather for a city. Returns temperature, conditions, and humidity.",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "The city name, e.g. 'London' or 'New York'"
                },
                "units": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"],
                    "description": "Temperature units. Defaults to celsius."
                }
            },
            "required": ["city"]
        }
    },
    {
        "name": "search_web",
        "description": "Search the web for recent information. Use when you need current data not in your training.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                },
                "num_results": {
                    "type": "integer",
                    "description": "Number of results to return (1-10). Default: 5"
                }
            },
            "required": ["query"]
        }
    }
]
```

---

## Handling tool calls: the full loop

```python
import anthropic
import json

client = anthropic.Anthropic()

# Tool implementations
def get_weather(city: str, units: str = "celsius") -> dict:
    # In production: call a real weather API
    return {"city": city, "temp": 12, "condition": "rainy", "humidity": 85, "units": units}

def search_web(query: str, num_results: int = 5) -> list[dict]:
    # In production: call Brave/Serper/Tavily API
    return [{"title": f"Result for {query}", "snippet": "...", "url": "https://..."}]

# Map tool names to functions
TOOLS = {
    "get_weather": get_weather,
    "search_web": search_web,
}

def run_with_tools(user_message: str, system: str = None) -> str:
    messages = [{"role": "user", "content": user_message}]

    while True:
        kwargs = {"model": "claude-opus-4-6", "max_tokens": 4096, "tools": tools, "messages": messages}
        if system:
            kwargs["system"] = system

        response = client.messages.create(**kwargs)

        # Model finished — return the text
        if response.stop_reason == "end_turn":
            return next(b.text for b in response.content if hasattr(b, "text"))

        # Model wants to call tools
        if response.stop_reason == "tool_use":
            # Add assistant's response (including tool call) to history
            messages.append({"role": "assistant", "content": response.content})

            # Execute each tool call
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    print(f"  → Calling {block.name}({json.dumps(block.input)})")
                    
                    try:
                        result = TOOLS[block.name](**block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result)
                        })
                    except Exception as e:
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": f"Error: {str(e)}",
                            "is_error": True
                        })

            # Feed results back to the model
            messages.append({"role": "user", "content": tool_results})

# Usage
result = run_with_tools("What's the weather in London? Should I bring an umbrella?")
print(result)
```

---

## Parallel tool calls

Claude can call multiple tools simultaneously when they're independent. This reduces latency significantly.

```python
# The model might respond with multiple tool calls at once:
# block 1: tool_use → get_weather("London")
# block 2: tool_use → get_weather("Paris")

# Handle all of them before returning results
tool_results = []
for block in response.content:
    if block.type == "tool_use":
        result = TOOLS[block.name](**block.input)
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": json.dumps(result)
        })

# All results in a single user turn
messages.append({"role": "user", "content": tool_results})
```

For CPU-intensive or slow tools, run them in parallel:

```python
import asyncio

async def execute_tools_parallel(tool_calls):
    tasks = [execute_tool_async(tc.name, tc.input) for tc in tool_calls]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return results
```

---

## Tool design principles

### 1. Write descriptions as if training someone

The model only knows what a tool does from its description. Be specific.

```python
# BAD: vague
{"name": "query", "description": "Run a query"}

# GOOD: specific about what, when, and what it returns
{
    "name": "execute_sql",
    "description": (
        "Execute a read-only SQL SELECT query against the analytics database. "
        "Use for aggregations, filters, and joins on sales, users, and product tables. "
        "Returns rows as a list of dicts. Limit results to 100 rows unless asked otherwise. "
        "Do NOT use for INSERT/UPDATE/DELETE."
    ),
    ...
}
```

### 2. Return structured, parseable results

```python
# BAD: free-form string the LLM has to parse
def get_user(user_id: str) -> str:
    return f"User Alice, email alice@example.com, joined 2023-01-15"

# GOOD: structured dict
def get_user(user_id: str) -> dict:
    return {
        "id": user_id,
        "name": "Alice",
        "email": "alice@example.com",
        "created_at": "2023-01-15",
        "status": "active"
    }
```

### 3. Fail informatively

```python
def get_order(order_id: str) -> dict:
    order = db.find(order_id)
    if not order:
        # Return a helpful error — don't raise an exception that kills the agent
        return {"error": f"Order {order_id} not found. Check the order ID and try again."}
    return order.to_dict()
```

### 4. Make tools idempotent where possible

The model may call a tool twice (retry after error). Safe re-execution prevents duplicate side effects.

```python
def send_email(to: str, subject: str, body: str, idempotency_key: str = None) -> dict:
    if idempotency_key and email_already_sent(idempotency_key):
        return {"status": "already_sent", "idempotency_key": idempotency_key}
    # send...
```

### 5. Limit blast radius

Don't give agents more permissions than they need.

```python
# READ-ONLY tools for exploration
# WRITE tools only when the task requires it
# DESTRUCTIVE tools (delete, send) with confirmation step

def delete_record(record_id: str, confirmed: bool = False) -> dict:
    if not confirmed:
        return {
            "status": "confirmation_required",
            "message": f"About to delete record {record_id}. Call again with confirmed=True to proceed."
        }
    db.delete(record_id)
    return {"status": "deleted", "record_id": record_id}
```

---

## Common tool patterns

### Calculator / code executor

```python
{
    "name": "run_python",
    "description": "Execute Python code in a sandbox and return the output. Use for calculations, data processing, and analysis. Code has access to numpy, pandas, and matplotlib.",
    "input_schema": {
        "type": "object",
        "properties": {
            "code": {"type": "string", "description": "Python code to execute"}
        },
        "required": ["code"]
    }
}

def run_python(code: str) -> dict:
    import subprocess
    result = subprocess.run(
        ["python", "-c", code],
        capture_output=True, text=True, timeout=10
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode
    }
```

### Knowledge retrieval

```python
{
    "name": "search_knowledge_base",
    "description": "Search internal documentation and knowledge base. Use when asked about company policies, product specs, or internal processes.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "top_k": {"type": "integer", "description": "Number of results (1-10)"}
        },
        "required": ["query"]
    }
}
```

### Database query

```python
{
    "name": "query_database",
    "description": "Run a read-only SQL query against the customer database. Tables: customers (id, name, email, plan), orders (id, customer_id, total, status, created_at), products (id, name, price, category).",
    "input_schema": {
        "type": "object",
        "properties": {
            "sql": {"type": "string", "description": "SQL SELECT statement only"}
        },
        "required": ["sql"]
    }
}
```

---

## Forcing or preventing tool use

```python
# Force a specific tool call
response = client.messages.create(
    model="claude-opus-4-6",
    tools=tools,
    tool_choice={"type": "tool", "name": "get_weather"},   # must use this tool
    messages=messages
)

# Force any tool call
response = client.messages.create(
    tool_choice={"type": "any"},   # must call at least one tool
    ...
)

# Default: model decides
response = client.messages.create(
    tool_choice={"type": "auto"},  # default
    ...
)
```

---

## Related topics

- [Agent Fundamentals](agent-fundamentals.md) — the agent loop and components
- [Building Agents](building-agents.md) — putting it all together
- [Example: Research Agent](example-research-agent.md) — search + synthesis in action
- [Agent Reliability](agent-reliability.md) — handling tool errors gracefully
