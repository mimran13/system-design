# Building Agents

This page walks through building agents from scratch, then covers popular frameworks so you can choose the right abstraction for your use case.

---

## From scratch: a reusable Agent class

A clean, extensible agent you can build on:

```python
import json
import time
from dataclasses import dataclass, field
from typing import Callable, Any
import anthropic

@dataclass
class Tool:
    name: str
    description: str
    input_schema: dict
    fn: Callable

    def to_api_format(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema
        }


@dataclass
class AgentConfig:
    model: str = "claude-opus-4-6"
    system: str = "You are a helpful assistant. Use available tools to complete tasks."
    max_iterations: int = 20
    max_tokens: int = 4096
    temperature: float = 1.0


class Agent:
    def __init__(self, tools: list[Tool], config: AgentConfig = None):
        self.tools = {t.name: t for t in tools}
        self.config = config or AgentConfig()
        self.client = anthropic.Anthropic()
        self._iteration = 0

    def run(self, task: str, messages: list[dict] = None) -> str:
        """Run the agent on a task. Returns the final text response."""
        messages = messages or []
        messages.append({"role": "user", "content": task})
        self._iteration = 0

        while self._iteration < self.config.max_iterations:
            self._iteration += 1
            print(f"\n[Iteration {self._iteration}]")

            response = self.client.messages.create(
                model=self.config.model,
                system=self.config.system,
                max_tokens=self.config.max_tokens,
                tools=[t.to_api_format() for t in self.tools.values()],
                messages=messages
            )

            if response.stop_reason == "end_turn":
                text = next((b.text for b in response.content if hasattr(b, "text")), "")
                print(f"[Done] {text[:100]}...")
                return text

            if response.stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": response.content})
                tool_results = self._execute_tool_calls(response.content)
                messages.append({"role": "user", "content": tool_results})

        raise RuntimeError(f"Agent exceeded max iterations ({self.config.max_iterations})")

    def _execute_tool_calls(self, content_blocks) -> list[dict]:
        results = []
        for block in content_blocks:
            if block.type != "tool_use":
                continue
            tool = self.tools.get(block.name)
            if not tool:
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"Error: Unknown tool '{block.name}'",
                    "is_error": True
                })
                continue

            print(f"  → {block.name}({json.dumps(block.input, indent=None)[:80]})")
            try:
                result = tool.fn(**block.input)
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result) if not isinstance(result, str) else result
                })
            except Exception as e:
                print(f"  ✗ Tool error: {e}")
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"Tool error: {str(e)}. Please try a different approach.",
                    "is_error": True
                })
        return results
```

### Using it

```python
import requests

# Define tools
def web_search(query: str, num_results: int = 5) -> list[dict]:
    """Real implementation would call Brave, Serper, or Tavily API"""
    response = requests.get(
        "https://api.tavily.com/search",
        json={"query": query, "max_results": num_results},
        headers={"Authorization": f"Bearer {TAVILY_API_KEY}"}
    )
    return response.json()["results"]

def calculate(expression: str) -> dict:
    """Safe math evaluation"""
    import ast, operator
    allowed = {ast.Add: operator.add, ast.Sub: operator.sub,
               ast.Mult: operator.mul, ast.Div: operator.truediv}
    # ... safe eval logic
    return {"result": eval(expression), "expression": expression}

search_tool = Tool(
    name="web_search",
    description="Search the web for current information. Use for facts, news, and research.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "num_results": {"type": "integer"}
        },
        "required": ["query"]
    },
    fn=web_search
)

calc_tool = Tool(
    name="calculate",
    description="Evaluate mathematical expressions. Use for any arithmetic or calculations.",
    input_schema={
        "type": "object",
        "properties": {"expression": {"type": "string"}},
        "required": ["expression"]
    },
    fn=calculate
)

# Create and run the agent
agent = Agent(
    tools=[search_tool, calc_tool],
    config=AgentConfig(
        system="You are a research assistant. Be thorough and cite your sources.",
        max_iterations=10
    )
)

result = agent.run("What is the current market cap of Apple and how does it compare to its revenue last year?")
print(result)
```

---

## Adding memory

### Short-term: persistent conversation

```python
class ConversationalAgent(Agent):
    def __init__(self, tools, config=None):
        super().__init__(tools, config)
        self.history: list[dict] = []

    def chat(self, message: str) -> str:
        result = self.run(message, messages=list(self.history))
        # Save conversation history
        self.history.append({"role": "user", "content": message})
        self.history.append({"role": "assistant", "content": result})
        return result

    def reset(self):
        self.history.clear()

# Usage
agent = ConversationalAgent(tools=[...])
print(agent.chat("What's the population of France?"))
print(agent.chat("How does that compare to Germany?"))  # agent remembers France context
print(agent.chat("Which one has higher GDP per capita?"))
```

### Long-term: RAG-based memory

```python
from sentence_transformers import SentenceTransformer
import numpy as np

class MemoryStore:
    def __init__(self):
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        self.memories: list[dict] = []  # In production: use Chroma/Pinecone

    def add(self, text: str, metadata: dict = None):
        embedding = self.model.encode(text)
        self.memories.append({"text": text, "embedding": embedding, "metadata": metadata or {}})

    def search(self, query: str, top_k: int = 3) -> list[str]:
        if not self.memories:
            return []
        query_emb = self.model.encode(query)
        scores = [np.dot(query_emb, m["embedding"]) for m in self.memories]
        top_indices = np.argsort(scores)[::-1][:top_k]
        return [self.memories[i]["text"] for i in top_indices]
```

---

## Structured output from agents

For agents that must return machine-readable data:

```python
import json
from pydantic import BaseModel

class ResearchReport(BaseModel):
    title: str
    summary: str
    key_findings: list[str]
    sources: list[str]
    confidence: float  # 0-1

def research_agent_structured(topic: str) -> ResearchReport:
    # Use a final "format_output" tool to enforce structure
    format_tool = Tool(
        name="format_output",
        description="Call this when you have gathered enough information to produce the final report. Pass all findings to this tool.",
        input_schema={
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string"},
                "key_findings": {"type": "array", "items": {"type": "string"}},
                "sources": {"type": "array", "items": {"type": "string"}},
                "confidence": {"type": "number"}
            },
            "required": ["title", "summary", "key_findings", "sources", "confidence"]
        },
        fn=lambda **kwargs: kwargs  # just return the inputs as the result
    )

    captured_output = {}

    def capture_format(**kwargs):
        captured_output.update(kwargs)
        return "Output formatted successfully."

    format_tool.fn = capture_format

    agent = Agent(tools=[search_tool, format_tool])
    agent.run(f"Research this topic thoroughly and format your findings: {topic}")

    return ResearchReport(**captured_output)
```

---

## Frameworks comparison

You don't always need to build from scratch. Here's when to use each framework.

### LangChain

The most widely used framework. Good for rapid prototyping.

```python
from langchain_anthropic import ChatAnthropic
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate

@tool
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    return f"It's 15°C and partly cloudy in {city}"

llm = ChatAnthropic(model="claude-opus-4-6")
tools = [get_weather]

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=10)

result = executor.invoke({"input": "What's the weather in Tokyo?"})
print(result["output"])
```

**Pros:** Huge ecosystem, many integrations, good for quick builds  
**Cons:** Heavy abstraction, hard to debug, over-engineered for simple cases

### LlamaIndex (for RAG-heavy agents)

Best when your agent primarily needs to reason over documents.

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from llama_index.core.agent import ReActAgent
from llama_index.core.tools import QueryEngineTool
from llama_index.llms.anthropic import Anthropic

# Build a knowledge base from documents
documents = SimpleDirectoryReader("./docs").load_data()
index = VectorStoreIndex.from_documents(documents)

# Wrap it as a tool
query_tool = QueryEngineTool.from_defaults(
    query_engine=index.as_query_engine(),
    name="company_docs",
    description="Search company documentation for policies, procedures, and product info."
)

llm = Anthropic(model="claude-opus-4-6")
agent = ReActAgent.from_tools([query_tool], llm=llm, verbose=True)

response = agent.chat("What is our refund policy for enterprise customers?")
```

**Best for:** Document-heavy agents, RAG pipelines, knowledge bases

### Pydantic AI (type-safe, minimal)

Great for production agents where you care about type safety and testability.

```python
from pydantic_ai import Agent
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic import BaseModel

class WeatherResult(BaseModel):
    temperature: float
    condition: str
    recommendation: str

model = AnthropicModel("claude-opus-4-6")
agent = Agent(model, result_type=WeatherResult, system_prompt="You give weather advice.")

@agent.tool_plain
def get_weather(city: str) -> dict:
    """Get weather for a city"""
    return {"temperature": 15.0, "condition": "rainy"}

result = agent.run_sync("Should I bring an umbrella in London today?")
print(result.data)   # WeatherResult(temperature=15.0, condition='rainy', recommendation='Yes...')
```

**Best for:** Type-safe agents, testable code, production services

### When to use what

| Framework | Best for |
|---|---|
| **Raw API (scratch)** | Full control, learning, custom behavior |
| **LangChain** | Quick prototypes, many integrations needed |
| **LlamaIndex** | Document/RAG-heavy agents |
| **Pydantic AI** | Production, type safety, testability |
| **AutoGen** | Multi-agent conversations |
| **CrewAI** | Multi-agent teams with roles |

---

## Agent system prompt patterns

The system prompt shapes everything. Common patterns:

```python
# Structured thinking prompt
SYSTEM = """You are a research assistant with access to web search and calculation tools.

When given a task:
1. Break it down into steps
2. Use tools to gather information — don't rely on memory for facts
3. Verify important claims with multiple sources
4. Synthesize findings into a clear, structured answer

Always cite your sources. If uncertain, say so."""

# Role-based prompt
SYSTEM = """You are a senior financial analyst assistant. You help users understand financial data.

Your approach:
- Always retrieve current data before answering (never guess numbers)
- Express uncertainty clearly
- Recommend consulting a financial advisor for investment decisions
- Format numbers clearly: use commas for thousands, show units

You have access to: stock_price, financial_statements, news_search"""

# Minimal/focused prompt
SYSTEM = "You are a Python coding assistant. Write clean, well-documented code. Test your solutions before presenting them."
```

---

## Related topics

- [Function Calling](function-calling.md) — deep dive on tools
- [Multi-Agent Systems](multi-agent-systems.md) — multiple agents working together
- [Agent Reliability](agent-reliability.md) — production safety
- [Example: Research Agent](example-research-agent.md) — full working example
- [Example: Data Agent](example-data-agent.md) — full working example
