# Runtime Context Isolation Implementation Plan

> **For agentic workers:** Treat engine continuation and server timing as two
> focused migrations under one ambient-state theme. Do not couple their commits
> or introduce request-context dependencies into engine-core.

**Goal:** Remove correctness and observability behavior that depends on mutable
module globals, import order, or overlapping asynchronous requests.

**Architecture:** Engine continuations are explicit typed control flow returned
to a static orchestrator. Match-server timing uses Node.js `AsyncLocalStorage`
to bind spans to one socket action across awaits. Neither path uses a mutable
process-global current handler or current span array.

**Authoritative References:**

- `01-system-architecture.s006`, `.s011`, `.s012`
- `02-engine-rules` battle damage and life-trigger continuation sections
- `docs/code-standard.md` determinism, side effects, and concurrency rules

---

## Scope

### In Scope

- Remove the registered life-trigger damage continuation resolver.
- Make continuation requests explicit in engine-internal result/control types.
- Remove import-order dependence between life-trigger and battle modules.
- Isolate action timing spans across overlapping asynchronous work.
- Add concurrency, direct-import, and architecture guards.

### Out Of Scope

- Changing battle, damage, or life-trigger rules.
- Changing public `EngineResult` or transport schemas.
- Adding Node request-context primitives to engine-core.
- Replacing the logging format or adding a tracing vendor.
- Broad engine action-dispatch refactoring.

## Runtime Invariants

- The same state and action produce the same engine result regardless of module
  import order or prior tests in the process.
- Every continuation is represented in typed local data and consumed once.
- Engine-core remains synchronous, deterministic, and platform-neutral.
- Each socket action records only spans created in its own async context.
- Timing disabled mode retains its current near-zero behavior and output.
- Timing or continuation failures cannot mutate unrelated request state.

## Task 1: Lock The Ambient-State Failures With Tests

**Files:**

- Create: `packages/engine-core/src/life-trigger/continuation-boundary.test.ts`
- Modify: battle damage/life-trigger integration tests
- Modify: `packages/match-server/src/action-timing-log.test.ts`

- [ ] Import and exercise life-trigger action code directly without first
      importing `battle/resolution.ts`; assert valid continuation still succeeds.
- [ ] Run equivalent cases under reversed and isolated module import order.
- [ ] Prove repeated module loading cannot replace a process-global resolver.
- [ ] Start two socket action timing scopes, pause both on deferred promises,
      interleave nested sync and async spans, then resolve them in reverse order.
- [ ] Assert each emitted timing record contains only its own named spans.
- [ ] Add error and rejection cases proving context is restored automatically.
- [ ] Confirm the new tests fail under the current globals and commit them.

## Task 2: Replace Resolver Registration With Typed Continuation

**Files:**

- Modify: `packages/engine-core/src/life-trigger/actions.ts`
- Modify: `packages/engine-core/src/actions.ts`
- Modify: `packages/engine-core/src/battle/resolution.ts`
- Modify: focused life-trigger and battle tests

- [ ] Introduce an engine-internal life-trigger outcome that carries the
      `EngineResult` plus either no continuation or `resumeBattleDamage` intent.
- [ ] Return that intent at the current resolver call site after a successful
      life-trigger response; do not call battle code from the life-trigger module.
- [ ] Consume the intent in the existing top-level action continuation wrapper,
      which already owns static battle and sequence orchestration imports.
- [ ] Invoke `resolveSupportedVanillaBattle` exactly once for
      `resumeBattleDamage`, then merge events and errors using existing helpers.
- [ ] Preserve the public `EngineResult` and action protocol types; keep the new
      control union internal to engine-core.
- [ ] Remove `damageContinuationResolver`, its registration function, the import
      in battle resolution, and the module-bottom registration side effect.
- [ ] Verify life-trigger, sequence-frame, damage, and malformed-continuation
      behavior is unchanged.
- [ ] Commit explicit continuation before any unrelated engine refactor.

## Task 3: Bind Timing Spans With `AsyncLocalStorage`

**Files:**

- Modify: `packages/match-server/src/action-timing-log.ts`
- Modify: `packages/match-server/src/action-timing-log.test.ts`
- Modify: match-server Node type/build configuration only if required

- [ ] Define an internal `ActionTimingContext` containing the span collector and
      action-local timing metadata.
- [ ] Create one `AsyncLocalStorage<ActionTimingContext>` in match-server; do not
      export a mutable current context.
- [ ] Make sync and async span recorders read `getStore()` and append only to the
      current context when present.
- [ ] Implement socket action `apply` with `storage.run(context, async () => ...)`
      so the binding survives awaits and restores automatically.
- [ ] Implement `record` with the same context, without assigning a module-global
      span array.
- [ ] Preserve disabled-mode behavior, span rounding, log keys, and error paths.
- [ ] Prove nested scopes inherit intentionally while independently created
      socket actions remain isolated.
- [ ] Commit timing isolation separately from engine continuation changes.

## Task 4: Install Ambient-State Guards

**Files:**

- Modify: engine-core architecture/source-scan tests
- Modify: match-server architecture and concurrency tests

- [ ] Reject production engine declarations of mutable module-global resolver,
      handler, callback, or current-context variables.
- [ ] Reject registration calls executed at module import time.
- [ ] Reject match-server timing implementations containing a mutable active span
      array outside an `AsyncLocalStorage` store.
- [ ] Add isolated-module tests so normal suite import order cannot mask the
      continuation boundary.
- [ ] Add a high-iteration overlapping timing test with randomized resolution
      order and deterministic assertions.
- [ ] Run leak detection and confirm no async handles remain after timing tests.
- [ ] Commit the guards after both migrations land.

---

## Migration And Compatibility Notes

- `AsyncLocalStorage` is a match-server infrastructure dependency only. Keep it
  out of engine-core and canonical shared types.
- The internal continuation outcome should not escape through package exports or
  become a public protocol field.
- Preserve event order and causality when the top-level orchestrator resumes
  battle damage.
- Do not hide context in a new service locator; explicit result data and
  lexical async context solve different problems here.

## Acceptance Criteria

- Life-trigger damage continuation works when modules are imported directly or
  in any order.
- Engine production code has no registered damage continuation callback or
  module import side effect.
- Each continuation intent is consumed at most once by static orchestration.
- Two overlapping socket actions never share timing spans.
- Rejections and nested awaits restore timing context without manual global
  assignment.
- Public engine, log, and transport shapes remain compatible.
- Focused concurrency and architecture tests pass.

## Verification

```sh
corepack pnpm exec vitest run packages/engine-core/src/life-trigger/continuation-boundary.test.ts
corepack pnpm exec vitest run packages/engine-core/src/battle
corepack pnpm exec vitest run packages/match-server/src/action-timing-log.test.ts
corepack pnpm test:tooling
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm coverage
corepack pnpm verify
```
