# Canonical Event Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize event-backed "whenever" effects so auto queueing and optional activated reactions use one canonical event-to-trigger matcher.

**Architecture:** Keep `EngineEvent` and `eventJournal` as the canonical event record. Extract reusable event trigger matching into a focused module consumed by both auto event queueing and optional activated reactions, then add regression tests that prove matcher-supported event-backed triggers do not require duplicated matcher branches. Normalize `effectQueued` payload evidence so effects can react to other effects being activated without replacing the timing consumers that legally queue those effects. Do not change parser support or gameplay timing in this plan.

**Tech Stack:** TypeScript, `@optcg/types`, `packages/engine-core`, Vitest through `npm.cmd run test -- ...`, repo typecheck/lint commands.

---

## File Structure

- Create: `packages/engine-core/src/runtime/event-hooks/matcher.ts`
  - Owns event-to-trigger matching for event-backed triggers.
  - Exports typed match helpers only; it does not queue effects or create legal actions.
- Create: `packages/engine-core/src/runtime/event-hooks/matcher.test.ts`
  - Direct unit tests for canonical matching across auto and optional reaction use cases.
- Modify: `packages/types/src/effects.ts`
  - Adds the reusable `effectQueued` trigger primitive for reacting to another effect being activated/queued.
- Modify: `packages/engine-core/src/effect-runtime-entry-adapters.ts`
  - Adds the reusable auto adapter for `effectQueued`.
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
- Modify: `packages/engine-core/src/action-results.ts`
  - Adds a shared `appendEffectQueuedEvent` helper so queue producers emit consistent canonical activation evidence.
- Modify: queue producers that currently append `effectQueued`
  - Replaces local payload construction with `appendEffectQueuedEvent`.
  - Keeps timing-window ownership and queue creation in the existing queue producers.
- Optional follow-up only if evidence appears during implementation: create `packages/engine-core/src/runtime/event-hooks/event-selection.ts`
  - Owns recent-event window selection and de-duplication if both queueing paths currently duplicate it in a way that blocks the matcher extraction.

---

## Matcher Boundary

`runtime/event-hooks/matcher.ts` answers only this question: does this trigger match this single event's public payload evidence for this source in this state?

The matcher must not own:

- recent-event or open-window filtering
- already-queued de-duplication
- source-entry timing policy
- source presence policy
- support certification
- effect body support
- queue entry creation
- legal-action exposure
- queue/action IDs or timing-window ID formatting

Consumer ownership stays explicit:

- Auto event queueing keeps its existing recent-event window, already-queued de-duplication, source-entry gate, `isSupportedAutoRuntimeEffectBlock` support check, and queue entry creation.
- Optional activated reactions keep their existing adapter-specific event-window predicates, `isSupportedActivatedReactionEffect` support gate, condition/once-per-turn checks, legal-action exposure, and activation queue creation.
- Special auto queueers for `lifeRemoved`, `opponentActivated`, `onOpponentAttack`, and similar timing-specific flows are not collapsed in this plan.
- Existing entry-point queueers such as `[On Play]` and `[When Attacking]` remain the legal timing owners. This plan only makes their emitted `effectQueued` events canonical enough for other effects to react to them.

---

## Implementation Code Shape

Create `packages/engine-core/src/runtime/event-hooks/matcher.ts` as a small functional module. It should have three layers:

1. Shared payload readers:

```ts
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const publicPayload = (
  event: EngineEvent,
): Record<string, unknown> | undefined =>
  event.visibility.type === "public" && isRecord(event.payload)
    ? event.payload
    : undefined;
```

2. Shared source-relative helpers:

```ts
const playerRefMatchesSource = (
  state: GameState,
  source: CardInstance,
  ref: PlayerRef,
  playerId: PlayerId,
): boolean => {
  switch (ref) {
    case "self":
    case "controller":
      return playerId === source.controller;
    case "owner":
      return playerId === source.owner;
    case "opponent":
      return playerId === getOpponentId(state, source.controller);
    case "turnPlayer":
      return playerId === state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return playerId === getOpponentId(state, state.turn.turnPlayerId);
  }
};

const resolvedCardFromPayload = (
  state: GameState,
  payload: Record<string, unknown>,
): ResolvedCard | undefined => {
  const cardId = payload["cardId"];
  return typeof cardId === "string"
    ? state.cardManifest.cards[cardId as CardId]
    : undefined;
};

const primitiveMatch = (
  triggerType: EventReactionTriggerType,
  matched: boolean,
): EventTriggerMatch =>
  matched
    ? { matched: true, triggerTypes: [triggerType] }
    : { matched: false, triggerTypes: [] };

const matchesSourceEvidence = (
  state: GameState,
  source: CardInstance,
  sourceController: PlayerRef | undefined,
  sourceKind: string | undefined,
  payload: Record<string, unknown>,
): boolean => {
  if (sourceController !== undefined) {
    const sourceControllerId = payload["sourceControllerId"];
    if (
      typeof sourceControllerId !== "string" ||
      !playerRefMatchesSource(
        state,
        source,
        sourceController,
        sourceControllerId as PlayerId,
      )
    ) {
      return false;
    }
  }
  return sourceKind === undefined || sourceKind === "any"
    ? true
    : payload["sourceKind"] === sourceKind;
};

const matchesResolvedFilter = (
  state: GameState,
  resolved: ResolvedCard | undefined,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (resolved === undefined) {
    return false;
  }
  return cardMatchesSearchFilter(resolved, filter);
};
```

3. One matcher per trigger family plus one public dispatcher:

```ts
const matchCardRested = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "cardRested" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "cardRested" || payload === undefined) {
    return false;
  }
  const playerId = payload["playerId"];
  if (
    typeof playerId !== "string" ||
    !playerRefMatchesSource(state, source, trigger.player, playerId as PlayerId)
  ) {
    return false;
  }
  if (
    trigger.target === "self" &&
    (payload["instanceId"] !== source.instanceId ||
      payload["cardId"] !== source.cardId)
  ) {
    return false;
  }
  return (
    matchesSourceEvidence(
      state,
      source,
      trigger.sourceController,
      trigger.sourceKind,
      payload,
    ) &&
    matchesResolvedFilter(
      state,
      resolvedCardFromPayload(state, payload),
      trigger.filter,
    )
  );
};

const matchPrimitiveEventTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Exclude<Trigger, { type: "anyOf" }>,
  event: EngineEvent,
): EventTriggerMatch => {
  if (trigger.type === "cardRested") {
    return primitiveMatch(
      "cardRested",
      matchCardRested(state, source, trigger, event),
    );
  }
  if (trigger.type === "cardPlayed") {
    return primitiveMatch(
      "cardPlayed",
      matchCardPlayed(state, source, trigger, event),
    );
  }
  if (trigger.type === "fieldRemoved") {
    return primitiveMatch(
      "fieldRemoved",
      matchFieldRemoved(state, source, trigger, event),
    );
  }
  if (trigger.type === "damageDealt") {
    return primitiveMatch(
      "damageDealt",
      matchDamageDealt(state, source, trigger, event),
    );
  }
  if (trigger.type === "donReturned") {
    return primitiveMatch(
      "donReturned",
      matchDonReturned(state, source, trigger, event),
    );
  }
  if (trigger.type === "donAttached") {
    return primitiveMatch(
      "donAttached",
      matchDonAttached(state, source, trigger, event),
    );
  }
  if (trigger.type === "attackDeclared") {
    return primitiveMatch(
      "attackDeclared",
      matchAttackDeclared(state, source, trigger, event),
    );
  }
  if (trigger.type === "effectQueued") {
    return primitiveMatch(
      "effectQueued",
      matchEffectQueued(state, source, trigger, event),
    );
  }
  if (trigger.type === "lifeRemoved") {
    return primitiveMatch(
      "lifeRemoved",
      matchLifeRemoved(state, source, trigger, event),
    );
  }
  if (trigger.type === "onOpponentAttack") {
    return primitiveMatch(
      "onOpponentAttack",
      matchOpponentAttack(state, source, trigger, event),
    );
  }
  if (trigger.type === "opponentActivated") {
    return primitiveMatch(
      "opponentActivated",
      matchOpponentActivated(state, source, trigger, event),
    );
  }
  return { matched: false, triggerTypes: [] };
};

export const matchEventTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Trigger,
  event: EngineEvent,
): EventTriggerMatch => {
  if (trigger.type === "anyOf") {
    return combineChildMatches(
      trigger.triggers.map((child) =>
        matchEventTrigger(state, source, child, event),
      ),
    );
  }
  return matchPrimitiveEventTrigger(state, source, trigger, event);
};
```

Keep `matchEventTrigger` return values deterministic. `triggerTypes` must preserve child order for `anyOf` while removing duplicates. If two children both match the same event as `cardPlayed`, return `["cardPlayed"]`, not two entries.

Do not export primitive matchers unless tests need direct imports. Prefer testing through `matchEventTrigger` so callers cannot grow a second semi-public matching API.

Consumer code shape:

- `runtime/trigger-queueing/event-reaction.ts` should retain event selection:

```ts
const reactionEvents = state.eventJournal.filter(
  (event) =>
    isRecentRuntimeEvent(state, event) &&
    !alreadyQueued.has(String(event.id)) &&
    isAutoEventReactionCandidate(event),
);
```

Then, inside the source/effect loop, call:

```ts
const match = matchEventTrigger(state, source, effect.trigger, event);
if (!match.matched) {
  return [];
}
```

- `runtime/optional-activation/event-reaction.ts` should keep trigger-specific candidate event selection:

```ts
const candidateEvents = activatedReactionCandidateEventsForTrigger(
  state,
  source,
  effect.trigger,
);
return candidateEvents.flatMap((event) =>
  matchEventTrigger(state, source, effect.trigger, event).matched
    ? [{ effect, triggerEvent: event }]
    : [],
);
```

`activatedReactionCandidateEventsForTrigger` may keep the existing `lifeRemoved`, `onOpponentAttack`, `opponentActivated`, `cardPlayed`, and `fieldRemoved` branches for event-window selection. Those branches should not duplicate payload/filter matching after this refactor.

---

## Canonical Event Payload Evidence

The matcher should consume existing payload fields where they already exist. When a trigger asks for source evidence that an event does not carry yet, fail closed instead of inventing support from the trigger shape.

Use these payload field names consistently:

- `cardRested`: `playerId`, `instanceId`, `cardId`, optional `sourceControllerId`, optional `sourceKind`
- `cardPlayed`: `playerId`, `instanceId`, `cardId`, `sourceZone`, optional `category`
- `donReturned`: `playerId`, `donInstanceId`, optional `sourceControllerId`, optional `sourceKind`
- `damageDealt`: `damagedPlayerId` when present; fallback to existing `target` leader instance lookup only for current compatibility
- `fieldRemoved` over `cardMoved`: `from`, `playerId`, `instanceId`, `cardId`, `reason`, optional `sourceControllerId`, optional `sourceKind`
- `lifeRemoved` over `cardMoved`: `from`, `playerId`, `instanceId`, `cardId`, `reason`
- `onOpponentAttack`: `attacker.playerId`, `attacker.cardId`
- `opponentActivated`: existing public evidence from `cardPlayed` event category, `counterUsed`, `triggerActivated`, and `blockerActivated`
- `effectQueued`: `queueEntryId`, `timingWindowId`, `effectBlockId`, `triggerEventId` when present, `controllerId`, `source`, `sourceCardId`, `effectCategory`, `entryPoint`, `sourceTypes`, `sourceCategory`
- `donAttached`: `playerId`, `donInstanceId`, `target`, `targetPlayerId`, `targetInstanceId`, `targetCardId`, optional `sourceControllerId`, optional `sourceKind`
- `attackDeclared`: `attacker`, `target`, `attackerPlayerId`, `targetPlayerId`, `attackerCardId`, `targetCardId`

For trigger `sourceKind: "effect"`, require payload `sourceKind: "effect"`. Do not treat existing protection-attempt terminology such as `"cardEffect"` as equivalent unless the event producer is explicitly normalized in a separate task. For trigger `sourceKind: "ko"`, existing `cardMoved.reason === "ko"` remains acceptable compatibility evidence.

For text like "When a `[On Play]` is activated", use `effectQueued` evidence rather than treating `onPlay` itself as the reacting trigger. The `[On Play]` queueer remains responsible for legally queueing the On Play effect; the event hook matcher only observes the canonical `effectQueued` evidence after that happens.

For text like "When this Leader or any of your Characters is given a DON!! card", use `donAttached` evidence. For text like "When this Leader attacks or is attacked", use `attackDeclared` evidence. These are matcher-supported event families in this plan; their timing consumers still decide whether the current event window is open.

---

### Task 1: Extract Canonical Event Matcher

**Files:**

- Modify: `packages/types/src/effects.ts`
- Modify: `packages/engine-core/src/effect-runtime-entry-adapters.ts`
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
- `fieldRemoved` with `sourceController` and `sourceKind: "effect"` rejecting when payload evidence is absent and matching only when canonical payload evidence is present
- `cardPlayed` with `sourceZone`
- `cardPlayed.anyOf` branch matching, duplicate branch de-duplication, and `sourceFilter` fail-closed behavior
- `donReturned`
- `donAttached` with target matching this Leader or one of your Characters
- `attackDeclared` with this Leader as attacker or target
- `effectQueued` with `entryPoint: { type: "onPlay" }` and source filter evidence
- `lifeRemoved` over a public `cardMoved` event from life
- `onOpponentAttack` requiring public `attackDeclared` event evidence
- `opponentActivated` from `cardPlayed` event category, `counterUsed`, `triggerActivated`, and `blockerActivated`
- `anyOf` combining two event-backed triggers
- private, hidden, server-only, and replay-only events rejecting for every trigger family that should require public evidence

- [ ] **Step 2: Run matcher tests and verify they fail**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/event-hooks/matcher.test.ts
```

Expected: fail because `runtime/event-hooks/matcher.ts` does not exist.

- [ ] **Step 3: Implement the matcher module**

Move the reusable matching logic out of the existing queueing files. The public API should be small:

In `packages/types/src/effects.ts`, add the trigger primitive:

```ts
export type EffectEntryPointFilter = {
  type:
    | "onPlay"
    | "whenAttacking"
    | "onOpponentAttack"
    | "onBlock"
    | "onKO"
    | "endOfYourTurn"
    | "endOfOpponentTurn"
    | "trigger"
    | "damageDealt"
    | "lifeRemoved"
    | "fieldRemoved"
    | "cardPlayed"
    | "cardRested"
    | "donReturned"
    | "donAttached"
    | "attackDeclared"
    | "handTrashedByEffect"
    | "opponentActivated"
    | "donAttach"
    | "activateMain"
    | "main"
    | "counter"
    | "permanent"
    | "replacement"
    | "startOfGame"
    | "startOfYourTurn"
    | "startOfOpponentTurn"
    | "startOfMainPhase"
    | "endOfBattle"
    | "custom"
    | "effectQueued";
};

| {
    type: "effectQueued";
    player: PlayerRef;
    effectEntryPoint?: EffectEntryPointFilter;
    effectCategory?: EffectCategory;
    sourceFilter?: CardFilter;
  }
| {
    type: "donAttached";
    player: PlayerRef;
    target?: "self" | "yourLeaderOrCharacters" | "any";
    filter?: CardFilter;
    sourceController?: PlayerRef;
    sourceKind?: "effect" | "any";
  }
| {
    type: "attackDeclared";
    role: "attacker" | "target" | "attackerOrTarget";
    player: PlayerRef;
    filter?: CardFilter;
  }
```

Future parser work can emit this for text such as "When a `[On Play]` is activated." This plan only adds the reusable runtime primitive and tests it with synthetic definitions.

In `packages/engine-core/src/effect-runtime-entry-adapters.ts`, add:

```ts
if (triggerType === "effectQueued") {
  return autoAdapter("effectQueued", ["mustRemainInSameZone"]);
}
```

```ts
export type EventReactionTriggerType =
  | "damageDealt"
  | "fieldRemoved"
  | "cardPlayed"
  | "cardRested"
  | "donReturned"
  | "donAttached"
  | "attackDeclared"
  | "effectQueued"
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
  if (trigger.type === "anyOf") {
    return combineChildMatches(
      trigger.triggers.map((child) =>
        matchEventTrigger(state, source, child, event),
      ),
    );
  }
  return matchPrimitiveEventTrigger(state, source, trigger, event);
};
```

Keep these constraints:

- The matcher must inspect event payload evidence and visibility.
- The matcher must not inspect effect body support.
- The matcher must not create queue entries, legal actions, decisions, or events.
- The matcher must not apply recency windows, already-queued de-duplication, or source-entry policy.
- The matcher may evaluate a filter against event payload evidence, but filter evaluation does not certify that a consumer supports that trigger/filter shape.
- The matcher must fail closed for missing payload fields.
- `anyOf` must flatten matching child trigger types without duplicates.

Clarify trigger ownership while implementing:

- `damageDealt`, `fieldRemoved`, `cardPlayed`, `cardRested`, `donReturned`, `donAttached`, and `attackDeclared` are consumed by auto event queueing in this plan.
- `effectQueued` is consumed by auto event queueing in this plan as canonical evidence that another effect was activated/queued by its timing owner.
- `lifeRemoved`, `onOpponentAttack`, and `opponentActivated` are included for optional activated reaction matching only in this plan unless an existing auto event-reaction consumer already uses them.
- Existing special auto queueers for those trigger families remain in place.

- [ ] **Step 4: Run matcher tests and verify they pass**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/event-hooks/matcher.test.ts
```

Expected: pass.

- [ ] **Step 5: Review checkpoint**

Before continuing, review the diff for these anti-shapes:

```powershell
rg -n "OP[0-9]{2}|ST[0-9]{2}|cardId ===|effectBlockId ===|timingWindowId.endsWith" packages/engine-core/src/runtime/event-hooks
```

Expected: no card IDs, no effect IDs, no support based on exact timing-window suffixes in the new matcher.

Then document the current legacy queue de-duplication separately:

```powershell
rg -n "timingWindowId.endsWith" packages/engine-core/src/runtime/trigger-queueing/event-reaction.ts
```

Expected: any hit must be limited to existing queue de-duplication, not matcher support authority. Do not move this de-duplication into `matchEventTrigger`.

- [ ] **Step 6: Commit**

```powershell
git add packages/engine-core/src/runtime/event-hooks/matcher.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts
git commit -m "Extract canonical event trigger matcher"
```

---

### Task 2: Normalize EffectQueued Evidence

**Files:**

- Modify: `packages/engine-core/src/action-results.ts`
- Modify: queue producers that currently append `effectQueued`
- Test: `packages/engine-core/src/runtime/event-hooks/effect-queued-evidence.test.ts`
- Read: `packages/engine-core/src/runtime/effect-presentation.ts`
- Read: `packages/engine-core/src/effect-runtime-trigger-source-lookup.ts`

- [ ] **Step 1: Write failing tests for canonical `effectQueued` evidence**

Add tests proving every queue producer can emit source and entry-point evidence through one helper. Start with one representative auto entry point and one activated reaction:

```ts
test("On Play queueing emits canonical effectQueued entry point and source evidence", () => {
  const { onPlayEffect, playedCard, state } = onPlayQueueEvidenceState();

  const result = queueOnPlayTriggers(state);

  assert.equal(result?.errors, undefined);
  const queued = must(
    result?.events.find((event) => event.type === "effectQueued"),
    "effectQueued event",
  );
  assert.deepEqual(queued.payload, {
    queueEntryId: result?.state.effectQueue[0]?.id,
    timingWindowId: result?.state.effectQueue[0]?.timingWindowId,
    generation: 0,
    effectBlockId: onPlayEffect.id,
    triggerEventId: state.eventJournal.at(-1)?.id,
    sourcePresencePolicy: "mustRemainInSameZone",
    orderingGroup: "turnPlayer",
    controllerId: playedCard.controller,
    source: {
      instanceId: playedCard.instanceId,
      cardId: playedCard.cardId,
      playerId: playedCard.controller,
      zone: playedCard.zone,
    },
    sourceCardId: playedCard.cardId,
    effectCategory: "auto",
    entryPoint: { type: "onPlay" },
    sourceTypes: ["Navy"],
    sourceCategory: "character",
  });
});
```

```ts
test("activated reaction queueing emits canonical effectQueued entry point evidence", () => {
  const { effect, source, state } = opponentAttackOptionalReactionState();
  const action = must(
    getActivatedReactionLegalActions(state, source.controller)[0],
    "activation action",
  );

  const result = applyActivatedReactionAction(state, action);

  assert.equal(result?.errors, undefined);
  const queued = must(
    result?.events.find((event) => event.type === "effectQueued"),
    "effectQueued event",
  );
  assert.equal(
    (queued.payload as { effectBlockId?: unknown }).effectBlockId,
    effect.id,
  );
  assert.deepEqual((queued.payload as { entryPoint?: unknown }).entryPoint, {
    type: "onOpponentAttack",
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/event-hooks/effect-queued-evidence.test.ts
```

Expected: fail because `effectQueued` payloads do not yet include the canonical evidence.

- [ ] **Step 3: Add `appendEffectQueuedEvent`**

In `packages/engine-core/src/action-results.ts`, add a helper parallel to `appendEffectResolvedEvent`:

```ts
export const appendEffectQueuedEvent = (
  state: GameState,
  events: EngineEvent[],
  queuedEntry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number],
  resolvedSourceCard: ResolvedCard,
): void => {
  appendEvent(
    state,
    events,
    "effectQueued",
    {
      queueEntryId: queuedEntry.id,
      timingWindowId: queuedEntry.timingWindowId,
      generation: queuedEntry.generation,
      effectBlockId: queuedEntry.effectBlockId,
      ...(queuedEntry.triggerEventId === undefined
        ? {}
        : { triggerEventId: queuedEntry.triggerEventId }),
      sourcePresencePolicy: queuedEntry.sourcePresencePolicy,
      orderingGroup: queuedEntry.orderingGroup,
      controllerId: queuedEntry.controllerId,
      source: queuedEntry.source,
      sourceCardId: queuedEntry.sourceSnapshot.cardId,
      effectCategory: effectBlock.category,
      entryPoint: effectBlock.trigger,
      sourceTypes: resolvedSourceCard.types,
      sourceCategory: resolvedSourceCard.category,
      ...(queuedEntry.presentation === undefined
        ? {}
        : { presentation: queuedEntry.presentation }),
    },
    { type: "public" },
  );
  const queued = events[events.length - 1];
  if (queued !== undefined) {
    queued.causedBy = queuedEntry.causedBy;
  }
};
```

Do not derive entry point from `timingWindowId` string suffixes. Do not add effect-entry-point fields to `CardSnapshot`; entry point is effect-block data, not card snapshot data.

- [ ] **Step 4: Replace local `effectQueued` event construction**

Replace local `appendEvent(..., "effectQueued", ...)` payload construction in queue producers with `appendEffectQueuedEvent`. Keep each queue producer responsible for creating the queue entry and timing window.

Run this scan before and after:

```powershell
rg -n '"effectQueued"' packages/engine-core/src --glob '*.ts'
```

Expected after implementation: event appends route through `appendEffectQueuedEvent`; tests may still assert `effectQueued` payloads.

- [ ] **Step 5: Run canonical evidence tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/event-hooks/effect-queued-evidence.test.ts packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/engine-core/src/action-results.ts packages/engine-core/src/runtime/event-hooks/effect-queued-evidence.test.ts packages/engine-core/src/runtime/trigger-queueing packages/engine-core/src/runtime/optional-activation
git commit -m "Normalize effect queued event evidence"
```

---

### Task 3: Use Matcher For Auto Event Queueing

**Files:**

- Modify: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts`
- Read: `packages/engine-core/src/effect-runtime-block-support.ts`

- [ ] **Step 1: Write auto queueing regression tests**

Add tests proving queueing depends on matcher results, not local trigger branches:

```ts
test("auto event reactions can hook DON attachment events", () => {
  const { reactingSource, state } = donAttachedReactionState({
    trigger: {
      type: "donAttached",
      player: "self",
      target: "yourLeaderOrCharacters",
    },
    reactionBody: { type: "draw", player: "self", count: 1 },
  });

  const result = queueEventReactionTriggers(state);

  assert.ok(result !== undefined);
  assert.equal(result.errors, undefined);
  assert.equal(
    result.state.effectQueue[0]?.source.instanceId,
    reactingSource.instanceId,
  );
});
```

```ts
test("auto event reactions can hook this source attacking or being attacked", () => {
  const { reactingSource, state } = attackDeclaredReactionState({
    trigger: {
      type: "attackDeclared",
      role: "attackerOrTarget",
      player: "self",
    },
    reactionBody: { type: "draw", player: "self", count: 1 },
  });

  const result = queueEventReactionTriggers(state);

  assert.ok(result !== undefined);
  assert.equal(result.errors, undefined);
  assert.equal(
    result.state.effectQueue[0]?.source.instanceId,
    reactingSource.instanceId,
  );
});
```

```ts
test("auto event reactions can hook an On Play effect being queued", () => {
  const { reactingSource, state } = onPlayEffectQueuedReactionState({
    reactionEffect: {
      trigger: {
        type: "effectQueued",
        player: "self",
        effectEntryPoint: { type: "onPlay" },
      },
      effect: { type: "draw", player: "self", count: 1 },
    },
  });

  const result = queueEventReactionTriggers(state);

  assert.ok(result !== undefined);
  assert.equal(result.errors, undefined);
  const entry = must(result.state.effectQueue[0], "queued reaction");
  assert.equal(entry.source.instanceId, reactingSource.instanceId);
  assert.equal(entry.triggerEventId, state.eventJournal.at(-1)?.id);
});
```

This test intentionally uses `draw` as the body so it isolates the event hook. A real card body such as "set up to 1 of your DON!! cards as active" should remain a separate reusable body primitive under the queued effect.

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

Add a field-removal source evidence integration test:

```ts
test("auto fieldRemoved reactions require canonical source evidence when sourceController or effect sourceKind is requested", () => {
  const missingEvidence = fieldRemovedReactionState({
    trigger: {
      type: "fieldRemoved",
      player: "opponent",
      sourceController: "self",
      sourceKind: "effect",
    },
    cardMovedPayload: {
      reason: "effect",
    },
  });

  assert.equal(queueEventReactionTriggers(missingEvidence.state), undefined);

  const withEvidence = fieldRemovedReactionState({
    trigger: {
      type: "fieldRemoved",
      player: "opponent",
      sourceController: "self",
      sourceKind: "effect",
    },
    cardMovedPayload: {
      reason: "effect",
      sourceControllerId: missingEvidence.source.controller,
      sourceKind: "effect",
    },
  });

  const result = queueEventReactionTriggers(withEvidence.state);

  assert.ok(result !== undefined);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
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

- [ ] **Step 1b: Add auto queueing timing/source-entry regressions**

Add tests proving consumer policy stays outside the matcher:

```ts
test("auto event reactions ignore matching events that happened before the source entered the field", () => {
  const { source, state } = cardRestedReactionState({
    eventSeqBeforeSourceEntered: true,
  });

  const result = queueEventReactionTriggers(state);

  assert.equal(result, undefined);
  assert.equal(source.state, "active");
});
```

```ts
test("auto event reactions keep recent-event window policy outside the matcher", () => {
  const { state } = cardRestedReactionState({
    createdAtStateSeq: toStateSeq(Number(state.seq) - 3),
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

Expected before implementation: behavior tests may pass because duplicated local logic already handles some cases. The required proof for this task is the combination of passing behavior tests and the review scan confirming local primitive matchers were removed.

- [ ] **Step 3: Replace local matching with `matchEventTrigger`**

In `runtime/trigger-queueing/event-reaction.ts`:

- Delete local duplicated primitive matchers that moved to `runtime/event-hooks/matcher.ts`.
- Keep `queuedEventReactionTriggerEventIds`, source enumeration, support checks, queue entry creation, event emission, and error handling.
- Replace `matchingTriggerTypes(...)` calls with `matchEventTrigger(...).triggerTypes`.
- Include `donAttached`, `attackDeclared`, and `effectQueued` in `isAutoEventReactionCandidate(event)` so effects can react to DON attachment, attacks, and other effects being queued/activated.
- Keep recent-event filtering, already-queued filtering, and source-entry filtering in this queueing module.

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

### Task 4: Use Matcher For Optional Activated Reactions

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

Add a visibility integration test:

```ts
test("optional opponent-attack reactions ignore non-public attackDeclared events", () => {
  const { source, state } = opponentAttackOptionalReactionState({
    eventVisibility: { type: "replayOnly" },
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

Expected before implementation: behavior tests may pass because duplicated local logic already handles some cases. The required proof for this task is the combination of passing behavior tests and the review scan confirming local primitive matchers were removed.

- [ ] **Step 3: Replace optional local event matching with `matchEventTrigger`**

In `runtime/optional-activation/event-reaction.ts`:

- Keep support policy in `isSupportedActivatedReactionEffect`.
- Keep legal-action creation, once-per-turn checks, condition evaluation, and immediate queue processing unchanged.
- Replace `activatedReactionEventsForSource` internals with filtering based on `matchEventTrigger(state, source, effect.trigger, event).matched`.
- Preserve optional-only supported trigger policy. If optional support intentionally excludes `cardRested`, do not add it in this task unless a test proves the existing parser/runtime already supports that timing.
- Filter candidate events with the existing adapter-specific recency/open-window predicates first, then call `matchEventTrigger` for payload/trigger matching.
- Reduce `activatedReactionCandidateEventsForTrigger` branches to event type plus recency/open-window predicates only. Player, filter, source-controller, source-kind, event category, and payload field matching all belong in `matchEventTrigger`.
- Do not replace optional activation's support policy with matcher success. `isSupportedActivatedReactionEffect` remains the authority for whether an optional reaction is supported.

- [ ] **Step 4: Run optional reaction tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts
```

Expected: pass.

- [ ] **Step 5: Review checkpoint**

Run a source scan to confirm there is only one primitive matcher implementation:

```powershell
rg -n "matchesCardPlayedTrigger|matchesCardRestedTrigger|matchesFieldRemovedTrigger|matchesDamageTrigger|matchesDonReturnedTrigger|isActivatedCardPlayedEvent|isActivatedFieldRemovedEvent|isActivatedOpponentAttackEvent|isActivatedOpponentActivationEvent|opponentActivationFromEvent|movedLifePlayer|playerRefMatchesSource" packages/engine-core/src/runtime
```

Expected: these old local matcher names should either be gone or exist only in `runtime/event-hooks/matcher.ts` under the canonical names.

- [ ] **Step 6: Commit**

```powershell
git add packages/engine-core/src/runtime/optional-activation/event-reaction.ts packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts packages/engine-core/src/runtime/event-hooks/matcher.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts
git commit -m "Use canonical matcher for optional event reactions"
```

---

### Task 5: Add Specialized Regression Coverage For Future Event Hooks

**Files:**

- Modify: `packages/engine-core/src/runtime/event-hooks/matcher.test.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/event-reaction.test.ts`
- Modify: `packages/engine-core/src/runtime/optional-activation/event-reaction.test.ts`

- [ ] **Step 1: Add anti-regression tests for extension behavior**

Add tests with synthetic effects and events proving:

- A matcher-supported event-backed trigger can be matched by the shared matcher without queueing code changes.
- Auto queueing still requires `isSupportedAutoRuntimeEffectBlock`.
- Optional activation still requires `isSupportedActivatedReactionEffect`.
- Missing public payload evidence fails closed.
- Hidden/private/server-only events do not expose public legal actions.
- Optional legal actions reject stale matching events, not just mismatched payloads.
- Optional `lifeRemoved` keeps its `state.seq - 1` open-window policy outside the matcher.
- Auto event queueing does not inherit optional-only trigger support just because the matcher can match `lifeRemoved`, `onOpponentAttack`, or `opponentActivated`.

Use focused test names:

```ts
test("canonical matcher can match matcher-supported event-backed triggers without queueing knowledge", () => {
  const { source, state } = setupEventHookState();
  const event = donReturnedEvent(state, {
    playerId: source.controller,
    donInstanceId: "don-1" as CardInstance["instanceId"],
  });

  const match = matchEventTrigger(
    state,
    source,
    { type: "donReturned", player: "self" },
    event,
  );

  assert.deepEqual(match, { matched: true, triggerTypes: ["donReturned"] });
});
```

```ts
test("auto event queueing rejects matched triggers with unsupported bodies", () => {
  const { state } = cardRestedReactionState({
    effectOverride: { effect: { type: "unsupported" as const } },
  });

  const result = queueEventReactionTriggers(state);

  assert.equal(result?.errors?.[0]?.type, "effectRuntimeError");
});
```

```ts
test("optional event reactions reject matched triggers outside optional support policy", () => {
  const { source, state } = cardRestedOptionalReactionState();

  const actions = getActivatedReactionLegalActions(state, source.controller);

  assert.equal(actions.length, 0);
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

### Task 6: Final Verification And Architecture Review

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
