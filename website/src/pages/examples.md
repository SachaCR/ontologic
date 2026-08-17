---
title: Examples
description: End-to-end examples showing how to model real domains with Ontologic.
---

# Examples

End-to-end examples showing how to model real domains with Ontologic.

---

## Library Management App

A full-featured library management application built with NestJS. Demonstrates all Ontologic features applied to a real-world use case — borrowing books, managing members, tracking inventory, and handling domain events end-to-end.

**Concepts:** Domain Entity · Domain Events · Invariants · Result Pattern · Repository · Message Relay · Event Bus · Outbox Pattern

[View on GitHub →](https://github.com/sachacr/library-examples)

---

## Credit Balance

A credit wallet that supports crediting, debiting, locking funds, and sub-credit resets. Demonstrates domain invariants, typed errors, and multiple state transitions on a single entity.

**Concepts:** Domain Entity · Domain Events · Invariants · Result Pattern · Repository

[View on GitHub →](https://github.com/SachaCR/ontologic/tree/main/src/examples/creditBalance)

---

## Order

An order lifecycle that moves through `DRAFT → PLACED → PAID` states. Demonstrates state-machine transitions, voucher application, multi-invariant validation, and comprehensive use-case test coverage.

**Concepts:** Domain Entity · Domain Events · Invariants · Result Pattern · Repository

[View on GitHub →](https://github.com/SachaCR/ontologic/tree/main/src/examples/order)
