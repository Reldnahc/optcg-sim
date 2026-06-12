# Canonical Event Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize event-backed "whenever" effects so auto queueing and optional activated reactions use one canonical event-to-trigger matcher.

**Architecture:** Keep `EngineEvent` and `eventJournal` as the canonical event record. Extract reusable event trigger matching into a focused module consumed by both auto event queueing and optional activated reactions, then add regression tests that prove new event-backed triggers do not require duplicated matcher branches. Do not change parser support or gameplay timing in this plan.

**Tech Stack:** TypeScript, `@optcg/types`, `packages/engine-core`, Vitest through `npm.cmd run test -- ...`, repo typecheck/lint commands.

---

## File Structure

- Create: `packages/engine-core/src/runtime/event-hooks/matcher.ts`
  - Owns event-to-trigger matching for event-backed triggers.
  - Exports typed match helpers only; it does not queue effects or create legal actions.
- Create: `packages/engine-core/src/runtime/event-hooks/matcher.test.ts`
  - Direct unit tests for canonical matching across auto and optional reaction use cases.
- Modify: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.ts`
  - Replaces local event trigger matchers with `matchEventTrigger`.
  - Keeps queueing behavior, source presence policy, ordering, and failure behavior unchanged.
- Modify: `packages/engine-core/src/runtime/optional-activation/event-reaction.ts`
  - Replaces duplicated activated reaction event matchers with `matchEventTrigger`.
  - Keeps legal action exposure and activation timing unchanged.
- Modify: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts`
  - Adds regressions proving auto event queueing still works through the shared matcher.
- Modify: `packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts`
  - Adds regressions proving optional reaction legal actions still work through the shared matcher.
- Optional follow-up only if evidence appears during implementation: create `packages/engine-core/src/runtime/event-hooks/event-selection.ts`
  - Owns recent-event window selection and de-duplication if both queueing paths currently duplicate it in a way that blocks the matcher extraction.

---

### Task 1: Extract Canonical Event Matcher

**Files:**

- Create: `packages/engine-core/src/runtime/event-hooks/matcher.ts`
- Create: `packages/engine-core/src/runtime/event-hooks/matcher.test.ts`
- Read: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.ts`
- Read: `packages/engine-core/src/runtime/optional-activation/event-reaction.ts`

- [ ] **Step 1: Write the failing matcher tests**

Add tests that exercise the matcher directly, without queueing an effect. Cover at least these cases:

```ts
test("canonical event matcher matches cardRested triggers by player, self target, source controller, and source kind", () => {
  const { source, state } = setupEventHookState();
  const event = cardRestedEvent(state, {
    playerId: source.controller,
    instanceId: source.instanceId,
    cardId: source.cardId,
    sourceControllerId: source.controller,
    sourceKind: "effect",
  });

  const match = matchEventTrigger(
    state,
    source,
    {
      type: "cardRested",
      target: "self",
      player: "self",
      sourceController: "self",
      sourceKind: "effect",
    },
    event,
  );

  assert.deepEqual(match, { matched: true, triggerTypes: ["cardRested"] });
});
```

```ts
test("canonical event matcher rejects unsupported payload evidence instead of trusting trigger shape", () => {
  const { source, state } = setupEventHookState();
  const event = cardRestedEvent(state, {
    playerId: source.controller,
    instanceId: source.instanceId,
    cardId: source.cardId,
  });

  const match = matchEventTrigger(
    state,
    source,
    {
      type: "cardRested",
      player: "self",
      sourceController: "opponent",
    },
    event,
  );

  assert.deepEqual(match, { matched: false, triggerTypes: [] });
});
```

Also include direct tests for:

- `damageDealt`
- `fieldRemoved` from a public `cardMoved` event
- `cardPlayed` with `sourceZone`
- `donReturned`
- `anyOf` combining two event-backed triggers

- [ ] **Step 2: Run matcher tests and verify they fail**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/event-hooks/matcher.test.ts
```

Expected: fail because `runtime/event-hooks/matcher.ts` does not exist.

- [ ] **Step 3: Implement the matcher module**

Move the reusable matching logic out of the existing queueing files. The public API should be small:

```ts
export type EventReactionTriggerType =
  | "damageDealt"
  | "fieldRemoved"
  | "cardPlayed"
  | "cardRested"
  | "donReturned"
  | "lifeRemoved"
  | "onOpponentAttack"
  | "opponentActivated";

export interface EventTriggerMatch {
  readonly matched: boolean;
  readonly triggerTypes: readonly EventReactionTriggerType[];
}

export const matchEventTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Trigger,
  event: EngineEvent,
): EventTriggerMatch => {
  // Delegate to primitive trigger matchers.
};
```

Keep these constraints:

- The matcher must inspect event payload evidence and visibility.
- The matcher must not inspect effect body support.
- The matcher must not create queue entries, legal actions, decisions, or events.
- The matcher must fail closed for missing payload fields.
- `anyOf` must flatten matching child trigger types without duplicates.

- [ ] **Step 4: Run matcher tests and verify they pass**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/event-hooks/matcher.test.ts
```

Expected: pass.

- [ ] **Step 5: Review checkpoint**

Before continuing, review the diff for these anti-shapes:

```powershell
rg -n "OP[0-9]{2}|ST[0-9]{2}|cardId ===|effectBlockId ===|timingWindowId.endsWith" packages/engine-core/src/runtime/event-hooks packages/engine-core/src/runtime/trigger-queueing/event-reaction.ts packages/engine-core/src/runtime/optional-activation/event-reaction.ts
```

Expected: no card IDs, no effect IDs, no support based on exact timing-window suffixes in the new matcher.

- [ ] **Step 6: Commit**

```powershell
git add packages/engine-core/src/runtime/event-hooks/matcher.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts
git commit -m "Extract canonical event trigger matcher"
```

---

### Task 2: Use Matcher For Auto Event Queueing

**Files:**

- Modify: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts`
- Read: `packages/engine-core/src/effect-runtime-block-support.ts`

- [ ] **Step 1: Write auto queueing regression tests**

Add tests proving queueing depends on matcher results, not local trigger branches:

```ts
test("auto event reactions queue anyOf event triggers through the canonical matcher", () => {
  const { source, state } = cardRestedReactionState();
  const definition = mustImplementedDefinition(state, source.cardId);
  definition.effects[0] = {
    ...definition.effects[0],
    trigger: {
      type: "anyOf",
      triggers: [
        { type: "donReturned", player: "self" },
        { type: "cardRested", target: "self", player: "self" },
      ],
    },
  };

  const result = queueEventReactionTriggers(state);

  assert.ok(result !== undefined);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(
    String(result.state.effectQueue[0]?.timingWindowId).endsWith(":cardRested"),
    true,
  );
});
```

Also add a negative test:

```ts
test("auto event reactions do not queue when the canonical matcher rejects payload evidence", () => {
  const { state } = cardRestedReactionState({
    payloadOverride: { sourceControllerId: "wrong-player" },
    triggerOverride: {
      type: "cardRested",
      player: "self",
      sourceController: "self",
    },
  });

  const result = queueEventReactionTriggers(state);

  assert.equal(result, undefined);
});
```

- [ ] **Step 2: Run auto queueing tests and verify they fail or expose current duplication**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts
```

Expected before implementation: at least one new test fails because queueing does not use the new matcher or does not support the shared match shape.

- [ ] **Step 3: Replace local matching with `matchEventTrigger`**

In `runtime/trigger-queueing/event-reaction.ts`:

- Delete local duplicated primitive matchers that moved to `runtime/event-hooks/matcher.ts`.
- Keep `queuedEventReactionTriggerEventIds`, source enumeration, support checks, queue entry creation, event emission, and error handling.
- Replace `matchingTriggerTypes(...)` calls with `matchEventTrigger(...).triggerTypes`.

- [ ] **Step 4: Run auto queueing tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts
```

Expected: pass.

- [ ] **Step 5: Review checkpoint**

Review specifically for behavior drift:

- Queue entry IDs must keep the same shape except when `anyOf` chooses the same trigger type it already would have.
- `effectQueued` events must retain `triggerEventId`.
- Unsupported body support must still be checked by `isSupportedAutoRuntimeEffectBlock`.

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/trigger-queueing/source-presence.test.ts packages/engine-core/src/effect-runtime-block-support.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/engine-core/src/runtime/trigger-queueing/event-reaction.ts packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts packages/engine-core/src/runtime/event-hooks/matcher.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts
git commit -m "Use canonical matcher for auto event reactions"
```

---

### Task 3: Use Matcher For Optional Activated Reactions

**Files:**

- Modify: `packages/engine-core/src/runtime/optional-activation/event-reaction.ts`
- Modify: `packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts`
- Read: `packages/engine-core/src/runtime/optional-activation/actions.ts`

- [ ] **Step 1: Write optional reaction regression tests**

Add tests proving optional legal-action exposure consumes the same matcher:

```ts
test("optional activated reactions expose legal actions through the canonical event matcher", () => {
  const { source, state } = cardPlayedOptionalReactionState({
    trigger: {
      type: "cardPlayed",
      player: "opponent",
      sourceZone: "hand",
    },
    eventSourceZone: "hand",
  });

  const actions = getActivatedReactionLegalActions(state, source.controller);

  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "activateEffect");
});
```

Add a shared negative payload-evidence test:

```ts
test("optional activated reactions do not expose actions when canonical matcher rejects the event", () => {
  const { source, state } = cardPlayedOptionalReactionState({
    trigger: {
      type: "cardPlayed",
      player: "opponent",
      sourceZone: "trash",
    },
    eventSourceZone: "hand",
  });

  const actions = getActivatedReactionLegalActions(state, source.controller);

  assert.equal(actions.length, 0);
});
```

- [ ] **Step 2: Run optional reaction tests and verify they fail or expose current duplication**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts
```

Expected before implementation: new tests fail if the optional path is not consuming the shared matcher.

- [ ] **Step 3: Replace optional local event matching with `matchEventTrigger`**

In `runtime/optional-activation/event-reaction.ts`:

- Keep support policy in `isSupportedActivatedReactionEffect`.
- Keep legal-action creation, once-per-turn checks, condition evaluation, and immediate queue processing unchanged.
- Replace `activatedReactionEventsForSource` internals with filtering based on `matchEventTrigger(state, source, effect.trigger, event).matched`.
- Preserve optional-only supported trigger policy. If optional support intentionally excludes `cardRested`, do not add it in this task unless a test proves the existing parser/runtime already supports that timing.

- [ ] **Step 4: Run optional reaction tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts
```

Expected: pass.

- [ ] **Step 5: Review checkpoint**

Run a source scan to confirm there is only one primitive matcher implementation:

```powershell
rg -n "matchesCardPlayedTrigger|matchesCardRestedTrigger|matchesFieldRemovedTrigger|matchesDamageTrigger|matchesDonReturnedTrigger|isActivatedCardPlayedEvent|isActivatedFieldRemovedEvent" packages/engine-core/src/runtime
```

Expected: these old local matcher names should either be gone or exist only in `runtime/event-hooks/matcher.ts` under the canonical names.

- [ ] **Step 6: Commit**

```powershell
git add packages/engine-core/src/runtime/optional-activation/event-reaction.ts packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts packages/engine-core/src/runtime/event-hooks/matcher.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts
git commit -m "Use canonical matcher for optional event reactions"
```

---

### Task 4: Add Specialized Regression Coverage For Future Event Hooks

**Files:**

- Modify: `packages/engine-core/src/runtime/event-hooks/matcher.test.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts`
- Modify: `packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts`

- [ ] **Step 1: Add anti-regression tests for extension behavior**

Add tests with synthetic effects and events proving:

- A new event-backed trigger can be matched by the shared matcher without queueing code changes.
- Auto queueing still requires `isSupportedAutoRuntimeEffectBlock`.
- Optional activation still requires `isSupportedActivatedReactionEffect`.
- Missing public payload evidence fails closed.
- Hidden/private/server-only events do not expose public legal actions.

Use focused test names:

```ts
test("canonical matcher can match supported event-backed triggers without queueing knowledge", () => {
  // Direct matcher test only. No queueing module imports.
});
```

```ts
test("auto event queueing rejects matched triggers with unsupported bodies", () => {
  // Proves matcher success is not support certification.
});
```

```ts
test("optional event reactions reject matched triggers outside optional support policy", () => {
  // Proves matcher success does not bypass optional activation support.
});
```

- [ ] **Step 2: Run specialized regression tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/event-hooks/matcher.test.ts packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts
```

Expected: pass.

- [ ] **Step 3: Review checkpoint**

Review the tests for the repo scaling invariant:

- No card IDs.
- No exact printed lines.
- No exact full definition shape used as authority.
- Matcher tests operate on primitives: trigger, event, source, state.
- Queueing tests prove support policy remains separate from matching.

- [ ] **Step 4: Commit**

```powershell
git add packages/engine-core/src/runtime/event-hooks/matcher.test.ts packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts
git commit -m "Add canonical event hook regression tests"
```

---

### Task 5: Final Verification And Architecture Review

**Files:**

- Read: all files changed by Tasks 1-4.

- [ ] **Step 1: Run focused event hook suite**

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/event-hooks/matcher.test.ts packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts packages/engine-core/src/battle/card-rested-event.test.ts
```

Expected: pass.

- [ ] **Step 2: Run broader runtime trigger suite**

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/trigger-queueing/source-presence.test.ts packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts packages/engine-core/src/runtime/trigger-queueing/main-event.test.ts packages/engine-core/src/runtime/trigger-queueing/attack.test.ts packages/engine-core/src/runtime/trigger-queueing/ko.test.ts packages/engine-core/src/runtime/optional-activation/activation.test.ts
```

Expected: pass.

- [ ] **Step 3: Run typecheck**

```powershell
npm.cmd run typecheck
```

Expected: pass.

- [ ] **Step 4: Run lint**

```powershell
npm.cmd run lint
```

Expected: pass unless the pre-existing unrelated client `decision-modal.test.ts` max-lines failure is still present. If it fails only there, record it as unrelated and do not edit client files in this plan.

- [ ] **Step 5: Architecture review**

Review for these invariants:

- `runtime/event-hooks/matcher.ts` has no queue insertion or action exposure.
- Queueing modules do not duplicate primitive payload matching.
- Optional reactions and auto reactions share payload matching.
- Support certification remains separate from event matching.
- Event production remains unchanged except for tests that already cover prior behavior.
- The implementation does not add card IDs, exact printed text, or exact full-line branches.

Run:

```powershell
rg -n "OP[0-9]{2}|ST[0-9]{2}|exact|full line|timingWindowId.endsWith|cardId ===" packages/engine-core/src/runtime/event-hooks packages/engine-core/src/runtime/trigger-queueing packages/engine-core/src/runtime/optional-activation
```

Expected: no new card-specific or exact-template support authority. Existing harmless timing-window ID formatting in tests can remain if it is assertion-only.

- [ ] **Step 6: Final commit if verification-only changes were needed**

If Task 5 required any code or test edits:

```powershell
git add packages/engine-core/src/runtime/event-hooks packages/engine-core/src/runtime/trigger-queueing packages/engine-core/src/runtime/optional-activation
git commit -m "Review canonical event hook architecture"
```

If no edits were needed, do not create an empty commit.

---

## Out Of Scope For This Plan

- Parser changes for new printed card text.
- New card support.
- New event producers except where tests expose an existing event path that already claims support but fails to emit canonical events.
- Collapsing K.O. batch/replacement timing into the generic event queueer.
- Changing life trigger timing or hidden-information handling.
- Refactoring client/UI code.

## Follow-Up Candidates

- Normalize semantic event production for `fieldRemoved`, `lifeRemoved`, `handTrashedByEffect`, and `opponentActivated` if audits show those remain aliases over unrelated event payloads.
- Collapse simple special queueers into event reaction queueing after matcher extraction proves stable.
- Add a typed payload map for `EngineEvent` so matcher code does not rely on ad hoc payload casts.
