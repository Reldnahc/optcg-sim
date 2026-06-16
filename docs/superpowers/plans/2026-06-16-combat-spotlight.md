# Combat Spotlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add same-queue two-card spotlight entries for attack declaration and blocker activation, with server-persisted cards and powers.

**Architecture:** Introduce a typed spotlight entry union with existing effect-text entries and new combat entries. Capture combat powers in public engine event payloads, project those events into server-backed spotlight history, then generalize client playback/rendering so both entry kinds use the same controls and timer.

**Tech Stack:** TypeScript, React 19 server-rendered tests, Vitest, existing `@optcg/types`, `@optcg/engine-core`, and `@optcg/client` packages.

---

## File Structure

- Modify `packages/types/src/effect-presentation.ts`: define shared history entry base, effect-text entry, combat presentation, and combat entry union.
- Modify `packages/types/src/effect-presentation.test.ts`: prove the union supports existing effect-text entries and new combat entries.
- Modify `packages/engine-core/src/battle/actions.ts`: add attacker/defender power values to `attackDeclared`.
- Modify `packages/engine-core/src/battle/block-actions.ts`: add attacker card ref and attacker/blocker power values to `blockerActivated`.
- Modify `packages/engine-core/src/battle/actions.test.ts`: assert attack event power payload.
- Modify `packages/engine-core/src/battle/blocker-flow.test.ts`: assert blocker event attacker and power payload while preserving deterministic event expectations.
- Modify `packages/engine-core/src/view/effect-spotlight-history.ts`: project public combat events into combat spotlight entries.
- Modify `packages/engine-core/src/view/effect-spotlight-history.test.ts`: cover attack, blocker, ordering, malformed payloads, and non-public visibility.
- Modify `packages/client/src/react/use-effect-spotlight-playback.ts`: let playback entries be effect-text or combat sources and generate signatures for both.
- Modify `packages/client/src/react/use-effect-spotlight-display.ts`: store the current playback entry, not only `active` text.
- Modify `packages/client/src/react/use-effect-spotlight.ts`: expose the generalized current entry while keeping controls unchanged.
- Modify `packages/client/src/react/use-effect-spotlight.test.ts` and `packages/client/src/react/use-effect-spotlight-display.test.ts`: prove combat entries dwell, rewind, fast-forward, and do not require active spans.
- Modify `packages/client/src/react/MatchApp.tsx`: build an effect-text or combat presentation model from the active spotlight entry.
- Modify `packages/client/src/react/BoardLayout.tsx`: pass one presentation model into `EffectSpotlight`.
- Modify `packages/client/src/react/EffectSpotlight.tsx`: render either the current single-card effect spotlight or the new two-card combat spotlight.
- Modify `packages/client/src/react/effect-spotlight.test.ts`: cover combat rendering and existing effect-text rendering.
- Modify `packages/client/src/react/styles/effect-spotlight.css`: add compact two-card layout and power styling for combat entries.

---

### Task 1: Type The Combat Spotlight Entry Union

**Files:**

- Modify: `packages/types/src/effect-presentation.ts`
- Modify: `packages/types/src/effect-presentation.test.ts`

- [ ] **Step 1: Add failing type coverage for combat entries**

Add this test to `packages/types/src/effect-presentation.test.ts`:

```ts
test("allows combat spotlight timeline entries without effect text", () => {
  const attacker: CardRef = {
    instanceId: "attacker-1" as InstanceId,
    cardId: "OP00-003" as CardId,
    playerId: "p1" as PlayerId,
  };
  const defender: CardRef = {
    instanceId: "defender-1" as InstanceId,
    cardId: "OP00-004" as CardId,
    playerId: "p2" as PlayerId,
  };

  const entry: EffectSpotlightHistoryEntry = {
    kind: "combat",
    id: "combat:event:1",
    key: "event:1",
    semanticKey: "combat|attackDeclared|attacker-1|defender-1|7000|5000",
    mode: "resolved",
    status: "resolved",
    combat: {
      eventKind: "attackDeclared",
      attacker,
      defender,
      attackerPower: 7000,
      defenderPower: 5000,
    },
    resolvedEventId: "event:1" as EngineEventId,
  };

  expect(entry.kind).toBe("combat");
  expect(entry.combat.defenderPower).toBe(5000);
});
```

- [ ] **Step 2: Run the type test to verify it fails**

Run:

```bash
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts
```

Expected: FAIL because `EffectSpotlightHistoryEntry` does not accept `kind: "combat"` or `combat`.

- [ ] **Step 3: Define the typed spotlight union**

Replace the current `EffectSpotlightHistoryEntry` interface in `packages/types/src/effect-presentation.ts` with this shape:

```ts
export type EffectSpotlightHistoryEntryStatus = "pending" | "resolved";

export interface EffectSpotlightHistoryEntryBase {
  readonly id: string;
  readonly key: string;
  readonly semanticKey: string;
  readonly mode: "live" | "resolved";
  readonly status: EffectSpotlightHistoryEntryStatus;
}

export interface EffectTextSpotlightHistoryEntry extends EffectSpotlightHistoryEntryBase {
  readonly kind?: "effectText";
  readonly active: ActiveEffectTextPresentation;
  readonly pendingDecisionId?: DecisionId;
  readonly resolvedEventId?: EngineEventId;
  readonly queueEntryId?: QueueEntryId;
  readonly effectBlockId?: EffectId;
}

export type CombatSpotlightEventKind = "attackDeclared" | "blockerActivated";

export interface CombatSpotlightPresentation {
  readonly eventKind: CombatSpotlightEventKind;
  readonly attacker: CardRef;
  readonly defender: CardRef;
  readonly attackerPower?: number;
  readonly defenderPower?: number;
}

export interface CombatSpotlightHistoryEntry extends EffectSpotlightHistoryEntryBase {
  readonly kind: "combat";
  readonly combat: CombatSpotlightPresentation;
  readonly resolvedEventId: EngineEventId;
}

export type EffectSpotlightHistoryEntry =
  | EffectTextSpotlightHistoryEntry
  | CombatSpotlightHistoryEntry;
```

Keep `EffectSpotlightHistory` unchanged so callers still receive `entries` and `presentKey`.

- [ ] **Step 4: Run the type test to verify it passes**

Run:

```bash
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/types/src/effect-presentation.ts packages/types/src/effect-presentation.test.ts
git commit -m "Add combat spotlight entry types"
```

---

### Task 2: Capture Combat Powers In Public Engine Events

**Files:**

- Modify: `packages/engine-core/src/battle/actions.ts`
- Modify: `packages/engine-core/src/battle/block-actions.ts`
- Modify: `packages/engine-core/src/battle/actions.test.ts`
- Modify: `packages/engine-core/src/battle/blocker-flow.test.ts`

- [ ] **Step 1: Add failing attack event payload coverage**

In `packages/engine-core/src/battle/actions.test.ts`, add a focused assertion near an existing successful `declareAttack` test:

```ts
const attackDeclared = must(
  result.events.find((event) => event.type === "attackDeclared"),
  "attackDeclared event",
);
assert.deepEqual(attackDeclared.payload, {
  attacker: cardRef(attacker, p1),
  target: cardRef(p2State.leader, p2),
  attackerPower: 5000,
  defenderPower: 5000,
});
```

Use the local result variable name from the chosen test. If the test names the action result `opened`, use `opened.events`.

- [ ] **Step 2: Add failing blocker event payload coverage**

Update the expected `blockerActivated` payload in `packages/engine-core/src/battle/blocker-flow.test.ts` where the test currently expects only `blocker`, `previousTarget`, and `currentTarget`:

```ts
{
  type: "blockerActivated",
  payload: {
    attacker: cardRef(must(opened.state.players[p1], "opened p1").leader, p1),
    blocker,
    previousTarget: originalTarget,
    currentTarget: blocker,
    attackerPower: 5000,
    defenderPower: 3000,
  },
  visibility: { type: "public" },
}
```

If the selected fixture changes the attacker or blocker manifest power in that test, use the fixture's actual current powers.

- [ ] **Step 3: Run the failing battle tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/battle/actions.test.ts packages/engine-core/src/battle/blocker-flow.test.ts
```

Expected: FAIL because the event payloads do not contain captured powers yet.

- [ ] **Step 4: Add attack powers to `attackDeclared`**

In `packages/engine-core/src/battle/actions.ts`, keep the existing `computeView` call but retain the card views:

```ts
let legalTargets: readonly CardInstance["instanceId"][];
let attackerHasDoubleAttack = false;
let attackPower: number | undefined;
let defendPower: number | undefined;
try {
  const computed = computeView(state, {
    ignoreAttackCosts: options.ignoreAttackCosts === true,
  });
  const attackerView = computed.cards[attacker.card.instanceId];
  const targetView = computed.cards[target.card.instanceId];
  attackerHasDoubleAttack =
    attackerView?.keywords.includes("doubleAttack") ?? false;
  attackPower = attackerView?.currentPower;
  defendPower = targetView?.currentPower;
  legalTargets = computed.legalAttackTargets[attacker.card.instanceId] ?? [];
} catch {
  return illegalAction(
    state,
    "declareAttack is unsupported for current combat metadata.",
  );
}
```

Then replace the `attackDeclared` payload with:

```ts
{
  attacker: toCardRef(attacker.card, attacker.playerId),
  target: toCardRef(target.card, target.playerId),
  ...(attackPower === undefined ? {} : { attackerPower: attackPower }),
  ...(defendPower === undefined ? {} : { defenderPower: defendPower }),
}
```

- [ ] **Step 5: Add attacker and powers to `blockerActivated`**

In `packages/engine-core/src/battle/block-actions.ts`, after `blockerRef` and `previousTarget` are available, compute the display powers:

```ts
let attackerPower: number | undefined;
let defenderPower: number | undefined;
try {
  const computed = computeView(state);
  attackerPower = computed.cards[battle.attacker.instanceId]?.currentPower;
  defenderPower = computed.cards[blockerRef.instanceId]?.currentPower;
} catch {
  return illegalAction(
    state,
    "Blocker activation is unsupported for current combat metadata.",
  );
}
```

Then replace the `blockerActivated` payload with:

```ts
{
  attacker: battle.attacker,
  blocker: blockerRef,
  previousTarget,
  currentTarget: blockerRef,
  ...(attackerPower === undefined ? {} : { attackerPower }),
  ...(defenderPower === undefined ? {} : { defenderPower }),
}
```

- [ ] **Step 6: Run the battle tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/battle/actions.test.ts packages/engine-core/src/battle/blocker-flow.test.ts
```

Expected: PASS. If a deterministic hash assertion changes only because public event payloads gained powers, update the expected hash in that test after confirming replay still matches.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/engine-core/src/battle/actions.ts packages/engine-core/src/battle/block-actions.ts packages/engine-core/src/battle/actions.test.ts packages/engine-core/src/battle/blocker-flow.test.ts
git commit -m "Capture combat spotlight powers in events"
```

---

### Task 3: Project Combat Events Into Server Spotlight History

**Files:**

- Modify: `packages/engine-core/src/view/effect-spotlight-history.ts`
- Modify: `packages/engine-core/src/view/effect-spotlight-history.test.ts`

- [ ] **Step 1: Add failing server history tests**

Add card refs near the existing `source` fixture in `packages/engine-core/src/view/effect-spotlight-history.test.ts`:

```ts
const attacker = {
  playerId: "p1" as PlayerId,
  instanceId: "attacker-1" as InstanceId,
  cardId: "OP00-003" as CardId,
};

const defender = {
  playerId: "p2" as PlayerId,
  instanceId: "defender-1" as InstanceId,
  cardId: "OP00-004" as CardId,
};
```

Add this test:

```ts
it("projects attack declaration as a combat spotlight entry", () => {
  const history = effectSpotlightHistoryFromPlayerViewState({
    activeEffectText: undefined,
    events: [
      {
        id: "event:attack" as EngineEventId,
        seq: 1,
        type: "attackDeclared",
        payload: {
          attacker,
          target: defender,
          attackerPower: 7000,
          defenderPower: 5000,
        },
        visibility: { type: "public" },
        createdAtStateSeq: 1 as StateSeq,
      },
    ],
    pendingDecisionId: undefined,
  });

  expect(history).toEqual({
    entries: [
      {
        kind: "combat",
        id: "combat:event:attack",
        key: "event:attack",
        semanticKey:
          "combat|attackDeclared|p1|attacker-1|OP00-003|p2|defender-1|OP00-004|7000|5000",
        mode: "resolved",
        status: "resolved",
        combat: {
          eventKind: "attackDeclared",
          attacker,
          defender,
          attackerPower: 7000,
          defenderPower: 5000,
        },
        resolvedEventId: "event:attack",
      },
    ],
    presentKey: "event:attack",
  });
});
```

Add this blocker test:

```ts
it("projects blocker activation as attacker versus blocker", () => {
  const blocker = {
    playerId: "p2" as PlayerId,
    instanceId: "blocker-1" as InstanceId,
    cardId: "OP00-005" as CardId,
  };
  const history = effectSpotlightHistoryFromPlayerViewState({
    activeEffectText: undefined,
    events: [
      {
        id: "event:blocker" as EngineEventId,
        seq: 1,
        type: "blockerActivated",
        payload: {
          attacker,
          blocker,
          previousTarget: defender,
          currentTarget: blocker,
          attackerPower: 7000,
          defenderPower: 3000,
        },
        visibility: { type: "public" },
        createdAtStateSeq: 1 as StateSeq,
      },
    ],
    pendingDecisionId: undefined,
  });

  expect(history?.entries[0]).toMatchObject({
    kind: "combat",
    key: "event:blocker",
    combat: {
      eventKind: "blockerActivated",
      attacker,
      defender: blocker,
      attackerPower: 7000,
      defenderPower: 3000,
    },
  });
});
```

Add malformed and visibility coverage:

```ts
it("skips malformed combat spotlight payloads", () => {
  const history = effectSpotlightHistoryFromPlayerViewState({
    activeEffectText: undefined,
    events: [
      {
        id: "event:bad-attack" as EngineEventId,
        seq: 1,
        type: "attackDeclared",
        payload: { attacker },
        visibility: { type: "public" },
        createdAtStateSeq: 1 as StateSeq,
      },
    ],
    pendingDecisionId: undefined,
  });

  expect(history).toBeUndefined();
});

it("skips non-public combat spotlight events", () => {
  const history = effectSpotlightHistoryFromPlayerViewState({
    activeEffectText: undefined,
    events: [
      {
        id: "event:hidden-attack" as EngineEventId,
        seq: 1,
        type: "attackDeclared",
        payload: {
          attacker,
          target: defender,
          attackerPower: 7000,
          defenderPower: 5000,
        },
        visibility: { type: "replayOnly" },
        createdAtStateSeq: 1 as StateSeq,
      },
    ],
    pendingDecisionId: undefined,
  });

  expect(history).toBeUndefined();
});
```

- [ ] **Step 2: Run the server history tests to verify failure**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/view/effect-spotlight-history.test.ts
```

Expected: FAIL because combat events are not projected.

- [ ] **Step 3: Add combat event projection**

In `packages/engine-core/src/view/effect-spotlight-history.ts`, import `CardRef` and `CombatSpotlightPresentation`, then add helpers:

```ts
const isCardRef = (value: unknown): value is CardRef => {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value["playerId"] === "string" &&
    typeof value["instanceId"] === "string" &&
    typeof value["cardId"] === "string"
  );
};

const numberPayloadValue = (
  payload: Record<string, unknown>,
  key: string,
): number | undefined =>
  typeof payload[key] === "number" ? payload[key] : undefined;

const combatSemanticKey = (combat: CombatSpotlightPresentation): string =>
  [
    "combat",
    combat.eventKind,
    String(combat.attacker.playerId),
    String(combat.attacker.instanceId),
    String(combat.attacker.cardId),
    String(combat.defender.playerId),
    String(combat.defender.instanceId),
    String(combat.defender.cardId),
    combat.attackerPower === undefined ? "" : String(combat.attackerPower),
    combat.defenderPower === undefined ? "" : String(combat.defenderPower),
  ].join("|");

const combatEntryForEvent = (
  event: EngineEvent,
): EffectSpotlightHistoryEntry | undefined => {
  if (event.visibility.type !== "public" || !isObjectRecord(event.payload)) {
    return undefined;
  }

  if (event.type === "attackDeclared") {
    const attacker = event.payload["attacker"];
    const defender = event.payload["target"];
    if (!isCardRef(attacker) || !isCardRef(defender)) {
      return undefined;
    }
    const combat: CombatSpotlightPresentation = {
      eventKind: "attackDeclared",
      attacker,
      defender,
      ...(numberPayloadValue(event.payload, "attackerPower") === undefined
        ? {}
        : {
            attackerPower: numberPayloadValue(event.payload, "attackerPower"),
          }),
      ...(numberPayloadValue(event.payload, "defenderPower") === undefined
        ? {}
        : {
            defenderPower: numberPayloadValue(event.payload, "defenderPower"),
          }),
    };
    return {
      kind: "combat",
      id: `combat:${String(event.id)}`,
      key: String(event.id),
      semanticKey: combatSemanticKey(combat),
      mode: "resolved",
      status: "resolved",
      combat,
      resolvedEventId: event.id,
    };
  }

  if (event.type === "blockerActivated") {
    const attacker = event.payload["attacker"];
    const defender = event.payload["blocker"];
    if (!isCardRef(attacker) || !isCardRef(defender)) {
      return undefined;
    }
    const combat: CombatSpotlightPresentation = {
      eventKind: "blockerActivated",
      attacker,
      defender,
      ...(numberPayloadValue(event.payload, "attackerPower") === undefined
        ? {}
        : {
            attackerPower: numberPayloadValue(event.payload, "attackerPower"),
          }),
      ...(numberPayloadValue(event.payload, "defenderPower") === undefined
        ? {}
        : {
            defenderPower: numberPayloadValue(event.payload, "defenderPower"),
          }),
    };
    return {
      kind: "combat",
      id: `combat:${String(event.id)}`,
      key: String(event.id),
      semanticKey: combatSemanticKey(combat),
      mode: "resolved",
      status: "resolved",
      combat,
      resolvedEventId: event.id,
    };
  }

  return undefined;
};
```

Then start `resolvedEntriesForEvent` with:

```ts
const combatEntry = combatEntryForEvent(event);
if (combatEntry !== undefined) {
  return [combatEntry];
}
```

- [ ] **Step 4: Run the server history tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/view/effect-spotlight-history.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/engine-core/src/view/effect-spotlight-history.ts packages/engine-core/src/view/effect-spotlight-history.test.ts
git commit -m "Project combat events into spotlight history"
```

---

### Task 4: Generalize Spotlight Playback And Display State

**Files:**

- Modify: `packages/client/src/react/use-effect-spotlight-playback.ts`
- Modify: `packages/client/src/react/use-effect-spotlight-display.ts`
- Modify: `packages/client/src/react/use-effect-spotlight.ts`
- Modify: `packages/client/src/react/use-effect-spotlight.test.ts`
- Modify: `packages/client/src/react/use-effect-spotlight-display.test.ts`

- [ ] **Step 1: Add failing display tests for combat entries**

In `packages/client/src/react/use-effect-spotlight-display.test.ts`, add:

```ts
it("creates a timed display model for a combat playback entry", () => {
  const entry = {
    kind: "combat" as const,
    id: "combat:event:attack",
    key: "event:attack",
    semanticKey:
      "combat|attackDeclared|p1|attacker-1|OP00-003|p2|defender-1|OP00-004|7000|5000",
    mode: "resolved" as const,
    status: "resolved" as const,
    combat: {
      eventKind: "attackDeclared" as const,
      attacker: {
        playerId: "p1",
        instanceId: "attacker-1",
        cardId: "OP00-003",
      },
      defender: {
        playerId: "p2",
        instanceId: "defender-1",
        cardId: "OP00-004",
      },
      attackerPower: 7000,
      defenderPower: 5000,
    },
    resolvedEventId: "event:attack",
  };

  const model = effectSpotlightDisplayForEntry({
    nowMs: 10_000,
    previous: undefined,
    minimumDwellMs: 2_000,
    graceMs: 800,
    entry,
    pendingDecisionId: undefined,
  });

  assert.deepEqual(model?.entry, entry);
  assert.equal(model?.active, undefined);
  assert.equal(model?.combat?.eventKind, "attackDeclared");
  assert.equal(model?.shownAtMs, 10_000);
  assert.equal(model?.visibleUntilMs, 12_000);
  assert.equal(model?.pinned, false);
});
```

- [ ] **Step 2: Add failing playback tests for combat signatures**

In `packages/client/src/react/use-effect-spotlight.test.ts`, add a combat source fixture and assert catch-up/rewind behavior uses the same queue:

```ts
const combatSource = {
  kind: "combat" as const,
  id: "combat:event:attack",
  key: "event:attack",
  semanticKey:
    "combat|attackDeclared|p1|attacker-1|OP00-003|p2|defender-1|OP00-004|7000|5000",
  mode: "resolved" as const,
  status: "resolved" as const,
  combat: {
    eventKind: "attackDeclared" as const,
    attacker: {
      playerId: "p1" as PlayerId,
      instanceId: "attacker-1" as InstanceId,
      cardId: "OP00-003" as CardId,
    },
    defender: {
      playerId: "p2" as PlayerId,
      instanceId: "defender-1" as InstanceId,
      cardId: "OP00-004" as CardId,
    },
    attackerPower: 7000,
    defenderPower: 5000,
  },
  resolvedEventId: "event:attack" as EngineEventId,
};
```

Use that fixture in an existing playback test style:

```ts
it("keeps combat sources in the same rewindable playback queue", () => {
  const state = appendSpotlightPlaybackSources({
    consumedKeys: new Set(),
    previous: {
      entries: [],
      cursorIndex: undefined,
      paused: false,
      fastForwarded: false,
    },
    sources: [combatSource],
    sourceKind: "serverTimeline",
  });

  assert.equal(currentSpotlightPlaybackEntry(state), combatSource);
  const caughtUp = advanceSpotlightPlayback({
    command: "catchUp",
    state,
  });
  assert.equal(caughtUp.cursorIndex, undefined);
  const rewound = advanceSpotlightPlayback({
    command: "rewind",
    state: caughtUp,
  });
  assert.equal(currentSpotlightPlaybackEntry(rewound), combatSource);
});
```

- [ ] **Step 3: Run the client spotlight hook tests to verify failure**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/use-effect-spotlight-display.test.ts
```

Expected: FAIL because playback/display types assume `active`.

- [ ] **Step 4: Generalize playback input types**

In `packages/client/src/react/use-effect-spotlight-playback.ts`, replace the input interface with a union:

```ts
import type {
  ActiveEffectTextPresentation,
  CombatSpotlightPresentation,
  DecisionId,
  EffectTextSpanId,
} from "@optcg/types";

export interface EffectTextSpotlightActiveSourceInput {
  readonly kind?: "effectText";
  readonly active: ActiveEffectTextPresentation;
  readonly id?: string;
  readonly key: string;
  readonly semanticKey?: string;
  readonly mode: EffectSpotlightSourceMode;
  readonly status?: "pending" | "resolved";
  readonly pendingDecisionId?: DecisionId | string;
}

export interface CombatSpotlightActiveSourceInput {
  readonly kind: "combat";
  readonly combat: CombatSpotlightPresentation;
  readonly id?: string;
  readonly key: string;
  readonly semanticKey?: string;
  readonly mode: EffectSpotlightSourceMode;
  readonly status?: "pending" | "resolved";
  readonly pendingDecisionId?: DecisionId | string;
}

export type EffectSpotlightActiveSourceInput =
  | EffectTextSpotlightActiveSourceInput
  | CombatSpotlightActiveSourceInput;
```

Add this guard:

```ts
export const isCombatSpotlightSource = (
  source: EffectSpotlightActiveSourceInput,
): source is CombatSpotlightActiveSourceInput => source.kind === "combat";
```

Update signature helpers:

```ts
const combatSpotlightSourceSignature = (
  source: CombatSpotlightActiveSourceInput,
): string =>
  [
    "combat",
    source.combat.eventKind,
    String(source.combat.attacker.playerId),
    String(source.combat.attacker.instanceId),
    String(source.combat.attacker.cardId),
    String(source.combat.defender.playerId),
    String(source.combat.defender.instanceId),
    String(source.combat.defender.cardId),
    source.combat.attackerPower === undefined
      ? ""
      : String(source.combat.attackerPower),
    source.combat.defenderPower === undefined
      ? ""
      : String(source.combat.defenderPower),
  ].join("|");

const spotlightSourceSignatures = (
  source: EffectSpotlightActiveSourceInput,
): readonly string[] => {
  if (isCombatSpotlightSource(source)) {
    return [combatSpotlightSourceSignature(source)];
  }
  const spanIds =
    source.active.activeSpanIds.length === 0
      ? [""]
      : source.active.activeSpanIds;
  return spanIds.map((spanId) =>
    [...spotlightSourceSignatureBase(source), spanId].join("|"),
  );
};
```

Keep `activePresentationKey` unchanged for legacy active-text callers.

- [ ] **Step 5: Generalize display state**

In `packages/client/src/react/use-effect-spotlight-display.ts`, change `EffectSpotlightState` to carry the source entry:

```ts
export interface EffectSpotlightState {
  readonly entry: EffectSpotlightPlaybackEntry;
  readonly active?: ActiveEffectTextPresentation | undefined;
  readonly combat?: CombatSpotlightPresentation | undefined;
  readonly activeKey: string;
  readonly activeMode: "live" | "resolved";
  readonly sourceInstanceId: string;
  readonly activeSpanIds: readonly EffectTextSpanId[];
  readonly shownAtMs: number;
  readonly visibleUntilMs: number;
  readonly pinned: boolean;
  readonly cursorVersion?: number | undefined;
}
```

Add helpers:

```ts
const entrySourceInstanceId = (entry: EffectSpotlightPlaybackEntry): string =>
  entry.kind === "combat"
    ? String(entry.combat.attacker.instanceId)
    : String(entry.active.source.instanceId);

const entrySpanIds = (
  entry: EffectSpotlightPlaybackEntry,
): readonly EffectTextSpanId[] =>
  entry.kind === "combat" ? [] : entry.active.activeSpanIds;

const sameSpotlightEntry = (
  previous: EffectSpotlightState,
  entry: EffectSpotlightPlaybackEntry,
  activeKey: string,
): boolean =>
  previous.activeKey === activeKey &&
  previous.entry.kind === entry.kind &&
  previous.sourceInstanceId === entrySourceInstanceId(entry) &&
  spanKey(previous.activeSpanIds) === spanKey(entrySpanIds(entry));
```

Replace the `active` input to `effectSpotlightModel` with `entry`, and construct the state with:

```ts
return {
  entry,
  ...(entry.kind === "combat"
    ? { combat: entry.combat }
    : { active: entry.active }),
  activeKey: nextActiveKey,
  activeMode,
  sourceInstanceId: entrySourceInstanceId(entry),
  activeSpanIds: entrySpanIds(entry),
  shownAtMs: nowMs,
  visibleUntilMs: nowMs + minimumDwellMs,
  pinned: pendingDecisionId !== undefined,
  ...(cursorVersion === undefined ? {} : { cursorVersion }),
};
```

For existing entries, `active` remains populated. For combat entries, `combat` is populated and `active` is absent.

- [ ] **Step 6: Update `useEffectSpotlight` to return generalized state**

In `packages/client/src/react/use-effect-spotlight.ts`, keep the public controls unchanged. The fallback normalized source remains effect-text:

```ts
{
  kind: "effectText" as const,
  active,
  key: activeKey ?? activePresentationKey(active),
  mode: activeMode,
  ...(activeMode === "live" && pendingDecisionId !== undefined
    ? { pendingDecisionId }
    : {}),
}
```

No separate combat controls are added.

- [ ] **Step 7: Run hook and display tests**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/use-effect-spotlight-display.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/use-effect-spotlight-display.ts packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/use-effect-spotlight-display.test.ts
git commit -m "Generalize spotlight playback entries"
```

---

### Task 5: Wire Generalized Spotlight Presentation Through The Client

**Files:**

- Modify: `packages/client/src/react/EffectSpotlight.tsx`
- Modify: `packages/client/src/react/BoardLayout.tsx`
- Modify: `packages/client/src/react/MatchApp.tsx`

- [ ] **Step 1: Add the presentation model type**

In `packages/client/src/react/EffectSpotlight.tsx`, define a prop model that is render-oriented:

```ts
export type EffectSpotlightPresentation =
  | {
      readonly kind: "effectText";
      readonly active: ActiveEffectTextPresentation;
      readonly card: ClientCardModel;
    }
  | {
      readonly kind: "combat";
      readonly combat: CombatSpotlightPresentation;
      readonly attackerCard: ClientCardModel;
      readonly defenderCard: ClientCardModel;
    };

export interface EffectSpotlightProps {
  readonly presentation: EffectSpotlightPresentation | undefined;
  readonly timer?: EffectSpotlightTimer | undefined;
  readonly controls?: EffectSpotlightControls | undefined;
}
```

Leave the single-card rendering body in place temporarily by deriving:

```ts
const active =
  presentation?.kind === "effectText" ? presentation.active : undefined;
const card =
  presentation?.kind === "effectText" ? presentation.card : undefined;
```

- [ ] **Step 2: Update `BoardLayout` props**

In `packages/client/src/react/BoardLayout.tsx`, replace:

```ts
effectSpotlightActive?: ActiveEffectTextPresentation | undefined;
effectSpotlightCard?: ClientCardModel | undefined;
```

with:

```ts
effectSpotlightPresentation?: EffectSpotlightPresentation | undefined;
```

Update the render call:

```tsx
<EffectSpotlight
  presentation={effectSpotlightPresentation}
  controls={effectSpotlightControls}
  timer={effectSpotlightTimer}
/>
```

- [ ] **Step 3: Build the presentation model in `MatchApp`**

In `packages/client/src/react/MatchApp.tsx`, replace the current `effectSpotlightActive` and `effectSpotlightCard` derivation with:

```ts
const effectSpotlightEntry = effectSpotlight?.entry;
const effectSpotlightPresentation =
  effectSpotlightEntry === undefined
    ? undefined
    : effectSpotlightEntry.kind === "combat"
      ? {
          kind: "combat" as const,
          combat: effectSpotlightEntry.combat,
          attackerCard: cardModel(effectSpotlightEntry.combat.attacker),
          defenderCard: cardModel(effectSpotlightEntry.combat.defender),
        }
      : {
          kind: "effectText" as const,
          active: effectSpotlightEntry.active,
          card: cardModel(effectSpotlightEntry.active.source),
        };
```

Update the timer guard:

```ts
const effectSpotlightTimer =
  effectSpotlight === undefined || effectSpotlight.entry === undefined
    ? undefined
    : {
        shownAtMs: effectSpotlight.shownAtMs,
        visibleUntilMs: effectSpotlight.visibleUntilMs,
        paused: effectSpotlight.controls.paused,
        pinned: effectSpotlight.pinned,
        animationKey: `${effectSpotlight.activeKey}:${String(
          effectSpotlight.shownAtMs,
        )}`,
      };
```

Pass `effectSpotlightPresentation` into `MatchBoardSurface` and then `BoardLayout`.

- [ ] **Step 4: Run client typecheck**

Run:

```bash
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected: PASS after all old `effectSpotlightActive` and `effectSpotlightCard` props are removed.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/client/src/react/EffectSpotlight.tsx packages/client/src/react/BoardLayout.tsx packages/client/src/react/MatchApp.tsx
git commit -m "Wire typed spotlight presentations"
```

---

### Task 6: Render And Style Two-Card Combat Spotlight Entries

**Files:**

- Modify: `packages/client/src/react/EffectSpotlight.tsx`
- Modify: `packages/client/src/react/effect-spotlight.test.ts`
- Modify: `packages/client/src/react/styles/effect-spotlight.css`

- [ ] **Step 1: Add failing combat render test**

In `packages/client/src/react/effect-spotlight.test.ts`, add:

```ts
const combatCard = (
  instanceId: string,
  name: string,
  imageUrl: string,
): ClientCardModel => ({
  ...card(),
  instanceId: instanceId as InstanceId,
  name,
  imageUrl,
});

it("renders a two-card combat spotlight with power labels", () => {
  const html = renderToStaticMarkup(
    createElement(EffectSpotlight, {
      presentation: {
        kind: "combat",
        combat: {
          eventKind: "blockerActivated",
          attacker: {
            instanceId: "attacker-1" as InstanceId,
            cardId: "OP00-003" as CardId,
            playerId: "p1" as PlayerId,
          },
          defender: {
            instanceId: "blocker-1" as InstanceId,
            cardId: "OP00-004" as CardId,
            playerId: "p2" as PlayerId,
          },
          attackerPower: 7000,
          defenderPower: 3000,
        },
        attackerCard: combatCard(
          "attacker-1",
          "Attacking Leader",
          "https://example.test/attacker.png",
        ),
        defenderCard: combatCard(
          "blocker-1",
          "Blocking Character",
          "https://example.test/blocker.png",
        ),
      },
      controls: controls(),
      timer: timer(),
    }),
  );

  expect(html).toContain("effect-spotlight-card--combat");
  expect(html).toContain("effect-spotlight-combat-card--attacker");
  expect(html).toContain("effect-spotlight-combat-card--defender");
  expect(html).toContain("Attacking Leader");
  expect(html).toContain("Blocking Character");
  expect(html).toContain("7000");
  expect(html).toContain("3000");
  expect(html).toContain("is-power-7000");
  expect(html).toContain("is-weak");
  expect(html).toMatch(
    /effect-spotlight-card--combat[\s\S]*effect-spotlight-controls/u,
  );
});
```

Update existing `EffectSpotlight` test calls from `card`/`active` props to the new `presentation` prop:

```ts
presentation: {
  kind: "effectText",
  card: card(),
  active: {
    source: {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    },
    textKind: "effect",
    activeSpanIds: ["span:body:draw"],
  },
}
```

- [ ] **Step 2: Run the render test to verify failure**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/effect-spotlight.test.ts
```

Expected: FAIL because combat rendering is not implemented.

- [ ] **Step 3: Add combat rendering helpers**

In `packages/client/src/react/EffectSpotlight.tsx`, import the combat type and tone helper:

```ts
import type {
  ActiveEffectTextPresentation,
  CombatSpotlightPresentation,
  EffectTextSourceMap,
} from "@optcg/types";
import { battlePowerTone } from "./BattleArrowOverlay.js";
```

Add reusable card image and power helpers:

```tsx
const SpotlightCardFace = ({
  card,
  className,
}: {
  readonly card: ClientCardModel;
  readonly className: string;
}): React.JSX.Element => (
  <div className={className}>
    {card.imageUrl === undefined ? (
      <div className="effect-spotlight-card__placeholder">{card.name}</div>
    ) : (
      <img
        className="effect-spotlight-card__art"
        src={card.imageUrl}
        alt={card.name}
      />
    )}
  </div>
);

const CombatPowerValue = ({
  power,
}: {
  readonly power: number | undefined;
}): React.JSX.Element | null =>
  power === undefined ? null : (
    <span
      className={`effect-spotlight-combat-power__value battle-arrow-power-value is-${battlePowerTone(power)}`}
    >
      {power}
    </span>
  );
```

Add the combat renderer:

```tsx
const CombatSpotlightCard = ({
  attackerCard,
  combat,
  defenderCard,
  timer,
  timerNowMs,
}: {
  readonly attackerCard: ClientCardModel;
  readonly combat: CombatSpotlightPresentation;
  readonly defenderCard: ClientCardModel;
  readonly timer: EffectSpotlightTimer | undefined;
  readonly timerNowMs: number;
}): React.JSX.Element => (
  <div className="effect-spotlight-card effect-spotlight-card--combat">
    <div
      className="effect-spotlight-combat"
      data-combat-spotlight-kind={combat.eventKind}
    >
      <SpotlightCardFace
        card={attackerCard}
        className="effect-spotlight-combat-card effect-spotlight-combat-card--attacker"
      />
      <div className="effect-spotlight-combat-power" aria-hidden="true">
        <CombatPowerValue power={combat.attackerPower} />
        <span className="effect-spotlight-combat-power__vs">vs</span>
        <CombatPowerValue power={combat.defenderPower} />
      </div>
      <SpotlightCardFace
        card={defenderCard}
        className="effect-spotlight-combat-card effect-spotlight-combat-card--defender"
      />
    </div>
    {timer === undefined ? null : (
      <div
        key={timer.animationKey}
        className={`effect-spotlight-card__timer${
          timer.paused || timer.pinned ? " is-paused" : ""
        }`}
        data-effect-spotlight-timer={timer.animationKey}
        aria-hidden="true"
        style={spotlightTimerStyle(timer, timerNowMs)}
      >
        <div className="effect-spotlight-card__timer-fill" />
      </div>
    )}
  </div>
);
```

Branch in `EffectSpotlight`:

```tsx
const ariaLabel =
  presentation === undefined
    ? "Spotlight playback"
    : presentation.kind === "combat"
      ? "Combat spotlight"
      : `Resolving ${presentation.card.name}`;
```

Render combat entries before the effect-text card branch:

```tsx
{
  presentation?.kind === "combat" ? (
    <CombatSpotlightCard
      attackerCard={presentation.attackerCard}
      defenderCard={presentation.defenderCard}
      combat={presentation.combat}
      timer={timer}
      timerNowMs={timerNowMs}
    />
  ) : card === undefined || active === undefined ? null : (
    <div className="effect-spotlight-card">...</div>
  );
}
```

- [ ] **Step 4: Add combat CSS**

Append to `packages/client/src/react/styles/effect-spotlight.css`:

```css
.effect-spotlight-card--combat {
  display: grid;
  place-items: center;
  background:
    radial-gradient(
      circle at 50% 48%,
      rgba(255, 224, 117, 0.2),
      transparent 46%
    ),
    rgba(16, 20, 25, 0.96);
}

.effect-spotlight-combat {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(58px, 0.34fr) minmax(0, 1fr);
  gap: clamp(8px, 4cqw, 20px);
  align-items: center;
  width: 92%;
}

.effect-spotlight-combat-card {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  box-shadow:
    0 12px 24px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.24);
}

.effect-spotlight-combat-card--attacker {
  transform: rotate(-3deg);
}

.effect-spotlight-combat-card--defender {
  transform: rotate(3deg);
}

.effect-spotlight-combat-power {
  display: grid;
  place-items: center;
  gap: clamp(2px, 1.5cqw, 8px);
  color: #f7f1df;
  font-weight: 900;
  line-height: 1;
  text-align: center;
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.95),
    0 0 12px rgba(0, 0, 0, 0.72);
}

.effect-spotlight-combat-power__value {
  font-size: clamp(24px, 12cqw, 54px);
  letter-spacing: 0;
}

.effect-spotlight-combat-power__vs {
  font-size: clamp(12px, 5cqw, 24px);
  opacity: 0.9;
  text-transform: uppercase;
}
```

- [ ] **Step 5: Run the render test**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/effect-spotlight.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/client/src/react/EffectSpotlight.tsx packages/client/src/react/effect-spotlight.test.ts packages/client/src/react/styles/effect-spotlight.css
git commit -m "Render combat spotlight cards"
```

---

### Task 7: Verify Cross-Package Integration

**Files:**

- Modify only files needed to fix failures found by verification.

- [ ] **Step 1: Run targeted package tests**

Run:

```bash
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/battle/actions.test.ts packages/engine-core/src/battle/blocker-flow.test.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/use-effect-spotlight-display.test.ts packages/client/src/react/effect-spotlight.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
corepack pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
corepack pnpm run lint
```

Expected: PASS.

- [ ] **Step 4: Run the default test suite**

Run:

```bash
corepack pnpm run test
```

Expected: PASS.

- [ ] **Step 5: Commit verification fixes if any were required**

If verification required code changes, run:

```bash
git add packages/types/src/effect-presentation.ts packages/types/src/effect-presentation.test.ts packages/engine-core/src/battle/actions.ts packages/engine-core/src/battle/block-actions.ts packages/engine-core/src/battle/actions.test.ts packages/engine-core/src/battle/blocker-flow.test.ts packages/engine-core/src/view/effect-spotlight-history.ts packages/engine-core/src/view/effect-spotlight-history.test.ts packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/use-effect-spotlight-display.ts packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/use-effect-spotlight-display.test.ts packages/client/src/react/MatchApp.tsx packages/client/src/react/BoardLayout.tsx packages/client/src/react/EffectSpotlight.tsx packages/client/src/react/effect-spotlight.test.ts packages/client/src/react/styles/effect-spotlight.css
git commit -m "Stabilize combat spotlight integration"
```

If no files changed during verification, do not create an empty commit.

---

## Self-Review

**Spec coverage:**

- Same queue/history controls: Task 4 generalizes playback entries and tests rewind/catch-up with combat sources.
- Attack declaration pair: Task 3 projects `attackDeclared` as attacker versus target.
- Blocker activation pair: Task 3 projects `blockerActivated` as attacker versus blocker.
- Server-backed refresh persistence: Task 3 adds combat entries to `effectSpotlightHistory`.
- Captured powers: Task 2 adds power values to engine events, and Task 3 persists those values in history entries.
- Existing effect text behavior: Tasks 1, 4, 5, and 6 keep effect-text entries and existing render tests.
- Malformed and non-public events: Task 3 adds fail-closed tests.
- No counter-event spotlighting: no task adds counter events.

**Placeholder scan:** The plan has concrete file paths, code snippets, commands, expected outcomes, and commits for each implementation slice.

**Type consistency:** The same names are used across tasks: `kind`, `effectText`, `combat`, `CombatSpotlightPresentation`, `attackerPower`, `defenderPower`, `attackerCard`, and `defenderCard`.
