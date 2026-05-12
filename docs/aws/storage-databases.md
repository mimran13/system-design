# AWS Storage & Databases

## Quick reference

| Need | AWS Service | Notes |
|---|---|---|
| Relational OLTP | RDS (Postgres/MySQL/Aurora) | ACID, joins, complex queries |
| High-scale relational | Aurora | 5× faster than RDS, serverless option |
| Key-value / document | DynamoDB | Single-digit ms, infinite scale |
| In-memory cache | ElastiCache (Redis/Memcached) | Sub-ms latency |
| Object storage | S3 | Blob, static files, data lake |
| Search / full-text | OpenSearch Service | Inverted index, Kibana |
| Time-series | Timestream | IoT, metrics, monitoring |
| Data warehouse | Redshift | OLAP, columnar, BI |
| Graph | Neptune | Relationships, recommendations |
| Ledger | QLDB | Immutable audit log |

## RDS (Relational Database Service)

Managed relational databases: PostgreSQL, MySQL, MariaDB, Oracle, SQL Server.

### RDS vs Aurora

| | RDS PostgreSQL | Aurora PostgreSQL |
|---|---|---|
| Performance | Baseline | ~3× faster writes, 5× reads |
| Storage | Up to 64 TB | Up to 128 TB, auto-grows |
| Replicas | Up to 5 read replicas | Up to 15 Aurora Replicas |
| Failover | ~60–120 s | ~30 s |
| Cost | Lower | ~20% higher than RDS |
| Serverless | No | Aurora Serverless v2 |

### Multi-AZ for HA

```
Primary (us-east-1a) ──synchronous replication──► Standby (us-east-1b)
        │
        └── Read Replica (us-east-1c) ← asynchronous, readable
        └── Read Replica (us-west-2)  ← cross-region DR

Failover: Route53 CNAME switches to standby → ~30s Aurora, ~60s RDS
```

### Aurora Serverless v2

Scales compute up/down in ~0.5 ACU increments (no restart):

```python
# Good for: variable workloads, dev environments
# Not for: consistent high throughput (slight overhead vs provisioned)

aurora_config = {
    'ServerlessV2ScalingConfiguration': {
        'MinCapacity': 0.5,   # minimum ACU (Aurora Capacity Unit)
        'MaxCapacity': 128,   # scales up in seconds
    }
}
```

### RDS Proxy

Connection pooler between Lambda/ECS and RDS — prevents connection exhaustion:

```
Lambda (1000 concurrent) ──► RDS Proxy (pool: 100) ──► RDS (max_connections: 100)

Without proxy: 1000 Lambda × DB connection = crashes RDS
With proxy: 1000 Lambda → 100 pooled connections → RDS handles it
```

## DynamoDB

Fully managed key-value and document store. Single-digit millisecond at any scale.

### Core concepts

```python
import boto3
from boto3.dynamodb.conditions import Key, Attr

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('orders')

# Put item
table.put_item(Item={
    'PK': 'USER#usr_123',           # partition key
    'SK': 'ORDER#ord_456',           # sort key
    'status': 'pending',
    'amount_cents': 2999,
    'created_at': '2024-04-26T14:00:00Z',
    'ttl': int(time.time()) + 86400 * 90,  # expire in 90 days
})

# Get item (O(1))
response = table.get_item(Key={'PK': 'USER#usr_123', 'SK': 'ORDER#ord_456'})

# Query (all orders for user, newest first)
response = table.query(
    KeyConditionExpression=Key('PK').eq('USER#usr_123') & Key('SK').begins_with('ORDER#'),
    ScanIndexForward=False,  # descending by SK
    Limit=20,
)

# GSI query (query by status)
response = table.query(
    IndexName='status-created-index',
    KeyConditionExpression=Key('status').eq('pending'),
    Limit=100,
)
```

### Single-table design

```
Table: orders-table
PK                SK                  Attributes
USER#usr_123      PROFILE#            name, email
USER#usr_123      ORDER#2024-04-26#1  status, amount
USER#usr_123      ORDER#2024-04-26#2  status, amount
PRODUCT#p_500     DETAIL#             name, price
ORDER#ord_456     ITEM#1              product_id, qty

Access patterns:
  Get user profile:     PK=USER#usr_123, SK=PROFILE#
  Get user orders:      PK=USER#usr_123, SK begins_with ORDER#
  Get order items:      PK=ORDER#ord_456, SK begins_with ITEM#
  Get pending orders:   GSI: status=pending
```

### DynamoDB Streams + Lambda

```python
# CDC: process every change to the table
def handler(event, context):
    for record in event['Records']:
        if record['eventName'] == 'INSERT':
            new_item = record['dynamodb']['NewImage']
            order_id = new_item['SK']['S'].replace('ORDER#', '')
            # Trigger order processing pipeline
            sqs.send_message(QueueUrl=ORDER_QUEUE, MessageBody=order_id)
```

### Capacity modes

```
On-Demand: pay per request (~$1.25/million reads, $1.25/million writes)
  → Unpredictable traffic, new tables, prefer no capacity planning

Provisioned: specify RCU/WCU → lower cost for predictable traffic
  + Auto-scaling: set min/max RCU/WCU → DAS adjusts automatically
  → Steady-state high-throughput workloads

Hot partition problem: all writes to same PK → throttled
Solution: write sharding (append random suffix 1-N to PK, query all shards)
```

## ElastiCache

Managed in-memory caching. Two engines:

### Redis vs Memcached

| | Redis | Memcached |
|---|---|---|
| Data structures | Rich (strings, hashes, lists, sets, sorted sets, streams) | Simple strings |
| Persistence | RDB snapshots, AOF | None |
| Replication | Primary + replicas | None |
| Clustering | Redis Cluster (sharding) | Multi-threaded sharding |
| Pub/Sub | Yes | No |
| Lua scripting | Yes | No |
| Best for | Session store, leaderboard, pub/sub, rate limiting | Simple cache, pure read throughput |

```python
import redis

r = redis.Redis(
    host='order-cache.abc123.ng.0001.use1.cache.amazonaws.com',
    port=6379,
    ssl=True,  # ElastiCache in-transit encryption
    decode_responses=True,
)

# Cache-aside pattern
def get_order(order_id: str) -> dict:
    cached = r.get(f"order:{order_id}")
    if cached:
        return json.loads(cached)
    
    order = db.query(Order).filter_by(id=order_id).first()
    r.setex(f"order:{order_id}", 300, json.dumps(order.to_dict()))
    return order.to_dict()
```

### ElastiCache cluster modes

```
Cluster Mode Disabled (primary + replicas):
  1 primary (read/write) + up to 5 replicas (read-only)
  → Up to ~26 GB max per node
  → Auto-failover if primary fails

Cluster Mode Enabled (Redis Cluster):
  Up to 500 shards × 6 nodes each
  → 500 shards × 26 GB ≈ 13 TB total
  → Use for data that doesn't fit on one node
```

## S3 (Simple Storage Service)

Object storage. Infinite scale, 11 9s durability.

### Storage classes

| Class | Use case | Retrieval | Cost |
|---|---|---|---|
| Standard | Frequent access | Instant | $$$ |
| Standard-IA | Infrequent access | Instant | $$ |
| One Zone-IA | Non-critical, infrequent | Instant | $ |
| Glacier Instant | Archives, occasional | Instant | $ |
| Glacier Flexible | Long-term archives | Minutes–hours | ¢ |
| Glacier Deep Archive | 7+ year retention | 12 hours | ¢¢ |
| Intelligent-Tiering | Unknown access pattern | Instant | Auto |

### S3 patterns

```python
s3 = boto3.client('s3')

# Presigned URL: let clients upload directly (bypass your server)
presigned_url = s3.generate_presigned_post(
    Bucket='order-attachments',
    Key=f'orders/{order_id}/receipt.pdf',
    Fields={'Content-Type': 'application/pdf'},
    Conditions=[
        ['content-length-range', 1, 10_000_000],  # max 10MB
        {'Content-Type': 'application/pdf'},
    ],
    ExpiresIn=3600,  # 1 hour
)

# Multipart upload for large files
mpu = s3.create_multipart_upload(Bucket='bucket', Key='large-file.csv')
# Upload parts in parallel, then complete
s3.complete_multipart_upload(...)

# Lifecycle rule: move to Glacier after 90 days
s3.put_bucket_lifecycle_configuration(
    Bucket='order-attachments',
    LifecycleConfiguration={'Rules': [{
        'Status': 'Enabled',
        'Filter': {'Prefix': 'orders/'},
        'Transitions': [
            {'Days': 90, 'StorageClass': 'STANDARD_IA'},
            {'Days': 365, 'StorageClass': 'GLACIER'},
        ],
        'Expiration': {'Days': 2555},  # delete after 7 years
    }]}
)
```

## OpenSearch Service

Managed Elasticsearch/OpenSearch. Full-text search, log analytics, dashboards.

```python
from opensearchpy import OpenSearch

client = OpenSearch(
    hosts=[{'host': 'search-orders.us-east-1.es.amazonaws.com', 'port': 443}],
    use_ssl=True,
    http_auth=('user', 'password'),
)

# Search
response = client.search(
    index='orders',
    body={
        'query': {
            'multi_match': {
                'query': 'blue running shoes',
                'fields': ['product_name^3', 'description'],
            }
        },
        'sort': [{'_score': 'desc'}, {'created_at': 'desc'}],
        'from': 0, 'size': 20,
    }
)
```

## Redshift

Columnar data warehouse for OLAP queries.

```sql
-- Redshift: columnar storage, massively parallel
-- Optimal for analytical queries on billions of rows

-- Distribution style: how data is distributed across nodes
CREATE TABLE orders (
    order_id BIGINT,
    user_id  BIGINT,
    amount   DECIMAL(10,2),
    created_at TIMESTAMP
)
DISTSTYLE KEY
DISTKEY(user_id)   -- co-locate with user table for joins
SORTKEY(created_at);  -- range scan on date queries

-- Redshift Spectrum: query S3 data lake without loading
SELECT o.order_id, p.product_name
FROM orders o
JOIN spectrum_schema.products p ON o.product_id = p.id
WHERE o.created_at > '2024-01-01';
```

## Interview cheat sheet

```
"Need a database for order service":
  → RDS PostgreSQL (ACID, relational data) or Aurora for scale

"Need fast key-value lookups (user session, cart)":
  → DynamoDB (serverless, infinite scale) or ElastiCache Redis

"Need to cache DB results":
  → ElastiCache Redis (cache-aside pattern)

"Store user-uploaded files":
  → S3 with presigned URLs (never stream through your server)

"Full-text search on products":
  → OpenSearch Service (sync from DynamoDB/RDS via Lambda or Firehose)

"Analytics on 10 billion orders":
  → Redshift (or Athena on S3 if data is already there)
```

## Related topics

- [SQL vs NoSQL](../storage/sql-vs-nosql.md)
- [Relational Databases](../storage/relational-databases.md)
- [Key-Value Stores](../storage/key-value-stores.md)
- [Blob Storage](../storage/blob-storage.md)
- [Caching](../caching/index.md)
