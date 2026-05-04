# LLM Inference & Serving

Running LLMs at production scale requires understanding the hardware constraints, memory bottlenecks, and serving optimizations that determine latency, throughput, and cost. This is where backend engineering skills translate directly.

## The inference bottleneck

Unlike most software, LLM inference is **memory bandwidth bound**, not compute bound.

```
GPU A100 80GB:
  Compute (FP16 matmul): 312 TFLOPS
  Memory bandwidth:       2 TB/s

Llama 3 70B model:
  Size (FP16): 140 GB  ← needs 2× A100s just to load
  Size (INT8):  70 GB  ← fits in one A100 80GB
  Size (INT4):  35 GB  ← fits in one A100 40GB

At inference: GPU must load each weight from HBM → compute unit
  per token: 140 GB × 2 (load + store) = 280 GB memory operations
  At 2 TB/s bandwidth: 140ms minimum per token (memory bound)
```

**Implication:** Optimizing inference is mostly about reducing memory pressure, not adding more compute.

---

## The KV Cache

The most important inference optimization. Avoids recomputing attention keys and values for tokens already processed.

```
Without KV cache:
  Token 1:  compute attention over [t1]
  Token 2:  compute attention over [t1, t2]        ← recomputes t1
  Token 3:  compute attention over [t1, t2, t3]    ← recomputes t1, t2
  → O(n²) compute, O(n²) memory

With KV cache:
  Token 1:  compute K, V for t1 → store in cache
  Token 2:  compute K, V for t2 → store; load t1 K,V from cache
  Token 3:  compute K, V for t3 → store; load t1,t2 K,V from cache
  → O(n) compute, O(n) memory per new token
```

**KV cache memory footprint:**

```
KV cache size = batch_size × seq_len × num_layers × 2 × num_heads × head_dim × dtype_bytes

For Llama 3 70B, sequence length 4096:
  = 1 × 4096 × 80 × 2 × 8 × 128 × 2 bytes
  = ~1.3 GB per sequence

For batch size 32:
  = 32 × 1.3 GB = ~42 GB just for KV cache
  (plus 140 GB for model weights → need 180+ GB total)
```

**KV cache is why memory is the bottleneck, not compute.** Larger batches need more KV cache → less room for model weights → need more GPUs.

---

## Continuous Batching (Iteration-Level Scheduling)

Naive batching waits for all sequences in a batch to finish before starting new ones. Continuous batching adds new requests as sequences complete — GPU is never idle.

```
Naive batching:
  Batch: [seq1(50 tokens), seq2(100 tokens)]
  GPU idle while seq1 finishes: ████████░░░░░░░░░░ (seq2 still running)
  New request waits until seq2 finishes

Continuous batching:
  seq1 finishes at token 50 → immediately add seq3 to batch
  GPU stays full: ████████████████████████████████████████
```

**vLLM** implements continuous batching. It's the primary reason vLLM achieves 2–10× higher throughput than naive serving.

---

## PagedAttention

vLLM's key innovation. Manages KV cache in non-contiguous pages (like OS virtual memory) instead of pre-allocating contiguous blocks.

```
Traditional KV cache:
  Pre-allocate max_seq_len for each request → wasted memory
  seq1 uses 200 tokens of 4096 allocated → 95% waste

PagedAttention:
  Allocate KV cache in fixed-size pages (e.g. 16 tokens)
  seq1 uses 200 tokens → allocates 13 pages (208 tokens)
  Pages from finished requests are immediately reused
  
Result:
  Near-zero memory fragmentation
  ~3× improvement in memory utilization
  Higher effective batch size → higher throughput
```

---

## Quantization

Reduce model weight precision to decrease memory footprint and increase throughput.

```
FP32:  32 bits per weight (full precision)
FP16:  16 bits — 2× smaller, standard inference
BF16:  16 bits — better dynamic range than FP16
INT8:   8 bits — 4× smaller vs FP32, minimal quality loss
INT4:   4 bits — 8× smaller, some quality loss
NF4:    4-bit Normal Float — QLoRA's format, better quality than INT4
```

```python
# Load model in 4-bit (bitsandbytes)
from transformers import AutoModelForCausalLM, BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True   # nested quantization
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Meta-Llama-3.1-70B",
    quantization_config=bnb_config,
    device_map="auto"
)
```

**GGUF / llama.cpp quantization levels:**

```
Q4_K_M:  4-bit, medium quality loss — best size/quality balance
Q5_K_M:  5-bit — better quality, 25% more memory
Q8_0:    8-bit — near-lossless, 2× the size of Q4
```

**Quality impact (rough):**
```
FP16 baseline → INT8: ~1% quality loss → INT4: ~3-5% quality loss
For most applications INT4/INT8 quality is acceptable.
```

---

## Speculative Decoding

Use a small "draft" model to predict several tokens ahead; the large "verifier" model validates them in parallel. Accepts correct predictions, rejects wrong ones.

```
Draft model (7B):    generates tokens t+1, t+2, t+3, t+4 quickly
Target model (70B):  validates all 4 tokens in ONE forward pass

If all 4 accepted: 4 tokens generated in ~1 forward pass of the 70B model
If t+3 rejected:   t+1, t+2 accepted (still 2 tokens from one pass)

Average: 2-3× speedup on generation-heavy workloads
```

**Requirements:**
- Draft and target model must share the same vocabulary
- Best for tasks where the draft model can predict accurately (code, structured data)
- Less effective for highly creative outputs

---

## Tensor Parallelism

Split the model across multiple GPUs to fit large models or increase throughput.

```
Tensor Parallel (TP=4):
  Split each weight matrix across 4 GPUs
  Each GPU holds 1/4 of every weight
  All 4 GPUs compute every token together (high communication)

Pipeline Parallel (PP=4):
  Split model layers across GPUs
  GPU1: layers 1-20
  GPU2: layers 21-40
  GPU3: layers 41-60
  GPU4: layers 61-80
  Less communication, but pipeline bubbles reduce efficiency
```

In practice, vLLM and TensorRT-LLM handle this transparently.

---

## Serving infrastructure

### vLLM

The go-to open-source LLM serving engine.

```bash
# Start vLLM server
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Meta-Llama-3.1-8B \
    --tensor-parallel-size 2 \
    --max-model-len 8192 \
    --gpu-memory-utilization 0.90

# OpenAI-compatible API at http://localhost:8000
```

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="token")
response = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3.1-8B",
    messages=[{"role": "user", "content": "Hello"}]
)
```

**Features:** Continuous batching, PagedAttention, streaming, OpenAI-compatible API, quantization support.

### Ollama

Easiest self-hosting option. Manages model downloads, quantization, and serving.

```bash
ollama run llama3.1:8b
ollama run llama3.1:70b-instruct-q4_K_M  # 4-bit quantized
```

**Best for:** Local development, small teams, quick prototyping.

### AWS / Cloud options

```
AWS Bedrock:
  → Managed inference for Claude, Llama, Mistral, etc.
  → No GPU management, pay per token
  → Provisioned throughput for consistent latency

AWS SageMaker:
  → Deploy custom or open-source models on EC2 instances
  → p4d.24xlarge (8× A100): $32/hour
  → ml.g5.48xlarge (8× A10G): $16/hour

Modal / RunPod / Lambda Labs:
  → Cheaper GPU clouds for self-hosted models
```

---

## Latency components

Understanding where latency comes from helps you optimise the right thing.

```
Total latency = TTFT + (completion_tokens × generation_speed)

TTFT (Time to First Token):
  ← determined by prompt processing (prefill)
  ← scales with prompt length
  ← fast on modern hardware: 100-500ms for 1K tokens

Generation speed (tokens/second):
  ← memory bandwidth bound
  ← typical: 20-80 tok/s (API), 50-150 tok/s (local small models)
  ← increases with batch size (but each request gets same tok/s)
```

**Optimisation targets by use case:**

```
Interactive chat → minimise TTFT and initial tokens/sec (streaming)
Batch processing → maximise total throughput (tokens/sec across all requests)
RAG system       → minimise TTFT (prompt is long due to retrieved context)
```

---

## Prompt caching

Reuse computation for repeated prompt prefixes (e.g. a static system prompt sent with every request).

```
Request structure:
  [System prompt — 2000 tokens]  ← same for every request
  [RAG context  — 1000 tokens]   ← varies per request
  [User message — 50 tokens]     ← varies per request

Without caching: process 3050 tokens every request
With prefix caching: process 2000 tokens ONCE, cache the KV state
  → subsequent requests only process 1050 new tokens
  → ~40% latency reduction, ~40% cost reduction

Anthropic: prompt caching built in (cache_control parameter)
OpenAI:    automatic prefix caching (no configuration needed)
```

```python
# Anthropic prompt caching
response = client.messages.create(
    model="claude-sonnet-4-6",
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": long_system_doc,  # this gets cached
                "cache_control": {"type": "ephemeral"}
            },
            {"type": "text", "text": user_question}
        ]
    }]
)
```

---

## Interview / design angle

!!! tip "What comes up in AI system design"
    - *"How would you serve a 70B model to 1000 concurrent users?"* → vLLM with continuous batching + tensor parallelism across multiple A100s; quantize to INT4/INT8 to fit more KV cache
    - *"Why is my LLM API so slow?"* → TTFT dominated by prompt length (use RAG to compress), or low throughput (need bigger batch / continuous batching)
    - *"How do you reduce inference cost by 50%?"* → Prompt caching for repeated prefixes, smaller model + fine-tuning, batching, INT8 quantization

## Related topics

- [LLM Fundamentals](llm-fundamentals.md) — tokens, context window
- [LLMOps](llmops.md) — cost monitoring, model versioning
- [Fine-tuning](fine-tuning.md) — smaller fine-tuned models are faster to serve
