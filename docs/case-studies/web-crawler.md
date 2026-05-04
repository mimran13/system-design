# Design a Web Crawler

## Problem statement

Design a web crawler that:
- Discovers and downloads web pages starting from a set of seed URLs
- Scales to crawl billions of pages
- Respects robots.txt and crawl-delay directives
- Avoids duplicate crawls of the same URL
- Prioritizes important/fresh pages
- Stores crawled content for downstream consumers (search indexers, ML pipelines)

## Clarifying questions

```
1. What's the scope — full web or specific domains?
   → Full web crawl (Google/Bing scale)

2. How many pages to crawl and how often?
   → 1 billion pages, re-crawl popular pages every few days, rare pages monthly

3. What content types?
   → HTML pages primarily; PDFs, images are out of scope

4. Output format?
   → Raw HTML + metadata stored for downstream indexing pipeline

5. Politeness requirements?
   → Must respect robots.txt, honor Crawl-delay, no more than 1 req/5s per domain
```

## Scale estimation

```
Target: 1 billion pages
Avg page size: 100KB HTML
Storage: 1B × 100KB = 100TB (compressed ~20TB with gzip)

Crawl rate needed:
  1B pages ÷ 30 days = ~400 pages/sec
  With re-crawls: ~1,000 pages/sec sustained

Network:
  1,000 pages/sec × 100KB = 100MB/sec download bandwidth

URLs to track (for deduplication):
  1B URLs × 50 bytes avg = 50GB URL fingerprints
  → Fits in memory with Bloom filter (much less than 50GB)
```

---

## High-level architecture

```
Seed URLs
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                    URL Frontier                          │
│   Priority Queue (by importance + freshness)            │
│   Per-domain rate limiting (politeness)                 │
└─────────────────────┬───────────────────────────────────┘
                      │ next URL to crawl
                      ▼
              ┌───────────────┐
              │  Fetcher Pool │  (distributed HTTP workers)
              │  (N machines) │
              └───────┬───────┘
                      │ raw HTML
          ┌───────────┴──────────┐
          ▼                      ▼
   ┌─────────────┐      ┌──────────────────┐
   │    Parser   │      │  Content Store   │
   │  Extract    │      │  (S3 / GCS)      │
   │  links +    │      │  raw HTML blobs  │
   │  metadata   │      └──────────────────┘
   └──────┬──────┘
          │ new URLs
          ▼
   ┌─────────────────┐
   │  URL Dedup      │  Bloom filter (seen before?)
   │  + Normalizer   │  + canonical URL form
   └──────┬──────────┘
          │ new unseen URLs
          ▼
    Back to URL Frontier
```

---

## Component 1: URL Frontier

The URL frontier decides **what to crawl next** and **when**. It has two responsibilities:

1. **Priority** — crawl important/fresh pages first
2. **Politeness** — don't hammer a single domain

```python
import heapq
import time
from collections import defaultdict
from dataclasses import dataclass, field

@dataclass(order=True)
class UrlEntry:
    priority: float          # lower = higher priority (min-heap)
    earliest_fetch: float    # don't fetch before this timestamp (politeness)
    url: str = field(compare=False)
    domain: str = field(compare=False)

class URLFrontier:
    def __init__(self):
        self.queue: list[UrlEntry] = []
        # Per-domain: when we're allowed to fetch next
        self.domain_next_allowed: dict[str, float] = defaultdict(float)
        self.crawl_delay_s = 5.0   # default politeness delay per domain
    
    def add(self, url: str, priority: float):
        domain = extract_domain(url)
        entry = UrlEntry(
            priority=priority,
            earliest_fetch=self.domain_next_allowed[domain],
            url=url,
            domain=domain,
        )
        heapq.heappush(self.queue, entry)
    
    def next(self) -> str | None:
        now = time.time()
        # Find the highest-priority URL that's allowed to be fetched now
        ready = []
        while self.queue:
            entry = heapq.heappop(self.queue)
            if entry.earliest_fetch <= now:
                # Update domain's next-allowed time (politeness)
                self.domain_next_allowed[entry.domain] = now + self.crawl_delay_s
                # Re-queue any we popped but weren't ready
                for e in ready:
                    heapq.heappush(self.queue, e)
                return entry.url
            else:
                ready.append(entry)
        
        # Nothing ready yet — put everything back
        for e in ready:
            heapq.heappush(self.queue, e)
        return None

def calculate_priority(url: str, page_rank: float, last_crawled: float | None) -> float:
    """Lower value = higher priority."""
    base = 1.0 / (page_rank + 0.01)    # high PageRank → low priority value → crawl first
    
    if last_crawled is None:
        return base * 0.5               # never crawled → high priority
    
    age_days = (time.time() - last_crawled) / 86400
    freshness_factor = 1.0 / (age_days + 1)  # older → more urgent re-crawl
    
    return base / freshness_factor
```

### robots.txt compliance

```python
import urllib.robotparser

class RobotsCache:
    def __init__(self):
        self._cache: dict[str, urllib.robotparser.RobotFileParser] = {}
    
    async def is_allowed(self, url: str, user_agent: str = 'MyCrawler') -> bool:
        domain = extract_domain(url)
        if domain not in self._cache:
            parser = urllib.robotparser.RobotFileParser()
            robots_url = f"https://{domain}/robots.txt"
            try:
                parser.set_url(robots_url)
                parser.read()
                self._cache[domain] = parser
            except Exception:
                return True  # can't fetch robots.txt → assume allowed
        
        return self._cache[domain].can_fetch(user_agent, url)
    
    def get_crawl_delay(self, domain: str) -> float:
        parser = self._cache.get(domain)
        if parser:
            delay = parser.crawl_delay('MyCrawler')
            return delay if delay else 5.0
        return 5.0
```

---

## Component 2: Fetcher

```python
import aiohttp
import asyncio

class Fetcher:
    def __init__(self, robots_cache: RobotsCache):
        self.robots = robots_cache
        self.session = aiohttp.ClientSession(
            headers={'User-Agent': 'MyCrawler/1.0 (+https://example.com/bot)'},
            timeout=aiohttp.ClientTimeout(total=30),
        )
    
    async def fetch(self, url: str) -> dict | None:
        if not await self.robots.is_allowed(url):
            return None  # robots.txt disallows
        
        try:
            async with self.session.get(url, allow_redirects=True) as response:
                if response.status != 200:
                    return None
                if 'text/html' not in response.content_type:
                    return None  # skip non-HTML
                
                html = await response.text()
                
                return {
                    'url': str(response.url),    # final URL after redirects
                    'status': response.status,
                    'html': html,
                    'content_type': response.content_type,
                    'crawled_at': time.time(),
                    'headers': dict(response.headers),
                }
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return None
```

---

## Component 3: URL deduplication with Bloom filter

With 1 billion URLs, storing them all in a hash set requires ~50GB RAM. A Bloom filter stores the same information in ~1GB with a small false-positive rate (a URL might be marked as seen when it wasn't — but never vice versa).

```python
from pybloom_live import ScalableBloomFilter

class URLDeduplicator:
    def __init__(self):
        # Scalable Bloom filter: grows as needed, 0.1% false positive rate
        self.bloom = ScalableBloomFilter(
            initial_capacity=1_000_000,
            error_rate=0.001,
        )
        # Persistent backup in Redis for restarts
        self.redis = redis.Redis()
    
    def is_seen(self, url: str) -> bool:
        canonical = self.canonicalize(url)
        return canonical in self.bloom
    
    def mark_seen(self, url: str):
        canonical = self.canonicalize(url)
        self.bloom.add(canonical)
    
    def canonicalize(self, url: str) -> str:
        """Normalize URL to avoid crawling the same page twice."""
        from urllib.parse import urlparse, urlunparse, urlencode, parse_qsl
        
        parsed = urlparse(url.lower())
        
        # Remove fragment (#section — same page)
        parsed = parsed._replace(fragment='')
        
        # Sort query parameters (a=1&b=2 == b=2&a=1)
        if parsed.query:
            params = sorted(parse_qsl(parsed.query))
            parsed = parsed._replace(query=urlencode(params))
        
        # Remove trailing slash inconsistency
        path = parsed.path.rstrip('/') or '/'
        parsed = parsed._replace(path=path)
        
        return urlunparse(parsed)

# Example: these all map to the same canonical URL
# http://Example.com/page?b=2&a=1
# http://example.com/page?a=1&b=2#section
# http://example.com/page/?a=1&b=2
# → http://example.com/page?a=1&b=2
```

**Why Bloom filter and not a hash set?**

```
1B URLs × 50 bytes = 50GB for a hash set (doesn't fit in RAM)

Bloom filter for 1B URLs:
  At 0.1% false positive rate: ~1.8 GB
  Trade-off: ~0.1% of new URLs incorrectly marked as seen → skipped
  Acceptable: the web is huge, missing 0.1% of URLs is fine
```

---

## Component 4: Parser and link extractor

```python
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

class HTMLParser:
    def parse(self, url: str, html: str) -> dict:
        soup = BeautifulSoup(html, 'lxml')
        
        # Extract links
        links = set()
        for tag in soup.find_all('a', href=True):
            href = tag['href'].strip()
            if not href or href.startswith('javascript:') or href.startswith('mailto:'):
                continue
            
            # Resolve relative URLs
            absolute = urljoin(url, href)
            parsed = urlparse(absolute)
            
            # Only HTTP/HTTPS
            if parsed.scheme not in ('http', 'https'):
                continue
            
            links.add(absolute)
        
        # Extract metadata
        title = soup.find('title')
        description = soup.find('meta', attrs={'name': 'description'})
        
        return {
            'url': url,
            'title': title.get_text() if title else '',
            'description': description.get('content', '') if description else '',
            'links': list(links),
            'text': soup.get_text(separator=' ', strip=True)[:10_000],  # first 10KB
            'word_count': len(soup.get_text().split()),
        }
```

---

## Distributed crawler design

One machine can't crawl 1,000 pages/sec reliably. Distribute across many workers:

```
URL Frontier (Redis Sorted Set — shared across workers)
         │
   ┌─────┼──────┐
   ▼     ▼      ▼
Worker1 Worker2 Worker3  ...  WorkerN
   │     │      │
   └─────┴──────┘
         │
   Parsed results → Kafka → downstream consumers
                          → Search indexer
                          → Content store (S3)
                          → Link graph builder
```

```python
# Distributed URL frontier using Redis Sorted Set
# Score = priority (lower = fetch sooner)
class DistributedFrontier:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.queue_key = "crawler:frontier"
    
    def add_url(self, url: str, priority: float):
        self.redis.zadd(self.queue_key, {url: priority})
    
    def next_url(self) -> str | None:
        # ZPOPMIN: atomically pop the lowest-score (highest-priority) URL
        result = self.redis.zpopmin(self.queue_key, count=1)
        if result:
            url, score = result[0]
            return url.decode()
        return None
    
    def size(self) -> int:
        return self.redis.zcard(self.queue_key)
```

### Trap detection

Crawler traps are pages that generate infinite URLs (calendars, infinite scroll, session IDs):

```python
def is_trap(url: str, crawl_depth: int) -> bool:
    parsed = urlparse(url)
    
    # Too deep in path (spider trap)
    if parsed.path.count('/') > 10:
        return True
    
    # URL has a session ID (creates infinite unique URLs)
    trap_params = {'sid', 'session_id', 'jsessionid', 'phpsessid'}
    params = dict(parse_qsl(parsed.query))
    if any(k.lower() in trap_params for k in params):
        return True
    
    # Same domain appearing too many times in path
    domain = extract_domain(url)
    if crawl_depth > 5 and url.count(domain) > 2:
        return True
    
    return False
```

---

## Content storage and change detection

```python
import hashlib

class ContentStore:
    def __init__(self, s3_client, redis_client):
        self.s3 = s3_client
        self.redis = redis_client
    
    def has_changed(self, url: str, new_html: str) -> bool:
        """Only store if content actually changed (saves storage + re-indexing)."""
        new_hash = hashlib.sha256(new_html.encode()).hexdigest()
        old_hash = self.redis.get(f"hash:{url}")
        
        if old_hash and old_hash.decode() == new_hash:
            return False  # same content — skip
        
        self.redis.set(f"hash:{url}", new_hash, ex=86400 * 30)  # remember for 30 days
        return True
    
    def store(self, url: str, html: str, metadata: dict):
        import gzip, json
        
        key = f"pages/{hashlib.md5(url.encode()).hexdigest()[:2]}/{url_to_key(url)}.html.gz"
        
        self.s3.put_object(
            Bucket='crawler-content',
            Key=key,
            Body=gzip.compress(html.encode()),
            ContentEncoding='gzip',
            ContentType='text/html',
            Metadata={
                'url': url,
                'crawled_at': str(metadata['crawled_at']),
            }
        )
```

---

## AWS architecture

```
Seed URLs → SQS (URL Frontier queue)
                │
         ECS Fargate Workers (auto-scaled, 50-200 instances)
         Each worker:
           - Fetches next URL from SQS
           - Checks robots.txt (cached in ElastiCache)
           - HTTP GET (with timeout + retry)
           - Dedup check (Bloom filter in ElastiCache)
           - Parse HTML, extract links
           - Store raw HTML → S3
           - Publish new links → Kinesis
                │
         Kinesis → Lambda (link processor)
           - Normalize URLs
           - Dedup via Bloom filter
           - Priority score
           - Add to SQS frontier

URL metadata: DynamoDB (url → last_crawled, content_hash, crawl_count)
robots.txt cache: ElastiCache Redis (domain → rules, TTL 24h)
Content: S3 (gzipped HTML, lifecycle policy: move to Glacier after 90 days)
Monitoring: CloudWatch (pages/sec, error rate, frontier depth)
```

---

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. **Bloom filter for dedup** — 1B URLs in ~1GB RAM with 0.1% false positive rate vs 50GB hash set. False positives only mean skipping a URL, never a correctness issue
    2. **URL frontier = priority + politeness** — two separate concerns: what to crawl (priority queue by PageRank + freshness) and when (per-domain rate limiting)
    3. **Distributed workers + shared Redis frontier** — ZPOPMIN is atomic, multiple workers can safely pop without coordination
    4. **robots.txt cached per domain** — fetch once, cache 24h. Never re-fetch for every URL
    5. **Content hashing for change detection** — don't re-store or re-index pages that haven't changed. Saves storage and downstream work
    6. **Trap detection** — deep paths, session IDs, cyclic redirects; without this the frontier grows unboundedly

## Related topics

- [Distributed Primitives](../distributed/distributed-primitives.md) — Bloom filter internals and probabilistic deduplication
- [Message Queues](../messaging/message-queues.md) — SQS as the distributed frontier
- [Blob Storage](../storage/blob-storage.md) — S3 for crawled content
- [Consistent Hashing](../patterns/consistent-hashing.md) — distributing URL assignments across workers
