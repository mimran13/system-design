# Example: Research Agent

A research agent that takes a topic, searches the web, reads sources, synthesizes findings, and produces a structured report. This is a realistic end-to-end example you can adapt and run.

---

## What it does

```
User: "Research the current state of quantum computing in 2024"

Agent:
  → web_search("quantum computing breakthroughs 2024")
  → web_search("quantum computing companies market 2024")
  → fetch_page(url) to read key articles
  → web_search("IBM Google quantum computing progress")
  → synthesizes into structured report

Output: Structured report with summary, key findings, companies, and sources
```

---

## Full implementation

```python
import json
import os
import anthropic
import requests
from dataclasses import dataclass
from typing import Optional

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# ─── Tool implementations ─────────────────────────────────────────────────────

def web_search(query: str, num_results: int = 5) -> list[dict]:
    """Search the web using Tavily API"""
    response = requests.post(
        "https://api.tavily.com/search",
        json={
            "api_key": os.environ["TAVILY_API_KEY"],
            "query": query,
            "max_results": num_results,
            "search_depth": "basic",
            "include_answer": True
        }
    )
    data = response.json()
    return [
        {
            "title": r["title"],
            "url": r["url"],
            "snippet": r["content"][:500],
            "score": r.get("score", 0)
        }
        for r in data.get("results", [])
    ]


def fetch_page(url: str, max_chars: int = 3000) -> dict:
    """Fetch and extract text from a webpage"""
    try:
        response = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        # In production: use BeautifulSoup or Trafilatura for better extraction
        text = response.text[:max_chars]
        return {"url": url, "content": text, "status": response.status_code}
    except Exception as e:
        return {"url": url, "error": str(e)}


def save_report(title: str, summary: str, key_findings: list[str],
                sections: dict, sources: list[str]) -> dict:
    """Save the final report (signals to agent it's done)"""
    report = {
        "title": title,
        "summary": summary,
        "key_findings": key_findings,
        "sections": sections,
        "sources": sources
    }
    # In production: save to DB, S3, etc.
    return {"status": "saved", "report": report}


# ─── Tool definitions ─────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "web_search",
        "description": (
            "Search the web for current information on a topic. "
            "Returns titles, URLs, and snippets. "
            "Use multiple targeted searches to cover different angles."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "num_results": {"type": "integer", "description": "Number of results (1-10). Default 5."}
            },
            "required": ["query"]
        }
    },
    {
        "name": "fetch_page",
        "description": (
            "Fetch and read the full text of a webpage. "
            "Use when a search result snippet doesn't have enough detail."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Full URL to fetch"},
                "max_chars": {"type": "integer", "description": "Max characters to return. Default 3000."}
            },
            "required": ["url"]
        }
    },
    {
        "name": "save_report",
        "description": (
            "Save the final research report. Call this when you have gathered sufficient information "
            "and are ready to present your findings. This is the LAST tool call you make."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "summary": {"type": "string", "description": "2-3 sentence executive summary"},
                "key_findings": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "5-8 most important findings"
                },
                "sections": {
                    "type": "object",
                    "description": "Dict of section_name → content for detailed sections"
                },
                "sources": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of URLs used as sources"
                }
            },
            "required": ["title", "summary", "key_findings", "sources"]
        }
    }
]

TOOL_FNS = {
    "web_search": web_search,
    "fetch_page": fetch_page,
    "save_report": save_report,
}

# ─── System prompt ────────────────────────────────────────────────────────────

SYSTEM = """You are a thorough research analyst. When given a research topic:

1. Search broadly first — get an overview with 2-3 initial searches
2. Identify the most important sub-topics and search each specifically
3. Fetch full pages for the most relevant results
4. Search for recent developments, key players, statistics, and controversies
5. When you have enough information (typically 5-10 searches), call save_report

Research quality standards:
- Use multiple sources — don't rely on a single article
- Prefer recent sources (2023-2024)
- Include specific numbers and data where available
- Note areas of uncertainty or conflicting information
- Always record source URLs"""

# ─── Agent loop ───────────────────────────────────────────────────────────────

def run_research_agent(topic: str, max_iterations: int = 15) -> dict:
    messages = [{"role": "user", "content": f"Research this topic thoroughly: {topic}"}]
    final_report = None
    iteration = 0

    print(f"\n🔍 Starting research on: {topic}\n")

    while iteration < max_iterations:
        iteration += 1

        response = client.messages.create(
            model="claude-opus-4-6",
            system=SYSTEM,
            max_tokens=4096,
            tools=TOOLS,
            messages=messages
        )

        if response.stop_reason == "end_turn":
            text = next((b.text for b in response.content if hasattr(b, "text")), "")
            print(f"\n✅ Agent completed (no save_report called)\n{text}")
            break

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})

            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                print(f"  [{iteration}] → {block.name}({list(block.input.values())[0] if block.input else ''})")

                try:
                    result = TOOL_FNS[block.name](**block.input)

                    # Check if agent just saved the report
                    if block.name == "save_report" and isinstance(result, dict):
                        final_report = result.get("report")

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

            messages.append({"role": "user", "content": tool_results})

            # If save_report was called, we're done
            if final_report:
                print(f"\n✅ Report saved after {iteration} iterations")
                break

    return final_report or {"error": "Agent did not produce a report"}


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    report = run_research_agent("quantum computing breakthroughs and commercial applications in 2024")

    print("\n" + "="*60)
    print(f"📄 {report['title']}")
    print("="*60)
    print(f"\n{report['summary']}\n")
    print("Key Findings:")
    for i, finding in enumerate(report['key_findings'], 1):
        print(f"  {i}. {finding}")
    print(f"\nSources ({len(report['sources'])}):")
    for url in report['sources']:
        print(f"  • {url}")
```

---

## Sample output

```
🔍 Starting research on: quantum computing breakthroughs and commercial applications in 2024

  [1] → web_search(quantum computing breakthroughs 2024)
  [2] → web_search(quantum computing commercial applications companies 2024)
  [3] → fetch_page(https://www.ibm.com/quantum/news)
  [4] → web_search(Google quantum advantage 2024 progress)
  [5] → web_search(quantum computing market size revenue 2024)
  [6] → fetch_page(https://quantumcomputingreport.com/...)
  [7] → web_search(quantum error correction breakthrough 2024)
  [8] → save_report(Quantum Computing in 2024: Breakthroughs...)

✅ Report saved after 8 iterations

============================================================
📄 Quantum Computing in 2024: Breakthroughs and Commercial Progress
============================================================

The quantum computing industry made significant strides in 2024, with major advances
in error correction and early commercial deployments. IBM, Google, and IonQ lead
hardware development while software ecosystem matures around near-term applications.

Key Findings:
  1. IBM's 1,000+ qubit Condor processor achieved new stability benchmarks
  2. Google demonstrated logical qubit error rates below physical qubit error rates
  3. Quantum market projected to reach $1.3B by end of 2024 (McKinsey)
  4. Pharmaceutical companies using quantum simulation for drug discovery
  5. Financial firms running quantum optimization for portfolio management
  6. Error correction remains the key bottleneck for fault-tolerant quantum computing
  7. IonQ and Quantinuum advancing trapped-ion approaches as alternative to superconducting
  8. First quantum advantage demonstrations in logistics optimization problems

Sources (6):
  • https://research.ibm.com/quantum-computing
  • https://quantumai.google/
  • https://quantumcomputingreport.com/...
```

---

## Variations to try

```python
# Comparative research
report = run_research_agent("Compare PostgreSQL vs MongoDB for e-commerce applications in 2024")

# Technical deep-dive
report = run_research_agent("How does Kubernetes horizontal pod autoscaling work? Include examples.")

# Market research
report = run_research_agent("What are the top AI coding assistant tools in 2024 and how do they compare?")

# News briefing
report = run_research_agent("What happened in the AI industry this week? Key announcements and releases.")
```

---

## Production enhancements

```python
# 1. Add caching — same query shouldn't hit the web twice
from functools import lru_cache

@lru_cache(maxsize=100)
def cached_search(query: str) -> str:
    return json.dumps(web_search(query))

# 2. Add cost tracking
class TrackedResearchAgent:
    def __init__(self):
        self.total_searches = 0
        self.total_cost = 0.0

    def run(self, topic: str) -> dict:
        # ... track tokens and cost per run

# 3. Stream progress to frontend
async def stream_research(topic: str, websocket):
    async for event in research_agent_stream(topic):
        await websocket.send_json(event)  # {"type": "tool_call", "name": "web_search", ...}
```

---

## Related topics

- [Function Calling](function-calling.md) — how the tool loop works
- [Building Agents](building-agents.md) — the Agent class used here
- [Agent Reliability](agent-reliability.md) — adding budget limits and error handling
- [Example: Data Agent](example-data-agent.md) — next example
