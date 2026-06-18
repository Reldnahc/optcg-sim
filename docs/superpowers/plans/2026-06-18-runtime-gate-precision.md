# Runtime Gate Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop false fail-closed gates from blocking supported current effects because unrelated card metadata or sibling effects look unsupported.

**Architecture:** Keep fail-closed behavior for the exact unsupported operation that is currently resolving, but replace broad whole-card and whole-queue preflight checks with relevance-based checks. Centralize the relevance decisions in small helpers, add parity tests between support admission and live runtime gates, and improve generic queue-gate diagnostics so future failures identify the current entry, trigger, or segment that failed.

**Tech Stack:** TypeScript, Vitest, engine-core runtime queues, effect definitions, play-card support metadata.

---

## File Structure

- Create `packages/engine-core/src/play-card/effect-relevance.ts`
  - Owns play-time effect relevance for Character, Stage, and Event cards.
  - Distinguishes immediate play-time effects from dormant future triggers and user-activated effects.
- Modify `packages/engine-core/src/play-card/support.ts`
  - Uses the relevance helper instead of inspecting every effect block on a playable card.
- Modify `packages/engine-core/src/play-card/support.test.ts`
  - Adds play metadata regressions for dormant future triggers, always-on blocks, and Event Main effects.
- Modify `packages/engine-core/src/play-card/on-play-runtime.test.ts`
  - Keeps live play-card behavior aligned with play metadata support.
- Modify `packages/engine-core/src/runtime/optional-activation/activate-main-trash-play.test.ts`
  - Keeps the current Yamato-style play-from-trash false-gate regression.
- Modify `packages/engine-core/src/runtime-support-gate-parity.test.ts`
  - Adds reusable parity cases proving canonical support admission and sequence/queue preflight agree.
- Modify trigger queueing tests:
  - `packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts`
  - `packages/engine-core/src/runtime/trigger-queueing/main-event.test.ts`
  - `packages/engine-core/src/runtime/trigger-queueing/attack.test.ts`
  - `packages/engine-core/src/runtime/trigger-queueing/ko.test.ts`
- Modify `packages/engine-core/src/effect-runtime-queue/unsupported.ts`
  - Allows unsupported queue errors to include the precise gate context.
- Modify `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`
  - Passes current-entry context into unsupported queue errors.
- Modify `packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts`
  - Passes ordering/deferred context into unsupported queue errors.
- Modify `packages/engine-core/src/effect-runtime.ts`
  - Keeps the public unsupported-pending-runtime-work shape but preserves optional detail fields.

## Policy

The engine should fail closed when the current operation is unsupported:

- A current On Play block is unsupported while resolving On Play timing.
- A current On K.O. block is unsupported while resolving On K.O. timing.
- A current sequence segment is unsupported while that segment is being executed.
- A current source-presence policy cannot prove the source is valid.
- A hidden-information, replay, replacement, or ordering case is ambiguous.

The engine should not fail closed because of unrelated metadata:

- A Character being played has an unsupported On K.O. block.
- A Character being played has an unsupported When Attacking block.
- A Stage being played has an unsupported Activate Main block.
- A queued On Play effect has an unrelated sibling On K.O. block.
- A supported queue entry exists beside unrelated dormant effects on the same card.

## Gate Inventory And Explicit Changes

Before implementing the tasks, run these inventory commands and compare the results to this section:

```bash
rg "detectPendingRuntimeWork|unsupported-pending-runtime-work|unsupported-.*definition|source-presence-failed|Battle requires unsupported|Unsupported .*decision|fail closed" packages/engine-core/src packages/card-support/src -n
rg "getSupportedPlayMetadata|evaluateEffectBlockRuntimeSupport|createUnsupportedEffectQueueResult|hasUnsupportedCounterWindow|getUnsupportedDamageStepContinuationReason" packages/engine-core/src -n
```

This plan is not a blanket removal of fail-closed behavior. It removes or narrows gates that reject supported current work because of unrelated metadata. It keeps gates that protect an exact unsupported operation, hidden information, stale causality, malformed decisions, battle invariants, or primitive semantics.

### Play And Support Admission Gates

| Gate site                                                                                                                                  | Current behavior                                                                                                                                                                  | Change in this plan                                                                                                                                                                                                                           | Why                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine-core/src/play-card/support.ts#getSupportedPlayMetadata` for `implemented-dsl` Characters                                  | Requires all current On Play blocks to pass runtime admission. Dormant future triggers are mostly ignored, but always-on and replacement blocks are not modeled as play-relevant. | Replace ad hoc category branches with `playRelevantEffectBlocks`. Character relevance becomes On Play plus always-on permanent/replacement effects. Dormant On K.O., When Attacking, and Activate Main blocks do not affect hand playability. | Playing a Character should not be blocked by future triggers, but permanent/replacement text that is active immediately can affect play legality and must remain checked. |
| `packages/engine-core/src/play-card/support.ts#getSupportedPlayMetadata` for `implemented-dsl` Stages                                      | Requires every effect block in the Stage definition to pass runtime admission.                                                                                                    | Remove the whole-definition Stage gate. Stage relevance becomes On Play plus always-on permanent/replacement effects. Dormant Activate Main blocks no longer block playing the Stage.                                                         | Stage activations happen later and should fail only when the player tries to activate them.                                                                               |
| `packages/engine-core/src/play-card/support.ts#getSupportedPlayMetadata` for `implemented-dsl` Events                                      | Requires at least one supported Main block and rejects unsupported Main blocks.                                                                                                   | Keep the current timing-specific Main Event gate, but route it through `playRelevantEffectBlocks` for consistency.                                                                                                                            | Events resolve when played; their Main blocks are the current operation. Unsupported current Main blocks should still fail closed.                                        |
| `packages/engine-core/src/play-card/support.ts#getSupportedPlayMetadata` for `vanilla-confirmed` cards and `hasUnsupportedSupportGateText` | Blocks vanilla play if printed effect/trigger text contains unsupported gate text.                                                                                                | Keep. Do not weaken this in this plan.                                                                                                                                                                                                        | Vanilla support is only safe when the card has no effect text that needs runtime behavior.                                                                                |
| `packages/engine-core/src/effect-runtime-admission.ts#evaluateEffectBlockRuntimeSupport`                                                   | Canonical primitive/body/entry support report for one effect block, with sibling context only for `activateReferencedEffect`.                                                     | Keep as the authority for a single current block. Add parity tests so sequence preflight and queue execution agree with this report.                                                                                                          | This is the correct fail-closed layer. The problem is callers using it on unrelated blocks or using weaker duplicate preflights.                                          |
| `packages/card-support/src/support-probe-report.ts` runtime reason output                                                                  | Reports parser and runtime reasons, but can make supported parser output look blocked by a later live queue gate.                                                                 | Keep output format unless Task 6 finds labels that need current-entry wording. Add probe/live parity coverage instead of trusting probe output alone.                                                                                         | Probe should explain support, but live engine behavior is the real contract.                                                                                              |

### Trigger Queueing Gates

| Gate site                                                                                            | Current behavior                                                                                                                                              | Change in this plan                                                                                                                                                                                                     | Why                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime/trigger-queueing/on-play.ts` with `unsupported-on-play-definition`                          | Looks only at current On Play candidates and rejects if any current On Play block is unsupported.                                                             | Keep the fail-closed behavior for current On Play blocks. Add sibling tests proving dormant On K.O. blocks do not matter.                                                                                               | This gate is conceptually right; tests make the boundary explicit.                                                                        |
| `runtime/trigger-queueing/main-event.ts` with `unsupported-main-event-definition`                    | Looks only at current Main Event candidates, but referenced-effect support uses sibling context from the full definition.                                     | Keep current Main-only gating. Ensure sibling context is used only to prove a referenced target block exists, not to reject unrelated dormant effects.                                                                  | Main Event effects are current work; unrelated On Play, On K.O., Trigger, or Activate blocks must not block them.                         |
| `runtime/trigger-queueing/attack.ts` with `unsupported-when-attacking-definition`                    | Looks at current When Attacking candidates for the attack event.                                                                                              | Keep. Add regression that a dormant On K.O. sibling does not matter.                                                                                                                                                    | When Attacking is current timing. Dormant future text should not gate it.                                                                 |
| `runtime/trigger-queueing/attack.ts` with `unsupported-on-opponent-attack-definition`                | Scans defender field sources and treats matched On Opponent Attack auto blocks plus matched activated reactions as current work.                              | Keep current-timing rejection, but make tests prove non-matching On Play/On K.O./Activate Main siblings are ignored. If needed, split matched activated reactions from unrelated activate blocks before support checks. | Retarget and attack-reaction support should fail on the reaction being offered, not on other text on the same card.                       |
| `runtime/trigger-queueing/ko.ts#detectBattleKOTriggerCandidates` with `unsupported-on-ko-definition` | Looks only at current On K.O. candidates from the KO event batch.                                                                                             | Keep current On K.O. fail-closed behavior. Add sibling test proving dormant On Play text is ignored.                                                                                                                    | On K.O. is current work; unrelated siblings are not.                                                                                      |
| `runtime/trigger-queueing/ko.ts#detectBattleKOTriggerCandidates` with `source-presence-failed`       | Fails if the current KO source cannot be proven in the expected destination or last-known-information location.                                               | Keep the gate, but diagnostics should identify it as source presence rather than generic unsupported runtime work. Do not make old unrelated trash cards trigger this path.                                             | Source presence protects trigger legality and hidden/known-zone semantics. It is not the same bug as unsupported effect support.          |
| `runtime/trigger-queueing/hand-trash.ts` with `unsupported-hand-trashed-by-effect-definition`        | Rejects unsupported current hand-trashed-by-effect definitions.                                                                                               | Keep if it support-checks only hand-trash event-matched candidates. Add a sibling regression if it checks full definitions.                                                                                             | Hand-trash triggers are current work only when their event matcher fires.                                                                 |
| `runtime/trigger-queueing/opponent-activation.ts` with `unsupported-opponent-activation-definition`  | Rejects unsupported current opponent-activation definitions.                                                                                                  | Keep if it support-checks only opponent-activation event-matched candidates. Add a sibling regression if it checks full definitions.                                                                                    | Opponent activation reactions should not be blocked by unrelated text on the same source.                                                 |
| `runtime/trigger-queueing/event-reaction.ts` with `unsupported-event-reaction-definition`            | Rejects unsupported current event-reaction definitions.                                                                                                       | Keep if it support-checks only event-reaction candidates whose trigger matcher fired. Add a sibling regression if it checks full definitions.                                                                           | Event reactions are timing-specific; unrelated activate or future trigger blocks are not current work.                                    |
| `runtime/trigger-queueing/end-turn.ts` with `unsupported-end-of-your-turn-definition`                | Rejects unsupported current end-of-turn definitions.                                                                                                          | Keep if it support-checks only end-of-turn candidates. Add a sibling regression if it checks full definitions.                                                                                                          | End-of-turn triggers should fail on current end-of-turn text, not other card text.                                                        |
| `life-trigger/actions.ts#selectSupportedTriggerEffects`                                              | Filters trigger effects, rejects activation when any current life-trigger block is unsupported, and falls back to add-to-hand when activation is unsupported. | Keep current trigger-only admission and add a regression proving dormant non-trigger siblings do not remove an otherwise supported `activateTrigger` option.                                                            | Life triggers are a separate trigger admission path and must be explicit in this plan.                                                    |
| `runtime/trigger-queueing/admission.ts#hasPendingTriggerRuntimeWork`                                 | Prevents new trigger queueing while runtime work is already pending.                                                                                          | Keep. Do not use this as proof that the pending work is unsupported. Pending supported work must be settled by queue processing.                                                                                        | Queue ordering must remain deterministic. The false gate is later generic unsupported handling, not the existence of pending work itself. |

### Effect Queue And Runtime Continuation Gates

| Gate site                                                                                                                                    | Current behavior                                                                                          | Change in this plan                                                                                                                                                                                                                                                                                          | Why                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect-runtime.ts#detectPendingRuntimeWork`                                                                                                 | Reports only `effectQueue` or `deferredTriggers` count. Callers often turn this into a generic hard stop. | Keep the detector simple. Stop treating detector presence as unsupported in continuation paths. Supported work should be processed by `processEffectRuntime` or `continueRuntimeUntilIdle`; only unresolved unsupported work should become an error.                                                         | Pending runtime work is a scheduling state, not support failure evidence.                                                                    |
| `effect-runtime.ts#unsupportedPendingRuntimeWorkError`                                                                                       | Emits `unsupported-effect-queue` or `unsupported-deferred-triggers` with only kind/count.                 | Keep the public reason, but add optional `gate`, `queueEntryId`, `effectId`, and `queueReason`.                                                                                                                                                                                                              | Logs must say which gate fired so future false positives are debuggable.                                                                     |
| `effect-runtime-queue/unsupported.ts#createUnsupportedEffectQueueResult`                                                                     | Creates the same generic unsupported queue error for every queue-processing failure.                      | Change signature to accept `UnsupportedEffectQueueContext` at call sites. Do not delete the helper; make it precise.                                                                                                                                                                                         | The generic error is hiding whether the failure was ordering, source presence, unsupported body, stale optional accept, or deferred release. |
| `effect-runtime-queue/no-choice-processing.ts#evaluateQueueOrdering` and `orderNoChoiceQueueEntries`                                         | Invalid queue ordering returns generic `unsupported-effect-queue`.                                        | Keep fail-closed behavior, but pass `gate: "queue-ordering"` and a `queueReason`.                                                                                                                                                                                                                            | Invalid ordering is real unsupported work; it should be explicit.                                                                            |
| `effect-runtime-queue/no-choice-processing.ts` accepted optional id validation                                                               | Missing accepted optional entry returns generic `unsupported-effect-queue`.                               | Keep fail-closed behavior, but pass `gate: "queue-ordering"` and `queueReason: "accepted-optional-entry-missing"`.                                                                                                                                                                                           | A stale optional accept is not a sibling support problem.                                                                                    |
| `effect-runtime-queue/entry-resolution.ts#evaluateQueuedEffectSourcePresence`                                                                | Source-presence failure returns generic `unsupported-effect-queue`.                                       | Keep fail-closed behavior for the selected entry, but pass `gate: "queue-source-presence"`, `queueReason: "source-presence-failed"`, and avoid exposing hidden entry identity.                                                                                                                               | Correct behavior, bad diagnostics.                                                                                                           |
| `effect-runtime-queue/entry-resolution.ts` condition support                                                                                 | Unsupported condition returns generic `unsupported-effect-queue`.                                         | Keep fail-closed behavior for the selected entry, but pass `gate: "queue-entry-resolution"` and `queueReason: "unsupported-condition"`.                                                                                                                                                                      | Unsupported current condition is real unsupported current work.                                                                              |
| `effect-runtime-queue/entry-resolution.ts` optional support and once-per-turn admission                                                      | Unsupported optional shape or once-per-turn admission failure returns generic `unsupported-effect-queue`. | Keep fail-closed behavior, but pass `queueReason: "unsupported-optional-shape"` or `queueReason: "once-per-turn-admission-failed"`.                                                                                                                                                                          | Optional activation and once-per-turn mutation affect fairness.                                                                              |
| `effect-runtime-queue/entry-resolution.ts` target, sequence, primitive, play-source, draw, move, damage, win, and continuous body resolution | Any current body failure returns generic `unsupported-effect-queue`.                                      | Keep fail-closed behavior, but pass `gate: "queue-entry-resolution"` and a body-specific `queueReason`, such as `unsupported-body`, `unsupported-target-request`, `unsupported-sequence-frame`, `unsupported-trash-from-hand`, `unsupported-play-source`, `unsupported-damage`, or `unsupported-continuous`. | These are exact current-operation gates. They should not be removed; they should be diagnosable and aligned with canonical admission.        |
| `effect-runtime.ts#deferredTriggers` and damage deferred release                                                                             | Unsupported deferred trigger shape returns `unsupported-deferred-triggers` or generic queue errors.       | Keep the exact double-attack/multiple-damage safety gate. Add context for deferred release failures.                                                                                                                                                                                                         | Deferred trigger ordering during damage is a high-risk game-rules area.                                                                      |

### Action And Battle Gates

| Gate site                                                                                                | Current behavior                                                                                                                                                                            | Change in this plan                                                                                                                                                                                   | Why                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `actions.ts#getLegalActions` when `detectPendingRuntimeWork(state) !== undefined` and no decision exists | Hides phase actions while runtime work is pending.                                                                                                                                          | Keep. Add a comment that this is legal-action suppression, not support failure.                                                                                                                       | Players should not act while the engine owes automatic work.                                                       |
| `actions.ts#applyAction` before phase actions                                                            | Returns illegal phase action while runtime work is pending.                                                                                                                                 | Keep for arbitrary user phase actions. Do not silently process runtime work when accepting a new unrelated user action.                                                                               | This preserves deterministic action ordering.                                                                      |
| `actions.ts` decision continuation helpers                                                               | Mostly continue runtime after supported decisions, but gaps can leave supported queue work pending and later trip generic gates.                                                            | Change continuation paths so supported runtime work is settled before generic gates. Remove broad hard stops from just-completed supported action/decision flows.                                     | This is the main "history is correct but live flow skips/stops" class.                                             |
| `battle/actions.ts#applyDeclareAttack` pending runtime gate                                              | Rejects declareAttack when runtime work is pending.                                                                                                                                         | Keep for direct attack declarations from arbitrary states. If a prior supported continuation leaves pending work, fix the continuation path instead.                                                  | Attacks should not start while automatic work is unresolved.                                                       |
| `battle/actions.ts` post-runtime checks around battle resolution                                         | Returns runtime result when errors, decisions, or pending work remain.                                                                                                                      | Keep, but add diagnostics and tests for supported work settling before this check.                                                                                                                    | Battle resolution has strict sequencing and cannot advance through unresolved automatic work.                      |
| `battle/block-actions.ts#hasUnsupportedBlockDecisionState`                                               | Blocks if pending runtime work, replacement state, existing blocker, unsupported damage count, wrong step, unsupported counter window, or unsupported combat view exists.                   | Keep battle-shape and replacement gates. Treat only the `detectPendingRuntimeWork` branch as a candidate for continuation fixes. Do not remove blocker/multi-damage checks in this runtime-gate plan. | Blocker/retarget battle semantics are separate combat support gates, not sibling effect support gates.             |
| `battle/counter-actions.ts#getLegalCharacterCounterActions` and `applyUseCounter`                        | Blocks on pending runtime work, replacement state, unsupported battle envelope, invalid target, unsupported counter window, unsupported continuation, and unsupported Counter Event shapes. | Keep combat and Counter Event support gates. Treat pending runtime work as legal-action suppression unless it appears immediately after a supported continuation, in which case settle it earlier.    | Counter windows are timing-sensitive; supported runtime continuation should prevent false stops before this point. |
| `battle/counter-window-support.ts#getUnsupportedCounterWindowReason`                                     | Fails only when defender is missing or a hand card has no manifest metadata.                                                                                                                | Keep. This is not the whitelist pattern that blocked supported effects.                                                                                                                               | Missing metadata makes legal counter choices unknowable.                                                           |
| `battle/damage-step-continuation.ts#getUnsupportedDamageStepContinuationReason`                          | Blocks unsupported battle envelope, pending runtime work, replacement state, stale blocker, unsupported combat view, and unsupported double-attack leader damage mismatch.                  | Keep battle envelope/replacement/combat gates. Treat pending runtime work as a continuation bug upstream.                                                                                             | Damage resolution mutates life/KO state and must stay conservative.                                                |

### Turn And Phase Gates

| Gate site                                                                         | Current behavior                                                                                                          | Change in this plan                                                                                                                          | Why                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `turn/phases.ts#enterMainPhase` pending runtime branch                            | If pending runtime work exists while entering main phase, calls `processEffectRuntime(state)` instead of advancing phase. | Keep and classify as runtime processing, not a support failure. Add a regression if Task 5 changes continuation behavior around phase entry. | Entering main phase is a legitimate place to settle automatic work before phase actions resume.                             |
| `turn/phases.ts#materializeBoardContinuousEffects` and `donPhasePlacementRecords` | Fail closed when implemented-DSL continuous effects cannot be materialized at phase boundaries.                           | Keep. Do not replace with sibling relevance logic in this plan.                                                                              | Continuous materialization affects public board state and turn flow; unsupported continuous shapes must remain fail-closed. |

### Gates That Must Not Be Removed By This Plan

- Primitive execution gates in `runtime/primitives/*` for unsupported player refs, chooser refs, target policies, counts, stale decisions, and hidden-zone shapes.
- Replacement/protection gates in `replacement/*` for unsupported replacement processes, unsupported protection shapes, unsupported field-removal destinations, and ambiguous replacement ordering.
- Battle combat view gates that protect stale participants, missing derived power, unsupported keyword/protection interaction, malformed blocker state, or unsupported multi-damage envelopes.
- Decision envelope gates for stale decision ids, wrong decision player, malformed payment responses, invalid card selections, and hidden-information leaks.
- Parser primitive evidence gates in card-support. Parser support must still be based on reusable primitive evidence, not exact card text or card IDs.

### Removal And Narrowing Checklist

During execution, every changed gate must satisfy one of these outcomes:

- **Removed:** The gate only checked unrelated sibling/full-definition metadata and no longer has a valid current-operation purpose.
- **Narrowed:** The gate remains, but it now filters to current timing, current queue entry, current sequence segment, or current event-matched candidate before checking support.
- **Reclassified:** The gate remains as legal-action suppression or diagnostics, not as evidence that the current effect is unsupported.
- **Kept:** The gate protects hidden information, stale causality, malformed decisions, battle invariants, replacement semantics, primitive support, or an actually unsupported current operation.

Before the final verification task, rerun both inventory commands and reconcile every hit into this plan's tables:

| Inventory family                                                                   | Required resolution                                                                                                                          |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Play/support admission hits                                                        | Removed, narrowed, or kept in **Play And Support Admission Gates**.                                                                          |
| Trigger queueing `unsupported-.*definition` hits                                   | Kept or narrowed in **Trigger Queueing Gates**, including life triggers.                                                                     |
| `detectPendingRuntimeWork` and `unsupported-pending-runtime-work` hits             | Kept, reclassified, or changed in **Effect Queue And Runtime Continuation Gates**, **Action And Battle Gates**, or **Turn And Phase Gates**. |
| `createUnsupportedEffectQueueResult` and local `unsupportedEffectQueueResult` hits | Given explicit context in Task 4's queue-exit checklist, or replaced by a more specific non-queue error.                                     |
| Battle/counter/damage continuation support hits                                    | Kept or reclassified in **Action And Battle Gates** with tests that prove the safety gate still exists.                                      |
| Parser/probe/runtime support-report hits                                           | Covered by Task 6 probe/live parity or explicitly left unchanged as reporting-only.                                                          |

If a new inventory hit appears during implementation, add a row to the appropriate gate table before changing code. Do not leave it as an unclassified "similar gate."

Do not commit a runtime-gate change unless the commit message or test name makes the outcome clear. Examples:

```bash
git commit -m "Narrow stage play gate to immediate effects"
git commit -m "Diagnose unsupported queue entry gates"
git commit -m "Settle supported decision continuations before action gates"
```

---

### Task 1: Tighten Play-Time Effect Relevance

**Files:**

- Create: `packages/engine-core/src/play-card/effect-relevance.ts`
- Modify: `packages/engine-core/src/play-card/support.ts`
- Test: `packages/engine-core/src/play-card/support.test.ts`
- Test: `packages/engine-core/src/play-card/on-play-runtime.test.ts`

- [ ] **Step 1: Write failing tests for dormant versus immediate play-time effects**

Add these tests to `packages/engine-core/src/play-card/support.test.ts` near the other `getSupportedPlayMetadata` tests:

```ts
test("getSupportedPlayMetadata rejects unsupported always-on Character blocks but accepts dormant triggers", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "implemented character");
  const implemented = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 3,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-character-relevance",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    character.cardId,
    implemented.support,
  );
  const baseEffect = must(definition.effects[0], "base effect");
  state.cardManifest.cards[character.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;

  state.cardManifest.effectDefinitions = {
    "def-character-relevance": {
      ...definition,
      effects: [
        {
          ...baseEffect,
          id: `${String(baseEffect.id)}:future-on-ko` as EffectDefinition["effects"][number]["id"],
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };
  assert.deepEqual(getSupportedPlayMetadata(state, character), {
    category: "character",
    printedCost: 3,
  });

  state.cardManifest.effectDefinitions = {
    "def-character-relevance": {
      ...definition,
      effects: [
        {
          ...baseEffect,
          id: `${String(baseEffect.id)}:unsupported-permanent` as EffectDefinition["effects"][number]["id"],
          category: "permanent",
          trigger: { type: "permanent" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: { type: "custom", name: "unsupported-permanent" },
        },
      ],
    },
  };
  assert.equal(getSupportedPlayMetadata(state, character), null);
});

test("getSupportedPlayMetadata accepts dormant Stage activations but rejects unsupported Stage On Play", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.hand[1], "implemented stage");
  const implemented = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 2,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-stage-relevance",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    stage.cardId,
    implemented.support,
  );
  const baseEffect = must(definition.effects[0], "base effect");
  state.cardManifest.cards[stage.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;

  state.cardManifest.effectDefinitions = {
    "def-stage-relevance": {
      ...definition,
      effects: [
        {
          ...baseEffect,
          id: `${String(baseEffect.id)}:stage-activate` as EffectDefinition["effects"][number]["id"],
          category: "activate",
          trigger: { type: "activateMain" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: { type: "custom", name: "unsupported-stage-activation" },
        },
      ],
    },
  };
  assert.deepEqual(getSupportedPlayMetadata(state, stage), {
    category: "stage",
    printedCost: 2,
  });

  state.cardManifest.effectDefinitions = {
    "def-stage-relevance": {
      ...definition,
      effects: [
        {
          ...baseEffect,
          id: `${String(baseEffect.id)}:unsupported-on-play` as EffectDefinition["effects"][number]["id"],
          trigger: { type: "onPlay" },
          effect: { type: "custom", name: "unsupported-stage-on-play" },
        },
      ],
    },
  };
  assert.equal(getSupportedPlayMetadata(state, stage), null);
});
```

- [ ] **Step 2: Run tests and verify the always-on Character case fails on current code**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/play-card/support.test.ts
```

Expected before implementation: at least one new assertion fails because current play support does not distinguish dormant triggers from always-on unsupported blocks precisely enough.

- [ ] **Step 3: Add the play relevance helper**

Create `packages/engine-core/src/play-card/effect-relevance.ts`:

```ts
import type { EffectDefinition, ResolvedCard } from "@optcg/types";

type EffectBlock = EffectDefinition["effects"][number];

const isOnPlayBlock = (effect: EffectBlock): boolean =>
  effect.category === "auto" && effect.trigger.type === "onPlay";

const isAlwaysOnBlock = (effect: EffectBlock): boolean =>
  effect.category === "permanent" || effect.category === "replacement";

const isMainEventBlock = (effect: EffectBlock): boolean =>
  effect.category === "auto" && effect.trigger.type === "main";

export const playRelevantEffectBlocks = (
  category: ResolvedCard["category"],
  effects: readonly EffectBlock[],
): EffectBlock[] => {
  if (category === "event") {
    return effects.filter(isMainEventBlock);
  }
  if (category === "character" || category === "stage") {
    return effects.filter(
      (effect) => isOnPlayBlock(effect) || isAlwaysOnBlock(effect),
    );
  }
  return [];
};
```

- [ ] **Step 4: Use the relevance helper in play support**

Modify `packages/engine-core/src/play-card/support.ts` imports:

```ts
import { playRelevantEffectBlocks } from "./effect-relevance.js";
```

Replace the Character, Event, and Stage definition scans with:

```ts
const relevantEffects = playRelevantEffectBlocks(
  resolved.category,
  lookup.definition.effects,
);
```

For Characters:

```ts
if (
  !hasOnlySupportedRelevantEffects(
    relevantEffects,
    isDefinitionRuntimeAdmittedEffect,
    { requireAtLeastOne: false },
  )
) {
  return null;
}
```

For Events:

```ts
if (
  !hasOnlySupportedRelevantEffects(
    relevantEffects,
    isDefinitionRuntimeAdmittedEffect,
    { requireAtLeastOne: true },
  )
) {
  return null;
}
```

For Stages:

```ts
if (
  !hasOnlySupportedRelevantEffects(
    relevantEffects,
    isDefinitionRuntimeAdmittedEffect,
    { requireAtLeastOne: false },
  )
) {
  return null;
}
```

- [ ] **Step 5: Run play-card tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/play-card/support.test.ts packages/engine-core/src/play-card/on-play-runtime.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/engine-core/src/play-card/effect-relevance.ts packages/engine-core/src/play-card/support.ts packages/engine-core/src/play-card/support.test.ts packages/engine-core/src/play-card/on-play-runtime.test.ts
git commit -m "Clarify play-time effect gate relevance"
```

---

### Task 2: Add Trigger-Queue Sibling Relevance Regressions

**Files:**

- Modify: `packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/main-event.test.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/attack.test.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/ko.test.ts`
- Inspect: `packages/engine-core/src/runtime/trigger-queueing/hand-trash.ts`
- Inspect: `packages/engine-core/src/runtime/trigger-queueing/opponent-activation.ts`
- Inspect: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.ts`
- Inspect: `packages/engine-core/src/runtime/trigger-queueing/end-turn.ts`
- Inspect: `packages/engine-core/src/life-trigger/actions.ts`
- Potential implementation target: `packages/engine-core/src/runtime/trigger-queueing/on-play.ts`
- Potential implementation target: `packages/engine-core/src/runtime/trigger-queueing/main-event.ts`
- Potential implementation target: `packages/engine-core/src/runtime/trigger-queueing/attack.ts`
- Potential implementation target: `packages/engine-core/src/runtime/trigger-queueing/ko.ts`

- [ ] **Step 1: Add On Play sibling test**

In `packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts`, add:

```ts
test("On Play queueing ignores unsupported dormant On K.O. sibling", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  setupOnPlayDefinition(
    state,
    played,
    {
      ...definition,
      effects: [
        onPlayEffect,
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:unsupported-on-ko` as typeof onPlayEffect.id,
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
    "def-on-play-with-dormant-on-ko",
  );

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.state.effectQueue[0]?.effectBlockId, onPlayEffect.id);
});
```

- [ ] **Step 2: Add Main Event sibling test**

In `packages/engine-core/src/runtime/trigger-queueing/main-event.test.ts`, add:

```ts
test("Main Event queueing ignores unsupported dormant On K.O. sibling", () => {
  const { state } = setupMainEventQueueingState();
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-main-event-draw"],
    "main event definition",
  );
  const mainEffect = must(definition.effects[0], "main effect");
  state.cardManifest.effectDefinitions = {
    "def-main-event-draw": {
      ...definition,
      effects: [
        mainEffect,
        {
          ...mainEffect,
          id: `${String(mainEffect.id)}:unsupported-on-ko` as typeof mainEffect.id,
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.state.effectQueue[0]?.effectBlockId, mainEffect.id);
});
```

- [ ] **Step 3: Add attack timing sibling tests**

In `packages/engine-core/src/runtime/trigger-queueing/attack.test.ts`, add two tests:

```ts
test("When Attacking queueing ignores unsupported dormant On K.O. sibling", () => {
  const { state, definition } = attackQueueingState();
  const whenAttackingEffect = must(
    definition.effects[0],
    "whenAttacking effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        whenAttackingEffect,
        {
          ...whenAttackingEffect,
          id: `${String(whenAttackingEffect.id)}:unsupported-on-ko` as typeof whenAttackingEffect.id,
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(
    result.state.effectQueue[0]?.effectBlockId,
    whenAttackingEffect.id,
  );
});

test("On Opponent Attack queueing ignores unsupported dormant On Play sibling", () => {
  const { state, definition } = opponentAttackQueueingState();
  const onOpponentAttackEffect = must(
    definition.effects[0],
    "onOpponentAttack effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-on-opponent-attack": {
      ...definition,
      effects: [
        onOpponentAttackEffect,
        {
          ...onOpponentAttackEffect,
          id: `${String(onOpponentAttackEffect.id)}:unsupported-on-play` as typeof onOpponentAttackEffect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = processDefenderOpponentAttackTiming(state);

  assert.equal(result.errors, undefined);
  const queuedEvent = result.events.find(
    (event) => event.type === "effectQueued",
  );
  const payload = queuedEvent?.payload as
    | { effectBlockId?: unknown }
    | undefined;
  assert.equal(payload?.effectBlockId, onOpponentAttackEffect.id);
});
```

- [ ] **Step 4: Add On K.O. sibling test**

In `packages/engine-core/src/runtime/trigger-queueing/ko.test.ts`, add:

```ts
test("On K.O. queueing ignores unsupported dormant On Play sibling", () => {
  const { state, source, definition, events } = koQueueingState();
  const onKOEffect = must(definition.effects[0], "onKO effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        onKOEffect,
        {
          ...onKOEffect,
          id: `${String(onKOEffect.id)}:unsupported-on-play` as typeof onKOEffect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  const candidate = must(result.candidates[0], "On K.O. candidate");
  assert.equal(candidate.effectBlockId, onKOEffect.id);
  assert.equal(candidate.source.instanceId, source.instanceId);
});
```

- [ ] **Step 5: Run trigger queueing tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts packages/engine-core/src/runtime/trigger-queueing/main-event.test.ts packages/engine-core/src/runtime/trigger-queueing/attack.test.ts packages/engine-core/src/runtime/trigger-queueing/ko.test.ts
```

Expected: tests pass, or fail only where an adapter is using a broad sibling gate.

- [ ] **Step 6: Fix any failing adapter by filtering current-timing candidates before support checks**

For each failing adapter, preserve this shape:

```ts
const currentTimingEffects = lookup.definition.effects.filter((effect) =>
  isAutoRuntimeTriggerCandidate(effect, adapterForThisTiming),
);
const supportedCurrentTimingEffects = currentTimingEffects.filter((effect) =>
  isSupportedAutoRuntimeEffectBlock(effect, adapterForThisTiming),
);
if (supportedCurrentTimingEffects.length !== currentTimingEffects.length) {
  return toEngineResult(
    state,
    [],
    [queueingError("unsupported-current-timing-definition")],
    options,
  );
}
```

Do not inspect unrelated `lookup.definition.effects` for this decision.

- [ ] **Step 7: Inventory the lower-traffic trigger adapters and life triggers**

Run:

```bash
rg "lookup\.definition\.effects|unsupported-.*definition|evaluateEffectBlockRuntimeSupport|isSupported.*Effect|selectSupportedTriggerEffects" packages/engine-core/src/runtime/trigger-queueing/hand-trash.ts packages/engine-core/src/runtime/trigger-queueing/opponent-activation.ts packages/engine-core/src/runtime/trigger-queueing/event-reaction.ts packages/engine-core/src/runtime/trigger-queueing/end-turn.ts packages/engine-core/src/life-trigger/actions.ts -n
```

Expected:

- `hand-trash.ts` checks only hand-trashed-by-effect event candidates before support checks.
- `opponent-activation.ts` checks only opponent-activation event candidates before support checks.
- `event-reaction.ts` checks only matched event-reaction candidates before support checks.
- `end-turn.ts` checks only end-of-your-turn candidates before support checks.
- `life-trigger/actions.ts#selectSupportedTriggerEffects` checks only `trigger.type === "trigger"` blocks before support checks and ignores dormant non-trigger siblings.

If a file checks the whole definition, add a sibling regression in the nearest existing test file and narrow it with the same current-candidate pattern from Step 6.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/engine-core/src/runtime/trigger-queueing
git commit -m "Test trigger gates ignore dormant siblings"
```

---

### Task 3: Strengthen Runtime Support Parity Tests

**Files:**

- Modify: `packages/engine-core/src/runtime-support-gate-parity.test.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-admission.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-queue/effect-resolution.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/basic.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/costs.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/field.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/continuous.ts`

- [ ] **Step 1: Add a reusable parity helper**

In `packages/engine-core/src/runtime-support-gate-parity.test.ts`, add below `syntheticEntry`:

```ts
const assertAdmissionAndSequencePreflightAgree = (
  name: string,
  block: EffectDefinition["effects"][number],
  entry: EffectQueueEntry = syntheticEntry(block.sourcePresencePolicy),
): void => {
  const admission = evaluateEffectBlockRuntimeSupport(block);
  const sequenceBlock = toSupportedSequenceBlock(entry, block);
  assert.equal(
    sequenceBlock !== undefined,
    admission.supported,
    `${name}: admission.supported=${String(
      admission.supported,
    )} sequenceBlock=${String(sequenceBlock !== undefined)}`,
  );
};
```

- [ ] **Step 2: Add supported block cases**

Add this table and test:

```ts
const supportedSequenceParityCases: readonly {
  readonly name: string;
  readonly block: EffectDefinition["effects"][number];
}[] = [
  {
    name: "conditioned optional DON attach sequence",
    block: conditionedOptionalDonAttachBlock(),
  },
  {
    name: "draw then trash hand sequence",
    block: {
      ...conditionedOptionalDonAttachBlock(),
      id: "runtime-support-gate-parity-draw-trash" as EffectDefinition["effects"][number]["id"],
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "draw", count: 2, player: "self" },
          },
          {
            connector: "then",
            effect: {
              type: "trashFromHand",
              count: 1,
              min: 1,
              player: "self",
              chooser: "self",
            },
          },
        ],
      },
    },
  },
  {
    name: "target selection then power modification sequence",
    block: {
      ...conditionedOptionalDonAttachBlock(),
      id: "runtime-support-gate-parity-target-power" as EffectDefinition["effects"][number]["id"],
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select-target",
            connector: "always",
            saveResultAs: "savedTarget",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: { categories: ["character"] },
              },
            },
          },
          {
            id: "power-saved-target",
            connector: "then",
            effect: {
              type: "modifyPower",
              value: -2000,
              duration: { type: "thisTurn" },
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "savedTarget",
                },
                zone: "characterArea",
                player: "opponent",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
    },
  },
  {
    name: "trash selection then playSelected sequence",
    block: {
      ...conditionedOptionalDonAttachBlock(),
      id: "runtime-support-gate-parity-play-selected" as EffectDefinition["effects"][number]["id"],
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected-trash-for-parity-play" as SelectionId,
            effect: {
              type: "selectCards",
              zone: "trash",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                names: ["Generic Body"],
                colorsAny: ["black"],
                cost: { op: "eq", value: 8 },
              },
              saveAs: "selected-trash-for-parity-play" as SelectionId,
              visibility: "bothPlayers",
            },
          },
          {
            connector: "ifPossible",
            effect: {
              type: "playSelected",
              selection: "selected-trash-for-parity-play" as SelectionId,
              ignoreCost: true,
            },
          },
        ],
      },
    },
  },
  {
    name: "play source sequence",
    block: {
      ...conditionedOptionalDonAttachBlock(),
      id: "runtime-support-gate-parity-play-source" as EffectDefinition["effects"][number]["id"],
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "playSource",
              source: { type: "triggerCard" },
              ignoreCost: true,
            },
          },
        ],
      },
    },
  },
];

for (const testCase of supportedSequenceParityCases) {
  test(`canonical support and sequence preflight agree for ${testCase.name}`, () => {
    assertAdmissionAndSequencePreflightAgree(testCase.name, testCase.block);
  });
}
```

If `SelectionId` is not already imported in this file, add it from `@optcg/types`.

This table intentionally covers the families that previously drifted between admission and runtime preflight: target selection, continuous/power modification, play-selected from a saved selection, play-source, and multi-step draw/trash sequencing. Deferred damage-trigger release is not an `EffectBlock` admission/preflight pair, so Task 4 owns its diagnostics and queue-shape regression instead of forcing it into this helper.

- [ ] **Step 3: Replace duplicate one-off assertions with the helper**

Update existing tests in the file:

```ts
test("canonical support and sequence execution preflight agree for conditioned sequence blocks", () => {
  assertAdmissionAndSequencePreflightAgree(
    "conditioned sequence",
    conditionedOptionalDonAttachBlock(),
  );
});
```

- [ ] **Step 4: Run parity tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/runtime-support-gate-parity.test.ts
```

Expected: all parity tests pass. If a supported block fails sequence preflight, adjust the narrower preflight helper so it accepts the same primitive evidence as canonical admission.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/engine-core/src/runtime-support-gate-parity.test.ts packages/engine-core/src/effect-runtime-admission.ts packages/engine-core/src/effect-runtime-sequence packages/engine-core/src/effect-runtime-queue
git commit -m "Add runtime gate parity coverage"
```

---

### Task 4: Add Precise Unsupported Queue Diagnostics

**Files:**

- Modify: `packages/engine-core/src/effect-runtime.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/unsupported.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts`
- Test: `packages/engine-core/src/effect-runtime-queue/pending-work.test.ts`
- Test: `packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts`

- [ ] **Step 1: Extend unsupported work details**

In `packages/engine-core/src/effect-runtime.ts`, change `UnsupportedPendingRuntimeWorkDetails` to:

```ts
export interface UnsupportedPendingRuntimeWorkDetails extends PendingRuntimeWork {
  reason: "unsupported-pending-runtime-work";
  gate?:
    | "queue-ordering"
    | "queue-entry-resolution"
    | "queue-source-presence"
    | "queue-effect-definition"
    | "deferred-trigger-release";
  queueEntryId?: string;
  effectId?: string;
  queueReason?: string;
}
```

Update `unsupportedPendingRuntimeWorkError` so it preserves optional fields:

```ts
const unsupportedPendingRuntimeWorkError = (
  work: PendingRuntimeWork & Partial<UnsupportedPendingRuntimeWorkDetails>,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: unsupportedEffectIdByKind[work.kind],
  details: {
    reason: "unsupported-pending-runtime-work",
    kind: work.kind,
    count: work.count,
    ...(work.gate === undefined ? {} : { gate: work.gate }),
    ...(work.queueEntryId === undefined
      ? {}
      : { queueEntryId: work.queueEntryId }),
    ...(work.effectId === undefined ? {} : { effectId: work.effectId }),
    ...(work.queueReason === undefined
      ? {}
      : { queueReason: work.queueReason }),
  } satisfies UnsupportedPendingRuntimeWorkDetails,
});
```

- [ ] **Step 2: Allow queue unsupported helper to accept context**

In `packages/engine-core/src/effect-runtime-queue/unsupported.ts`, replace the function with:

```ts
import type { EffectQueueEntry, EngineResult, GameState } from "@optcg/types";

import { type EngineResultOptions, toEngineResult } from "../action-results.js";
import type { CreateUnsupportedPendingRuntimeWorkError } from "./target-decisions.js";

export interface UnsupportedEffectQueueContext {
  readonly gate:
    | "queue-ordering"
    | "queue-entry-resolution"
    | "queue-source-presence"
    | "queue-effect-definition"
    | "deferred-trigger-release";
  readonly entry?: EffectQueueEntry;
  readonly exposeEntryIdentity?: boolean;
  readonly queueReason?: string;
}

const publicQueueIdentityZones = new Set([
  "leaderArea",
  "characterArea",
  "stageArea",
  "trash",
  "costArea",
]);

export const canExposeQueueEntryIdentity = (entry: EffectQueueEntry): boolean =>
  entry.source.zone !== undefined &&
  publicQueueIdentityZones.has(entry.source.zone.zone);

export const createUnsupportedEffectQueueResult = (
  state: GameState,
  createUnsupportedPendingRuntimeWorkError: CreateUnsupportedPendingRuntimeWorkError,
  options: EngineResultOptions = {},
  context?: UnsupportedEffectQueueContext,
): EngineResult =>
  toEngineResult(
    state,
    [],
    [
      createUnsupportedPendingRuntimeWorkError({
        kind: "effectQueue",
        count: state.effectQueue.length,
        ...(context?.gate === undefined ? {} : { gate: context.gate }),
        ...(context?.entry === undefined ||
        context.exposeEntryIdentity !== true ||
        !canExposeQueueEntryIdentity(context.entry)
          ? {}
          : {
              queueEntryId: String(context.entry.id),
              effectId: String(context.entry.effectBlockId),
            }),
        ...(context?.queueReason === undefined
          ? {}
          : { queueReason: context.queueReason }),
      }),
    ],
    options,
  );
```

- [ ] **Step 3: Pass entry-resolution context**

In `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`, replace the local helper with:

```ts
const unsupportedEffectQueueResult = (
  state: GameState,
  context?: Parameters<typeof createUnsupportedEffectQueueResult>[3],
): EngineResult =>
  createUnsupportedEffectQueueResult(
    state,
    dependencies.createUnsupportedPendingRuntimeWorkError,
    options,
    context,
  );
```

For source presence failures:

```ts
return unsupportedEffectQueueResult(originalState, {
  gate: "queue-source-presence",
  entry: selected,
  exposeEntryIdentity: false,
  queueReason: "source-presence-failed",
});
```

For missing unsupported body resolution:

```ts
return unsupportedEffectQueueResult(originalState, {
  gate: "queue-entry-resolution",
  entry: selectedForBodyResolution,
  exposeEntryIdentity: true,
  queueReason: "unsupported-body",
});
```

- [ ] **Step 4: Pass ordering context**

In `packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts`, update unsupported ordering calls:

```ts
if (!ordering.ok) {
  return unsupportedEffectQueueResult(state, options, {
    gate: "queue-ordering",
    queueReason: "invalid-ordering",
  });
}
```

If the local helper signature differs, update it to accept and forward `UnsupportedEffectQueueContext`.

- [ ] **Step 5: Assign context to every unsupported queue exit**

Use this checklist while replacing `unsupportedEffectQueueResult(...)` calls:

| File                                           | Failure path                                                                              | Required context                                                                                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect-runtime-queue/no-choice-processing.ts` | active double-attack damage deferred queue is not exact                                   | `{ gate: "deferred-trigger-release", queueReason: "invalid-damage-deferred-queue" }`                                                                                                         |
| `effect-runtime-queue/no-choice-processing.ts` | `evaluateQueueOrdering` fails                                                             | `{ gate: "queue-ordering", queueReason: "invalid-ordering" }`                                                                                                                                |
| `effect-runtime-queue/no-choice-processing.ts` | accepted optional entry id is missing from the current queue                              | `{ gate: "queue-ordering", queueReason: "accepted-optional-entry-missing" }`                                                                                                                 |
| `effect-runtime-queue/no-choice-processing.ts` | ordered current choice ids fail validation                                                | `{ gate: "queue-ordering", queueReason: "invalid-choice-order" }`                                                                                                                            |
| `effect-runtime-queue/no-choice-processing.ts` | `orderNoChoiceQueueEntries` fails                                                         | `{ gate: "queue-ordering", queueReason: "invalid-no-choice-order" }`                                                                                                                         |
| `effect-runtime-queue/entry-resolution.ts`     | source presence fails for selected entry                                                  | `{ gate: "queue-source-presence", entry: selected, exposeEntryIdentity: false, queueReason: "source-presence-failed" }`                                                                      |
| `effect-runtime-queue/entry-resolution.ts`     | queued definition has `conditionTiming`                                                   | `{ gate: "queue-entry-resolution", entry: selected, exposeEntryIdentity: true, queueReason: "unsupported-condition-timing" }`                                                                |
| `effect-runtime-queue/entry-resolution.ts`     | queued condition shape unsupported                                                        | `{ gate: "queue-entry-resolution", entry: selected, exposeEntryIdentity: true, queueReason: "unsupported-condition" }`                                                                       |
| `effect-runtime-queue/entry-resolution.ts`     | optional support shape unsupported                                                        | `{ gate: "queue-entry-resolution", entry: selected, exposeEntryIdentity: true, queueReason: "unsupported-optional-shape" }`                                                                  |
| `effect-runtime-queue/entry-resolution.ts`     | once-per-turn admission fails                                                             | `{ gate: "queue-entry-resolution", entry: selectedForBodyResolution, exposeEntryIdentity: true, queueReason: "once-per-turn-admission-failed" }`                                             |
| `effect-runtime-queue/entry-resolution.ts`     | sequence frame returns unsupported without a concrete error                               | `{ gate: "queue-entry-resolution", entry: selectedForBodyResolution, exposeEntryIdentity: true, queueReason: "unsupported-sequence-frame" }`                                                 |
| `effect-runtime-queue/entry-resolution.ts`     | target request decision cannot be created                                                 | let the target decision helper return its specific error; do not wrap it in generic unsupported queue unless it lacks an error, then use `queueReason: "unsupported-target-request"`         |
| `effect-runtime-queue/entry-resolution.ts`     | trash-from-hand resolver returns unsupported                                              | `{ gate: "queue-entry-resolution", entry: selectedForBodyResolution, exposeEntryIdentity: true, queueReason: "unsupported-trash-from-hand" }`                                                |
| `effect-runtime-queue/entry-resolution.ts`     | no primitive body resolver matches the current entry                                      | `{ gate: "queue-entry-resolution", entry: selectedForBodyResolution, exposeEntryIdentity: true, queueReason: "unsupported-body" }`                                                           |
| `effect-runtime-queue/entry-resolution.ts`     | draw, moveCards, playSource, winGame, damage, or continuous primitive returns errors/null | use `queueReason: "unsupported-draw"`, `"unsupported-move-cards"`, `"unsupported-play-source"`, `"unsupported-win-game"`, `"unsupported-damage"`, or `"unsupported-continuous"` respectively |

Expected after this step:

```bash
rg "unsupportedEffectQueueResult\\((originalState|state)(, options)?\\)" packages/engine-core/src/effect-runtime-queue -n
```

The command should return no bare unsupported queue calls. Every call should pass an `UnsupportedEffectQueueContext`, except calls that have been replaced by a more specific non-queue error.

- [ ] **Step 6: Add diagnostics tests**

In `packages/engine-core/src/effect-runtime-queue/pending-work.test.ts`, add:

```ts
test("unsupported queue errors include current gate context when available", () => {
  const state = createActiveState();
  state.effectQueue.push(queuedEffect());

  const result = processEffectRuntime(state);

  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.equal(result.errors?.[0]?.effectId, "unsupported-effect-queue");
  assert.equal(
    (result.errors?.[0] as { details?: { gate?: string } }).details?.gate,
    "queue-entry-resolution",
  );
  assert.equal(
    JSON.stringify(result.errors).includes("hidden-effect-block"),
    false,
  );
});
```

Add this hidden-zone redaction matrix in the same file:

```ts
test.each([
  {
    name: "life",
    zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
  },
  {
    name: "hand",
    zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
  },
  {
    name: "deck",
    zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
  },
] as const)(
  "unsupported queue diagnostics redact $name queue identity",
  ({ zone }) => {
    const state = createActiveState();
    const hiddenEntry = {
      ...queuedEffect(),
      source: { ...queuedEffect().source, zone },
      effectBlockId: "hidden-effect-block" as ReturnType<
        typeof queuedEffect
      >["effectBlockId"],
    };
    state.effectQueue.push(hiddenEntry);

    const result = processEffectRuntime(state);
    const serialized = JSON.stringify(result.errors);

    assert.equal(result.errors?.[0]?.effectId, "unsupported-effect-queue");
    assert.equal(serialized.includes("hidden-effect-block"), false);
    assert.equal(serialized.includes("queueEntryId"), false);
  },
);
```

- [ ] **Step 7: Run queue diagnostics tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/effect-runtime-queue/pending-work.test.ts packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts
```

Expected: all tests pass and existing assertions that only check `reason`, `kind`, and `count` still pass because the new fields are additive.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/engine-core/src/effect-runtime.ts packages/engine-core/src/effect-runtime-queue/unsupported.ts packages/engine-core/src/effect-runtime-queue/entry-resolution.ts packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts packages/engine-core/src/effect-runtime-queue/pending-work.test.ts packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts
git commit -m "Add precise unsupported queue diagnostics"
```

---

### Task 5: Audit Pending Runtime Gates That Block Supported Work

**Files:**

- Modify: `packages/engine-core/src/actions.ts`
- Modify: `packages/engine-core/src/battle/actions.ts`
- Modify: `packages/engine-core/src/battle/resolution.ts`
- Modify: `packages/engine-core/src/battle/block-actions.ts`
- Modify: `packages/engine-core/src/battle/counter-actions.ts`
- Modify: `packages/engine-core/src/battle/counter-card-use.ts`
- Modify: `packages/engine-core/src/battle/damage-step-continuation.ts`
- Test: use nearest existing tests in `packages/engine-core/src/actions*.test.ts` and `packages/engine-core/src/battle/*.test.ts`

- [ ] **Step 1: Add an actions-level supported-runtime-work regression**

In `packages/engine-core/src/actions-pending-decision.test.ts`, add an `applyAction` continuation regression. Do not replace this with a direct `processEffectRuntime(...)` assertion; the bug class is that a completed decision can leave supported work pending and later trip generic action gates.

Update imports as needed:

```ts
import {
  createChooseQuantityDecisionForQueuedEffect,
  processEffectRuntime,
} from "./effect-runtime.js";
import {
  setupOnPlayDefinition,
  queueDrawForP1,
  queueingState,
} from "./effect-runtime-queue/test-support.js";
```

If `reviewedOnPlayDrawDefinition` is not already imported from `./action-test-fixtures.js`, add it.

Add this test near the existing effect-originated `chooseQuantity` tests. It uses the same real drawUpTo runtime shape as `packages/engine-core/src/runtime/primitives/draw.test.ts`, then verifies that `respondToDecision` settles the queue before legal actions are exposed:

```ts
test("respondToDecision settles supported effect runtime before generic action gates", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-action-gate-draw-up-to",
      rulesVersion: "action-gate-draw-up-to-rules",
      sourceTextHash: "action-gate-draw-up-to-source",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  const effect = {
    ...must(definition.effects[0], "draw effect"),
    effect: { type: "drawUpTo" as const, count: 2, player: "self" as const },
  };
  setupOnPlayDefinition(
    state,
    played,
    { ...definition, effects: [effect] },
    "def-action-gate-draw-up-to",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-action-gate-draw-up-to"),
      source: {
        instanceId: played.instanceId,
        cardId: played.cardId,
        playerId: p1,
        zone: played.zone,
      },
      sourceSnapshot: {
        instanceId: played.instanceId,
        cardId: played.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: played.zone,
        category: "character",
        colors: ["red"],
        cost: 1,
        power: 3000,
        keywords: [],
      },
      effectBlockId: effect.id,
      sourcePresencePolicy:
        effect.sourcePresencePolicy ?? "mustRemainInSameZone",
    },
  ];

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "quantity decision");
  assert.equal(decision.type, "chooseQuantity");

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    getLegalActions(result.state, p1).some(
      (action) => action.type === "endMainPhase",
    ),
    true,
  );
});
```

- [ ] **Step 2: Classify each `detectPendingRuntimeWork` caller**

Use the "Action And Battle Gates" table above as the checklist. For each caller, add a one-line comment only when the gate is intentionally legal-action suppression rather than runtime resolution:

```ts
// Runtime work is resolved by the action/decision continuation path; legal actions stay hidden while it is pending.
```

Do not add comments to obvious runtime-processing calls.

- [ ] **Step 3: Preserve explicit keep decisions for battle gates**

For battle gates listed as **Keep** in the table, do not remove the guard. Add or preserve tests that prove the gate still rejects unsupported battle envelope, replacement state, malformed blocker, missing metadata, and unsupported damage continuation cases.

Use these existing checks as the baseline:

```bash
corepack pnpm vitest run packages/engine-core/src/actions-fail-closed.test.ts packages/engine-core/src/battle/blocker-invalid.test.ts packages/engine-core/src/battle/counter-invalid.test.ts packages/engine-core/src/battle/counter-flow.test.ts
```

Expected: tests pass before and after runtime continuation changes.

- [ ] **Step 4: Replace false action hard-stops with runtime continuation**

When a caller returns an unsupported or illegal result only because `detectPendingRuntimeWork(state) !== undefined`, use `continueRuntimeUntilIdle` if the state came from a just-completed supported action or decision.

Use this shape:

```ts
const continued = continueRuntimeUntilIdle(
  state,
  toEngineResult(state, [], undefined, options),
  options,
);
if (
  continued.errors !== undefined ||
  continued.state.pendingDecision !== undefined
) {
  return continued;
}
```

Do not run runtime continuation before user phase actions from arbitrary states; that remains legal-action suppression.

- [ ] **Step 5: Run action and battle tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/actions-pending-decision.test.ts packages/engine-core/src/battle
```

Expected: all tests pass. Any changed behavior must show that supported runtime work now settles before generic gates appear.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/engine-core/src/actions.ts packages/engine-core/src/battle packages/engine-core/src/actions-pending-decision.test.ts
git commit -m "Settle supported runtime work before action gates"
```

---

### Task 6: Add Support Probe and Live Runtime Gate Parity

**Files:**

- Modify: `packages/card-support/src/support-probe.test.ts`
- Modify: `packages/engine-core/src/real-card-dsl-runtime.test.ts`
- Modify when report labels need current-entry wording: `packages/card-support/src/support-probe-report.ts`

- [ ] **Step 1: Add probe output assertion for current-entry support**

In `packages/card-support/src/support-probe.test.ts`, add text-only probe cases for both the reported shape and a non-Yamato synthetic variant:

```ts
const activateMainTrashPlayProbeTexts = [
  "[Activate: Main] You may trash this Character: Play up to 1 black [Yamato] with a cost of 8 from your trash.",
  "[Activate: Main] You may trash this Character: Play up to 1 black [Generic Body] with a cost of 8 from your trash.",
];
```

Assert parser support and runtime support both report the activate-main sequence primitives:

```ts
expect(report.lines).toContain("Line 1 primitive parser: passed");
expect(report.lines).toEqual(
  expect.arrayContaining([
    expect.stringContaining("parser entryPoint:activateMain"),
    expect.stringContaining("parser cost:trashSelf"),
    expect.stringContaining("parser body:playSelected"),
    expect.stringContaining("runtime body:sequence"),
  ]),
);
```

- [ ] **Step 2: Add live runtime parity fixture**

In `packages/engine-core/src/real-card-dsl-runtime.test.ts`, update these imports:

```ts
import type {
  CardId,
  CardInstance,
  MatchCardManifest,
  SelectionId,
} from "@optcg/types";

import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toEffectId,
} from "./action-dispatcher-test-support.js";
import {
  reviewedOnPlayDrawDefinition,
  targetSelectionQueueState,
} from "./effect-runtime-queue/test-support.js";
```

Add this parameterized helper below `toCardId`. The helper must take at least `targetName`, `targetCardId`, and `targetEffectDefinitionId`; do not leave the live runtime parity test hardcoded to one card name.

```ts
const setupActivateMainTrashSelfPlayFromTrashState = (
  params: {
    readonly targetName: string;
    readonly targetCardId: CardId;
    readonly targetEffectDefinitionId: string;
  } = {
    targetName: "Yamato",
    targetCardId: toCardId("black-yamato-eight"),
    targetEffectDefinitionId: "def-yamato-on-play-draw",
  },
): {
  effectId: ReturnType<typeof toEffectId>;
  source: CardInstance;
  state: ReturnType<typeof makeMainPhaseLegalActionState>;
  trashTarget: CardInstance;
} => {
  const { targetCardId, targetEffectDefinitionId, targetName } = params;
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.characters[0], "source character");
  source.cardId = toCardId("self-trash-source");
  const effectId = toEffectId("activate-main-self-trash-play");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: source.cardId,
    category: "character",
    definitionId: "def-activate-main-self-trash-play",
    effectId,
  });
  const trashSelectionId = "trashSelection:target" as SelectionId;
  const effectBlock = must(definition.effects[0], "activate effect");
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "pay-trash-self",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: { type: "trashSelf", optional: true },
        },
      },
      {
        id: "select-target-from-trash",
        connector: "ifYouDo",
        saveResultAs: trashSelectionId,
        effect: {
          type: "selectCards",
          zone: "trash",
          player: "self",
          chooser: "self",
          min: 0,
          max: 1,
          filter: {
            categories: ["character"],
            names: [targetName],
            colorsAny: ["black"],
            cost: { op: "eq", value: 8 },
          },
          saveAs: trashSelectionId,
          visibility: "bothPlayers",
        },
      },
      {
        id: "play-selected-target",
        connector: "ifPossible",
        effect: {
          type: "playSelected",
          selection: trashSelectionId,
          ignoreCost: true,
        },
      },
    ],
  };

  const trashTarget = {
    ...must(p1State.deck[0], "trash target"),
    cardId: targetCardId,
    zone: {
      zone: "trash" as const,
      playerId: p1,
      slot: "trash" as const,
      index: 0,
    },
  };
  p1State.deck = p1State.deck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p1, slot: "deck", index },
  }));
  p1State.trash = [trashTarget];

  const targetSupport = {
    cardId: trashTarget.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    effectDefinitionId: targetEffectDefinitionId,
    rulesVersion: "activate-main-trash-play-parity-rules",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "activate-main-trash-play-parity-source",
    behaviorHash: "activate-main-trash-play-parity-behavior",
  };
  const targetCard = resolvedCard({
    cardId: trashTarget.cardId,
    category: "character",
    cost: 8,
    power: 8000,
    support: targetSupport,
  });
  state.cardManifest.cards[trashTarget.cardId] = {
    ...targetCard,
    colors: ["black"],
    name: targetName,
  };
  const targetDefinition = reviewedOnPlayDrawDefinition(
    trashTarget.cardId,
    targetSupport,
  );
  const targetBaseEffect = must(targetDefinition.effects[0], "target effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [targetSupport.effectDefinitionId]: {
      ...targetDefinition,
      effects: [
        {
          ...targetBaseEffect,
          id: toEffectId("target-on-play-draw"),
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };

  return { effectId, source, state, trashTarget };
};
```

Add this test matrix that uses the helper and asserts the live engine does not produce `unsupported-effect-queue` for either the reported Yamato shape or the generic variant:

```ts
test.each([
  {
    label: "Yamato reported shape",
    targetName: "Yamato",
    targetCardId: toCardId("black-yamato-eight"),
    targetEffectDefinitionId: "def-yamato-on-play-draw",
  },
  {
    label: "generic reusable shape",
    targetName: "Generic Body",
    targetCardId: toCardId("black-generic-eight"),
    targetEffectDefinitionId: "def-generic-body-on-play-draw",
  },
])(
  "probe-supported activate-main trash play from trash does not hit generic runtime gates: $label",
  ({ targetCardId, targetEffectDefinitionId, targetName }) => {
    const { effectId, source, state, trashTarget } =
      setupActivateMainTrashSelfPlayFromTrashState({
        targetName,
        targetCardId,
        targetEffectDefinitionId,
      });

    const activated = applyAction(state, {
      type: "activateEffect",
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      effectId,
    });
    const trashSelfDecision = must(
      activated.state.pendingDecision,
      "trash-self decision",
    );
    const paid = applyAction(activated.state, {
      type: "respondToDecision",
      decisionId: trashSelfDecision.id,
      response: { type: "payment", optionId: "trashSelf" },
    });
    const selection = must(paid.state.pendingDecision, "trash selection");
    assert.equal(selection.type, "selectCards");

    const selected = applyAction(paid.state, {
      type: "respondToDecision",
      decisionId: selection.id,
      response: {
        type: "cards",
        cards: selection.candidates.map((candidate) => candidate.card),
      },
    });

    assert.equal(selected.errors, undefined);
    assert.equal(
      must(selected.state.players[p1], "p1").characters.some(
        (card) => card.instanceId === trashTarget.instanceId,
      ),
      true,
    );
  },
);
```

- [ ] **Step 3: Run probe and runtime parity tests**

Run:

```bash
corepack pnpm vitest run packages/card-support/src/support-probe.test.ts packages/engine-core/src/real-card-dsl-runtime.test.ts
```

Expected: both pass and no live runtime path emits `unsupported-effect-queue` for the supported activate-main sequence.

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/card-support/src/support-probe.test.ts packages/engine-core/src/real-card-dsl-runtime.test.ts packages/card-support/src/support-probe-report.ts
git commit -m "Check probe support against live runtime gates"
```

---

### Task 7: Final Verification and Push

**Files:**

- No production files changed in this task.

- [ ] **Step 1: Run format check**

Run:

```bash
corepack pnpm run format:check
```

Expected: Prettier reports all files formatted.

- [ ] **Step 2: Run lint**

Run:

```bash
corepack pnpm run lint
```

Expected: ESLint exits successfully with zero warnings.

- [ ] **Step 3: Run typecheck**

Run:

```bash
corepack pnpm run typecheck
```

Expected: all package TypeScript projects compile with `--noEmit`.

- [ ] **Step 4: Run root tests**

Run:

```bash
corepack pnpm run test
```

Expected: all non-contract Vitest tests pass.

- [ ] **Step 5: Run contracts if runtime DSL shape changed**

Run:

```bash
corepack pnpm run contracts
```

Expected: contracts compile, effect fixtures validate, schema validates, package types sync check passes, and contract tests pass.

- [ ] **Step 6: Push after user approval**

Run:

```bash
git push origin HEAD:dev
```

Expected: branch pushes cleanly to `origin/dev`.

---

## Self-Review

- Spec coverage: The plan targets the clarified problem: supported current effects blocked by coarse gates. It covers play-card preflight, trigger queue sibling relevance, admission/preflight parity, generic queue diagnostics, pending runtime action gates, and probe/runtime parity.
- Placeholder scan: The plan contains concrete code snippets for the tests, imports, and setup functions that matter most; no task depends on a missing code snippet or card-specific allowlist.
- Type consistency: New API names are consistent: `playRelevantEffectBlocks`, `UnsupportedEffectQueueContext`, and `assertAdmissionAndSequencePreflightAgree`.
- Scope check: This is one subsystem: engine runtime gate precision. It intentionally does not broaden into parser feature work or client UI behavior.
