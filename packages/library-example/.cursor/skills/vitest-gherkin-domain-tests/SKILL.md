---
name: vitest-gherkin-domain-tests
description: >-
  Project-local: Vitest unit tests with Gherkin Given/When/Then titles, domain-oriented
  wording, and colocated __tests__ folders. Use when adding or refactoring unit tests in
  this repository, or when the user mentions Gherkin, Given/When/Then, or __tests__ layout.
---

# Vitest unit tests (Gherkin + domain language)

## When this applies

Use these rules for **unit tests** in this repo unless instructed otherwise.

## File layout

- Place test files under **`__tests__`** next to the code under test, e.g. `src/domain/entities/book/__tests__/book.entity.test.ts`.
- Name files `*.test.ts` (or the project’s existing test suffix).
- Point Vitest at that layout: `include: ["src/**/__tests__/**/*.test.ts"]` in `vitest.config.ts`.
- Imports from `__tests__` use parent paths (e.g. `../book.entity`).

## Describe vs it (Gherkin keywords)

- **`describe`**: only for **Given** and **When**. Each title must include the keyword **and** the full scenario sentence in one string.
  - Example: `describe("Given I have a new book to add to the library collection", () => { ... })`
  - Example: `describe("When I register the book", () => { ... })`
- **`it`**: every **Then** is a test case. Title must start with **`Then`** and state the outcome in domain language.
  - Example: `it("Then the book is not lost", () => { ... })`
- Do **not** wrap Then branches in `describe`; use `it("Then …")` only.

## Domain-oriented titles

- Prefer **Ubiquitous Language** and the **user’s process** (librarian, library, catalogue, loan, return, etc.), not low-level implementation jargon in titles—unless the scenario is explicitly technical.
- Use natural **Given / When / Then** storytelling (often first person: “I register the book”, “the library refuses…”).

## Structure and setup

- **Given** blocks hold shared context; use `beforeEach` when several **Then** tests need the same fresh instance.
- **When** blocks perform the action under test (or hold the `beforeEach` that runs it once per test).
- Keep **assertions** inside **Then** `it` callbacks.

## Runner and imports

- Use **Vitest** with `describe` / `it` / `expect` / `beforeEach` from `"vitest"` (or `globals: true` if the project uses it).

## Quick skeleton

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { MyEntity } from "../my.entity";

describe("Given …", () => {
  describe("When …", () => {
    it("Then …", () => {
      expect(…);
    });

    it("Then …", () => {
      expect(…);
    });
  });
});
```

## Self-check before finishing

- [ ] Tests live under `__tests__` and Vitest `include` matches.
- [ ] Given/When use single `describe` titles with keyword + sentence.
- [ ] Every Then is `it("Then …")`.
- [ ] Titles read like domain scenarios, not internal API dumps.
