# Parser Evidence Certification Implementation Plan

> **For agentic workers:** Complete this plan before claiming new generated card
> support or deleting specialized parsers. Steps use checkbox (`- [ ]`) syntax
> and should land as focused commits.

**Goal:** Make a complete parser certificate mean that every semantic primitive
emitted into the typed effect tree is backed by parser-produced evidence.

**Architecture:** Derive requirements from the emitted typed tree, collect
evidence only while primitive parsers recognize source text, and compare the two
sets. Runtime capability and repository diagnostics may consume the result, but
neither may manufacture parser evidence or upgrade an incomplete certificate.

**Authoritative References:**

- `03-effects.s008`, `.s010`, `.s017`, `.s020`
- `09-card-data-repository.s006`, `.s007`, `.s009`
- `docs/code-standard.md` parser-evidence and generated-support rules
- `contracts/types/support-certification.ts`

---

## Scope

### In Scope

- Replace the current non-empty-evidence completeness rule.
- Define stable requirement keys for every supported semantic boundary.
- Report missing, conflicting, and unconsumed evidence precisely.
- Preserve the public certificate shape unless an approved additive change is
  required.

### Out Of Scope

- Adding new printed card syntax.
- Rewriting exact multi-primitive parsers.
- Expanding replacement runtime support.
- Treating runtime capability as parser proof.

## Required Evidence Model

A certificate must account for every applicable boundary in the emitted tree:

- entry point, source line, marker, and activation timing;
- cost, condition, body primitive, and their operands;
- target, filter, cardinality, quantity, zone, player, and chooser;
- duration and expiration timing;
- saved target, saved number, or other reference;
- sequence, optional branch, conditional branch, and connector semantics;
- numeric value, comparison, and modifier semantics.

One record may cover multiple requirements only when its schema names each
boundary. Card IDs, full lines, rule IDs, shape IDs, and runtime capability IDs
are not requirement keys.

## Task 1: Characterize The Authority Defect

**Files:**

- Modify: `packages/cards/src/materialization/support-certificate.test.ts`
- Modify: `packages/cards/src/card-effect-line-parser*.test.ts`
- Modify: repository or card-support tests that assert completeness

- [ ] Keep an `onPlay` draw fixture with visibility-only evidence; assert its
      certificate is incomplete.
- [ ] Remove target, filter, quantity, duration, reference, and connector
      evidence one boundary at a time.
- [ ] Prove runtime capability, card ID, and exact full-line knowledge cannot
      repair missing evidence.
- [ ] Add valid atomic and composed effects as positive controls.
- [ ] Assert completeness per line and block so a complete sibling cannot hide
      an incomplete effect.
- [ ] Run focused tests, confirm the negative cases fail, and commit them.

## Task 2: Derive Requirements From Typed Effects

**Files:**

- Create: `packages/cards/src/materialization/parser-evidence-requirements.ts`
- Create: `packages/cards/src/materialization/parser-evidence-requirements.test.ts`

- [ ] Define an internal requirement with semantic path, boundary kind, source
      identity, and diagnostic context.
- [ ] Traverse every supported entry point, cost, condition, body, target,
      filter, duration, reference, and composition node exhaustively.
- [ ] Make new typed-node variants fail typecheck until requirements exist.
- [ ] Keep requirements semantic; exclude card IDs, printed lines, function
      names, and runtime support IDs.
- [ ] Preserve repeated requirements at distinct paths.
- [ ] Add tables for atomic, nested, optional, conditional, and sequence effects.
- [ ] Commit the requirement derivation layer.

## Task 3: Match Evidence Against Requirements

**Files:**

- Modify: `packages/cards/src/materialization/support-certificate.ts`
- Modify: `packages/cards/src/materialization/support-certificate.test.ts`
- Modify: canonical parser-evidence types only if needed

- [ ] Normalize evidence and requirements into deterministic semantic keys.
- [ ] Match by boundary, source identity, and path, never by array position or
      list truthiness.
- [ ] Mark complete only when all required keys have compatible evidence and no
      claims conflict.
- [ ] Report missing, duplicate, conflicting, and unconsumed evidence with
      source context.
- [ ] Keep output independent of parser registration order.
- [ ] Start any public contract change in
      `contracts/types/support-certification.ts`; keep it additive and optional.
- [ ] Commit the comparison and diagnostics.

## Task 4: Integrate Materialization And Reporting

**Files:**

- Modify: `packages/cards/src/materialization/effect-definitions.ts`
- Modify: card repository materialization and report builders
- Modify: `packages/card-support` report/probe consumers

- [ ] Generate requirements after typed materialization and before runtime
      capability evaluation.
- [ ] Carry incomplete-certificate diagnostics through reports without changing
      their authority level.
- [ ] Keep runtime-supported plus parser-incomplete effects unsupported for
      generated support.
- [ ] Keep authored definitions on their authored-support path.
- [ ] Add integration tests from raw line through repository report.
- [ ] Commit integration separately from the authority change.

## Task 5: Install Permanent Guards

- [ ] Reject completeness checks based only on evidence length or truthiness.
- [ ] Reject production mappings from IDs or exact lines to completeness.
- [ ] Mutate away every evidence kind and assert the certificate becomes
      incomplete.
- [ ] Prove unknown typed-node families fail closed.
- [ ] Commit the guards after focused and architecture tests pass.

---

## Compatibility And Acceptance

- The June plans remain historical context; their non-empty-evidence rule is
  superseded here.
- Prefer internal evidence changes over public schema changes.
- No temporary fallback may report incomplete evidence as complete.
- Evidence must not depend on Redis, repository discovery, runtime probes, or
  parser registration order.
- Visibility-only evidence cannot certify an `onPlay` draw.
- Removing any required evidence makes its line or block incomplete.
- Repository reports identify the missing semantic boundary.
- Public certificate contracts remain compatible.

## Verification

```sh
corepack pnpm exec vitest run packages/cards/src/materialization/parser-evidence-requirements.test.ts
corepack pnpm exec vitest run packages/cards/src/materialization/support-certificate.test.ts
corepack pnpm test:tooling
corepack pnpm types:sync:check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm coverage
corepack pnpm verify
```
