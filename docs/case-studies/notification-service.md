# Design a Notification Service

## Problem statement

Design a notification service that:
- Delivers notifications via push (iOS/Android), email, SMS
- Handles 100M notifications/day across all channels
- Supports scheduled notifications and user preferences
- Guarantees at-least-once delivery
- Tracks delivery status (sent, delivered, clicked)

## Clarifying questions

```
1. What types of notifications?
   → Push (mobile), email, SMS. In-app is out of scope.

2. Real-time vs scheduled?
   → Both: immediate and scheduled (e.g., "send in 24 hours")

3. User preference management?
   → Yes: users can opt out per channel and notification type

4. Rate limiting per user?
   → Yes: no more than 10 notifications/hour per user per channel

5. Analytics?
   → Track sent, delivered, opened, clicked
```

## High-level design

```
Trigger sources:                         Channel providers:
  Order Service  ─┐                       ─► APNs (iOS push)
  Payment Svc    ─┤                       ─► FCM (Android push)
  Marketing Svc  ─┼─► Notification API ──► AWS SES (email)
  Scheduler      ─┤                       ─► AWS SNS / Twilio (SMS)
  Admin portal   ─┘
                        │
                        ▼
                  Preference Check
                  Rate Limit Check
                        │
                        ▼
                  Channel Queues (SQS)
                  ├── push-queue
                  ├── email-queue
                  └── sms-queue
                        │
                  Channel Workers
```

## API design

```python
# Create notification request
POST /notifications
{
    "user_id": "usr_123",
    "type": "order_shipped",
    "data": {
        "order_id": "ord_456",
        "tracking_number": "1Z999AA1",
        "estimated_delivery": "2024-04-28"
    },
    "channels": ["push", "email"],  # optional override
    "idempotency_key": "order-shipped-ord_456"
}

# Response
201 Created
{
    "notification_id": "notif_789",
    "status": "queued",
    "channels_queued": ["push", "email"]
}
```

## Preference and opt-out checking

```python
class PreferenceService:
    async def get_channels(self, user_id: str, notification_type: str) -> list[str]:
        # Check global opt-out
        if await self.is_globally_opted_out(user_id):
            return []
        
        prefs = await db.get_user_preferences(user_id)
        
        allowed_channels = []
        for channel in ['push', 'email', 'sms']:
            # Check channel opt-out
            if prefs.get(f"{channel}_enabled", True) is False:
                continue
            
            # Check notification type opt-out
            if notification_type in prefs.get(f"{channel}_disabled_types", []):
                continue
            
            # Check quiet hours
            if channel == 'push' and self.in_quiet_hours(user_id, prefs):
                continue
            
            allowed_channels.append(channel)
        
        return allowed_channels
    
    def in_quiet_hours(self, user_id: str, prefs: dict) -> bool:
        if not prefs.get('quiet_hours_enabled'):
            return False
        
        user_tz = pytz.timezone(prefs.get('timezone', 'UTC'))
        local_hour = datetime.now(user_tz).hour
        start = prefs.get('quiet_start', 22)
        end = prefs.get('quiet_end', 8)
        
        if start > end:  # wraps midnight
            return local_hour >= start or local_hour < end
        return start <= local_hour < end
```

## Channel workers

### Push notification worker

```python
import aioapns  # APNs
from firebase_admin import messaging  # FCM

class PushWorker:
    async def send(self, notification: Notification, user: User) -> DeliveryResult:
        # Get device tokens for user (may have multiple devices)
        tokens = await device_token_db.get_tokens(user.user_id)
        
        results = []
        for token in tokens:
            if token.platform == 'ios':
                result = await self.send_apns(notification, token)
            else:
                result = await self.send_fcm(notification, token)
            results.append(result)
        
        return DeliveryResult(
            channel='push',
            sent_count=len(results),
            failed_tokens=[r.token for r in results if r.failed],
        )
    
    async def send_apns(self, notification: Notification, token: DeviceToken):
        message = aioapns.NotificationRequest(
            device_token=token.value,
            message={
                "aps": {
                    "alert": {
                        "title": notification.title,
                        "body": notification.body,
                    },
                    "sound": "default",
                    "badge": await self.get_unread_count(notification.user_id),
                },
                "data": notification.data,
            },
        )
        
        try:
            result = await apns_client.send_notification(message)
            if result.is_successful:
                return DeliveryResult(success=True)
            
            # Handle token invalidation
            if result.description == "Unregistered":
                await device_token_db.invalidate(token.value)
            return DeliveryResult(success=False, error=result.description)
        
        except Exception as e:
            return DeliveryResult(success=False, error=str(e))
```

### Email worker (SES)

```python
import boto3
from jinja2 import Environment, FileSystemLoader

ses = boto3.client('ses', region_name='us-east-1')
jinja_env = Environment(loader=FileSystemLoader('templates/email'))

class EmailWorker:
    async def send(self, notification: Notification, user: User) -> DeliveryResult:
        template = jinja_env.get_template(f"{notification.type}.html")
        html_body = template.render(**notification.data, user=user)
        
        try:
            response = ses.send_email(
                Source='notifications@example.com',
                Destination={'ToAddresses': [user.email]},
                Message={
                    'Subject': {'Data': notification.title, 'Charset': 'UTF-8'},
                    'Body': {
                        'Html': {'Data': html_body, 'Charset': 'UTF-8'},
                        'Text': {'Data': notification.body, 'Charset': 'UTF-8'},
                    }
                },
                Tags=[
                    {'Name': 'notification_type', 'Value': notification.type},
                    {'Name': 'user_id', 'Value': user.user_id},
                ],
            )
            return DeliveryResult(
                success=True,
                message_id=response['MessageId'],
            )
        except ses.exceptions.MessageRejected as e:
            return DeliveryResult(success=False, error=str(e))
```

## Queue architecture

```
Notification API ──► Priority Router
                         │
                ┌────────┼────────┐
                ▼        ▼        ▼
         push-high   push-low   email-queue   sms-queue
         queue       queue      (SQS FIFO)    (SQS)
         (SQS FIFO)  (SQS)
         
Priority:
  high = transactional (order shipped, payment failed, OTP)
  low  = marketing (promotions, weekly digests)

Workers: separate SQS consumers per queue
  High-priority workers: more instances, low latency
  Low-priority workers: fewer instances, batching
```

## Idempotency

The same notification must not be sent twice (e.g., retry after worker crash):

```python
async def process_notification(message: SQSMessage):
    notification_id = message.body['notification_id']
    channel = message.body['channel']
    
    # Idempotency check
    key = f"notif-sent:{notification_id}:{channel}"
    already_sent = redis.set(key, "1", nx=True, ex=86400)  # SET if Not eXists
    
    if not already_sent:
        # Already processed → safe to ack and skip
        await sqs.delete_message(message.receipt_handle)
        return
    
    # Process normally
    result = await channel_worker.send(notification)
    await notification_db.update_status(notification_id, channel, result)
    await sqs.delete_message(message.receipt_handle)
```

## Delivery tracking

```python
# Track all delivery events
class DeliveryEvent(BaseModel):
    notification_id: str
    channel: str
    event: str  # queued, sent, delivered, opened, clicked, failed, bounced
    timestamp: datetime
    metadata: dict

# Store in DynamoDB (time-series per notification)
table.put_item(Item={
    'PK': f'NOTIF#{notification_id}',
    'SK': f'EVENT#{channel}#{timestamp_iso}',
    **event.dict(),
})

# SES bounce/complaint webhooks → update delivery status
@app.post("/webhooks/ses")
async def ses_webhook(event: dict):
    msg_type = event['Message']['notificationType']
    if msg_type == 'Bounce':
        email = event['Message']['bounce']['bouncedRecipients'][0]['emailAddress']
        await mark_email_invalid(email)
        await notification_db.update(notification_id, 'email', status='bounced')
```

## Scheduled notifications

```python
# Schedule a notification for later
scheduler = boto3.client('scheduler')

scheduler.create_schedule(
    Name=f'notification-{notification_id}',
    ScheduleExpression=f'at({send_at.strftime("%Y-%m-%dT%H:%M:%S")})',
    FlexibleTimeWindow={'Mode': 'OFF'},
    Target={
        'Arn': notification_lambda_arn,
        'RoleArn': scheduler_role_arn,
        'Input': json.dumps({'notification_id': notification_id}),
    },
    ActionAfterCompletion='DELETE',  # auto-cleanup after firing
)
```

## Rate limiting per user

```python
# Sliding window: max 10 push notifications per hour per user
def can_send(user_id: str, channel: str, limit: int = 10, window: int = 3600) -> bool:
    key = f"notif-rate:{user_id}:{channel}"
    now = int(time.time())
    
    with redis.pipeline() as pipe:
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zcard(key)
        pipe.zadd(key, {str(now): now})
        pipe.expire(key, window)
        _, count, _, _ = pipe.execute()
    
    if count >= limit:
        redis.zrem(key, str(now))  # rollback
        return False
    return True
```

## AWS architecture

```
Triggers → API Gateway → Lambda (notification API)
                              │
                         Preference DB (DynamoDB)
                         Rate Limiter (ElastiCache)
                              │
                         SQS Queues (per channel + priority)
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
         Push Workers    Email Workers    SMS Workers
         (Lambda/ECS)    (Lambda → SES)  (Lambda → SNS/Twilio)
               │
         APNs / FCM

Scheduled: EventBridge Scheduler → Lambda

Tracking: SES webhooks → SNS → Lambda → DynamoDB
          FCM delivery reports → Lambda → DynamoDB
```

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. Queue per channel — isolate failures (SMS outage doesn't affect email)
    2. Priority queues — transactional before marketing
    3. Idempotency with Redis SET NX — no duplicate sends on retry
    4. Preference check before queuing — don't process what won't be sent
    5. Bounce handling — track and invalidate bad email addresses

## Related topics

- [Message Queues](../messaging/message-queues.md) — SQS workers per channel
- [Idempotency](../patterns/idempotency.md) — deduplication
- [Rate Limiting](../patterns/rate-limiting.md) — per-user notification throttle
- [Event-Driven Architecture](../architecture/event-driven.md) — trigger pattern
