---
slug: ddd-is-not-about-the-code
title: DDD is not about the code
authors: [sacha]
tags: [ddd, architecture]
---

The most common misconception about Domain-Driven Design is that it is about code. People read about Aggregates, Entities, Value Objects, and Repositories, and they conclude that DDD is a set of patterns to apply to their codebase. They start renaming their services, wrapping their models, and calling it DDD.

It is not DDD.

DDD is a methodology for learning. Its central insight — the one that Eric Evans built the whole book around — is that the biggest problem in software is not the code. It is the gap between what the business knows and what the developers know.

<!-- truncate -->

## Knowledge crunching

Evans called it "knowledge crunching." The idea is simple: developers are not naturally close to the domain. They understand the software requirements they were given, which are already a lossy compression of the actual business problem. The goal of DDD is to close that gap — to make developers genuine experts in the domain they are building for.

That happens in conversations, not in code. It happens when a developer sits with a domain expert and asks "what actually happens when a payment fails? Who finds out? What do they do? What can go wrong?" It happens when the answers surprise them, and they realize the model they had in their heads was wrong.

The code is a downstream artifact of that process. You write better code because you understand the domain better. The patterns — Entities, Aggregates, Domain Events — are a language for expressing what you learned. They are not the learning itself.

## Event Storming and the workshops

Alberto Brandolini's Event Storming is probably the most concrete expression of what DDD actually looks like in practice. You put domain experts and developers in a room. You cover a wall in sticky notes. You map out every event that can happen in the system — in business terms, not technical terms. You argue about what things are called. You discover that two people on the same team have completely different mental models of the same process.

That argument is the work. That argument is DDD.

By the end of a good Event Storming session, the developers know things they did not know before. They understand the domain in a way that makes better software feel obvious. The Bounded Contexts emerge from what the domain experts actually care about, not from what is convenient to implement.

This is the Strategic Design side of DDD — the part the books spend the most pages on, and the part that gets the least attention in online discussions. Context Mapping, Ubiquitous Language, core domain versus supporting subdomains. These are not code concepts. They are organizational and epistemological ones.

## Where the code patterns fit

The tactical patterns — Entities, Value Objects, Aggregates, Repositories — exist to preserve what you learned. Once you understand the domain, once you have a Ubiquitous Language that the business and the developers share, you want the code to reflect that language. You want the rules to live where the business says they live. You want the failures to have the names the domain experts use.

The patterns are a way of encoding knowledge into structure. They are useful precisely because they force a certain discipline: state lives here, rules are checked here, events are produced here. Without that discipline, the knowledge you worked so hard to acquire gets scattered across the codebase and eventually lost.

But the patterns without the knowledge are just ceremony. An Aggregate that nobody designed with a domain expert is just a class with extra constraints. A Bounded Context that nobody drew on a whiteboard is just a module boundary. The form without the substance.

## What Ontologic is

Ontologic is not DDD. It does not run workshops for you or make you talk to domain experts. It cannot close the gap between what you know and what the business knows.

What it does is give you sharp tools for the moment after that gap is closed. Once you have done the knowledge crunching — once you know your domain, know your Bounded Contexts, know your language — Ontologic gives you a concise way to express that in TypeScript. The entities protect their invariants. The failures have names. The events are immutable records. The repository saves state and events together.

It is a modeling toolkit, not a design methodology. Use DDD to figure out what to build. Use Ontologic to build it.
