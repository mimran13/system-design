# LLM Fundamentals

Understanding how large language models work under the hood helps you make better engineering decisions — choosing the right model, sizing context windows, tuning generation parameters, and diagnosing unexpected outputs.

## What is an LLM?

A Large Language Model is a neural network trained to predict the next token given a sequence of tokens. That single objective — next-token prediction — at sufficient scale produces models that can reason, code, summarise, translate, and converse.

```
Input:  "The capital of France is"
Model:  P("Paris" | context) = 0.94   ← highest probability token
Output: "Paris"
```

LLMs don't "know" facts. They learn statistical associations between tokens from training data and use those associations to generate plausible continuations.

---

## Transformers

Every major LLM is built on the **Transformer** architecture (Vaswani et al. 2017). As a backend engineer you don't need to implement one, but understanding the key components helps diagnose behaviour.

```
Input tokens
    ↓
Token Embeddings (convert token IDs → dense vectors)
    ↓
Positional Encoding (inject order information)
    ↓
N × Transformer Blocks:
  - Multi-Head Self-Attention  ← "which other tokens matter for this one?"
  - Feed-Forward Network       ← "process the attended representation"
  - Layer Norm + Residual
    ↓
Output Projection → vocabulary logits
    ↓
Softmax → probability distribution over all tokens
    ↓
Sample or argmax → next token
```

**Self-attention** is why LLMs can handle long-range dependencies. Every token can attend to every other token in the context — the model learns which relationships matter.

---

## Tokens

LLMs operate on **tokens**, not characters or words. A tokenizer (e.g. BPE — Byte Pair Encoding) splits text into subword units.

```
"unhappiness" → ["un", "happ", "iness"]  (3 tokens)
"hello"       → ["hello"]                 (1 token)
" hello"      → [" hello"]                (1 token, different from "hello")
"1234567890"  → ["123", "456", "789", "0"] (4 tokens)
```

**Rules of thumb for token counting:**
- English text: ~1 token per 4 characters, or ~0.75 tokens per word
- Code: more tokens per character (symbols, whitespace matter)
- Non-English languages: often 2–3× more tokens per word than English
- `gpt-4`: uses `cl100k_base` tokenizer (100K vocabulary)

```python
import tiktoken

enc = tiktoken.encoding_for_model("gpt-4")
tokens = enc.encode("Hello, how are you?")
print(len(tokens))   # 6
print(tokens)        # [9906, 11, 1268, 527, 499, 30]
```

**Why tokens matter for engineers:**
- Pricing is per token (input + output)
- Context window limits are in tokens
- Structured data (JSON, tables) is token-expensive

---

## Context Window

The context window is the maximum number of tokens the model can "see" at once — both the input (prompt) and the output (completion) count against it.

```
Context window = prompt tokens + completion tokens

GPT-4o:        128K tokens  (~96K words)
Claude 3.5:    200K tokens  (~150K words)
Gemini 1.5:    1M tokens    (~750K words)
Llama 3 70B:   8K tokens    (original), 128K (extended)
```

**Practical limits:** Just because a model has a 200K context doesn't mean you should fill it.

| Context size | Behaviour |
|---|---|
| < 8K | Fast, cheap, reliable |
| 8K–32K | Good performance, moderate cost |
| 32K–100K | "Lost in the middle" degradation begins |
| > 100K | Expensive, slower, attention quality degrades for items in the middle |

**"Lost in the middle" problem:** Models attend better to content at the start and end of the context. Information buried in the middle of a 100K prompt is often ignored.

```
Attention quality across context:
HIGH ████████░░░░░░░░░░░░░░░░████████ HIGH
     start                      end
              LOW in middle
```

**Implication:** For RAG, put the most relevant chunks at the top or bottom, not buried in the middle.

---

## Tokenization & the Prompt Structure

Modern LLMs use a structured prompt format with distinct roles:

```python
messages = [
    {
        "role": "system",
        "content": "You are a helpful assistant. Answer concisely."
    },
    {
        "role": "user",
        "content": "What is the CAP theorem?"
    },
    {
        "role": "assistant",
        "content": "CAP theorem states..."   # for few-shot or multi-turn
    },
    {
        "role": "user",
        "content": "Give me an example."
    }
]
```

Under the hood, this gets serialised into a single token sequence using the model's **chat template** (e.g. `<|im_start|>system\n...<|im_end|>`). The model then generates the next `assistant` turn.

---

## Temperature & Sampling

LLMs produce a probability distribution over the next token. **Sampling parameters** control how you draw from that distribution.

### Temperature

Scales the logits before softmax — controls randomness.

```
logits = [2.0, 1.5, 0.5, 0.1]

Temperature = 1.0 (default):  [0.47, 0.35, 0.13, 0.05]  balanced
Temperature = 0.1 (cold):     [0.98, 0.02, 0.00, 0.00]  near-deterministic
Temperature = 2.0 (hot):      [0.32, 0.28, 0.22, 0.18]  near-uniform

formula: softmax(logits / temperature)
```

| Temperature | Use case |
|---|---|
| `0.0` | Deterministic — same input always gives same output. Good for classification, extraction |
| `0.1–0.3` | Low creativity, high consistency. Good for code, structured data |
| `0.7–1.0` | Balanced. Good for chat, summaries |
| `1.2–2.0` | High creativity. Good for brainstorming, creative writing |

### Top-P (Nucleus Sampling)

Only sample from the smallest set of tokens whose cumulative probability exceeds P.

```
top_p = 0.9

Tokens sorted by probability:
  "Paris"  0.60  → cumsum 0.60
  "Lyon"   0.20  → cumsum 0.80
  "Nice"   0.10  → cumsum 0.90  ← stop here (≥ 0.9)
  "Lille"  0.05  → excluded
  ...

Sample from ["Paris", "Lyon", "Nice"] only.
```

**Top-P** adapts to the distribution shape. When the model is confident (steep distribution), fewer tokens are considered. When uncertain, more tokens are included.

### Top-K

Restrict sampling to the K most probable tokens. Less adaptive than top-P.

```
top_k = 50  → sample from the 50 most likely tokens only
```

### Practical settings

```python
# Extraction / classification — deterministic
response = client.chat(temperature=0.0, top_p=1.0)

# General assistant — balanced
response = client.chat(temperature=0.7, top_p=0.9)

# Creative writing — high variance
response = client.chat(temperature=1.2, top_p=0.95)
```

---

## Max Tokens & Stop Sequences

```python
response = client.chat(
    messages=messages,
    max_tokens=512,        # hard cap on output length
    stop=["###", "\n\n"]   # stop generation when these strings appear
)
```

**Always set `max_tokens`** — unbounded generation wastes money and can loop.

Stop sequences are useful for structured output: generate until a delimiter appears, then parse.

---

## Model Families & Capabilities

```
OpenAI:
  GPT-4o         → fast, multimodal, 128K context
  GPT-4o-mini    → cheap, fast, good for simple tasks
  o1 / o3        → reasoning models (chain-of-thought internally)

Anthropic:
  Claude 3.5 Sonnet → best coding + reasoning, 200K context
  Claude 3 Haiku    → fast, cheap, good for classification/extraction

Google:
  Gemini 1.5 Pro  → 1M context, multimodal
  Gemini Flash    → fast, cheap

Meta (open source):
  Llama 3.1 405B  → strongest open model, self-hostable
  Llama 3.1 8B    → small, fast, runs on a single GPU

Mistral:
  Mixtral 8x22B   → MoE architecture, strong at code
```

**Choosing a model:**

```
Start with Claude 3.5 Sonnet or GPT-4o for prototyping.
Optimise down to a smaller/cheaper model once quality is validated.
Never assume one model fits all tasks — benchmark for your specific use case.
```

---

## Completion vs Chat Models

- **Base models** (e.g. `gpt-3.5-turbo-instruct`): raw next-token prediction. Given a prefix, complete it. Used for few-shot with raw text.
- **Instruction-tuned models** (e.g. `gpt-4o`, `claude-3-5-sonnet`): fine-tuned to follow instructions via RLHF/DPO. Use the messages API.
- **Reasoning models** (e.g. `o1`, `o3`): generate extended internal chain-of-thought before answering. Better for hard multi-step problems.

---

## Embeddings vs Generative Models

| | Generative (LLM) | Embedding Model |
|---|---|---|
| Output | Text (tokens) | Fixed-length dense vector |
| Use case | Generation, reasoning, Q&A | Semantic search, classification, clustering |
| Examples | GPT-4o, Claude | text-embedding-3-large, Cohere embed-v3 |
| Cost | Higher (per output token) | Lower (per input token) |

Embedding models convert text into dense vectors that encode semantic meaning. Similar texts produce similar vectors. See [Embeddings & Vector Search](embeddings-vector-search.md).

---

## Key numbers to remember

| Metric | Value |
|---|---|
| GPT-4o input cost | ~$5 / 1M tokens |
| GPT-4o output cost | ~$15 / 1M tokens |
| Claude 3.5 Sonnet input | ~$3 / 1M tokens |
| p50 latency (small model, API) | 300–800ms first token |
| p50 latency (large model, API) | 1–3s first token |
| Tokens/sec (streaming) | 50–150 tokens/sec |
| 1 page of text ≈ | 500–700 tokens |

---

## Interview / design angle

!!! tip "What comes up in AI system design"
    - *"How would you handle a 500-page document?"* → chunking + RAG, not stuffing into context
    - *"Why is the model giving inconsistent answers?"* → temperature too high, or prompt ambiguity
    - *"How do you reduce cost?"* → smaller model, prompt compression, caching, batching
    - *"How do you make output deterministic?"* → temperature=0 reduces variance but doesn't eliminate it

## Related topics

- [Prompt Engineering](prompt-engineering.md) — controlling model output
- [RAG](rag.md) — working around context window limits
- [Embeddings & Vector Search](embeddings-vector-search.md) — semantic search for retrieval
- [LLM Inference & Serving](llm-inference.md) — running models at scale
