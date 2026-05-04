# AWS Messaging

## Quick reference

| Need | AWS Service | Notes |
|---|---|---|
| Task queue (worker pool) | SQS Standard | At-least-once, unlimited throughput |
| Ordered, dedup queue | SQS FIFO | Exactly-once, 3k msg/s per queue |
| Fan-out to many consumers | SNS | Push to SQS/Lambda/HTTP/email/SMS |
| Event routing (filtering) | EventBridge | Rule-based routing, schema registry |
| High-throughput streaming | Kinesis Data Streams | Ordered, retain up to 365 days |
| Managed Kafka | MSK | Full Kafka API, complex but powerful |
| Data delivery to S3/Redshift | Kinesis Firehose | No consumers to manage |
| Async service integration | Step Functions | Orchestration + wait for callback |

## SQS (Simple Queue Service)

### Standard Queue

```python
import boto3
import json

sqs = boto3.client('sqs', region_name='us-east-1')

# Send message
sqs.send_message(
    QueueUrl='https://sqs.us-east-1.amazonaws.com/123/order-processing',
    MessageBody=json.dumps({'order_id': 'ord_123', 'action': 'process'}),
    MessageAttributes={
        'event_type': {'StringValue': 'order.created', 'DataType': 'String'}
    },
)

# Receive and process (visibility timeout pattern)
response = sqs.receive_message(
    QueueUrl=QUEUE_URL,
    MaxNumberOfMessages=10,       # batch up to 10
    WaitTimeSeconds=20,           # long polling (reduce empty responses)
    VisibilityTimeout=60,         # 60s to process before redelivery
    MessageAttributeNames=['All'],
)

for message in response.get('Messages', []):
    try:
        body = json.loads(message['Body'])
        process_order(body['order_id'])
        
        # Delete only after successful processing
        sqs.delete_message(
            QueueUrl=QUEUE_URL,
            ReceiptHandle=message['ReceiptHandle'],
        )
    except Exception as e:
        log.error(f"Failed: {e}")
        # Don't delete → SQS redelivers after visibility timeout
        # After maxReceiveCount → moves to DLQ
```

### Dead Letter Queue

```python
# Create DLQ
dlq = sqs.create_queue(QueueName='order-processing-dlq')
dlq_arn = sqs.get_queue_attributes(
    QueueUrl=dlq['QueueUrl'],
    AttributeNames=['QueueArn']
)['Attributes']['QueueArn']

# Create main queue with DLQ redrive
main_queue = sqs.create_queue(
    QueueName='order-processing',
    Attributes={
        'VisibilityTimeout': '60',
        'MessageRetentionPeriod': '86400',  # 1 day
        'RedrivePolicy': json.dumps({
            'deadLetterTargetArn': dlq_arn,
            'maxReceiveCount': 3,  # 3 failures → DLQ
        })
    }
)
```

### FIFO Queue

Ordered, deduplication, exactly-once delivery:

```python
sqs.send_message(
    QueueUrl='https://sqs.us-east-1.amazonaws.com/123/payments.fifo',
    MessageBody=json.dumps({'payment_id': 'pay_123'}),
    MessageGroupId='user-usr_123',             # ordering per user
    MessageDeduplicationId='pay_123-attempt1', # idempotency
)
# Limit: 3,000 msg/s per queue (with batching: 300 × 10-message batches)
# Use for: payment processing, order sequencing, inventory updates
```

### Lambda SQS integration

```python
# Lambda polls SQS automatically — no polling code needed
# Configure in Lambda → Add trigger → SQS

# Handler receives a batch
def handler(event, context):
    failed_ids = []
    
    for record in event['Records']:
        try:
            body = json.loads(record['body'])
            process(body)
        except Exception as e:
            # Report failure — SQS will retry just this message
            failed_ids.append({'itemIdentifier': record['messageId']})
    
    # Partial batch failure — don't fail all on one error
    return {'batchItemFailures': [{'itemIdentifier': id} for id in failed_ids]}
```

## SNS (Simple Notification Service)

Push notifications to multiple subscribers simultaneously.

```python
sns = boto3.client('sns')

# Create topic
topic = sns.create_topic(Name='order-events')
topic_arn = topic['TopicArn']

# Subscribe SQS queue to topic
sns.subscribe(
    TopicArn=topic_arn,
    Protocol='sqs',
    Endpoint='arn:aws:sqs:us-east-1:123:order-processing',
    Attributes={
        # Filter: this queue only gets order.created events
        'FilterPolicy': json.dumps({'event_type': ['order.created']}),
        'FilterPolicyScope': 'MessageAttributes',
    }
)

# Subscribe Lambda
sns.subscribe(TopicArn=topic_arn, Protocol='lambda', Endpoint=lambda_arn)

# Publish
sns.publish(
    TopicArn=topic_arn,
    Message=json.dumps({'order_id': 'ord_123', 'status': 'created'}),
    MessageAttributes={
        'event_type': {'DataType': 'String', 'StringValue': 'order.created'},
        'region': {'DataType': 'String', 'StringValue': 'us-east-1'},
    }
)
```

### SNS + SQS fan-out (canonical pattern)

```
Order Service → SNS Topic (order-events)
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
    SQS Queue   SQS Queue  Lambda
    (payment    (inventory  (analytics)
     service)   service)
    
Benefits:
  - Decoupled: order service doesn't know about consumers
  - Durable: SQS buffers if consumers are slow
  - Independent scaling per consumer
  - Filter policies: each consumer gets only relevant events
```

## EventBridge

Serverless event bus with routing rules. Better than SNS for complex routing.

```python
events = boto3.client('events')

# Rule: route payment.failed events to fraud team queue
events.put_rule(
    Name='payment-failed-rule',
    EventBusName='default',
    EventPattern=json.dumps({
        'source': ['order.service'],
        'detail-type': ['PaymentFailed'],
        'detail': {
            'amount': [{'numeric': ['>', 1000]}],  # only large failures
        }
    }),
    State='ENABLED',
)

events.put_targets(
    Rule='payment-failed-rule',
    EventBusName='default',
    Targets=[
        {'Id': 'fraud-queue', 'Arn': fraud_queue_arn},
        {'Id': 'notify-lambda', 'Arn': lambda_arn},
    ]
)

# Publish event
events.put_events(Entries=[{
    'Source': 'order.service',
    'DetailType': 'PaymentFailed',
    'Detail': json.dumps({
        'order_id': 'ord_123',
        'amount': 5000,
        'reason': 'card_declined',
    }),
    'EventBusName': 'default',
}])
```

### EventBridge Scheduler (cron)

```python
scheduler = boto3.client('scheduler')

# Run every day at 2am UTC
scheduler.create_schedule(
    Name='daily-order-cleanup',
    ScheduleExpression='cron(0 2 * * ? *)',
    FlexibleTimeWindow={'Mode': 'OFF'},
    Target={
        'Arn': cleanup_lambda_arn,
        'RoleArn': scheduler_role_arn,
        'Input': json.dumps({'action': 'cleanup_stale_orders'}),
    }
)
```

## Kinesis Data Streams

Real-time data streaming. Ordered within a shard.

```python
kinesis = boto3.client('kinesis')

# Produce: events go to a shard determined by partition key
kinesis.put_record(
    StreamName='order-events',
    Data=json.dumps({'order_id': 'ord_123', 'event': 'created'}),
    PartitionKey='usr_123',  # same user → same shard → ordered
)

# Batch produce (up to 500 records, up to 5MB)
kinesis.put_records(
    StreamName='order-events',
    Records=[
        {'Data': json.dumps(event), 'PartitionKey': event['user_id']}
        for event in events
    ]
)

# Consume: each shard processed by one consumer in a group
# Lambda trigger: processes shards in parallel (1 Lambda per shard)
def handler(event, context):
    for record in event['Records']:
        data = json.loads(base64.b64decode(record['kinesis']['data']))
        shard_id = record['eventID'].split(':')[0]
        process(data)
```

### Kinesis capacity

```
Shard = 1 MB/s writes, 2 MB/s reads, 1,000 records/s
Capacity = shards × limits

Auto-scaling: UpdateShardCount
On-demand mode: AWS manages shards automatically (cost premium)
Retention: 24h (default) → 365 days (extended, costs more)
```

### Kinesis vs SQS vs Kafka

| | SQS | Kinesis | MSK (Kafka) |
|---|---|---|---|
| Ordering | FIFO queues only | Within shard | Within partition |
| Replay | No (deleted after consume) | Yes (up to 365 days) | Yes (configurable) |
| Consumers | One consumer per message | Multiple (fan-out) | Multiple consumer groups |
| Throughput | Unlimited | Shard-limited (1 MB/s) | Very high |
| Managed | Fully | Mostly | Control plane only |
| Best for | Task queues | Real-time streaming | High-volume, Kafka ecosystem |

## Kinesis Firehose

Deliver stream data to S3, Redshift, OpenSearch — no consumer code:

```python
firehose = boto3.client('firehose')

# Send data (buffered and batched automatically)
firehose.put_record(
    DeliveryStreamName='order-analytics',
    Record={'Data': json.dumps(order_event) + '\n'},  # newline-delimited JSON
)

# Firehose buffers for up to 60s or 64MB, then writes to S3
# S3 prefix: s3://analytics-bucket/orders/year=!{timestamp:yyyy}/month=!{timestamp:MM}/
```

## MSK (Managed Streaming for Kafka)

Full Kafka API on AWS. Use when you need the Kafka ecosystem (Kafka Streams, Flink, existing Kafka consumers):

```python
from kafka import KafkaProducer, KafkaConsumer
import json

# Producer
producer = KafkaProducer(
    bootstrap_servers='b-1.msk-cluster.abc.c2.kafka.us-east-1.amazonaws.com:9092',
    value_serializer=lambda v: json.dumps(v).encode('utf-8'),
    acks='all',                # wait for all ISR replicas
    enable_idempotence=True,   # exactly-once
)
producer.send('order-events', key=b'usr_123', value={'order_id': 'ord_456'})

# Consumer
consumer = KafkaConsumer(
    'order-events',
    bootstrap_servers='...',
    group_id='order-processor',
    value_deserializer=lambda m: json.loads(m.decode('utf-8')),
    enable_auto_commit=False,  # manual commit for at-least-once
)
for message in consumer:
    process(message.value)
    consumer.commit()
```

## Messaging decision guide

```
Simple async task queue:        SQS Standard + Lambda
Ordered payments/transactions:  SQS FIFO
Fan-out to multiple consumers:  SNS → SQS (per consumer)
Complex event routing:          EventBridge
Real-time analytics/streaming:  Kinesis Data Streams
Stream → S3/Redshift pipeline:  Kinesis Firehose
Kafka workloads:               MSK
```

## Related topics

- [Message Queues](../messaging/message-queues.md)
- [Pub/Sub](../messaging/pub-sub.md)
- [Event Streaming](../messaging/event-streaming.md)
- [Event-Driven Architecture](../architecture/event-driven.md)
