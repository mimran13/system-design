# Example: Customer Support Agent

A customer support agent that handles tier-1 queries autonomously — looking up orders, answering FAQs, processing refunds — and escalates to a human when it can't resolve the issue. This is the most common real-world agent deployment pattern.

---

## What it does

```
Customer: "My order #12345 hasn't arrived. It's been 10 days."

Agent:
  → get_order("12345")          → order found, shipped 8 days ago
  → get_shipping_status("12345") → "delayed at regional hub"
  → search_kb("shipping delay policy")  → finds policy: 10+ days = eligible for reship
  → check_eligibility("12345")  → order is within policy

  Decision: eligible for free reship

  → process_reship("12345")     → creates new shipment

Output: "I've arranged a reship of your order. New tracking: #XYZ. 
         Expected delivery: 3-5 business days. Sorry for the inconvenience!"

───────────────────────────────

Customer: "I want to sue your company for emotional distress"

Agent:
  → escalate_to_human(reason="legal threat", priority="urgent")

Output: "I'm connecting you with a senior support specialist right away. 
         They'll be with you within 2 minutes."
```

---

## Full implementation

```python
import json
import os
import anthropic
from datetime import datetime, timedelta
from typing import Optional

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# ─── Mock data store ──────────────────────────────────────────────────────────

ORDERS = {
    "12345": {
        "id": "12345", "customer_id": "C001", "customer_name": "Alice Johnson",
        "status": "shipped", "shipped_date": "2024-01-05",
        "items": [{"name": "Wireless Headphones", "qty": 1, "price": 199.99}],
        "total": 199.99, "tracking": "TRK789012",
        "shipping_status": "delayed_in_transit"
    },
    "67890": {
        "id": "67890", "customer_id": "C002", "customer_name": "Bob Smith",
        "status": "delivered", "delivered_date": "2024-01-08",
        "items": [{"name": "USB-C Cable 3-pack", "qty": 2, "price": 24.99}],
        "total": 49.98, "tracking": "TRK456789",
        "shipping_status": "delivered"
    }
}

KB_ARTICLES = [
    {
        "id": "kb-001", "title": "Shipping delays and reshipping policy",
        "content": "If an order is delayed more than 10 business days from the expected delivery date, customers are eligible for a free reship or full refund. Process: verify order status, confirm delay exceeds threshold, offer reship or refund, document in CRM."
    },
    {
        "id": "kb-002", "title": "Return and refund policy",
        "content": "Customers can return items within 30 days of delivery for a full refund. Items must be unused and in original packaging. Digital products are non-refundable. Refunds are processed within 5-7 business days to the original payment method."
    },
    {
        "id": "kb-003", "title": "Account billing issues",
        "content": "For double charges: verify transaction IDs, initiate refund for duplicate. For unauthorized charges: escalate to billing team immediately, freeze account if needed. For subscription issues: check renewal date, process refund if within 7 days of renewal."
    }
]

# ─── Tool implementations ─────────────────────────────────────────────────────

def get_order(order_id: str) -> dict:
    order = ORDERS.get(order_id)
    if not order:
        return {"error": f"Order {order_id} not found. Please verify the order number."}
    return order


def get_shipping_status(order_id: str) -> dict:
    order = ORDERS.get(order_id)
    if not order:
        return {"error": f"Order {order_id} not found"}

    statuses = {
        "delayed_in_transit": {
            "status": "Delayed",
            "message": "Your shipment is delayed at a regional sorting facility.",
            "estimated_delivery": "2-3 more business days",
            "days_since_ship": 8
        },
        "delivered": {
            "status": "Delivered",
            "message": "Package delivered successfully.",
            "delivered_at": order.get("delivered_date")
        },
        "in_transit": {
            "status": "In Transit",
            "message": "On its way to you.",
            "estimated_delivery": "1-2 business days"
        }
    }
    return statuses.get(order.get("shipping_status", "in_transit"),
                        {"status": "Unknown", "message": "Unable to retrieve status"})


def search_knowledge_base(query: str) -> list[dict]:
    """Search internal KB for policies and procedures"""
    # Simple keyword matching — production would use vector search
    results = []
    query_lower = query.lower()
    for article in KB_ARTICLES:
        if any(word in article["title"].lower() or word in article["content"].lower()
               for word in query_lower.split()):
            results.append(article)
    return results or [{"message": "No relevant articles found"}]


def process_refund(order_id: str, reason: str, amount: Optional[float] = None) -> dict:
    order = ORDERS.get(order_id)
    if not order:
        return {"error": f"Order {order_id} not found"}

    refund_amount = amount or order["total"]
    refund_id = f"REF-{order_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    return {
        "status": "approved",
        "refund_id": refund_id,
        "order_id": order_id,
        "amount": refund_amount,
        "processing_time": "5-7 business days",
        "method": "original payment method",
        "message": f"Refund of ${refund_amount:.2f} initiated. Reference: {refund_id}"
    }


def process_reship(order_id: str, notes: str = "") -> dict:
    order = ORDERS.get(order_id)
    if not order:
        return {"error": f"Order {order_id} not found"}

    new_tracking = f"TRK-RESHIP-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    return {
        "status": "reship_scheduled",
        "original_order": order_id,
        "new_tracking": new_tracking,
        "estimated_delivery": (datetime.now() + timedelta(days=4)).strftime("%Y-%m-%d"),
        "message": f"Reship scheduled. New tracking: {new_tracking}. Estimated delivery: 3-5 business days."
    }


def escalate_to_human(reason: str, priority: str = "normal",
                      context: str = "") -> dict:
    """Escalate to human agent"""
    ticket_id = f"ESC-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    wait_times = {"urgent": "2 minutes", "high": "5 minutes", "normal": "10-15 minutes"}

    return {
        "status": "escalated",
        "ticket_id": ticket_id,
        "priority": priority,
        "reason": reason,
        "estimated_wait": wait_times.get(priority, "10-15 minutes"),
        "message": f"Escalated to human support (ticket {ticket_id}). "
                   f"A specialist will join in approximately {wait_times.get(priority, '10-15 minutes')}."
    }


# ─── Tool definitions ─────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "get_order",
        "description": "Look up order details by order ID. Returns order status, items, total, and tracking info.",
        "input_schema": {
            "type": "object",
            "properties": {"order_id": {"type": "string"}},
            "required": ["order_id"]
        }
    },
    {
        "name": "get_shipping_status",
        "description": "Get real-time shipping status for an order. Use after get_order to check delivery status.",
        "input_schema": {
            "type": "object",
            "properties": {"order_id": {"type": "string"}},
            "required": ["order_id"]
        }
    },
    {
        "name": "search_knowledge_base",
        "description": "Search internal policies, procedures, and FAQs. Use before taking action to verify you're following the right policy.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "What policy or procedure to look up"}},
            "required": ["query"]
        }
    },
    {
        "name": "process_refund",
        "description": "Issue a refund for an order. Only use when policy allows it and the customer has requested it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string"},
                "reason": {"type": "string"},
                "amount": {"type": "number", "description": "Refund amount in USD. Omit for full refund."}
            },
            "required": ["order_id", "reason"]
        }
    },
    {
        "name": "process_reship",
        "description": "Schedule a free reship for a lost or significantly delayed order. Only use when policy allows it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string"},
                "notes": {"type": "string"}
            },
            "required": ["order_id"]
        }
    },
    {
        "name": "escalate_to_human",
        "description": (
            "Escalate to a human support agent. Use when: "
            "(1) the issue is complex or sensitive beyond your authority, "
            "(2) the customer is very upset or threatening, "
            "(3) there's a legal or security concern, "
            "(4) you've tried and cannot resolve the issue, "
            "(5) the customer explicitly requests a human."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Why escalating"},
                "priority": {"type": "string", "enum": ["normal", "high", "urgent"]},
                "context": {"type": "string", "description": "Summary of the conversation for the human agent"}
            },
            "required": ["reason", "priority"]
        }
    }
]

TOOL_FNS = {
    "get_order": get_order,
    "get_shipping_status": get_shipping_status,
    "search_knowledge_base": search_knowledge_base,
    "process_refund": process_refund,
    "process_reship": process_reship,
    "escalate_to_human": escalate_to_human,
}

# ─── System prompt ────────────────────────────────────────────────────────────

SYSTEM = """You are a friendly and efficient customer support agent for ShopCo, an e-commerce company.

Your goal: Resolve customer issues quickly and accurately.

ALWAYS:
- Look up order details before discussing any order-specific issue
- Check the knowledge base before taking any action (refund, reship)
- Be empathetic and professional, especially with frustrated customers
- Confirm the action you took at the end of each response

ESCALATE TO HUMAN when:
- Customer uses threatening or abusive language
- Any legal threats (lawsuits, chargebacks disputes)
- Security concerns (account hacked, fraud)
- You cannot find a path to resolution after 2-3 attempts
- Customer explicitly asks for a human

NEVER:
- Process refunds or reshipping without checking policy first
- Make promises you can't keep
- Guess about order status — always look it up
- Discuss competitor products

Tone: Warm, direct, solutions-focused. Keep responses concise."""

# ─── Conversational agent ─────────────────────────────────────────────────────

class CustomerSupportAgent:
    def __init__(self):
        self.history: list[dict] = []
        self.escalated = False

    def chat(self, customer_message: str) -> str:
        if self.escalated:
            return "You're connected with our support team. How can I help?"

        self.history.append({"role": "user", "content": customer_message})
        messages = list(self.history)

        for _ in range(8):  # max tool iterations per turn
            response = client.messages.create(
                model="claude-opus-4-6",
                system=SYSTEM,
                max_tokens=1024,
                tools=TOOLS,
                messages=messages
            )

            if response.stop_reason == "end_turn":
                text = next((b.text for b in response.content if hasattr(b, "text")), "")
                self.history.append({"role": "assistant", "content": text})
                return text

            if response.stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": response.content})
                tool_results = []

                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    result = TOOL_FNS[block.name](**block.input)
                    if block.name == "escalate_to_human":
                        self.escalated = True
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result)
                    })

                messages.append({"role": "user", "content": tool_results})

        return "I apologize, I'm having trouble processing your request. Let me connect you with a specialist."

    def reset(self):
        self.history.clear()
        self.escalated = False


# ─── Run it ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    agent = CustomerSupportAgent()

    conversations = [
        # Scenario 1: Shipping delay resolved with reship
        [
            "Hi, my order 12345 hasn't arrived. It's been over a week.",
            "Yes, I'd like the reship please. Thank you!"
        ],
        # Scenario 2: Refund request
        [
            "I want to return my order 67890. I don't need it anymore.",
        ],
        # Scenario 3: Escalation
        [
            "This is the worst service I've ever received. I'm going to sue you.",
        ]
    ]

    for i, conversation in enumerate(conversations, 1):
        print(f"\n{'='*60}")
        print(f"SCENARIO {i}")
        print('='*60)
        agent.reset()

        for message in conversation:
            print(f"\nCustomer: {message}")
            response = agent.chat(message)
            print(f"Agent: {response}")
```

---

## Sample output

```
============================================================
SCENARIO 1
============================================================

Customer: Hi, my order 12345 hasn't arrived. It's been over a week.

Agent: I'm sorry to hear that! Let me look into order #12345 right away.

Your order was shipped on January 5th and is currently showing a delay at a 
regional sorting facility — it should have arrived by now, so I completely 
understand your frustration.

Good news: since it's been delayed beyond our expected delivery window, you're 
eligible for either a **free reship** or a **full refund**. Which would you prefer?

Customer: Yes, I'd like the reship please. Thank you!

Agent: Done! I've scheduled a reship for your Wireless Headphones. Here are the details:

- **New tracking number:** TRK-RESHIP-20240115143022  
- **Estimated delivery:** January 19, 2024 (3-5 business days)

You'll receive a confirmation email shortly. I'm sorry for the inconvenience — 
is there anything else I can help you with?

============================================================
SCENARIO 3
============================================================

Customer: This is the worst service I've ever received. I'm going to sue you.

Agent: I'm very sorry you're this frustrated — I can hear how upsetting this has been.

Because you've mentioned legal action, I want to make sure you're speaking with 
the right person immediately. I've connected you with a senior support specialist 
(ticket ESC-20240115143025). They'll be with you in approximately **2 minutes**.

I want to make sure this gets resolved properly for you.
```

---

## Production patterns

```python
# 1. Multi-channel: same agent for chat, email, SMS
class OmniChannelAgent(CustomerSupportAgent):
    def handle_email(self, email: dict) -> str:
        prompt = f"Subject: {email['subject']}\n\n{email['body']}"
        return self.chat(prompt)

# 2. Integration with ticketing system (Zendesk, Freshdesk)
def create_ticket(conversation: list, outcome: str):
    zendesk.create_ticket({
        "subject": "AI Agent Interaction",
        "comment": {"body": format_conversation(conversation)},
        "tags": ["ai-agent", outcome]
    })

# 3. Quality monitoring — sample and review agent decisions
def should_review(agent_action: str) -> bool:
    high_risk = ["process_refund", "process_reship", "escalate_to_human"]
    return agent_action in high_risk
```

---

## Related topics

- [Building Agents](building-agents.md) — the base agent pattern
- [Agent Reliability](agent-reliability.md) — HITL, escalation patterns
- [Multi-Agent Systems](multi-agent-systems.md) — tier-1/tier-2 agent handoffs
- [AI Engineering: Guardrails & Safety](../ai/guardrails-safety.md) — safety for customer-facing agents
