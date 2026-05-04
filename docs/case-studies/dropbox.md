# Design a Cloud File Storage Service (Dropbox/Google Drive)

## Problem statement

Design a cloud file storage and sync service that:
- Allows users to upload, store, and download files from any device
- Syncs files across multiple devices automatically
- Supports files up to 50GB in size
- Handles 50 million DAU
- Deduplicates identical files across users
- Handles concurrent edits and conflict resolution

## Clarifying questions

```
1. File size limit?
   → Max 50GB per file. Avg file ~500KB.

2. Sync model — real-time or on-demand?
   → Near real-time: changes sync within seconds when online.

3. Shared folders / collaboration?
   → Yes: multiple users can share a folder. Focus on sync, not real-time co-editing.

4. Version history?
   → Yes: last 30 days / 30 versions.

5. Offline access?
   → Yes: client caches files locally, syncs when back online.

6. Global distribution?
   → Yes: users worldwide, minimize upload/download latency.
```

## Scale estimation

```
50M DAU, avg user stores 2GB = 100PB total storage
  With deduplication (40% duplicate reduction): ~60PB net

Upload traffic:
  50M users × 2 new files/day × 500KB avg = 50TB/day uploads
  = 575 MB/sec sustained upload bandwidth

Download traffic (3× uploads): ~1.7 GB/sec

Metadata (files, folders, users):
  50M users × 1000 files avg = 50B file records
  Each file record ~500 bytes = 25TB metadata
  → Relational DB is fine, but needs careful indexing
```

---

## The core problem: don't transfer the whole file

Naive approach: upload the entire file every time it changes. For a 2GB file with a 1-word edit, this wastes enormous bandwidth. The solution is **chunking**.

```
Chunking approach:
  Split file into fixed-size blocks (4MB each)
  
  file.docx (20MB) → [Block0][Block1][Block2][Block3][Block4]
  
  On first upload:   upload all 5 blocks
  On edit (page 1):  Block0 changes, Blocks 1-4 unchanged
  On sync:           upload only Block0 (4MB instead of 20MB)
  
  Savings: 80% bandwidth reduction for small edits
```

---

## Architecture overview

```
Client devices (desktop, mobile, web)
        │
        │  1. File changes detected (file watcher)
        │  2. Compute block checksums
        │  3. Ask server which blocks are new
        │  4. Upload only new blocks
        ▼
┌─────────────────────────────────────────────────┐
│                  API Servers                     │
│  (metadata operations: files, folders, sharing) │
└──────────┬──────────────────────┬───────────────┘
           │                      │
           ▼                      ▼
    Metadata Store          Block Store
    (PostgreSQL/            (S3 + CDN)
     CockroachDB)
    - file records          - blocks stored by hash
    - folder structure      - deduplicated globally
    - sharing permissions   - served via CloudFront
    - block references
           │
           ▼
    Notification Service
    (WebSocket / SSE)
    - tells other devices
      a file changed
    - triggers sync
```

---

## Component 1: Client sync engine

The client is responsible for detecting changes, chunking, and minimizing what gets transferred.

```python
import hashlib
import os
from pathlib import Path
from dataclasses import dataclass

CHUNK_SIZE = 4 * 1024 * 1024  # 4MB blocks

@dataclass
class FileChunk:
    index: int
    offset: int
    size: int
    checksum: str  # SHA-256 of this chunk's content

@dataclass
class FileManifest:
    file_path: str
    file_size: int
    file_checksum: str   # SHA-256 of entire file
    chunks: list[FileChunk]

class ChunkEngine:
    def compute_manifest(self, file_path: str) -> FileManifest:
        chunks = []
        file_hash = hashlib.sha256()
        
        with open(file_path, 'rb') as f:
            index = 0
            offset = 0
            while True:
                data = f.read(CHUNK_SIZE)
                if not data:
                    break
                
                chunk_hash = hashlib.sha256(data).hexdigest()
                file_hash.update(data)
                
                chunks.append(FileChunk(
                    index=index,
                    offset=offset,
                    size=len(data),
                    checksum=chunk_hash,
                ))
                index += 1
                offset += len(data)
        
        return FileManifest(
            file_path=file_path,
            file_size=os.path.getsize(file_path),
            file_checksum=file_hash.hexdigest(),
            chunks=chunks,
        )
    
    def get_chunks_to_upload(
        self, manifest: FileManifest, server_known_chunks: set[str]
    ) -> list[FileChunk]:
        """Return only chunks the server doesn't have yet."""
        return [
            chunk for chunk in manifest.chunks
            if chunk.checksum not in server_known_chunks
        ]
```

### Sync protocol

```python
class SyncClient:
    def sync_file(self, local_path: str):
        # Step 1: compute manifest (checksums of all chunks)
        manifest = self.chunker.compute_manifest(local_path)
        
        # Step 2: ask server which chunks it already has
        # Server checks block store (S3) and returns set of known checksums
        known_checksums = self.api.check_chunks(
            [c.checksum for c in manifest.chunks]
        )
        
        # Step 3: upload only missing chunks
        missing = self.chunker.get_chunks_to_upload(manifest, known_checksums)
        
        with open(local_path, 'rb') as f:
            for chunk in missing:
                f.seek(chunk.offset)
                data = f.read(chunk.size)
                # Upload to block store via presigned URL (direct to S3)
                upload_url = self.api.get_upload_url(chunk.checksum)
                self.http.put(upload_url, data=data)
        
        # Step 4: commit the file (update metadata)
        self.api.commit_file(
            path=local_path,
            file_checksum=manifest.file_checksum,
            chunk_checksums=[c.checksum for c in manifest.chunks],
        )
        
        # Step 5: server notifies other devices via WebSocket
        # → other devices pull manifest → download only changed chunks
```

---

## Component 2: Block store (deduplication)

Blocks are stored by their content hash — this gives deduplication for free across all users.

```
Block storage key: SHA-256(block_content)

User A uploads photo.jpg:
  Block 0: SHA-256 = "a3f2..." → stored as blocks/a3/f2/a3f2...
  Block 1: SHA-256 = "b7c1..." → stored as blocks/b7/c1/b7c1...

User B uploads the same photo.jpg:
  Block 0: SHA-256 = "a3f2..." → already in S3! Skip upload.
  Block 1: SHA-256 = "b7c1..." → already in S3! Skip upload.
  
  Storage saved: 100% for this file.

Real deduplication impact:
  Photos shared across families and friends: ~40% reduction
  OS files, common templates: ~20% reduction
  Average: 30-40% storage saved
```

```python
class BlockStore:
    def __init__(self, s3_client):
        self.s3 = s3_client
        self.bucket = 'dropbox-blocks'
    
    def block_key(self, checksum: str) -> str:
        # Prefix with first 2 chars for S3 key distribution
        return f"blocks/{checksum[:2]}/{checksum[2:4]}/{checksum}"
    
    def exists(self, checksum: str) -> bool:
        try:
            self.s3.head_object(Bucket=self.bucket, Key=self.block_key(checksum))
            return True
        except self.s3.exceptions.ClientError:
            return False
    
    def check_batch(self, checksums: list[str]) -> set[str]:
        """Return set of checksums that already exist in the block store."""
        # In practice: batch check via Redis cache first, then S3
        return {c for c in checksums if self.exists(c)}
    
    def get_upload_url(self, checksum: str, ttl_s: int = 3600) -> str:
        """Presigned URL so client uploads directly to S3 — no proxy."""
        return self.s3.generate_presigned_url(
            'put_object',
            Params={'Bucket': self.bucket, 'Key': self.block_key(checksum)},
            ExpiresIn=ttl_s,
        )
    
    def get_download_url(self, checksum: str, ttl_s: int = 3600) -> str:
        """Presigned URL or CloudFront signed URL for download."""
        return self.cloudfront.create_signed_url(
            url=f"https://cdn.dropbox.com/{self.block_key(checksum)}",
            expires_in=ttl_s,
        )
```

---

## Component 3: Metadata service

```sql
-- File and folder hierarchy
CREATE TABLE nodes (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL,
    parent_id       UUID REFERENCES nodes(id),
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(10) NOT NULL,     -- 'file' or 'folder'
    size_bytes      BIGINT,
    file_checksum   VARCHAR(64),              -- SHA-256 of full file
    version         INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL,
    modified_at     TIMESTAMP NOT NULL,
    is_deleted      BOOLEAN DEFAULT FALSE,    -- soft delete
    UNIQUE (user_id, parent_id, name)         -- no duplicate names in same folder
);

-- Block list for each file version
CREATE TABLE file_blocks (
    file_id         UUID REFERENCES nodes(id),
    version         INT NOT NULL,
    block_index     INT NOT NULL,
    block_checksum  VARCHAR(64) NOT NULL,     -- points into block store
    PRIMARY KEY (file_id, version, block_index)
);

-- Version history
CREATE TABLE file_versions (
    file_id         UUID NOT NULL,
    version         INT NOT NULL,
    size_bytes      BIGINT,
    file_checksum   VARCHAR(64),
    created_at      TIMESTAMP NOT NULL,
    created_by      UUID NOT NULL,            -- which device/session
    PRIMARY KEY (file_id, version)
);

-- Shared folders
CREATE TABLE folder_members (
    folder_id       UUID REFERENCES nodes(id),
    user_id         UUID NOT NULL,
    role            VARCHAR(20) NOT NULL,     -- 'owner', 'editor', 'viewer'
    joined_at       TIMESTAMP NOT NULL,
    PRIMARY KEY (folder_id, user_id)
);

-- Index for listing a folder's contents
CREATE INDEX idx_nodes_parent ON nodes(user_id, parent_id, is_deleted);

-- Index for finding all versions of a file
CREATE INDEX idx_file_versions ON file_versions(file_id, version DESC);
```

---

## Component 4: Change notification (sync trigger)

When one device commits a change, all other connected devices of the same user must be notified so they can pull the update.

```python
import asyncio
import redis.asyncio as aioredis
from fastapi import WebSocket

class NotificationService:
    def __init__(self):
        self.redis = aioredis.from_url("redis://...")
        # user_id → list of connected WebSockets (this server only)
        self.connections: dict[str, list[WebSocket]] = {}
    
    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(user_id, []).append(ws)
        # Subscribe to user's Redis channel
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(f"sync:{user_id}")
        asyncio.create_task(self._relay(user_id, ws, pubsub))
    
    async def _relay(self, user_id: str, ws: WebSocket, pubsub):
        """Forward Redis messages to this WebSocket."""
        async for msg in pubsub.listen():
            if msg['type'] == 'message':
                await ws.send_text(msg['data'].decode())
    
    async def notify_user_devices(self, user_id: str, change: dict):
        """Called when any device commits a file change."""
        import json
        payload = json.dumps(change)
        # Publish to Redis → all servers relay to user's WebSockets
        await self.redis.publish(f"sync:{user_id}", payload)
        # Message reaches all devices of this user, on all servers

# On file commit:
async def on_file_committed(user_id: str, file_id: str, new_version: int):
    await notification_service.notify_user_devices(user_id, {
        'type': 'file_changed',
        'file_id': file_id,
        'version': new_version,
    })
    # Each device receives this, checks its local version,
    # pulls only the changed chunks if needed
```

---

## Conflict resolution

When two devices edit the same file offline, a conflict occurs on sync:

```
Device A (offline): edits report.docx → version 5
Device B (offline): edits report.docx → version 5

Both come online:
  Device A commits → server accepts (version 5 → 6)
  Device B commits → server rejects (expected base version 5, but now it's 6)

Resolution strategies:
```

```python
class ConflictResolver:
    def resolve(self, base_version: int, committed_version: int,
                conflict_file_id: str, device_id: str) -> str:
        # Strategy: create a "conflict copy" — don't overwrite
        # Dropbox approach: keep both versions, user resolves manually
        
        conflict_name = self.make_conflict_name(conflict_file_id, device_id)
        # "report (Device B's conflicted copy 2024-04-28).docx"
        
        # Save the conflicting version as a new file
        self.file_service.save_as_new_file(
            source_file_id=conflict_file_id,
            new_name=conflict_name,
            user_id=self.get_device_owner(device_id),
        )
        
        return conflict_name
    
    def make_conflict_name(self, file_id: str, device_id: str) -> str:
        from datetime import date
        file = self.file_service.get(file_id)
        stem = Path(file.name).stem
        suffix = Path(file.name).suffix
        date_str = date.today().isoformat()
        return f"{stem} (conflicted copy {date_str}){suffix}"
```

**Alternative strategies:**
- **Last-write-wins:** Simple but loses data. Dropbox doesn't use this for user files.
- **Three-way merge:** Works well for text (like Git). Hard for binary files.
- **Conflict copy (Dropbox default):** Both versions kept, user resolves. Safe but requires user action.
- **Operational Transformation / CRDT:** Used by Google Docs for real-time co-editing. Not needed for Dropbox's sync model.

---

## Delta sync (advanced)

For large files with small changes, even uploading one 4MB chunk is wasteful if only 100 bytes changed within it. Delta sync computes only the diff:

```
Traditional chunking:
  Edit 1 byte in chunk 2 → re-upload entire 4MB chunk 2

Delta sync (rsync algorithm):
  Compute rolling checksum of chunk 2 on both sides
  Find the matching regions
  Upload only the diff (100 bytes + overhead)
  
Performance:
  1GB video file, metadata tag change:
  - Without delta: upload 4MB (one chunk)
  - With delta:    upload ~200 bytes
```

Dropbox uses a variant of rsync for large files. Simpler implementations just use fixed-size blocks.

---

## AWS architecture

```
Client (desktop/mobile)
    │
    ├── Metadata API ─────────────────────────────────────────┐
    │   (ECS Fargate)                                         │
    │   - file/folder CRUD                                    │
    │   - chunk existence check                               │
    │   - generate presigned S3 URLs                         │
    │   - commit file versions                                │
    │                                                         │
    ├── Direct upload ──────────────────────────────────────► S3 (block store)
    │   (presigned URL, no proxy)                             (content-addressed)
    │                                                         │
    └── Notification WS ──────────────────────────────────────┤
        (ECS, long-lived connections)                        │
        Redis pub/sub for cross-server fanout               │
                                                             │
Metadata DB: Aurora PostgreSQL (Multi-AZ)                   │
Block cache:  ElastiCache Redis (checksums → exists?)        │
Download CDN: CloudFront in front of S3 ◄────────────────────┘
              (blocks cached at edge by checksum)

Storage classes:
  S3 Standard:           recently accessed files
  S3 Intelligent-Tiering: auto-moves cold files to cheaper tiers
  S3 Glacier:            version history older than 30 days
```

---

## Interview talking points

!!! tip "Key design decisions to discuss"
    1. **Chunking + content-addressed storage** — upload by hash means deduplication is free. If two users have the same 4MB block, it's stored once
    2. **Check before upload** — client asks server which chunks it already has; only uploads the missing ones. Crucial for sync efficiency
    3. **Presigned URLs** — client uploads directly to S3. Your servers never touch file bytes. Can't scale if you do
    4. **WebSocket + Redis pub/sub** — when one device commits, all other devices notified across all servers via pub/sub
    5. **Conflict copies over last-write-wins** — safer for user data; never silently lose changes
    6. **Delta sync** — for large files, even one changed chunk is wasteful; rsync-style delta reduces to actual changed bytes

## Related topics

- [Blob Storage](../storage/blob-storage.md) — S3 as the block store
- [CDN](../networking/cdn.md) — CloudFront for low-latency downloads
- [WebSockets & SSE](../networking/websockets-sse.md) — real-time change notification
- [Consistent Hashing](../patterns/consistent-hashing.md) — distributing metadata across DB shards
