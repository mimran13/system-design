# LLMOps

LLMOps is the operational discipline of deploying, monitoring, and improving AI systems in production. It extends DevOps and MLOps with the unique challenges of probabilistic, non-deterministic systems where a "bug" might be a gradual quality degradation that no test explicitly catches.

## The LLMOps lifecycle

```
┌──────────────────────────────────────────────────────────┐
│                    LLMOps Lifecycle                       │
│                                                          │
│  Develop → Evaluate → Deploy → Monitor → Improve → ...  │
│     ↑                                         │          │
│     └─────────────── feedback loop ──────────┘          │
└──────────────────────────────────────────────────────────┘

Develop:  prompt engineering, RAG tuning, fine-tuning
Evaluate: offline evals, benchmarks, human review
Deploy:   versioned prompts, canary releases, A/B tests
Monitor:  latency, cost, quality metrics, safety flags
Improve:  analyse failures, update prompts, retrain
```

---

## Observability for AI

Standard logging + metrics are necessary but not sufficient. You need **LLM-specific observability**: traces of the full reasoning chain, token counts, retrieval steps, and tool calls.

### What to log

```python
@dataclass
class LLMTrace:
    trace_id:       str
    timestamp:      datetime
    user_id:        str
    session_id:     str

    # Input
    model:          str
    system_prompt_version: str
    input_messages: list[dict]
    input_tokens:   int

    # Output
    output:         str
    output_tokens:  int
    finish_reason:  str   # "stop", "length", "tool_calls"

    # Performance
    latency_ms:     int
    ttft_ms:        int   # time to first token
    cost_usd:       float

    # Quality signals
    user_feedback:  int | None   # thumbs up/down = 1/-1
    eval_scores:    dict | None  # {"faithfulness": 0.9, ...}

    # For RAG
    retrieval_query:    str | None
    retrieved_chunks:   list[dict] | None
    retrieval_latency:  int | None

    # For agents
    tool_calls:     list[dict] | None
    agent_steps:    int | None
```

### Tracing with OpenTelemetry / Langfuse

[Langfuse](https://langfuse.com) is the most popular open-source LLM observability platform:

```python
from langfuse.decorators import observe, langfuse_context
from langfuse.openai import openai   # auto-instrumented client

@observe()
def rag_pipeline(query: str) -> str:
    langfuse_context.update_current_observation(
        input=query,
        metadata={"pipeline": "rag-v2"}
    )

    # This call is automatically traced
    chunks = retrieve(query)
    langfuse_context.update_current_observation(
        metadata={"chunks_retrieved": len(chunks)}
    )

    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=build_messages(query, chunks)
    )

    langfuse_context.update_current_observation(
        output=response.choices[0].message.content,
        usage={
            "input": response.usage.prompt_tokens,
            "output": response.usage.completion_tokens
        }
    )
    return response.choices[0].message.content
```

**What Langfuse shows:**
- Full trace tree: every LLM call, tool call, retrieval step
- Latency breakdown per step
- Token costs per trace and aggregated
- Eval scores attached to traces
- Filter traces by user, session, latency, cost

---

## Cost management

LLM costs can spiral quickly. Treat token spend like database query cost — measure, budget, and optimise.

### Track cost per feature

```python
COST_PER_TOKEN = {
    "gpt-4o": {"input": 5.0, "output": 15.0},       # per 1M tokens
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},
}

def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = COST_PER_TOKEN[model]
    return (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000

# Track per user, per endpoint, per feature
metrics.increment("llm.cost.usd", calculate_cost(model, input_tokens, output_tokens),
                  tags={"model": model, "feature": "rag_chat", "user_tier": "pro"})
```

### Cost optimisation strategies

```
1. Right-size the model
   - Use gpt-4o-mini / claude-haiku for classification, extraction, routing
   - Reserve gpt-4o / claude-sonnet for complex reasoning
   - Cost difference: 10-50× between small and large models

2. Prompt compression
   - Remove filler words from system prompts
   - Use LLMLingua to compress long prompts by 50%
   - Chunk documents smaller to inject less context per query

3. Caching
   - Semantic caching: similar queries return cached response
   - Prompt prefix caching: Anthropic/OpenAI cache static system prompts
   - Exact-match cache for deterministic queries

4. Batching
   - Batch embedding requests (2048 texts per API call)
   - Batch non-urgent LLM calls during off-peak hours

5. Output length limits
   - Always set max_tokens
   - Use structured output — structured responses are shorter than prose
```

### Semantic caching

Cache LLM responses for semantically similar queries:

```python
from openai import OpenAI

client = OpenAI()

class SemanticCache:
    def __init__(self, similarity_threshold: float = 0.95):
        self.threshold = similarity_threshold
        self.cache: list[dict] = []  # {embedding, query, response}

    def get(self, query: str) -> str | None:
        query_emb = embed(query)
        for entry in self.cache:
            similarity = cosine_similarity(query_emb, entry["embedding"])
            if similarity >= self.threshold:
                return entry["response"]
        return None

    def set(self, query: str, response: str):
        self.cache.append({
            "embedding": embed(query),
            "query": query,
            "response": response
        })

cache = SemanticCache(similarity_threshold=0.95)

def cached_complete(query: str) -> str:
    cached = cache.get(query)
    if cached:
        metrics.increment("llm.cache.hit")
        return cached

    response = llm.complete(query)
    cache.set(query, response)
    metrics.increment("llm.cache.miss")
    return response
```

GPTCache and Redis Semantic Cache are production implementations of this pattern.

---

## Prompt versioning

Prompts are code. They must be version-controlled, reviewed, and tested before deployment.

```
prompts/
  chat/
    v1.0.0/
      system.txt
      metadata.json
    v1.1.0/
      system.txt
      metadata.json
  rag/
    v2.0.0/
      system.txt
      metadata.json
```

```python
# metadata.json
{
    "version": "1.1.0",
    "model": "gpt-4o",
    "author": "alice",
    "description": "Added tone guidelines",
    "eval_score": 0.87,
    "deployed_at": "2024-04-26T10:00:00Z"
}
```

```python
# Load prompt by version
def get_prompt(name: str, version: str = "latest") -> str:
    if version == "latest":
        version = prompt_registry.get_latest(name)
    return prompt_registry.load(name, version)
```

---

## CI/CD for AI

Add AI-specific quality gates to your deployment pipeline:

```yaml
# .github/workflows/ai-deploy.yml
name: AI Pipeline

on: [push]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run eval suite
        run: python evals/run_suite.py --model gpt-4o --output results.json

      - name: Check regression
        run: |
          python evals/check_regression.py \
            --current results.json \
            --baseline evals/baseline.json \
            --max-regression 0.02   # fail if > 2% quality drop

      - name: Deploy prompt
        if: success()
        run: python scripts/deploy_prompt.py --version ${{ github.sha }}
```

```python
# check_regression.py
def check_regression(current: dict, baseline: dict, max_regression: float):
    for metric in ["faithfulness", "answer_relevancy", "safety_score"]:
        delta = current[metric] - baseline[metric]
        if delta < -max_regression:
            raise RegressionError(
                f"{metric} regressed by {abs(delta):.1%} "
                f"(threshold: {max_regression:.1%})"
            )
```

---

## Model versioning and rollback

LLM providers update models. `gpt-4o` today is not `gpt-4o` in 6 months.

```python
# Always pin to a dated model version in production
MODEL_CONFIG = {
    "chat":     "gpt-4o-2024-08-06",    # pinned
    "embed":    "text-embedding-3-small",
    "moderate": "text-moderation-latest"  # ok to use latest for safety
}

# Use aliases for easy update rollout
MODELS = {
    "production": "gpt-4o-2024-08-06",
    "canary":     "gpt-4o-2024-11-20",   # new version on 10% traffic
    "fallback":   "gpt-4o-mini-2024-07-18"
}
```

**Canary deployment for model updates:**

```python
def get_model_for_request(user_id: str) -> str:
    # 10% of traffic to new model version
    if hash(user_id) % 10 == 0:
        return MODELS["canary"]
    return MODELS["production"]
```

---

## Production metrics dashboard

Key metrics to track for every AI application:

```
Performance:
  └─ TTFT p50 / p95 / p99
  └─ Total latency p50 / p95 / p99
  └─ Tokens/second (throughput)
  └─ Error rate (API failures, timeouts)

Cost:
  └─ Cost per request (mean, p95)
  └─ Daily/monthly token spend
  └─ Cost per feature / endpoint
  └─ Cache hit rate

Quality:
  └─ User feedback score (thumbs up/down ratio)
  └─ Eval scores (faithfulness, answer_relevancy, etc.)
  └─ Hallucination rate (from sampling + manual review)
  └─ Completion rate (did user get what they needed?)

Safety:
  └─ Injection detection rate
  └─ Content moderation flag rate
  └─ Prompt length distribution (detect abuse)
  └─ Output refusal rate
```

---

## Debugging AI failures

When something goes wrong in production:

```
1. Find the failing trace in your observability tool
   → Langfuse / Arize / Helicone → filter by user/session

2. Inspect the full prompt + response
   → Was the system prompt the expected version?
   → Did retrieval return relevant chunks?
   → Was the input unusually long or adversarial?

3. Reproduce locally
   → Copy exact messages from the trace
   → Try temperature=0 for determinism
   → Run with different models to isolate model vs prompt issue

4. Add to your eval suite
   → This failure case should become a test

5. Fix and verify
   → Prompt change? Run full eval suite
   → Verify the specific failure case passes
   → Check no regressions
```

---

## Interview / design angle

!!! tip "What comes up in AI system design"
    - *"How do you know your AI system's quality is not degrading?"* → Continuous eval pipeline, quality metrics in observability dashboard, alert on regression
    - *"How do you roll back a bad prompt deploy?"* → Versioned prompts in registry, instant rollback to previous version, canary rollout to catch issues before full deploy
    - *"How do you manage costs at scale?"* → Token-level cost tracking per feature, semantic cache, right-size model per task, prompt compression

## Related topics

- [Evaluation](evaluation.md) — the eval system LLMOps depends on
- [Guardrails & Safety](guardrails-safety.md) — safety monitoring
- [LLM Inference & Serving](llm-inference.md) — infrastructure layer
- [Observability](../observability/index.md) — general observability patterns that apply here
- [CI/CD](../cicd/index.md) — extending standard CI/CD for AI
