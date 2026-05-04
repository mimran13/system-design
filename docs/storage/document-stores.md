# Document Stores

## What it is

A document store saves data as self-contained documents — typically JSON or BSON. Each document can have a different structure. There's no schema enforced by the database. Documents are grouped in collections (not tables).

## Data model

```json
// Collection: orders
{
  "_id": "ord_8821",
  "user": {
    "id": "u_1001",
    "name": "Alice",
    "email": "alice@example.com"
  },
  "items": [
    { "product_id": "p_500", "name": "Widget", "qty": 2, "price": 9.99 },
    { "product_id": "p_501", "name": "Gadget", "qty": 1, "price": 24.99 }
  ],
  "status": "pending",
  "shipping_address": {
    "street": "123 Main St",
    "city": "Springfield"
  },
  "created_at": { "$date": "2024-04-26T10:00:00Z" },
  "metadata": { "source": "mobile_app", "ab_test": "variant_b" }
}
```

Key differences from relational:
- No fixed schema — fields can vary per document
- Nested objects and arrays are first-class — no need for join tables
- Each document is a natural unit — reads/writes are typically per-document

## MongoDB

The dominant document store. MongoDB stores BSON (Binary JSON) documents.

### CRUD

```javascript
// Insert
db.orders.insertOne({ user_id: "u_1001", status: "pending", items: [...] })

// Find
db.orders.find({ status: "pending", "user.id": "u_1001" })
db.orders.findOne({ _id: ObjectId("ord_8821") })

// Update
db.orders.updateOne(
  { _id: "ord_8821" },
  { $set: { status: "shipped" }, $push: { events: { action: "shipped", at: new Date() } } }
)

// Delete
db.orders.deleteOne({ _id: "ord_8821" })
```

### Aggregation pipeline

MongoDB's most powerful feature — multi-stage transformation pipeline for analytics:

```javascript
db.orders.aggregate([
  { $match: { status: "completed", created_at: { $gte: ISODate("2024-01-01") } } },
  { $unwind: "$items" },
  { $group: {
    _id: "$items.product_id",
    total_revenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } },
    order_count: { $sum: 1 }
  }},
  { $sort: { total_revenue: -1 } },
  { $limit: 10 }
])
```

### Indexing

```javascript
// Single field index
db.orders.createIndex({ status: 1 })

// Compound index (left-prefix rule same as SQL)
db.orders.createIndex({ user_id: 1, created_at: -1 })

// Text index for full-text search
db.products.createIndex({ name: "text", description: "text" })

// Array field index (multikey) — indexes every element
db.orders.createIndex({ "items.product_id": 1 })

// Partial index — only index pending orders
db.orders.createIndex({ created_at: 1 }, { partialFilterExpression: { status: "pending" } })
```

### Schema design patterns

**Embedding vs referencing** is the core MongoDB design decision:

=== "Embed (denormalize)"
    ```json
    // User document with embedded address
    {
      "_id": "u_1001",
      "name": "Alice",
      "addresses": [
        { "type": "home", "street": "123 Main", "city": "Springfield" },
        { "type": "work", "street": "456 Oak", "city": "Shelbyville" }
      ]
    }
    ```
    **Use when:** Data is accessed together, 1:1 or 1:few relationship, child data doesn't grow unbounded

=== "Reference (normalize)"
    ```json
    // Order references user by ID
    { "_id": "ord_8821", "user_id": "u_1001", "items": [...] }
    
    // Requires $lookup (like a join) or multiple queries
    db.orders.aggregate([
      { $lookup: { from: "users", localField: "user_id", foreignField: "_id", as: "user" } }
    ])
    ```
    **Use when:** Data is large, frequently updated independently, or shared across many documents

**Bucket pattern** — group time-series or event data into buckets to reduce document count:
```json
{
  "sensor_id": "s_001",
  "hour": "2024-04-26T14:00:00Z",
  "readings": [
    { "minute": 0, "temp": 22.1 },
    { "minute": 1, "temp": 22.3 },
    ...
    { "minute": 59, "temp": 22.8 }
  ],
  "count": 60,
  "max_temp": 22.9,
  "min_temp": 22.0
}
```

### Transactions

MongoDB 4.0+ supports multi-document ACID transactions:

```javascript
const session = client.startSession();
session.withTransaction(async () => {
  await orders.insertOne({ ... }, { session });
  await inventory.updateOne({ _id: product_id }, { $inc: { stock: -1 } }, { session });
});
```

**Caveat:** Transactions in MongoDB are slower and less recommended than in SQL DBs. Design documents to minimize cross-document transactions.

### Replication & Sharding

**Replica Set:** 3+ nodes (primary + secondaries). Automatic failover via Raft election. Reads can go to secondaries (with staleness risk).

**Sharding:** MongoDB Atlas and self-hosted both support sharding. Choose shard key carefully — same rules as DynamoDB partition key (avoid hot shards, high cardinality).

## When to use document stores

| Good fit | Bad fit |
|---|---|
| Hierarchical / nested data (orders with items) | Complex multi-entity queries with many joins |
| Varying schema per document (product catalog) | Strict ACID across many documents |
| Content management, catalogs, user profiles | Financial ledgers, inventory |
| Rapid iteration / schema evolution | When you need strong consistency guarantees |
| Read-heavy with document-level access | Write-heavy with many conflicting updates |

## AWS equivalent

| Service | Notes |
|---|---|
| Amazon DocumentDB | MongoDB-compatible, fully managed on AWS |
| DynamoDB (document mode) | Can store JSON documents; less query flexibility |
| Amazon Keyspaces | For Cassandra (wide-column, not document) |

!!! warning "DocumentDB is not MongoDB"
    AWS DocumentDB is MongoDB-compatible at the driver level but is a completely different engine (Aurora-based). Some MongoDB features (aggregation stages, transactions, change streams) behave differently or have limitations.

## Interview angle

!!! tip "What interviewers are testing"
    They want to see you articulate *when* the flexible schema and embedding model is the right choice — not just "MongoDB is good for JSON."

**Strong answer pattern:**
1. Identify nested/hierarchical data in the domain — orders with line items, posts with comments
2. Justify embedding vs referencing for each relationship
3. Name the access pattern — "we always fetch the order with all its items, so embedding is correct"
4. Acknowledge the transaction limitation — "for cross-document ACID, we'd use a SQL DB or careful denormalization"

## Related topics

- [SQL vs NoSQL](sql-vs-nosql.md) — decision framework
- [Wide-Column Stores](wide-column-stores.md) — when write scale dominates
- [Key-Value Stores](key-value-stores.md) — simpler model for simpler access patterns
- [Sharding](../patterns/sharding.md) — how MongoDB distributes data
