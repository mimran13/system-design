# Encoding Pitfalls (Endianness, UTF-8, Base64, Varints)

Bytes-on-the-wire issues hit every engineer eventually. Endianness explains "why does this number look swapped?"; UTF-8 explains "why is this string corrupted?"; Base64 explains email and JWTs; varints explain Protocol Buffers and database integers. None of this is exotic — all of it is bedrock.

---

## Endianness

How a multi-byte integer is stored in memory:

```
Number: 0x12345678   (32-bit)

Big-endian:    [12, 34, 56, 78]   ← most significant byte first
Little-endian: [78, 56, 34, 12]   ← least significant byte first
```

| Architecture | Endianness |
|---|---|
| x86, x86_64 | Little-endian |
| ARM | Little-endian (default; ARM supports both) |
| RISC-V | Little-endian (default) |
| PowerPC, SPARC | Big-endian (historically) |
| **Network byte order** | Big-endian |

### Why "network byte order" is big-endian

Historical: the early ARPANET used IBM and DEC machines that were big-endian. The standard stuck. Every multi-byte field in TCP/IP/UDP headers is big-endian.

```c
// Convert host → network and vice versa
uint32_t htonl(uint32_t hostlong);   // host to network long
uint16_t htons(uint16_t hostshort);
uint32_t ntohl(uint32_t netlong);
uint16_t ntohs(uint16_t netshort);
```

Forgetting these swaps is a classic bug. Symptom: ports/IPs show as huge or weird numbers in logs.

### File formats specify endianness explicitly

```
PNG, JPEG:     big-endian
GIF:           little-endian
ZIP, BMP:      little-endian
WAV (RIFF):    little-endian
TIFF:          either; byte order marker tells reader
```

Reading a file produced on a different-endian machine without converting → garbage.

### Modern programming

Most code never sees endianness — language stdlib and serialization frameworks (Protobuf, MessagePack, JSON) handle it. You hit it when:

- Implementing a wire protocol from scratch
- Reading binary file formats
- Interoperating with C structs across machines
- Cryptography (where byte order is part of the spec)

---

## UTF-8 and Unicode

### Code points and encoding

Unicode assigns a **code point** (an integer, 0 to 0x10FFFF) to every character. Encoding maps code points to bytes.

| Encoding | Bytes per character |
|---|---|
| ASCII | 1 (only first 128 code points) |
| Latin-1 (ISO-8859-1) | 1 (first 256 code points only) |
| UTF-8 | 1-4 (variable) |
| UTF-16 | 2 or 4 (variable, surrogate pairs) |
| UTF-32 | 4 (fixed) |

UTF-8 is the de facto standard. ~98% of the web. ASCII-compatible (0-127 byte values are the same as ASCII).

### How UTF-8 works

```
Code point     | Bytes
0x00-0x7F      | 0xxxxxxx
0x80-0x7FF     | 110xxxxx 10xxxxxx
0x800-0xFFFF   | 1110xxxx 10xxxxxx 10xxxxxx
0x10000-0x10FFFF | 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
```

Examples:

```
"a" (U+0061)        → 0x61
"é" (U+00E9)        → 0xC3 0xA9
"中" (U+4E2D)       → 0xE4 0xB8 0xAD
"😀" (U+1F600)      → 0xF0 0x9F 0x98 0x80
```

### Common pitfalls

**1. `strlen` ≠ visible characters.**

```python
len("héllo")        # 5 in Python (counts code points)
len("héllo".encode('utf-8'))  # 6 bytes (é is 2 bytes in UTF-8)
```

C's `strlen` counts bytes, not characters. UI logic that uses byte counts for "character count" mis-renders multibyte text.

**2. Splitting at byte boundaries breaks characters.**

```python
text = "héllo"
broken = text.encode('utf-8')[:2].decode('utf-8')  # raises UnicodeDecodeError
```

Truncating to a byte budget requires care to land on a code point boundary.

**3. Mixing encodings.**

```python
# Read a file written as ISO-8859-1 as if UTF-8
open("file.txt").read()   # may UnicodeDecodeError or produce garbage
```

The "mojibake" symptom (`Ã©` instead of `é`) is reading UTF-8 data as Latin-1.

**4. BOM (Byte Order Mark).**

A file may start with `EF BB BF` (UTF-8 BOM), `FF FE` (UTF-16 LE BOM), etc. Strip when reading; usually not written.

**5. Normalisation.**

Some characters have multiple representations:

```
"é" = U+00E9                          (precomposed)
"é" = U+0065 U+0301                   (e + combining acute accent)
```

These are different byte sequences but visually identical. Comparing requires Unicode normalisation (`NFC` is the standard form for the web).

**6. Grapheme clusters.**

What users perceive as "one character" can be multiple code points: emoji + skin tone modifier, flags, combining accents. `"👨‍👩‍👧"` is 1 visible character, 5 code points, 18 UTF-8 bytes.

For "user-visible character count," use grapheme cluster libraries (`unicode-segmentation` in Rust, `grapheme` in Python via `regex`, etc.).

### Best practices

```
1. Always specify UTF-8 explicitly when reading/writing text.
   open(file, encoding='utf-8')

2. Treat strings as opaque sequences of code points; don't slice by byte.

3. Normalize on input (NFC) for comparison.

4. Use grapheme cluster libs for visible-length checks.

5. Default databases, file systems, and APIs to UTF-8.
```

---

## Base64

A binary-to-text encoding that uses 64 printable ASCII characters (A-Z, a-z, 0-9, +, /).

```
Input:  3 bytes (24 bits)
Output: 4 base64 chars (4 × 6 = 24 bits)
Ratio:  133% size growth
```

Characters: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=`

```python
import base64
base64.b64encode(b"Hello").decode()    # "SGVsbG8="
base64.b64decode("SGVsbG8=").decode()  # "Hello"
```

The `=` is padding to make output length a multiple of 4.

### Why Base64 exists

Many systems can't carry arbitrary bytes:

- Email bodies (assume 7-bit ASCII)
- URL parameters (must avoid special characters)
- JSON strings (binary doesn't fit in JSON)
- HTTP basic auth header
- Embedded data in HTML/CSS (data URIs)

Base64 makes binary safe for these channels. **It is not encryption** — anyone can decode.

### Variants

| Variant | Difference |
|---|---|
| Standard | Uses `+`, `/`, `=` padding |
| URL-safe | Uses `-`, `_`, often no padding (used in JWTs, S3 signatures) |
| MIME | Standard with line breaks every 76 chars (email) |
| Base32 | 32-char alphabet (A-Z, 2-7); case-insensitive; used in TOTP secrets |
| Base58 | Bitcoin alphabet — no `0/O/I/l` confusion characters |

```python
import base64
base64.urlsafe_b64encode(b"Hello").decode()   # "SGVsbG8="
```

### Common mistakes

- Treating base64 as encryption. It isn't.
- Forgetting padding. Some libraries add it; some don't.
- Mixing standard and URL-safe alphabets. They differ in 2-3 characters.
- Using Base64 in places that don't need it. Adds 33% overhead; modern channels (gRPC, MessagePack) carry binary natively.

---

## Hex (Base16)

Two characters per byte:

```
0xDEADBEEF → "DEADBEEF"
```

100% size overhead (worse than base64) but human-readable byte-by-byte. Used for:

- Hashes (SHA-256 hex is common)
- UUIDs (`550e8400-e29b-41d4-a716-446655440000`)
- Debugging binary data

---

## Variable-length integers (varints)

Most integers in real data are small. Storing every integer as a fixed 8 bytes wastes space.

Varint encoding uses **continuation bits**: the top bit of each byte is `1` if more bytes follow.

```
Number: 1
  0b00000001                          → 1 byte

Number: 300
  0b10101100 0b00000010              → 2 bytes
  
Number: 2^32 - 1 (about 4 billion)
                                     → 5 bytes
```

| Number range | Bytes |
|---|---|
| 0 - 127 | 1 |
| 128 - 16K | 2 |
| 16K - 2M | 3 |
| 2M - 256M | 4 |
| 256M - 2^31 | 5 |

Used by:

- **Protocol Buffers** (every integer is varint)
- **MessagePack**
- **Cap'n Proto** (variants)
- **MongoDB** (BSON)
- **Kafka** record format

For typical data (small IDs, status codes, counts), varints save 50-90% over fixed 8-byte integers.

### Zig-zag encoding

Varints favour small unsigned integers. To encode signed integers efficiently:

```
ZigZag(0)  = 0
ZigZag(-1) = 1
ZigZag(1)  = 2
ZigZag(-2) = 3
ZigZag(2)  = 4
```

Maps small-magnitude signed → small unsigned → small varint. Used by Protobuf for `sint32`, `sint64`.

---

## URL encoding (percent encoding)

URLs can only contain a subset of ASCII. Other bytes are encoded as `%XX` where `XX` is hex.

```
"hello world!" → "hello%20world%21"
"café"         → "caf%C3%A9"   (UTF-8 bytes percent-encoded)
```

Reserved characters in URLs (`/`, `?`, `&`, `=`, etc.) must be encoded when used as data, not structure.

```python
from urllib.parse import quote, unquote
quote("hello world!")           # "hello%20world%21"
quote("café/path", safe='')     # "caf%C3%A9%2Fpath"
```

Common pitfall: encoding `+` differently in query strings. Some implementations decode `+` as space; some don't.

---

## JSON encoding peculiarities

**1. JSON has no native binary type.** Use base64 strings.

**2. Numbers are doubles.** Integers above 2^53 lose precision:

```json
{"id": 9007199254740993}   ← can't be represented exactly in double
```

Solution: encode large integers as strings (Twitter API does this for tweet IDs).

**3. No native date type.** Use ISO 8601 strings (`"2026-05-09T12:34:56Z"`) or Unix timestamps.

**4. UTF-8 only** in modern JSON; some parsers accept UTF-16/32 with BOM but it's non-standard.

**5. `\uXXXX` escapes** code points up to U+FFFF. Higher code points use surrogate pairs.

---

## Magic numbers / file signatures

Files often start with a known byte sequence identifying their type:

```
PNG:   89 50 4E 47 0D 0A 1A 0A    "‰PNG\r\n\x1a\n"
JPEG:  FF D8 FF
ZIP:   50 4B 03 04                  "PK\x03\x04"
PDF:   25 50 44 46                  "%PDF"
ELF:   7F 45 4C 46                  "\x7fELF"
```

`file` command on Unix uses these to identify content regardless of extension.

---

## Practical guidance

```
1. Default to UTF-8 everywhere.
   Files, databases, network, HTML.

2. Use network byte order (big-endian) for custom binary protocols.
   Use the htons/htonl/ntohs/ntohl functions.

3. Don't use Base64 unless required by the channel.
   Modern protocols carry binary natively.

4. Be careful with grapheme clusters in user-facing length counts.
   "❤️" is one visible character but 2 code points and 6 bytes.

5. Normalise Unicode (NFC) before string comparison.

6. For user IDs and other large integers, encode as strings in JSON.

7. Test with non-ASCII inputs from day one.
   Most Unicode bugs are silent until they aren't.
```

---

## Interview angle

!!! tip "What interviewers are testing"
    Whether you've actually been bitten by encoding bugs and know the standard fixes.

**Strong answer pattern:**
1. UTF-8 is variable-length; byte count ≠ character count ≠ visible character count
2. Network byte order = big-endian; `htonl`/`ntohl` for protocol code
3. Base64 is 133% overhead; avoid unless channel requires
4. Varints save bytes for small numbers — basis of Protobuf efficiency
5. Always specify encoding explicitly; never rely on defaults

**Common follow-up:** *"Why does my Twitter API integration drop the last digits of tweet IDs?"*
> Tweet IDs are 64-bit integers (snowflake IDs). JSON parsers in many languages decode numbers as doubles, which only have 53 bits of integer precision. Numbers above 2^53 (about 9 quadrillion) lose precision. Twitter's API returns IDs both as numbers and as strings (`"id_str": "..."`); always use the string version. The general lesson: large integers in JSON should be strings.

---

## Related topics

- [Data Encoding & Serialization](serialization.md) — Protobuf, Avro, JSON in depth
- [Hashing](hashing.md) — hex output, byte order in cryptographic specs
- [TCP/UDP Deep Dive](tcp-udp-deep-dive.md) — network byte order in headers
- [API Design](../api/index.md) — REST and JSON conventions
