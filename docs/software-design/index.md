# Software Design

<div class="sec-hero" markdown>
<span class="ey">Foundations · code craft</span>
The foundation before system design. These principles operate at the code and component level — they determine how well a system can evolve, be tested, and be understood by the next engineer.
</div>

## Roadmap

<div class="roadmap">
  <div class="rm-head">
    <span class="h">🧭 Software Design roadmap</span>
    <span class="legend">
      <i><span class="sw core"></span>core path</i>
      <i><span class="sw opt"></span>read as needed</i>
      <i><span class="sw adv"></span>advanced / later</i>
    </span>
  </div>
  <p class="rm-sub">Follow the spine top-to-bottom your first time. Branches hang off the topic they support — grab them when you need them.</p>
  <div class="rm-track">
    <div class="rm-stop">
      <a class="rm-node" href="clean-code-principles/"><span class="n">1</span>Clean Code Principles</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="solid/"><span class="n">2</span>SOLID Principles</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="ioc-di/"><span class="n">3</span>IoC &amp; Dependency Injection</a>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="design-patterns/"><span class="n">4</span>Design Patterns (GoF)</a>
      <div class="rm-branch right"><a class="rm-chip" href="ddd-tactical/">DDD Tactical Patterns</a><a class="rm-chip" href="clean-architecture/">Clean Architecture</a></div>
    </div>
    <div class="rm-stop">
      <a class="rm-node" href="refactoring/"><span class="n">5</span>Refactoring &amp; Code Smells</a>
    </div>
    <div class="rm-stop">
      <div class="rm-branch left"><a class="rm-chip" href="error-handling/">Error Handling Patterns</a></div>
      <a class="rm-node" href="testing-strategies/"><span class="n">6</span>Testing Strategies</a>
    </div>
  </div>
</div>

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

The vocabulary and structure that everything else assumes — what makes code good and why it's shaped the way it is.

<div class="pcards">
<a class="pcard" href="clean-code-principles/"><span class="t">Clean Code Principles</span><span class="d">DRY, KISS, YAGNI, SoC, Law of Demeter</span></a>
<a class="pcard" href="solid/"><span class="t">SOLID Principles</span><span class="d">The 5 principles every OOP design is judged by</span></a>
<a class="pcard" href="ioc-di/"><span class="t">IoC & Dependency Injection</span><span class="d">Inversion of control, DI containers, pure DI</span></a>
</div>

## Patterns & modeling

Proven solutions to recurring problems, modeling the domain in code, and organizing it all at scale.

<div class="pcards">
<a class="pcard" href="design-patterns/"><span class="t">Design Patterns (GoF)</span><span class="d">Creational, structural, behavioral patterns with intent</span></a>
<a class="pcard" href="ddd-tactical/"><span class="t">DDD Tactical Patterns</span><span class="d">Entities, Value Objects, Aggregates, Repositories, Domain Events</span></a>
<a class="pcard" href="clean-architecture/"><span class="t">Clean Architecture</span><span class="d">Dependency rule, ports & adapters, layered rings</span></a>
</div>

## Craft

Improving existing code safely, making failure a first-class citizen, and verifying it all works.

<div class="pcards">
<a class="pcard" href="refactoring/"><span class="t">Refactoring & Code Smells</span><span class="d">Recognizing and safely fixing bad code</span></a>
<a class="pcard" href="error-handling/"><span class="t">Error Handling Patterns</span><span class="d">Result types, fail-fast, error propagation, boundary translation</span></a>
<a class="pcard" href="testing-strategies/"><span class="t">Testing Strategies</span><span class="d">Testing pyramid, test doubles, contract testing, integration tests</span></a>
</div>

---

## Why this matters in system design interviews

Interviewers at senior+ levels expect you to reason about code structure, not just boxes on a diagram. "How would you structure the matching service?" is a software design question. "How do you model an Order and prevent invalid states?" is a DDD tactical question. "What happens when the payment service returns an error mid-checkout?" is an error handling question.

The jump from drawing boxes to designing evolvable systems is exactly what these principles enable.
