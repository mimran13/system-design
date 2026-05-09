# Multi-Agent Systems

A single agent can handle most tasks. But some problems are too large for one context window, benefit from parallelism, or need specialized expertise. Multi-agent systems coordinate multiple agents to solve these problems.

---

## Why multi-agent?

```
Single agent limits:
  - Context window: can only hold ~200K tokens at once
  - Serialization: one step at a time
  - Generalism: one agent trying to be expert at everything
  - Single point of failure: one model, one failure mode

Multi-agent solutions:
  - Parallelism: multiple agents work simultaneously
  - Specialization: each agent is an expert at one thing
  - Long tasks: agents hand off state between them
  - Quality: one agent checks another's work
```

---

## Core patterns

### Orchestrator / Worker

An orchestrator breaks down a task and delegates to specialized workers. Workers report back; the orchestrator synthesizes results.

```
User: "Write a market analysis report for the EV industry"

Orchestrator
  ├─→ Research Agent: "Find recent EV market data and trends"
  ├─→ Competitor Agent: "Analyze top 5 EV manufacturers"
  ├─→ Financial Agent: "Pull revenue and growth figures"
  └─→ [Synthesizes all results into final report]
```

```python
import anthropic
import json
from concurrent.futures import ThreadPoolExecutor

client = anthropic.Anthropic()

def run_worker(role: str, task: str, tools: list = None) -> str:
    """Run a specialized worker agent"""
    system = f"You are a specialized {role}. Focus only on your area of expertise."
    messages = [{"role": "user", "content": task}]
    
    while True:
        response = client.messages.create(
            model="claude-opus-4-6",
            system=system,
            max_tokens=2048,
            tools=tools or [],
            messages=messages
        )
        if response.stop_reason == "end_turn":
            return next(b.text for b in response.content if hasattr(b, "text"))
        if response.stop_reason == "tool_use":
            # handle tool calls...
            pass


def orchestrator(task: str) -> str:
    """Break task into subtasks, run workers in parallel, synthesize"""
    
    # Step 1: Orchestrator plans
    plan_response = client.messages.create(
        model="claude-opus-4-6",
        system="You are a project orchestrator. Break complex tasks into parallel subtasks.",
        max_tokens=1024,
        messages=[{"role": "user", "content": f"Break this into 3-5 parallel subtasks: {task}"}]
    )
    plan = plan_response.content[0].text

    # Step 2: Parse subtasks (in production: use structured output)
    subtasks = [
        ("market research analyst", "Find current EV market size, growth rate, and key trends"),
        ("competitive intelligence analyst", "Analyze Tesla, BYD, GM, Ford, and Volkswagen EV strategies"),
        ("financial analyst", "Pull revenue, margins, and investment figures for top EV companies"),
    ]

    # Step 3: Run workers in parallel
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(run_worker, role, worker_task): role
            for role, worker_task in subtasks
        }
        results = {}
        for future in futures:
            role = futures[future]
            results[role] = future.result()

    # Step 4: Orchestrator synthesizes
    synthesis_input = "\n\n".join([f"## {role}\n{result}" for role, result in results.items()])
    final = client.messages.create(
        model="claude-opus-4-6",
        system="You are a senior analyst. Synthesize the following research into a coherent report.",
        max_tokens=4096,
        messages=[{"role": "user", "content": f"Synthesize into a final report:\n\n{synthesis_input}"}]
    )
    return final.content[0].text
```

### Pipeline (Sequential)

Each agent's output is the next agent's input. Good for multi-stage transformation.

```
Input → [Researcher] → [Fact Checker] → [Writer] → [Editor] → Output

Or for code:
Spec → [Designer] → [Coder] → [Reviewer] → [Tester] → Final Code
```

```python
def pipeline(task: str, stages: list[tuple[str, str]]) -> str:
    """
    stages: list of (agent_role, prompt_template)
    Each agent receives the previous output as input
    """
    current_output = task
    
    for role, prompt_template in stages:
        prompt = prompt_template.format(input=current_output)
        current_output = run_worker(role, prompt)
        print(f"[{role}] complete")
    
    return current_output

# Usage
result = pipeline(
    task="Write an article about quantum computing",
    stages=[
        ("research analyst", "Research key facts about quantum computing: {input}"),
        ("technical writer", "Write a clear article using this research: {input}"),
        ("editor", "Edit this article for clarity and accuracy: {input}"),
    ]
)
```

### Critic / Evaluator

One agent generates, another reviews. Loop until quality threshold is met.

```
Generator → [Draft] → Critic → [Score + Feedback]
   ↑                                    |
   └──── revise based on feedback ──────┘
         (repeat until score > threshold)
```

```python
def generate_with_critic(task: str, iterations: int = 3) -> str:
    draft = run_worker("writer", task)
    
    for i in range(iterations):
        # Critic evaluates the draft
        critique = run_worker(
            "critic",
            f"""Review this draft for accuracy, clarity, and completeness.
Score it 1-10 and list specific improvements needed.

Draft:
{draft}"""
        )
        
        # Parse score (simple heuristic)
        if "score: 9" in critique.lower() or "score: 10" in critique.lower():
            break  # good enough
        
        # Revise based on feedback
        draft = run_worker(
            "writer",
            f"""Improve this draft based on the critique below.

Original draft:
{draft}

Critique and feedback:
{critique}"""
        )
    
    return draft
```

---

## Building with CrewAI

CrewAI provides a high-level framework for role-based multi-agent systems.

```python
from crewai import Agent, Task, Crew
from crewai_tools import SerperDevTool, WebsiteSearchTool

search_tool = SerperDevTool()

# Define specialized agents
researcher = Agent(
    role="Market Research Analyst",
    goal="Find accurate, up-to-date market information",
    backstory="Expert at gathering and analyzing market data with 10 years in the industry.",
    tools=[search_tool],
    llm="claude-opus-4-6",
    verbose=True,
    max_iter=5
)

writer = Agent(
    role="Business Report Writer",
    goal="Write clear, compelling business reports",
    backstory="Experienced business writer who turns complex data into clear narratives.",
    llm="claude-opus-4-6",
    verbose=True
)

# Define tasks
research_task = Task(
    description="Research the current state of the EV market: size, growth, key players, trends.",
    agent=researcher,
    expected_output="A detailed research brief with data and sources."
)

writing_task = Task(
    description="Write a 500-word executive summary of the EV market using the research brief.",
    agent=writer,
    expected_output="A polished executive summary ready for C-suite readers.",
    context=[research_task]  # depends on research_task output
)

# Assemble and run the crew
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    verbose=True,
    process="sequential"  # or "hierarchical" for orchestrator pattern
)

result = crew.kickoff()
print(result)
```

---

## Building with AutoGen

AutoGen specializes in multi-agent conversations — agents talk to each other.

```python
import autogen

config = {
    "config_list": [{"model": "claude-opus-4-6", "api_key": "..."}]
}

# Agents that talk to each other
user_proxy = autogen.UserProxyAgent(
    name="User",
    human_input_mode="NEVER",  # fully autonomous
    max_consecutive_auto_reply=10,
    code_execution_config={"work_dir": "coding", "use_docker": False}
)

assistant = autogen.AssistantAgent(
    name="Assistant",
    llm_config=config,
    system_message="You are a helpful Python programmer."
)

critic = autogen.AssistantAgent(
    name="CodeReviewer",
    llm_config=config,
    system_message="You review code for bugs, security issues, and best practices."
)

# Group chat — all agents collaborate
groupchat = autogen.GroupChat(
    agents=[user_proxy, assistant, critic],
    messages=[],
    max_round=10
)
manager = autogen.GroupChatManager(groupchat=groupchat, llm_config=config)

# Initiate the conversation
user_proxy.initiate_chat(
    manager,
    message="Write a Python function that finds the top 5 most frequent words in a text file."
)
```

---

## State management between agents

Agents need to share state. Common patterns:

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class SharedContext:
    """Shared state passed between agents in a pipeline"""
    original_task: str
    artifacts: dict[str, Any] = field(default_factory=dict)  # outputs from each stage
    messages: list[str] = field(default_factory=list)         # agent-to-agent communication
    metadata: dict = field(default_factory=dict)

    def add_artifact(self, key: str, value: Any):
        self.artifacts[key] = value

    def get_artifact(self, key: str) -> Any:
        return self.artifacts.get(key)

# Pipeline with shared context
def run_pipeline(task: str) -> str:
    ctx = SharedContext(original_task=task)

    # Stage 1: Research
    research = run_worker("researcher", task)
    ctx.add_artifact("research", research)

    # Stage 2: Analysis (uses research)
    analysis = run_worker("analyst",
        f"Analyze this research: {ctx.get_artifact('research')}")
    ctx.add_artifact("analysis", analysis)

    # Stage 3: Report (uses both)
    report = run_worker("writer",
        f"Write a report. Research: {ctx.get_artifact('research')}\n"
        f"Analysis: {ctx.get_artifact('analysis')}")
    
    return report
```

---

## When to use multi-agent

| Scenario | Approach |
|---|---|
| Task fits in context window | Single agent |
| Task needs parallel research | Orchestrator + parallel workers |
| Task has quality requirements | Generator + critic loop |
| Task has distinct stages | Sequential pipeline |
| Task needs specialized expertise | Specialist agents |
| Task exceeds context window | Chunked handoff between agents |

**Anti-patterns:**
- Don't add agents for their own sake — each agent adds latency and cost
- Don't have agents talk to each other if one agent with the right tools suffices
- Don't make agents too specialized — the coordination overhead may exceed the benefit

---

## Cost and latency

Multi-agent systems multiply costs. Plan for it.

```
Single agent: 1 LLM call × cost per call
3 parallel workers + 1 orchestrator: 4 LLM calls × cost per call (but faster)
Pipeline with 5 stages: 5 sequential LLM calls × cost per call (slower)

Approximate costs (claude-opus-4-6, ~2K tokens per call):
  Single call:        $0.03
  3-worker parallel:  $0.12  (4× cost, ~same wall time)
  5-stage pipeline:   $0.15  (5× cost, 5× wall time)
```

Budget controls:

```python
class BudgetedOrchestrator:
    def __init__(self, max_cost_usd: float = 1.0):
        self.max_cost = max_cost_usd
        self.spent = 0.0

    def run_worker(self, role: str, task: str) -> str:
        if self.spent >= self.max_cost:
            raise BudgetExceeded(f"Budget ${self.max_cost} exhausted")
        
        response = # ... call agent
        cost = self._estimate_cost(response.usage)
        self.spent += cost
        return response
    
    def _estimate_cost(self, usage) -> float:
        # claude-opus-4-6: $15/M input, $75/M output
        return (usage.input_tokens * 15 + usage.output_tokens * 75) / 1_000_000
```

---

## Related topics

- [Agent Fundamentals](agent-fundamentals.md) — single agent first
- [Building Agents](building-agents.md) — base agent implementation
- [Agent Reliability](agent-reliability.md) — failure handling in multi-agent systems
- [Example: Research Agent](example-research-agent.md) — orchestrator pattern in action
- [AI Engineering: Agentic Patterns](../ai/agentic-patterns.md) — more advanced patterns
