# Generic Replacement Runtime Implementation Plan

> **For agentic workers:** Land this as an engine migration, not new card
> support. Preserve replacement timing, causality, decisions, and semantic
> movement events throughout.

**Goal:** Admit and execute replacement bodies recursively from reusable
primitives instead of authorizing exact effect counts and combinations.

**Architecture:** Replacement timing remains a dedicated orchestration context,
but the replacement body is analyzed and executed as a typed composition of
ordinary supported primitives. Admission walks the tree recursively; execution
uses shared primitive semantics plus replacement-safe continuations.

**Authoritative References:**

- `03-effects.s010`, `.s017`, `.s020`
- `02-engine-rules` replacement and semantic-event sections
- `docs/code-standard.md` generic runtime support rules
- `packages/engine-core/src/effect-runtime-composition-regression.test.ts`

---

## Scope

### In Scope

- Remove exact length and primitive-combination authorization gates.
- Define recursive admission for sequence, branch, cost, decision, and reference
  nodes allowed at replacement timing.
- Reuse normal primitive mutations and semantic events.
- Preserve interrupt, decline, decision, resume, and original-event semantics.
- Add cross-product and source-scan guards.

### Out Of Scope

- Changing which game events are replaceable.
- Treating every normal effect as valid during replacement timing.
- Adding card-ID or shape-ID exceptions.
- Parser changes beyond fixtures needed to exercise typed replacement bodies.

## Runtime Invariants

- The original event is prevented only after a mandatory replacement succeeds
  or an optional replacement is accepted and completes.
- Declining an optional replacement resumes the original event exactly once.
- Pending decisions retain replacement process identity and continuation data.
- Reused primitives emit the same semantic movement and causality events as in
  normal resolution.
- Admission and execution share one capability vocabulary and fail closed.
- Support never depends on the total number or exact order of sibling effects.

## Task 1: Characterize Existing Replacement Shapes

**Files:**

- Modify: `packages/engine-core/src/effect-runtime-admission*.test.ts`
- Modify: replacement process and decision tests
- Modify: `packages/engine-core/src/effect-runtime-composition-regression.test.ts`

- [ ] Inventory every accepted replacement body and the helper that authorizes
      it, including hand-trash, pay-cost, owner-deck-bottom, life movement, and
      power modification paths.
- [ ] Add behavior fixtures for mandatory, optional accepted, optional declined,
      decision-paused, and resumed replacements.
- [ ] Add permutations with an additional independently supported primitive;
      current exact-length helpers must reject them before the migration.
- [ ] Assert semantic events, causality, pending decisions, and original-event
      resumption, not only final zones.
- [ ] Commit the characterization and failing composition tests.

## Task 2: Introduce Recursive Replacement Admission

**Files:**

- Modify: `packages/engine-core/src/effect-runtime-replacement-primitives.ts`
- Modify: `packages/engine-core/src/replacement/primitives/support-shapes.ts`
- Modify: replacement admission tests

- [ ] Define a replacement execution capability for each supported atomic body,
      decision, connector, saved reference, and branch.
- [ ] Walk typed replacement bodies recursively and return a structured support
      report with the first unsupported semantic path.
- [ ] Permit a sequence when each child is replacement-safe and their
      continuations compose; never key support on sequence length.
- [ ] Make optional and conditional branches recurse through the same admission
      API.
- [ ] Keep timing restrictions explicit so a normal primitive that cannot run
      during replacement still fails closed with a reason.
- [ ] Prove admission is stable under supported sibling permutations.
- [ ] Commit recursive admission before changing execution.

## Task 3: Execute Through Shared Primitive Semantics

**Files:**

- Modify: `packages/engine-core/src/replacement/instead-effects.ts`
- Modify: replacement process and decision modules
- Modify: shared sequence/primitive execution only where an adapter is needed

- [ ] Add a replacement-body runner that delegates atomic state mutation and
      semantic-event creation to existing primitive implementations.
- [ ] Represent pause/resume as typed continuation state carrying the remaining
      body path, saved values, replacement identity, and original event.
- [ ] Route pay-cost, target selection, saved-target, and owner-deck-bottom
      decisions through reusable decision primitives.
- [ ] Resume at the next semantic child after a decision without replaying
      completed mutations or events.
- [ ] Prevent the original event only after the replacement runner completes.
- [ ] Compare normal and replacement execution for shared primitive effects.
- [ ] Commit the runner and each decision migration in focused changes.

## Task 4: Remove Exact Shape Helpers

**Files:**

- Modify: `packages/engine-core/src/replacement/instead-effects.ts`
- Modify: `packages/engine-core/src/replacement/primitives/applicability.ts`
- Modify: field-removal process and decision consumers

- [ ] Replace `supportedReplacementSequenceWithTrashFromHandInstead` consumers
      with recursive capability results.
- [ ] Replace `supportedReplacementPayCostInstead` consumers with generic
      decision/primitive inspection.
- [ ] Replace `supportedOwnerDeckBottomInstead` consumers with generic typed
      body analysis.
- [ ] Remove duplicate authorizers after all callers use the recursive API.
- [ ] Delete checks for exact effect counts and known full combinations.
- [ ] Run the characterized fixtures after each helper deletion.
- [ ] Commit helper removal separately from the runner introduction.

## Task 5: Install Genericity And Safety Guards

**Files:**

- Modify: `packages/engine-core/src/effect-runtime-composition-regression.test.ts`
- Modify: replacement cross-product and architecture tests

- [ ] Reject support decisions based on `effects.length`, fixed indices, or an
      exact primitive-kind tuple in replacement production files.
- [ ] Reject card IDs, full printed lines, parser IDs, and shape IDs as runtime
      authority.
- [ ] Cross product supported costs, movements, modifiers, decisions, and
      connectors within valid replacement timing constraints.
- [ ] Test concurrent pending replacements and distinct continuation identities.
- [ ] Test failure rollback so a partial replacement cannot suppress the
      original event or leak partial state.
- [ ] Commit the guards after focused and full engine tests pass.

---

## Migration And Compatibility Notes

- Keep typed effect contracts and public protocol shapes stable.
- A temporary adapter may wrap the shared sequence runner, but it must return a
  typed replacement continuation rather than close over mutable process state.
- Unsupported timing combinations remain unsupported with explicit diagnostics;
  generic composition does not mean unrestricted composition.
- Review any support-count increase against parser certificates before exposing
  it as generated support.

## Acceptance Criteria

- No replacement support helper authorizes an exact sequence size or tuple.
- A valid supported sibling can be added without creating a new authorizer.
- Decisions resume generic replacement bodies at the correct semantic path.
- Declined replacements resume the original event once; completed replacements
  suppress it once.
- Shared primitives produce equivalent mutations and semantic events in normal
  and replacement contexts.
- Cross-product, admission, process, and architecture tests pass.

## Verification

```sh
corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-admission.test.ts
corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-admission-replacement-anyof.test.ts
corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-composition-regression.test.ts
corepack pnpm exec vitest run packages/engine-core/src/replacement
corepack pnpm test:tooling
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm coverage
corepack pnpm verify
```
