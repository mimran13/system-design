# Fine-Tuning

Fine-tuning updates a pre-trained model's weights on your specific data, teaching it new behaviour, style, or domain knowledge. It is powerful but expensive and slow — most problems are better solved with better prompting or RAG first.

## When to fine-tune vs alternatives

```
Problem                         Solution
──────────────────────────────────────────────────────────
Output format always wrong      → Structured output / few-shot examples
Needs external knowledge        → RAG
Inconsistent tone/style         → Few-shot examples in system prompt
Needs private data              → RAG
Slow/expensive for your task    → Smaller model + prompt tuning
Domain-specific terminology     → Few-shot or RAG
Style the model can't replicate → Fine-tuning ✓
Format RAG/prompting can't fix  → Fine-tuning ✓
Latency-sensitive (no retrieval)→ Fine-tuning ✓
Need to "unlearn" harmful output→ Fine-tuning (RLHF/DPO) ✓
```

**Rule of thumb:** Try prompting → few-shot → RAG → fine-tuning, in that order.

---

## Types of fine-tuning

### Supervised Fine-Tuning (SFT)

Train on labelled input→output pairs. The model learns to produce the target output given the input.

```
Training data format (JSONL):
{"messages": [
    {"role": "user", "content": "Summarise this: [legal document...]"},
    {"role": "assistant", "content": "This agreement establishes..."}
]}
```

**Use cases:** Custom response style, domain-specific formatting, instruction following for niche tasks.

**Cost (OpenAI):**
```
gpt-4o-mini fine-tuning:
  Training:  $3 / 1M tokens
  Inference: $0.30 input / $1.20 output per 1M tokens (3× base rate)
  Minimum:   ~50–100 high-quality examples to see improvement
  Sweet spot: 500–5,000 examples
```

---

### LoRA (Low-Rank Adaptation)

Fine-tune only a small set of adapter weights instead of all model parameters. Reduces memory and compute by 10–100×.

```
Standard fine-tuning:
  Train all N billion parameters
  Memory: store full gradient for each weight
  Storage: full copy of model per fine-tune

LoRA:
  Freeze original weights W (N billion params)
  Add small trainable matrices: ΔW = A × B
    where A is (d × r) and B is (r × d), r << d
  Train only A and B (r = 8-64, vs d = 4096)
  
  Parameters trained: 2 × d × r  (e.g. 2 × 4096 × 16 = 131K)
  vs original layer:  d × d       (e.g. 4096 × 4096 = 16.7M)
  Reduction: ~100×
```

```python
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM

base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Meta-Llama-3.1-8B")

lora_config = LoraConfig(
    r=16,               # rank of the adaptation matrices
    lora_alpha=32,      # scaling factor
    target_modules=["q_proj", "v_proj"],  # which layers to adapt
    lora_dropout=0.1,
    bias="none",
    task_type="CAUSAL_LM"
)

model = get_peft_model(base_model, lora_config)
model.print_trainable_parameters()
# trainable params: 2,097,152 || all params: 8,033,669,120 || trainable%: 0.026%
```

**QLoRA:** LoRA + quantization (4-bit). Fine-tune a 70B model on a single A100 GPU.

---

### PEFT (Parameter-Efficient Fine-Tuning)

Umbrella term for techniques that train a small subset of parameters:

| Method | Approach | When to use |
|---|---|---|
| **LoRA** | Low-rank adapter matrices | Most common, general purpose |
| **QLoRA** | LoRA + 4-bit quantization | Large models on limited GPU |
| **Prefix Tuning** | Prepend trainable "virtual tokens" | Style/format control |
| **Prompt Tuning** | Tune only the prompt embedding | Smallest footprint |
| **Adapter layers** | Insert trainable modules between layers | Multi-task fine-tuning |

---

### RLHF (Reinforcement Learning from Human Feedback)

The technique behind ChatGPT's helpfulness and safety. Three stages:

```
Stage 1: SFT
  Fine-tune base model on high-quality demonstrations
  → Instruction-following model

Stage 2: Reward Model Training
  Collect human preferences: given (prompt, response_A, response_B)
  → Annotators rank which response is better
  → Train a reward model to predict human preference scores

Stage 3: RL Optimisation (PPO)
  Use reward model to score LLM outputs
  Optimise LLM with PPO to maximise reward
  KL divergence penalty prevents the model from drifting too far from SFT
```

**Expensive and complex.** Requires human annotators, a separate reward model, and RL training. Used by OpenAI, Anthropic, Google — not typically done in-house.

---

### DPO (Direct Preference Optimisation)

A simpler alternative to RLHF that skips the reward model and RL stage.

```
Training data: (prompt, chosen_response, rejected_response)

DPO directly optimises the model to:
  → Increase probability of chosen_response
  → Decrease probability of rejected_response
  → Stay close to the reference model (KL constraint)
```

```python
from trl import DPOTrainer, DPOConfig

trainer = DPOTrainer(
    model=model,
    ref_model=reference_model,   # frozen copy of base model
    args=DPOConfig(beta=0.1),    # beta controls KL constraint strength
    train_dataset=preference_dataset,  # {prompt, chosen, rejected}
    tokenizer=tokenizer,
)
trainer.train()
```

**DPO vs RLHF:**
- DPO: simpler, more stable, no separate reward model
- RLHF: more powerful, handles complex reward functions, industry standard for frontier models

---

## Fine-tuning data quality

**Data quality beats data quantity.** 50 perfect examples outperform 5,000 noisy ones.

```
Bad training example:
  Input:  "Summarise this legal contract"
  Output: "This contract is about some legal stuff between two companies."

Good training example:
  Input:  "Summarise this legal contract"
  Output: "Agreement between Acme Corp and Beta Ltd dated 2024-01-15.
           Key terms: 12-month SaaS subscription at $50K/year.
           Includes data processing addendum (GDPR compliant).
           Termination clause: 30-day notice, immediate termination for breach."
```

**Data preparation checklist:**
- [ ] Each example represents the exact format/style you want at inference
- [ ] Cover edge cases and failure modes, not just happy paths
- [ ] No contradictions between examples
- [ ] Diverse inputs — don't overfit to one pattern
- [ ] De-duplicate before training

---

## Fine-tuning vs RAG decision matrix

| Factor | Favours RAG | Favours Fine-tuning |
|---|---|---|
| Data changes frequently | ✓ | |
| Need to cite sources | ✓ | |
| Large knowledge base | ✓ | |
| Quick to deploy | ✓ | |
| Fixed domain knowledge | | ✓ |
| Custom output format | | ✓ |
| Specific writing style | | ✓ |
| Low latency (no retrieval) | | ✓ |
| Can't expose training data at inference | | ✓ |

**Combine both:** Fine-tune for style/format, use RAG for up-to-date knowledge.

---

## Continual learning problem

Fine-tuned models can **catastrophically forget** — they lose general capabilities as they specialise.

```
Base model: knows Python, Java, C++, SQL, ...
Fine-tuned on Java:
  Java performance: +30%
  Python performance: -15%  ← catastrophic forgetting
  SQL performance: -10%
```

**Mitigations:**
- Mix fine-tuning data with general-purpose examples
- Use LoRA (frozen base weights preserve general knowledge)
- Elastic Weight Consolidation (EWC) — penalise changes to weights important for other tasks

---

## Infrastructure for fine-tuning

| Scale | Setup | Cost estimate |
|---|---|---|
| < 10B params (QLoRA) | Single A100 40GB | ~$2–5/hour (cloud) |
| 7–70B params (LoRA) | 4× A100 80GB | ~$8–20/hour |
| > 70B params | 8–32× H100 | ~$50–200/hour |
| Managed (OpenAI) | No GPU needed | $3/1M training tokens |

**Tooling:**
```
Hugging Face TRL   → SFT, DPO, RLHF training
Unsloth            → 2-5× faster LoRA/QLoRA training
Axolotl            → Config-driven fine-tuning
OpenAI API         → Managed fine-tuning (limited models)
Together.ai        → Managed fine-tuning for open-source models
```

---

## Interview / design angle

!!! tip "What comes up in AI system design"
    - *"When would you fine-tune instead of using RAG?"* → Fixed style/format the model can't learn from prompts; latency requirements where retrieval is too slow; domain where base model vocabulary/tokenization is poor
    - *"How do you avoid destroying general capabilities?"* → LoRA (frozen base), mix general data into fine-tuning set, eval on general benchmarks before/after
    - *"What data do you need?"* → 50–500 high-quality input/output pairs; quality >> quantity; cover edge cases

## Related topics

- [RAG](rag.md) — often the better alternative
- [Prompt Engineering](prompt-engineering.md) — try this before fine-tuning
- [LLM Inference & Serving](llm-inference.md) — serving fine-tuned models
- [Evaluation](evaluation.md) — how to measure fine-tuning impact
