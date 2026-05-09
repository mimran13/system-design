# Graph Databases

A graph database stores data as nodes and relationships, making it natural to model and query highly connected data — social networks, fraud rings, recommendation engines, and knowledge graphs. Where relational databases struggle with multi-hop JOIN chains, graph databases traverse relationships natively in sub-second time.

---

## The property graph model

The core abstraction: **nodes** (entities) connected by **edges** (relationships), both of which can carry **properties**.

```
(Alice)-[:FOLLOWS]->(Bob)
(Alice)-[:PURCHASED]->(Product:Laptop {price: 1299})
(Bob)-[:REVIEWED {rating: 5}]->(Product:Laptop)
(Alice)-[:FRIEND_OF {since: "2020"}]->(Carol)
(Carol)-[:WORKS_AT]->(Company:Acme)
```

```
Nodes:      Alice, Bob, Carol, Product(Laptop), Company(Acme)
Edges:      FOLLOWS, PURCHASED, REVIEWED, FRIEND_OF, WORKS_AT
Properties: {price: 1299}, {rating: 5}, {since: "2020"}
```

**Why this beats SQL for graph queries:**

```sql
-- SQL: Find friends-of-friends who bought the same product (2 hops)
-- Requires 3 joins on potentially millions of rows
SELECT DISTINCT u3.name
FROM users u1
JOIN friendships f1 ON u1.id = f1.user_id
JOIN users u2 ON f1.friend_id = u2.id
JOIN friendships f2 ON u2.id = f2.user_id
JOIN users u3 ON f2.friend_id = u3.id
JOIN purchases p1 ON u1.id = p1.user_id
JOIN purchases p2 ON u3.id = p2.user_id
WHERE u1.id = 'alice' AND p1.product_id = p2.product_id;
```

```cypher
-- Cypher (Neo4j): same query — traverse the graph directly
MATCH (alice:User {name: "Alice"})-[:FRIEND_OF*2]->(fof:User),
      (alice)-[:PURCHASED]->(p:Product)<-[:PURCHASED]-(fof)
RETURN DISTINCT fof.name
```

At 4+ hops, the SQL version is effectively unusable. The graph traversal stays fast.

---

## Neo4j

The most widely-used graph database. Uses the Cypher query language.

### Schema and data

```cypher
// Create nodes
CREATE (alice:User {id: 'u1', name: 'Alice', email: 'alice@example.com'})
CREATE (bob:User {id: 'u2', name: 'Bob'})
CREATE (laptop:Product {id: 'p1', name: 'MacBook Pro', price: 1999, category: 'Electronics'})

// Create relationships
MATCH (a:User {name: 'Alice'}), (b:User {name: 'Bob'})
CREATE (a)-[:FOLLOWS {since: date('2023-01-15')}]->(b)

MATCH (a:User {name: 'Alice'}), (p:Product {name: 'MacBook Pro'})
CREATE (a)-[:PURCHASED {order_id: 'ord_123', date: date('2024-03-10')}]->(p)
```

### Queries

```cypher
// 1. Find all of Alice's direct followers
MATCH (alice:User {name: 'Alice'})<-[:FOLLOWS]-(follower)
RETURN follower.name

// 2. Find products Alice's friends bought (recommendations)
MATCH (alice:User {name: 'Alice'})-[:FOLLOWS]->(friend)-[:PURCHASED]->(product)
WHERE NOT (alice)-[:PURCHASED]->(product)  // exclude what Alice already owns
RETURN product.name, COUNT(friend) AS friend_count
ORDER BY friend_count DESC
LIMIT 10

// 3. Shortest path between two users
MATCH path = shortestPath(
    (alice:User {name: 'Alice'})-[:FOLLOWS*]-(carol:User {name: 'Carol'})
)
RETURN length(path) AS degrees_of_separation, 
       [n IN nodes(path) | n.name] AS path

// 4. Fraud detection: find accounts sharing an IP address (transaction ring)
MATCH (a:Account)-[:USED_IP]->(ip:IPAddress)<-[:USED_IP]-(b:Account)
WHERE a <> b
  AND a.flagged = false AND b.flagged = true
RETURN DISTINCT a.id AS suspicious_account, 
       COUNT(ip) AS shared_ips

// 5. Community detection: find users in Alice's extended network (up to 3 hops)
MATCH (alice:User {name: 'Alice'})-[:FOLLOWS*1..3]->(user)
RETURN DISTINCT user.name, 
       MIN(length(shortestPath((alice)-[:FOLLOWS*]->(user)))) AS distance
ORDER BY distance
```

### Indexes in Neo4j

```cypher
// Index for fast node lookup
CREATE INDEX user_id FOR (u:User) ON (u.id)
CREATE INDEX product_category FOR (p:Product) ON (p.category)

// Full-text index for name search
CREATE FULLTEXT INDEX user_name FOR (u:User) ON EACH [u.name]
```

---

## Amazon Neptune

AWS-managed graph database. Supports two query languages:
- **Gremlin** (Apache TinkerPop) — property graph traversal
- **SPARQL** — RDF triples (knowledge graph / semantic web)

```python
# Neptune with Gremlin (Python)
from gremlin_python.driver import client, serializer

neptune_client = client.Client(
    'wss://your-neptune-endpoint:8182/gremlin',
    'g',
    message_serializer=serializer.GraphSONSerializersV2d0()
)

# Find followers of a user
result = neptune_client.submitAsync(
    "g.V().has('User', 'id', userId).in('FOLLOWS').values('name')",
    {"userId": "u1"}
).result()

# Find friends who bought the same product (Gremlin)
result = neptune_client.submitAsync("""
    g.V().has('User', 'name', 'Alice')
     .out('FOLLOWS').as('friend')
     .out('PURCHASED').as('product')
     .select('friend', 'product')
     .by('name')
""").result()
```

**Neptune vs Neo4j:**

| | Neo4j | Amazon Neptune |
|---|---|---|
| Hosting | Self-managed or AuraDB (cloud) | Fully managed AWS |
| Query language | Cypher (excellent) | Gremlin or SPARQL |
| Scale | Up to ~30GB RAM per instance | Up to 64TB storage, serverless option |
| Integration | Great tooling, large community | Native AWS integration |
| Best for | Complex queries, development speed | AWS-native apps, large scale |

---

## Graph algorithms

Graph databases shine at algorithms that are expensive or impossible in SQL:

### PageRank (influence scoring)

```cypher
// Neo4j Graph Data Science library
CALL gds.pageRank.stream('social-graph', {
  maxIterations: 20,
  dampingFactor: 0.85
})
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name AS user, score
ORDER BY score DESC
LIMIT 10
```

### Community detection (Louvain)

```cypher
CALL gds.louvain.stream('social-graph')
YIELD nodeId, communityId
RETURN gds.util.asNode(nodeId).name AS user, communityId
ORDER BY communityId, user
```

### Centrality (most connected nodes)

```cypher
CALL gds.betweennessCentrality.stream('social-graph')
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name, score
ORDER BY score DESC LIMIT 10
// → finds "bridge" accounts that connect communities
```

---

## Real-world use cases

### Social networks

```
Facebook graph: 3 billion users, ~450 billion connections
- "People you may know": mutual friend detection (2-hop traversal)
- News feed ranking: connection strength, interaction history
- Privacy enforcement: per-connection visibility rules
```

### Fraud detection

```
Fraud rings share: IP addresses, device fingerprints, phone numbers, addresses

Graph approach:
  (Account A) -[:SHARES_DEVICE]-> (Device X) <-[:SHARES_DEVICE]- (Account B)
  (Account A) -[:SHARES_PHONE]->  (Phone Y)  <-[:SHARES_PHONE]-  (Account C)

A, B, C are connected through shared properties — a fraud ring.
Graph traversal detects this in milliseconds; SQL would require complex self-joins.
```

### Recommendation engines

```
User → purchased → Product → purchased_by → Other Users
                             → purchased → Related Products

"Customers who bought X also bought Y" = 2-hop graph traversal
```

### Knowledge graphs

```
Google Knowledge Graph: entities + facts
  (Barack Obama)-[:WAS_BORN_IN]->(Honolulu)
  (Barack Obama)-[:WAS_PRESIDENT_OF]->(United States)
  (Honolulu)-[:IS_CAPITAL_OF]->(Hawaii)

Enables: semantic search, entity disambiguation, fact checking
```

---

## When to use a graph database

| Scenario | Use graph? |
|---|---|
| Social connections (friends, followers) | Yes |
| Fraud ring detection | Yes |
| Recommendation engine (collaborative filtering) | Yes |
| Knowledge graph / semantic data | Yes |
| Access control with role hierarchies | Yes |
| Simple key-value access patterns | No — use DynamoDB/Redis |
| ACID transactions with relational data | No — use PostgreSQL |
| Time-series data | No — use InfluxDB |

**Rule of thumb:** If your query involves traversing relationships of unknown depth (1..N hops), graph is the right tool. If depth is always 1-2 hops and data fits in SQL JOINs, relational is simpler.

---

## Polyglot with graph databases

Graph databases are rarely the only store. Common pairings:

```
PostgreSQL  → transactional data (orders, accounts)
Neo4j       → relationship data (social graph, fraud detection)
Redis       → caching (hot user profiles)
Elasticsearch → full-text search (user search)

Sync pattern:
  PostgreSQL change → event → update Neo4j graph
  (eventual consistency between operational DB and graph DB)
```

---

## Interview angle

!!! tip "Graph databases in system design"
    - *"Design a 'people you may know' feature."* → Graph DB. Store users as nodes, follow/friend relationships as edges. "People you may know" = friends-of-friends minus existing connections. 2-hop graph traversal, not SQL joins.
    - *"How does fraud detection work at a payment company?"* → Graph DB. Accounts, devices, phone numbers, IPs as nodes. Shared attributes as edges. Fraud rings appear as densely-connected subgraphs — detectable with community detection algorithms or simple shared-property traversal.
    - *"What's the difference between a graph database and a relational database with join tables?"* → SQL joins work for 1-2 hops at small scale. At 4+ hops or social-graph scale (billions of nodes), SQL joins become full table scans. Graph databases use index-free adjacency — each node directly references its neighbors — so traversal is O(edges visited), not O(total rows).

## Related topics

- [SQL vs NoSQL](sql-vs-nosql.md) — where graph fits in the landscape
- [Distributed Systems: CRDTs](../distributed/crdts.md) — merging graph updates without conflicts
- [Patterns: Consistent Hashing](../patterns/consistent-hashing.md) — distributing graph data across nodes
- [Case Studies: Social Media Feed](../case-studies/twitter.md) — graph-heavy system design
