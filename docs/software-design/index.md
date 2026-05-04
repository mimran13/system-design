# Software Design Fundamentals

The foundation before system design. These principles operate at the code and component level — they determine how well a system can evolve, be tested, and be understood.

---

## Topics

| Topic | What you'll learn |
|---|---|
| [Clean Code Principles](clean-code-principles.md) | DRY, KISS, YAGNI, SoC, Law of Demeter |
| [SOLID Principles](solid.md) | The 5 principles every OOP design is judged by |
| [IoC & Dependency Injection](ioc-di.md) | Inversion of control, DI containers, pure DI |
| [Design Patterns](design-patterns.md) | GoF patterns — creational, structural, behavioral |
| [Clean Architecture](clean-architecture.md) | Layered architecture, dependency rule, ports & adapters |
| [Testing Strategies](testing-strategies.md) | Testing pyramid, test doubles, contract testing, integration tests |

---

## Learning order

```
Clean Code Principles       ← what makes good code
        ↓
SOLID Principles            ← why code is structured that way
        ↓
IoC & Dependency Injection  ← how components connect without coupling
        ↓
Design Patterns             ← proven solutions to recurring problems
        ↓
Clean Architecture          ← how to organize all of the above at scale
        ↓
Architecture patterns       ← microservices, event-driven, DDD, hexagonal
(see docs/architecture/)
```

---

## Why this matters in system design interviews

Interviewers at senior+ levels expect you to reason about code structure, not just boxes on a diagram. "How would you structure the matching service?" is a software design question. "How do you keep the billing module from knowing about the notification module?" is a SOLID / DI question.

The jump from drawing boxes to designing evolvable systems is exactly what these principles enable.
