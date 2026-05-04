# Evaluation

Evaluation is the discipline of measuring how well your AI system is working. It is the most underinvested area in AI engineering and the root cause of most production failures. **You cannot improve what you cannot measure.**

## Why eval is different for AI

```
Traditional software:
  f(x) = y   → deterministic, one correct answer
  Test: assert f(x) == expected_y

LLM-based software:
  f(x) ≈ y   → probabilistic, many acceptable answers
  Test: is the response good enough? useful? accurate? safe?
         → no single correct answer
         → quality is a distribution, not a boolean
```

---

## Types of evaluations

### Unit evals (functional correctness)

Test specific, well-defined behaviours with exact-match or near-exact checks.

```python
# Exact match — good for classification, extraction
def test_sentiment_classification():
    response = llm.classify("This product is terrible!")
    assert response == "NEGATIVE"

# Regex match — good for structured output
def test_json_output():
    response = llm.extract(text)
    data = json.loads(response)   # must be valid JSON
    assert "name" in data
    assert "email" in data
    assert "@" in data["email"]

# Fuzzy match — good for factual short answers
from rapidfuzz import fuzz
def test_capital_cities():
    response = llm.complete("What is the capital of France?")
    assert fuzz.partial_ratio("Paris", response) > 80
```

---

### Model-as-judge (LLM eval)

Use a capable LLM (e.g. GPT-4o or Claude) to score responses on dimensions like quality, accuracy, and helpfulness.

```python
from openai import OpenAI

client = OpenAI()

JUDGE_PROMPT = """
You are evaluating an AI assistant's response.

Question: {question}
Response: {response}
Reference answer: {reference}

Rate the response on these dimensions (1-5 each):
- Accuracy: Is it factually correct?
- Completeness: Does it fully answer the question?
- Clarity: Is it well-written and easy to understand?

Return JSON: {{"accuracy": N, "completeness": N, "clarity": N, "reasoning": "..."}}
"""

def judge_response(question: str, response: str, reference: str) -> dict:
    result = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[{
            "role": "user",
            "content": JUDGE_PROMPT.format(
                question=question,
                response=response,
                reference=reference
            )
        }]
    )
    return json.loads(result.choices[0].message.content)
```

**Pairwise comparison (better than absolute scoring):**

```python
def compare_responses(question: str, response_a: str, response_b: str) -> str:
    result = judge_llm.complete(
        f"Which response better answers this question? Return 'A', 'B', or 'TIE'.\n\n"
        f"Question: {question}\n\nResponse A:\n{response_a}\n\nResponse B:\n{response_b}"
    )
    return result.strip()
```

Pairwise comparison is more reliable than absolute scores — it's easier for a judge to say "A is better than B" than to assign a number.

---

### RAG-specific metrics (RAGAS)

[RAGAS](https://docs.ragas.io) provides metrics specifically for evaluating RAG pipelines.

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,          # Is the answer grounded in the context?
    answer_relevancy,      # Does the answer address the question?
    context_precision,     # Are the retrieved chunks actually relevant?
    context_recall,        # Were all necessary chunks retrieved?
    answer_correctness,    # Is the answer factually correct?
)
from datasets import Dataset

# Build eval dataset
eval_data = Dataset.from_dict({
    "question":  ["What is the capital of France?", ...],
    "answer":    [generated_answers],
    "contexts":  [retrieved_chunks],          # list of lists
    "ground_truth": [reference_answers]
})

result = evaluate(eval_data, metrics=[
    faithfulness, answer_relevancy, context_precision, context_recall
])
print(result)
# {'faithfulness': 0.85, 'answer_relevancy': 0.92, 'context_precision': 0.78, 'context_recall': 0.80}
```

**Metric definitions:**

| Metric | Question it answers | Range |
|---|---|---|
| **Faithfulness** | Does the answer contain only claims supported by the context? | 0–1 |
| **Answer Relevancy** | Does the answer address what was asked? | 0–1 |
| **Context Precision** | Of the retrieved chunks, what fraction was actually useful? | 0–1 |
| **Context Recall** | Of the necessary information, what fraction was retrieved? | 0–1 |
| **Answer Correctness** | Is the answer factually correct vs ground truth? | 0–1 |

---

### Agentic eval

Evaluating agents is harder — there's no single right answer, and the path matters as much as the result.

```python
class AgentEval:
    def evaluate_task(self, task: str, agent_trace: AgentTrace) -> dict:
        return {
            # Task completion
            "completed": self.check_goal_achieved(task, agent_trace.final_output),

            # Efficiency
            "tool_calls": len(agent_trace.tool_calls),
            "total_tokens": agent_trace.total_tokens,
            "latency_seconds": agent_trace.duration,

            # Tool use correctness
            "correct_tools_used": self.verify_tool_usage(agent_trace),

            # Reasoning quality
            "reasoning_score": self.judge_reasoning(agent_trace.thoughts),

            # Safety
            "no_harmful_actions": self.safety_check(agent_trace)
        }
```

**Trajectory evaluation:** Does the agent take sensible steps, even if it reaches the right answer?

```python
# Bad: agent reaches correct answer via hallucinated tool call
# agent says "I called the DB and got X" but never actually called it

# Eval must check: did the tool actually get called?
assert "search_database" in [t.name for t in trace.tool_calls]
assert trace.final_answer in [r.content for r in trace.tool_results]
```

---

## Building an eval suite

### Step 1: Define dimensions

What does "good" mean for your application?

```
Customer support bot dimensions:
  - Correctness: factually accurate based on KB
  - Tone: professional, empathetic
  - Completeness: answers the full question
  - Escalation: correctly identifies when to escalate to human
  - Safety: no harmful, discriminatory, or off-topic content
```

### Step 2: Create a golden dataset

```python
# golden_dataset.jsonl — version-controlled in git
{"input": "What's your refund policy?",
 "expected": "contains '30 days'",
 "category": "policy",
 "difficulty": "easy"}

{"input": "I never received my order from 6 months ago, I want a refund",
 "expected_action": "escalate_to_human",
 "category": "escalation",
 "difficulty": "hard"}
```

**Golden dataset rules:**
- Cover all categories your system handles
- Include edge cases and adversarial inputs
- Include inputs that should be refused
- Update when you find new failure modes in production

### Step 3: Automate and track over time

```python
def run_eval_suite(model_version: str):
    results = []
    for case in load_golden_dataset():
        response = llm.complete(case["input"])
        score = evaluate(case, response)
        results.append({"case": case["id"], "score": score, "model": model_version})

    # Write to tracking DB
    db.insert_eval_run(results, model_version=model_version, timestamp=now())

    # Alert if regression
    prev_score = db.get_latest_score(model_version="previous")
    if mean(results) < prev_score - 0.02:   # > 2% regression
        alert("Eval regression detected!")
```

---

## Eval-driven development

Apply software engineering discipline to prompt/model changes:

```
1. Identify a failure mode in production
2. Add it to the golden dataset
3. Verify the eval catches the failure
4. Fix the issue (better prompt, RAG, fine-tuning)
5. Verify the eval passes AND no regressions on other cases
6. Deploy
```

This is the AI equivalent of test-driven development. **Never deploy a change without running evals.**

---

## Human evaluation

For high-stakes applications, machine metrics are not enough.

```
A/B eval:
  Route 10% of traffic to new model version
  Collect implicit feedback (thumbs up/down, session length, retry rate)
  Compare metrics between versions

Expert annotation:
  Have domain experts rate samples on quality dimensions
  Use for calibrating automated evals (do your LLM judges agree with humans?)

Red-teaming:
  Dedicated team tries to break the system
  Finds failure modes automated evals miss (social engineering, edge cases)
```

---

## Benchmarks and leaderboards

Public benchmarks for comparing models (do not rely on these alone — always benchmark on your task):

| Benchmark | Tests |
|---|---|
| **MMLU** | Multitask knowledge (57 academic subjects) |
| **HumanEval** | Python code generation correctness |
| **MT-Bench** | Multi-turn conversation quality |
| **MATH** | Mathematical reasoning |
| **HellaSwag** | Commonsense reasoning |
| **TruthfulQA** | Truthfulness / hallucination resistance |
| **GPQA** | Graduate-level science (hard) |
| **SWE-bench** | Real GitHub issue resolution |

**Goodhart's Law applies:** Models optimised on public benchmarks may not perform well on your specific task. Always evaluate on your domain data.

---

## Interview / design angle

!!! tip "What comes up in AI system design"
    - *"How do you know your RAG system is working?"* → RAGAS metrics: faithfulness, context recall, answer relevancy; regression test on golden dataset
    - *"How do you compare two model versions?"* → Pairwise comparison with model-as-judge; A/B test with implicit feedback
    - *"What's in your eval pipeline?"* → Golden dataset in git, automated eval on every PR, regression alerting, model-as-judge for quality dimensions

## Related topics

- [RAG](rag.md) — RAGAS metrics for retrieval pipelines
- [LLMOps](llmops.md) — eval as part of CI/CD for AI
- [Guardrails & Safety](guardrails-safety.md) — safety as an eval dimension
- [Agentic Patterns](agentic-patterns.md) — evaluating agent trajectories
