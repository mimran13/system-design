# Software Design

The foundation before system design. These principles operate at the code and component level — they determine how well a system can evolve, be tested, and be understood by the next engineer.

## Suggested reading order

New to this topic? Read these in order — each builds on the previous:

1. [Clean Code Principles](clean-code-principles.md) — the vocabulary of good code (DRY, KISS, YAGNI) everything else assumes
2. [SOLID Principles](solid.md) — why well-structured code is shaped the way it is
3. [IoC & Dependency Injection](ioc-di.md) — how components connect without coupling; makes SOLID concrete
4. [Design Patterns (GoF)](design-patterns.md) — proven, named solutions to the recurring problems you now recognize
5. [Refactoring & Code Smells](refactoring.md) — how to safely move existing code toward those principles
6. [Testing Strategies](testing-strategies.md) — the safety net that makes refactoring and good design verifiable

**Then, as needed (reference):** [Error Handling Patterns](error-handling.md)

**Advanced — come back later:** [DDD Tactical Patterns](ddd-tactical.md), [Clean Architecture](clean-architecture.md)

## Principles

| Topic | What you'll learn |
|---|---|
| [Clean Code Principles](clean-code-principles.md) | DRY, KISS, YAGNI, SoC, Law of Demeter |
| [SOLID Principles](solid.md) | The 5 principles every OOP design is judged by |
| [IoC & Dependency Injection](ioc-di.md) | Inversion of control, DI containers, pure DI |

## Patterns & modeling

| Topic | What you'll learn |
|---|---|
| [Design Patterns (GoF)](design-patterns.md) | Creational, structural, behavioral patterns with intent |
| [DDD Tactical Patterns](ddd-tactical.md) | Entities, Value Objects, Aggregates, Repositories, Domain Events |
| [Clean Architecture](clean-architecture.md) | Dependency rule, ports & adapters, layered rings |

## Craft

| Topic | What you'll learn |
|---|---|
| [Refactoring & Code Smells](refactoring.md) | Recognizing and safely fixing bad code |
| [Error Handling Patterns](error-handling.md) | Result types, fail-fast, error propagation, boundary translation |
| [Testing Strategies](testing-strategies.md) | Testing pyramid, test doubles, contract testing, integration tests |

---

## Learning order

```
Clean Code Principles       ← what makes good code
SOLID Principles            ← why code is structured that way
IoC & Dependency Injection  ← how components connect without coupling
        ↓
Design Patterns             ← proven solutions to recurring problems
DDD Tactical Patterns       ← modeling the domain in code
Clean Architecture          ← organizing it all at scale
        ↓
Refactoring & Code Smells   ← improving existing code safely
Error Handling              ← making failure a first-class citizen
Testing Strategies          ← verifying it all works
```

---

## Why this matters in system design interviews

Interviewers at senior+ levels expect you to reason about code structure, not just boxes on a diagram. "How would you structure the matching service?" is a software design question. "How do you model an Order and prevent invalid states?" is a DDD tactical question. "What happens when the payment service returns an error mid-checkout?" is an error handling question.

The jump from drawing boxes to designing evolvable systems is exactly what these principles enable.
