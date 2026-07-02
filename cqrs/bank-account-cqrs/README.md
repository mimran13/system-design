# NestJS CQRS + Event Sourcing — a teaching bank

A hands-on, fully-runnable reference implementation of **CQRS** and **Event
Sourcing** in [NestJS](https://nestjs.com), built around a bank-account/ledger
domain. It runs **entirely in-memory** — no database, no Docker, no config.

> **Read the guided lesson first.** Open [`../cqrs-guide.html`](../cqrs-guide.html)
> in a browser — it's the standalone classroom sitting next to this project. It
> teaches every concept from scratch and maps each one to the exact file in
> `src/`. This README is the quick tour; the HTML is the classroom.

## Run it

```bash
npm install
npm start          # http://localhost:3000  → the API (open ../cqrs-guide.html for the lesson)
# or:
npm run start:dev  # watch mode
npm test           # unit tests for both stages
```

## The idea, in one breath

CQRS says: **stop using one model for both writing and reading.** Split them.
Commands (writes) go through a rich domain model that enforces the rules;
queries (reads) go through a separate, denormalised model built for fast lookups.
Event Sourcing then says: **stop storing current state — store the events that
produced it,** and derive everything else by replaying them.

This repo teaches both, **staged**, so you feel the difference:

| Stage | What | Source of truth | Folder |
|---|---|---|---|
| **1** | Pure CQRS | The account's **stored state** (a row) | [`src/stage1-cqrs`](src/stage1-cqrs) |
| **2** | CQRS + Event Sourcing | The account's **event log** | [`src/stage2-event-sourcing`](src/stage2-event-sourcing) |

Both stages run side by side on the same server so you can compare them.

## The moving parts (both stages share this vocabulary)

```
            WRITE SIDE (change state)                 READ SIDE (answer questions)
  ┌───────────────────────────────────────┐   ┌────────────────────────────────┐
  Command → CommandBus → CommandHandler      │   Query → QueryBus → QueryHandler
                            │                 │                        │
                     Domain model             │                  Read model
                     (enforces rules)         │                (denormalised views)
                            │                 │                        ▲
                            └──► Event ──► EventBus ──► Projection ─────┘
                                                       (updates read model)
```

- **Command** — an imperative message ("OpenAccount"); may be rejected. One handler each.
- **Query** — a question ("GetAccount"); never changes state. One handler each.
- **Domain model / aggregate** — the guardian of business rules (e.g. *no overdraft*).
- **Event** — a fact that happened ("MoneyWithdrawn"), past tense.
- **Projection** — an event handler that keeps a read model up to date.
- **Saga** — reacts to events by issuing follow-up commands (drives the transfer).

## API cheat-sheet

Amounts are always in **minor units** (pence/cents), so `10000` = £100.00.

### Stage 1 — pure CQRS (`/stage1`)
| Method | Route | What |
|---|---|---|
| POST | `/stage1/accounts` | open account `{owner, openingBalanceMinor}` |
| POST | `/stage1/accounts/:id/deposit` | `{amountMinor}` |
| POST | `/stage1/accounts/:id/withdraw` | `{amountMinor}` (enforces no-overdraft) |
| GET | `/stage1/accounts/:id` | account view (read model) |
| GET | `/stage1/accounts/:id/transactions` | ledger (read model) |

### Stage 2 — CQRS + Event Sourcing (`/stage2`)
| Method | Route | What |
|---|---|---|
| POST | `/stage2/accounts` | open account |
| POST | `/stage2/accounts/:id/deposit` | `{amountMinor}` |
| POST | `/stage2/accounts/:id/withdraw` | `{amountMinor}` |
| POST | `/stage2/accounts/transfer` | `{fromAccountId, toAccountId, amountMinor}` → **saga** drives leg 2 |
| GET | `/stage2/accounts/:id` | account view (read model) |
| GET | `/stage2/accounts/:id/ledger` | ledger (read model) |
| GET | `/stage2/accounts/:id/events` | **raw event stream** — the source of truth |
| POST | `/stage2/admin/rebuild-projections` | **wipe & rebuild** read models by replaying the log |

### 60-second demo

```bash
# Stage 2: open two accounts, transfer between them, watch the saga + replay
A=$(curl -s -XPOST localhost:3000/stage2/accounts -H 'Content-Type: application/json' \
      -d '{"owner":"Alice","openingBalanceMinor":10000}' | grep -o '"accountId":"[^"]*"' | cut -d'"' -f4)
B=$(curl -s -XPOST localhost:3000/stage2/accounts -H 'Content-Type: application/json' \
      -d '{"owner":"Bob","openingBalanceMinor":0}' | grep -o '"accountId":"[^"]*"' | cut -d'"' -f4)

curl -XPOST localhost:3000/stage2/accounts/transfer -H 'Content-Type: application/json' \
     -d "{\"fromAccountId\":\"$A\",\"toAccountId\":\"$B\",\"amountMinor\":7000}"

curl localhost:3000/stage2/accounts/$A/events        # Alice's history — the truth
curl -XPOST localhost:3000/stage2/admin/rebuild-projections   # rebuild from the log
```

## Repo tour

```
src/
├── shared/domain/            Money value object, domain errors (shared by both stages)
├── stage1-cqrs/              PURE CQRS
│   ├── domain/               Account (stores state) + events (notifications)
│   ├── commands/             OpenAccount / Deposit / Withdraw + handlers
│   ├── queries/              GetAccount / ListTransactions + handlers
│   ├── read-model/           views + the projection (event → read model)
│   ├── infrastructure/       in-memory write repo + read store
│   └── api/                  controller (HTTP → bus) + DTOs
└── stage2-event-sourcing/    CQRS + EVENT SOURCING
    ├── domain/               AccountAggregate (replayed) + events (the truth)
    ├── commands/             + Transfer
    ├── queries/              + GetEventStream (see the raw log)
    ├── projections/          projector + live handlers + rebuilder
    ├── sagas/                TransferSaga (process manager)
    ├── infrastructure/       append-only EventStore + event-sourced repo + read store
    └── api/                  accounts controller + admin (rebuild) + DTOs
```

Start reading at the domain model of each stage, then follow one command from the
controller down. Every file is heavily commented for exactly this purpose.

## Where to go next (production concerns this demo deliberately skips)

- **Snapshots** — replaying millions of events is slow; periodically snapshot an
  aggregate's state and replay only events after it.
- **Async projections** — real read models update off a queue/broker (Kafka),
  which is where *eventual consistency* becomes visible. Here the EventBus is
  synchronous, so reads are instantly consistent.
- **Event versioning / upcasting** — events live forever; their shape evolves.
  See the `deserialize()` note in the event-sourced repository.
- **Saga compensation** — the transfer saga implements the happy path; a real one
  also reacts to failures with a compensating command. See `transfer.saga.ts`.
- **Real persistence** — swap the in-memory `EventStore`/repositories for
  Postgres/EventStoreDB by writing one class and changing one module line.
