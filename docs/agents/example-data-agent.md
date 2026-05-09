# Example: Data Analysis Agent

A data analysis agent that takes a natural language question about your data, writes and executes SQL/Python to answer it, interprets the results, and generates charts and insights. This is the "talk to your data" pattern.

---

## What it does

```
User: "Which product categories had declining sales last quarter vs the previous one? 
       Show me the numbers and suggest why it might be happening."

Agent:
  → execute_sql("SELECT category, SUM(revenue) FROM orders WHERE ...")
  → execute_sql("SELECT category, SUM(revenue) FROM orders WHERE ... previous quarter")
  → run_python("""
      import pandas as pd
      # calculate % change, sort by decline
    """)
  → web_search("electronics consumer spending Q3 2024 decline") # contextual research
  → generate_chart(data, "bar chart of category decline")

Output: Table of declining categories + % change + contextual insights + chart
```

---

## Full implementation

```python
import json
import os
import sqlite3
import subprocess
import tempfile
import anthropic
import requests

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# ─── Sample database setup ────────────────────────────────────────────────────

def create_sample_db(db_path: str = "sales.db"):
    """Create a sample sales database for testing"""
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY,
            order_date DATE,
            customer_id INTEGER,
            product_id INTEGER,
            category TEXT,
            product_name TEXT,
            quantity INTEGER,
            unit_price REAL,
            revenue REAL,
            region TEXT
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY,
            name TEXT,
            email TEXT,
            plan TEXT,
            signup_date DATE,
            country TEXT
        );

        -- Insert sample data
        INSERT OR IGNORE INTO orders VALUES
            (1, '2024-07-15', 1, 101, 'Electronics', 'Laptop Pro', 2, 1299.99, 2599.98, 'North'),
            (2, '2024-07-20', 2, 102, 'Electronics', 'Headphones', 5, 199.99, 999.95, 'South'),
            (3, '2024-08-01', 3, 201, 'Clothing', 'Winter Jacket', 3, 89.99, 269.97, 'North'),
            (4, '2024-09-10', 1, 301, 'Books', 'System Design Guide', 10, 49.99, 499.90, 'East'),
            (5, '2024-10-05', 4, 101, 'Electronics', 'Laptop Pro', 1, 1299.99, 1299.99, 'West'),
            (6, '2024-10-12', 2, 401, 'Home', 'Coffee Maker', 4, 79.99, 319.96, 'North'),
            (7, '2024-11-01', 5, 102, 'Electronics', 'Headphones', 2, 189.99, 379.98, 'South'),
            (8, '2024-11-15', 3, 201, 'Clothing', 'Winter Jacket', 8, 79.99, 639.92, 'East');
    """)
    conn.commit()
    conn.close()

DB_PATH = "sales.db"
create_sample_db(DB_PATH)

# ─── Tool implementations ─────────────────────────────────────────────────────

def get_schema() -> dict:
    """Return database schema so the agent knows what tables/columns exist"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]

    schema = {}
    for table in tables:
        cursor.execute(f"PRAGMA table_info({table})")
        columns = [{"name": row[1], "type": row[2]} for row in cursor.fetchall()]
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        row_count = cursor.fetchone()[0]
        schema[table] = {"columns": columns, "row_count": row_count}

    conn.close()
    return schema


def execute_sql(query: str) -> dict:
    """Execute a read-only SQL query"""
    # Safety: only allow SELECT
    stripped = query.strip().upper()
    if not stripped.startswith("SELECT") and not stripped.startswith("WITH"):
        return {"error": "Only SELECT queries are allowed"}

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(query)
        rows = [dict(row) for row in cursor.fetchmany(200)]  # cap at 200 rows
        columns = [desc[0] for desc in cursor.description]
        conn.close()
        return {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "query": query
        }
    except Exception as e:
        return {"error": str(e), "query": query}


def run_python(code: str) -> dict:
    """Execute Python for data analysis (pandas, numpy, basic stats)"""
    # Allowed imports only
    allowed_imports = ["pandas", "numpy", "json", "statistics", "math", "datetime"]
    for line in code.split("\n"):
        if "import" in line:
            module = line.split("import")[-1].strip().split(".")[0].split(" ")[0]
            if module and module not in allowed_imports and not module.startswith("#"):
                return {"error": f"Import '{module}' not allowed. Use: {allowed_imports}"}

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        tmpfile = f.name

    try:
        result = subprocess.run(
            ["python3", tmpfile],
            capture_output=True, text=True, timeout=15,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        )
        return {
            "stdout": result.stdout[:3000],
            "stderr": result.stderr[:500] if result.stderr else None,
            "returncode": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {"error": "Code execution timed out (15s limit)"}
    finally:
        os.unlink(tmpfile)


def create_visualization(data: list[dict], chart_type: str, title: str,
                          x_key: str, y_key: str) -> dict:
    """Generate a matplotlib chart and save it"""
    code = f"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import json

data = {json.dumps(data)}
x = [str(row["{x_key}"]) for row in data]
y = [float(row["{y_key}"]) for row in data]

fig, ax = plt.subplots(figsize=(10, 6))
if "{chart_type}" == "bar":
    bars = ax.bar(x, y, color=['#ef4444' if v < 0 else '#22c55e' for v in y])
elif "{chart_type}" == "line":
    ax.plot(x, y, marker='o', linewidth=2)
elif "{chart_type}" == "pie":
    ax.pie(y, labels=x, autopct='%1.1f%%')

ax.set_title("{title}", fontsize=14, fontweight='bold')
ax.set_xlabel("{x_key}")
ax.set_ylabel("{y_key}")
plt.xticks(rotation=45, ha='right')
plt.tight_layout()
plt.savefig("chart.png", dpi=150, bbox_inches='tight')
print("Chart saved to chart.png")
"""
    result = run_python(code)
    return {**result, "chart_file": "chart.png" if result.get("returncode") == 0 else None}


# ─── Tool definitions ─────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "get_schema",
        "description": "Get the database schema: tables, columns, and row counts. Always call this first before writing any SQL.",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "execute_sql",
        "description": "Execute a read-only SQL SELECT query against the database. Returns rows as JSON. Cap at 200 rows.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "SQL SELECT statement"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "run_python",
        "description": (
            "Run Python code for data analysis and calculations. "
            "Has access to pandas, numpy, json, statistics, math. "
            "Use for aggregations, percentage changes, statistical analysis, and data transformations. "
            "Print your results — stdout is returned."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Python code to execute"}
            },
            "required": ["code"]
        }
    },
    {
        "name": "create_visualization",
        "description": "Create a chart from data. Supports bar, line, and pie charts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "data": {"type": "array", "items": {"type": "object"}},
                "chart_type": {"type": "string", "enum": ["bar", "line", "pie"]},
                "title": {"type": "string"},
                "x_key": {"type": "string", "description": "Column name for x-axis"},
                "y_key": {"type": "string", "description": "Column name for y-axis"}
            },
            "required": ["data", "chart_type", "title", "x_key", "y_key"]
        }
    }
]

TOOL_FNS = {
    "get_schema": get_schema,
    "execute_sql": execute_sql,
    "run_python": run_python,
    "create_visualization": create_visualization,
}

# ─── System prompt ────────────────────────────────────────────────────────────

SYSTEM = """You are a senior data analyst with strong SQL and Python skills.

When asked a data question:
1. Call get_schema first to understand the database structure
2. Write precise SQL to retrieve the relevant data
3. Use run_python with pandas for complex analysis (% changes, rankings, correlations)
4. Create a visualization when it would aid understanding
5. Provide clear, actionable insights — not just raw numbers

SQL guidelines:
- Use date functions for time-based analysis
- Always include ORDER BY for ranked results
- Use CTEs for complex multi-step queries
- Include appropriate GROUP BY

Insights guidelines:
- State the direct answer first, then explain
- Include the actual numbers
- Identify patterns, outliers, and trends
- Suggest follow-up analyses when relevant"""

# ─── Agent loop ───────────────────────────────────────────────────────────────

def run_data_agent(question: str, max_iterations: int = 12) -> str:
    messages = [{"role": "user", "content": question}]
    print(f"\n📊 Question: {question}\n")

    for iteration in range(1, max_iterations + 1):
        response = client.messages.create(
            model="claude-opus-4-6",
            system=SYSTEM,
            max_tokens=4096,
            tools=TOOLS,
            messages=messages
        )

        if response.stop_reason == "end_turn":
            answer = next((b.text for b in response.content if hasattr(b, "text")), "")
            print(f"\n{'='*60}\n📈 Analysis:\n{answer}")
            return answer

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []

            for block in response.content:
                if block.type != "tool_use":
                    continue

                print(f"  [{iteration}] → {block.name}")

                try:
                    result = TOOL_FNS[block.name](**block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result)
                    })
                except Exception as e:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": f"Error: {e}",
                        "is_error": True
                    })

            messages.append({"role": "user", "content": tool_results})

    return "Agent exceeded iteration limit"


# ─── Run it ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    questions = [
        "What are our top 3 product categories by revenue? Show me the numbers.",
        "Which region has the highest average order value?",
        "Show me month-over-month revenue trend for Q3 and Q4 2024.",
    ]

    for q in questions:
        run_data_agent(q)
        print("\n" + "─"*60 + "\n")
```

---

## Sample interaction

```
📊 Question: What are our top 3 product categories by revenue?

  [1] → get_schema
  [2] → execute_sql
        SELECT category,
               SUM(revenue) as total_revenue,
               COUNT(*) as order_count,
               ROUND(AVG(revenue), 2) as avg_order_value
        FROM orders
        GROUP BY category
        ORDER BY total_revenue DESC

  [3] → create_visualization
        (bar chart of category revenue)

════════════════════════════════════════════════════════════
📈 Analysis:
Here are the top 3 product categories by revenue:

| Category    | Revenue   | Orders | Avg Order |
|-------------|-----------|--------|-----------|
| Electronics | $5,279.90 | 4      | $1,319.98 |
| Clothing    | $909.89   | 2      | $454.95   |
| Books       | $499.90   | 1      | $499.90   |

**Key insights:**
- Electronics dominates at 73% of total revenue, driven primarily by Laptop Pro 
  ($1,299.99 unit price × high volumes)
- Clothing has a much lower average order value ($454.95) — seasonal item bundling 
  could improve this
- Books shows a single large order ($499.90) — worth investigating if this is 
  a corporate/bulk buyer vs individual sales

**Recommended follow-up:** Break down Electronics by product to see 
if Laptop Pro is the only driver, or if Headphones also contribute significantly.
```

---

## Extending the agent

```python
# Connect to a real database
import psycopg2

def execute_sql(query: str) -> dict:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cursor = conn.cursor()
    cursor.execute(query)
    rows = cursor.fetchmany(200)
    return {"rows": rows, "columns": [d[0] for d in cursor.description]}

# Add to Slack / web app
from flask import Flask, request, jsonify
app = Flask(__name__)

@app.post("/analyze")
def analyze():
    question = request.json["question"]
    answer = run_data_agent(question)
    return jsonify({"answer": answer})

# Add authentication check (analyst-only endpoint)
# Add rate limiting (expensive agent calls)
# Add result caching (same question within 1 hour)
```

---

## Related topics

- [Function Calling](function-calling.md) — how execute_sql and run_python are wired up
- [Agent Reliability](agent-reliability.md) — SQL injection protection, code sandboxing
- [Example: Research Agent](example-research-agent.md) — web search pattern
- [Example: Customer Support Agent](example-customer-support-agent.md) — next example
