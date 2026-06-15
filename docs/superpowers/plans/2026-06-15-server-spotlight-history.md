# Server Spotlight History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist spotlight playback history in the server-projected player view so refresh/reconnect can restore rewindable entries while starting at the present entry.

**Architecture:** Add a public spotlight history contract to `@optcg/types`, project it from the engine view layer using already visible player events and active effect text, then have the client seed spotlight playback from that server field. The hook keeps local cursor/pause controls, but the history entries come from the server snapshot.

**Tech Stack:** TypeScript, React, Vitest, `@optcg/types`, `@optcg/engine-core`, `@optcg/client`.

---

## File Structure

- Modify `packages/types/src/effect-presentation.ts`
  - Owns the public spotlight history DTO types because they are built from `ActiveEffectTextPresentation`.
- Modify `packages/types/src/view.ts`
  - Adds `effectSpotlightHistory?: EffectSpotlightHistory` to `PlayerView`.
- Modify `packages/types/src/view.test.ts`
  - Proves the public view contract can carry spotlight history while still excluding private engine internals.
- Create `packages/engine-core/src/view/effect-spotlight-history.ts`
  - Pure projection helper that converts visible player events plus optional active effect text into hidden-info-safe spotlight history.
- Modify `packages/engine-core/src/view/filter-state-for-player.ts`
  - Builds `visibleEvents` once, reuses them for `events`, and attaches `effectSpotlightHistory`.
- Modify `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`
  - Proves resolved history projection and hidden-info filtering.
- Modify `packages/client/src/react/use-effect-spotlight.ts`
  - Adds initial cursor seeding from a server-present key and an explicit flag for legacy initial consumption.
- Modify `packages/client/src/react/use-effect-spotlight.test.ts`
  - Proves refresh-style server history starts at the present entry and still preserves rewound cursors for new entries.
- Modify `packages/client/src/react/MatchApp.tsx`
  - Uses `playerSnapshot.view.effectSpotlightHistory` when present, with the existing event-derived fallback for older test fixtures.
- Modify `packages/client/src/react/playmat-structure.test.ts`
  - Updates source assertions if the MatchApp wiring changes.

---

### Task 1: Public Type Contract

**Files:**

- Modify: `packages/types/src/effect-presentation.ts`
- Modify: `packages/types/src/view.ts`
- Test: `packages/types/src/view.test.ts`

- [ ] **Step 1: Write the failing type contract test**

In `packages/types/src/view.test.ts`, extend the canonical `playerView` fixture inside `TYP-002A canonical player and spectator view DTO contracts compile` with `effectSpotlightHistory`.

```ts
const playerView: PlayerView = {
  matchId: "match-1" as MatchId,
  playerId: playerA,
  stateSeq: seq,
  actionSeq: 1,
  turn,
  self,
  opponent,
  battle,
  pendingDecision: decision,
  effectSpotlightHistory: {
    entries: [
      {
        key: "event-spotlight-1",
        mode: "resolved",
        active: {
          source: cardRef("source", playerA),
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
      },
    ],
    presentKey: "event-spotlight-1",
  },
  legalActions: [legalAction],
  revealedCards: [reveal],
  events: [event],
  timers: {
    activePlayerId: playerA,
    players: {
      [playerA]: { remainingMs: 120_000, isRunning: true },
      [playerB]: { remainingMs: 120_000, isRunning: false },
    },
  },
};
expect(playerView.effectSpotlightHistory?.presentKey).toBe("event-spotlight-1");
```

- [ ] **Step 2: Run the failing type test**

Run:

```powershell
corepack pnpm exec vitest run packages/types/src/view.test.ts
```

Expected: TypeScript transform fails or test compile fails because `effectSpotlightHistory` is not a known `PlayerView` field.

- [ ] **Step 3: Add the minimal public DTO types**

In `packages/types/src/effect-presentation.ts`, add after `ActiveEffectTextPresentation`:

```ts
export interface EffectSpotlightHistoryEntry {
  readonly key: string;
  readonly mode: "live" | "resolved";
  readonly active: ActiveEffectTextPresentation;
}

export interface EffectSpotlightHistory {
  readonly entries: readonly EffectSpotlightHistoryEntry[];
  readonly presentKey?: string;
}
```

In `packages/types/src/view.ts`, update the import:

```ts
import type {
  ActiveEffectTextPresentation,
  EffectSpotlightHistory,
  EffectTextSourceMap,
} from "./effect-presentation.js";
```

Add this field to `PlayerView` after `activeEffectText?: ActiveEffectTextPresentation;`:

```ts
  effectSpotlightHistory?: EffectSpotlightHistory;
```

- [ ] **Step 4: Verify the type contract test passes**

Run:

```powershell
corepack pnpm exec vitest run packages/types/src/view.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the public contract slice**

Run:

```powershell
git add packages/types/src/effect-presentation.ts packages/types/src/view.ts packages/types/src/view.test.ts
git commit -m "Add spotlight history view contract"
```

---

### Task 2: Engine View Projection

**Files:**

- Create: `packages/engine-core/src/view/effect-spotlight-history.ts`
- Modify: `packages/engine-core/src/view/filter-state-for-player.ts`
- Test: `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`

- [ ] **Step 1: Write the failing projection tests**

In `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`, add these imports:

```ts
import type { EngineEventId } from "@optcg/types";
```

Add this helper near the existing ID helpers:

```ts
const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;
```

Add this test after `player decision projection includes active effect text for visible queued sources`:

```ts
test("player view projects resolved spotlight history from visible effect presentations", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("history-source-instance");
  sourceCard.zone = {
    zone: "characterArea",
    playerId: p1,
    slot: "character",
    index: 0,
  };
  p1State.characters.push(sourceCard);
  state.cardManifest.cards[sourceCard.cardId] = resolvedCard({
    cardId: sourceCard.cardId,
    category: "character",
  });
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  state.eventJournal.push({
    id: toEngineEventId("event:spotlight-history:resolved"),
    seq: 99,
    type: "effectResolved",
    source,
    payload: {
      status: "resolved",
      presentation: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:body:draw"],
      },
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.effectSpotlightHistory, {
    entries: [
      {
        key: "event:spotlight-history:resolved",
        mode: "resolved",
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
      },
    ],
    presentKey: "event:spotlight-history:resolved",
  });
});
```

Add this hidden-info test near the existing private source projection tests:

```ts
test("player view does not project private opponent spotlight history", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "private source card");
  sourceCard.instanceId = toInstanceId("private-history-source-instance");
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  state.eventJournal.push({
    id: toEngineEventId("event:spotlight-history:private"),
    seq: 100,
    type: "effectResolved",
    source,
    payload: {
      status: "resolved",
      presentation: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:body:private"],
      },
    },
    visibility: { type: "private", playerId: p1 },
    createdAtStateSeq: state.seq,
  });

  const ownerView = filterStateForPlayer(state, p1);
  const opponentView = filterStateForPlayer(state, p2);

  assert.equal(ownerView.effectSpotlightHistory?.entries.length, 1);
  assert.equal(opponentView.effectSpotlightHistory, undefined);
});
```

- [ ] **Step 2: Run the failing projection tests**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/view/filter-state-effect-presentation.test.ts
```

Expected: FAIL because `effectSpotlightHistory` is undefined.

- [ ] **Step 3: Create the projection helper**

Create `packages/engine-core/src/view/effect-spotlight-history.ts`:

```ts
import type {
  ActiveEffectTextPresentation,
  EffectSpotlightHistory,
  EffectSpotlightHistoryEntry,
  EngineEvent,
} from "@optcg/types";

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isActiveEffectTextPresentation = (
  value: unknown,
): value is ActiveEffectTextPresentation => {
  if (!isObjectRecord(value) || !isObjectRecord(value["source"])) {
    return false;
  }
  const source = value["source"];
  const activeSpanIds = value["activeSpanIds"];
  return (
    typeof source["instanceId"] === "string" &&
    typeof source["cardId"] === "string" &&
    typeof source["playerId"] === "string" &&
    (value["textKind"] === undefined ||
      value["textKind"] === "effect" ||
      value["textKind"] === "trigger") &&
    Array.isArray(activeSpanIds) &&
    activeSpanIds.every(
      (spanId) => typeof spanId === "string" && spanId.startsWith("span:"),
    )
  );
};

const sequenceSpanPrefix = "span:sequence:";
const searchSpanPrefix = "span:search:";

const sameEffectTextSource = (
  left: ActiveEffectTextPresentation["source"],
  right: ActiveEffectTextPresentation["source"],
): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

const spanKey = (
  spanIds: ActiveEffectTextPresentation["activeSpanIds"],
): string => spanIds.join("\n");

const sameEffectTextPresentation = (
  left: ActiveEffectTextPresentation,
  right: ActiveEffectTextPresentation,
): boolean =>
  sameEffectTextSource(left.source, right.source) &&
  (left.textKind ?? "effect") === (right.textKind ?? "effect") &&
  spanKey(left.activeSpanIds) === spanKey(right.activeSpanIds);

const presentationForEvent = (
  event: EngineEvent,
): ActiveEffectTextPresentation | undefined => {
  if (
    (event.type !== "effectResolved" && event.type !== "replacementApplied") ||
    !isObjectRecord(event.payload)
  ) {
    return undefined;
  }
  const presentation = event.payload["presentation"];
  return isActiveEffectTextPresentation(presentation)
    ? presentation
    : undefined;
};

const splitResolvedSpanIds = (
  activeSpanIds: ActiveEffectTextPresentation["activeSpanIds"],
): ActiveEffectTextPresentation["activeSpanIds"] => {
  const splitSpanIds = activeSpanIds.filter(
    (spanId) =>
      spanId.startsWith(sequenceSpanPrefix) ||
      spanId.startsWith(searchSpanPrefix),
  );
  return splitSpanIds.length > 1 ? splitSpanIds : [];
};

const resolvedEntriesForEvent = (
  event: EngineEvent,
): readonly EffectSpotlightHistoryEntry[] => {
  const presentation = presentationForEvent(event);
  if (presentation === undefined) {
    return [];
  }
  const splitSpanIds = splitResolvedSpanIds(presentation.activeSpanIds);
  if (splitSpanIds.length === 0) {
    return [
      {
        key: String(event.id),
        mode: "resolved",
        active: presentation,
      },
    ];
  }
  return splitSpanIds.map((spanId) => ({
    key: `${String(event.id)}:${spanId}`,
    mode: "resolved" as const,
    active: {
      ...presentation,
      activeSpanIds: [spanId],
    },
  }));
};

const liveEntryKey = (active: ActiveEffectTextPresentation): string =>
  [
    "active",
    String(active.source.instanceId),
    active.textKind ?? "",
    active.activeSpanIds.join("\n"),
  ].join("|");

const hasMatchingResolvedPresentationSinceLastQueue = ({
  activeEffectText,
  events,
}: {
  readonly activeEffectText: ActiveEffectTextPresentation;
  readonly events: readonly EngineEvent[];
}): boolean => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined || event.type === "effectQueued") {
      return false;
    }
    const presentation = presentationForEvent(event);
    if (
      presentation !== undefined &&
      sameEffectTextPresentation(presentation, activeEffectText)
    ) {
      return true;
    }
  }
  return false;
};

export const effectSpotlightHistoryFromPlayerViewState = ({
  activeEffectText,
  events,
}: {
  readonly activeEffectText: ActiveEffectTextPresentation | undefined;
  readonly events: readonly EngineEvent[];
}): EffectSpotlightHistory | undefined => {
  const entries = events.flatMap((event) => resolvedEntriesForEvent(event));
  const liveEntry =
    activeEffectText === undefined ||
    hasMatchingResolvedPresentationSinceLastQueue({ activeEffectText, events })
      ? undefined
      : {
          key: liveEntryKey(activeEffectText),
          mode: "live" as const,
          active: activeEffectText,
        };
  const historyEntries =
    liveEntry === undefined ? entries : [...entries, liveEntry];
  const presentKey = historyEntries.at(-1)?.key;
  return historyEntries.length === 0 || presentKey === undefined
    ? undefined
    : { entries: historyEntries, presentKey };
};
```

- [ ] **Step 4: Wire the helper into `filterStateForPlayer`**

In `packages/engine-core/src/view/filter-state-for-player.ts`, add:

```ts
import { effectSpotlightHistoryFromPlayerViewState } from "./effect-spotlight-history.js";
```

Before the `return { ... }`, compute visible events and history:

```ts
const events = state.eventJournal
  .filter((event) => isEventVisibleToPlayer(event, playerId))
  .map((event) => toPlayerEventForView(state, event));
const effectSpotlightHistory = effectSpotlightHistoryFromPlayerViewState({
  activeEffectText,
  events,
});
```

In the returned object, add after active effect text:

```ts
    ...(effectSpotlightHistory === undefined
      ? {}
      : { effectSpotlightHistory }),
```

Replace the existing inline `events: state.eventJournal...` expression with:

```ts
    events,
```

- [ ] **Step 5: Verify the projection tests pass**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/view/filter-state-effect-presentation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the engine projection slice**

Run:

```powershell
git add packages/engine-core/src/view/effect-spotlight-history.ts packages/engine-core/src/view/filter-state-for-player.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts
git commit -m "Project spotlight history in player views"
```

---

### Task 3: Client Playback Seeding

**Files:**

- Modify: `packages/client/src/react/use-effect-spotlight.ts`
- Test: `packages/client/src/react/use-effect-spotlight.test.ts`

- [ ] **Step 1: Write the failing hook model test**

In `packages/client/src/react/use-effect-spotlight.test.ts`, add this test after `retains every unseen source in arrival order without consuming the active cursor`:

```ts
it("starts server-projected history at the present source on initial load", () => {
  const next = appendSpotlightPlaybackSources({
    consumedKeys: new Set<string>(),
    initialCursorKey: "event:second",
    previous: {
      entries: [],
      cursorIndex: undefined,
      paused: false,
    },
    sources: [
      source("event:first", "span:first"),
      source("event:second", "span:second"),
    ],
  });

  expect(next.entries.map((entry) => entry.key)).toEqual([
    "event:first",
    "event:second",
  ]);
  expect(next.cursorIndex).toBe(1);
  expect(next.paused).toBe(false);
});
```

- [ ] **Step 2: Run the failing hook model test**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected: FAIL because `appendSpotlightPlaybackSources` does not accept or apply `initialCursorKey`.

- [ ] **Step 3: Add initial cursor support to the append model**

In `packages/client/src/react/use-effect-spotlight.ts`, update `appendSpotlightPlaybackSources` parameters:

```ts
export const appendSpotlightPlaybackSources = ({
  consumedKeys,
  initialCursorKey,
  suppressedResolvedSignatures,
  previous,
  sources,
}: {
  readonly consumedKeys: ReadonlySet<string>;
  readonly initialCursorKey?: string | undefined;
  readonly suppressedResolvedSignatures?: Set<string>;
  readonly previous: EffectSpotlightPlaybackState;
  readonly sources: readonly EffectSpotlightActiveSourceInput[];
}): EffectSpotlightPlaybackState => {
```

Before returning the new state, compute the cursor:

```ts
const initialCursorIndex =
  previous.entries.length === 0 && initialCursorKey !== undefined
    ? entries.findIndex((source) => source.key === initialCursorKey)
    : -1;
```

Set `cursorIndex` in the return object to:

```ts
    cursorIndex:
      previous.cursorIndex !== undefined
        ? previous.cursorIndex
        : initialCursorIndex >= 0
          ? initialCursorIndex
          : previous.entries.length,
```

- [ ] **Step 4: Add hook input flags for server history**

In `UseEffectSpotlightInput`, add:

```ts
  readonly consumeInitialResolvedSources?: boolean | undefined;
  readonly initialCursorKey?: string | undefined;
```

In `useEffectSpotlight` parameters, default the flag:

```ts
  consumeInitialResolvedSources = true,
  initialCursorKey,
```

Add this ref beside `initializedConsumedResolvedKeys`:

```ts
const initializedPlaybackSources = useRef(false);
```

In the effect that seeds initial consumed keys, change the condition to:

```ts
    if (
      consumeInitialResolvedSources &&
      !initializedConsumedResolvedKeys.current &&
      activeSources !== undefined
    ) {
```

Before `setPlayback`, compute whether this is the first non-empty playback
source batch:

```ts
const isInitialPlaybackBatch =
  !initializedPlaybackSources.current && normalizedSources.length > 0;
```

Pass `initialCursorKey` to `appendSpotlightPlaybackSources` only for that first
non-empty playback source batch:

```ts
        initialCursorKey: isInitialPlaybackBatch
          ? initialCursorKey
          : undefined,
```

After `setPlayback`, mark the first non-empty source batch initialized:

```ts
if (isInitialPlaybackBatch) {
  initializedPlaybackSources.current = true;
}
```

Add `consumeInitialResolvedSources` and `initialCursorKey` to the effect
dependency list.

- [ ] **Step 5: Verify hook tests pass**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the hook seeding slice**

Run:

```powershell
git add packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight.test.ts
git commit -m "Seed spotlight playback from server history"
```

---

### Task 4: MatchApp Server History Wiring

**Files:**

- Modify: `packages/client/src/react/MatchApp.tsx`
- Modify: `packages/client/src/react/playmat-structure.test.ts`
- Test: `packages/client/src/react/playmat-structure.test.ts`
- Test: `packages/client/src/react/effect-spotlight-source.test.ts`
- Test: `packages/client/src/react/effect-spotlight.test.ts`
- Test: `packages/client/src/react/use-effect-spotlight.test.ts`

- [ ] **Step 1: Write the failing structure assertion**

In `packages/client/src/react/playmat-structure.test.ts`, inside `effect spotlight is hosted in the empty hand rail lane`, add assertions that `MatchApp.tsx` uses `effectSpotlightHistory`:

```ts
assert.match(
  matchApp,
  /const effectSpotlightHistory = playerSnapshot\?\.view\.effectSpotlightHistory;/u,
);
assert.match(
  matchApp,
  /consumeInitialResolvedSources: effectSpotlightHistory === undefined/u,
);
assert.match(
  matchApp,
  /initialCursorKey: effectSpotlightHistory\?\.presentKey/u,
);
```

- [ ] **Step 2: Run the failing structure test**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/playmat-structure.test.ts
```

Expected: FAIL because `MatchApp.tsx` does not read `effectSpotlightHistory`.

- [ ] **Step 3: Wire server history into `MatchApp`**

In `packages/client/src/react/MatchApp.tsx`, replace the current `activeEffectTextSources` block with:

```ts
const effectSpotlightHistory = playerSnapshot?.view.effectSpotlightHistory;
const activeEffectTextSources =
  effectSpotlightHistory?.entries ??
  (playerSnapshot === undefined
    ? undefined
    : activeEffectTextSourcesForSpotlight({
        activeEffectText: playerSnapshot.view.activeEffectText,
        pendingDecision: playerSnapshot.view.pendingDecision,
        events: playerSnapshot.view.events,
      }));
```

Update the `useEffectSpotlight` call:

```ts
const effectSpotlight = useEffectSpotlight({
  active: undefined,
  ...(activeEffectTextSources === undefined
    ? {}
    : { activeSources: activeEffectTextSources }),
  consumeInitialResolvedSources: effectSpotlightHistory === undefined,
  initialCursorKey: effectSpotlightHistory?.presentKey,
  pendingDecisionId: playerSnapshot?.view.pendingDecision?.id,
});
```

- [ ] **Step 4: Verify client focused tests pass**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/effect-spotlight-source.test.ts packages/client/src/react/effect-spotlight.test.ts packages/client/src/react/playmat-structure.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the client wiring slice**

Run:

```powershell
git add packages/client/src/react/MatchApp.tsx packages/client/src/react/playmat-structure.test.ts
git commit -m "Use server spotlight history in MatchApp"
```

---

### Task 5: Cross-Package Verification

**Files:**

- No new files. This task verifies all previous slices together.

- [ ] **Step 1: Run focused spotlight and view tests**

Run:

```powershell
corepack pnpm exec vitest run packages/types/src/view.test.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/effect-spotlight-source.test.ts packages/client/src/react/effect-spotlight.test.ts packages/client/src/react/playmat-structure.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run strict typechecks for touched packages**

Run:

```powershell
corepack pnpm exec tsc -p packages/types/tsconfig.json --noEmit
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected: each command exits 0.

- [ ] **Step 3: Run ESLint on touched implementation files**

Run:

```powershell
corepack pnpm exec eslint packages/types/src/effect-presentation.ts packages/types/src/view.ts packages/types/src/view.test.ts packages/engine-core/src/view/effect-spotlight-history.ts packages/engine-core/src/view/filter-state-for-player.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/MatchApp.tsx packages/client/src/react/playmat-structure.test.ts --max-warnings=0
```

Expected: exits 0.

- [ ] **Step 4: Check worktree and commit any verification-only formatting changes**

Run:

```powershell
git status --short
```

Expected: clean. If lint-staged or Prettier changed files during a prior commit
hook, inspect `git diff`, stage the exact touched spotlight-history files, and
commit:

```powershell
git add packages/types/src/effect-presentation.ts packages/types/src/view.ts packages/types/src/view.test.ts packages/engine-core/src/view/effect-spotlight-history.ts packages/engine-core/src/view/filter-state-for-player.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/MatchApp.tsx packages/client/src/react/playmat-structure.test.ts
git commit -m "Format server spotlight history changes"
```

---

## Spec Coverage Self-Review

- Refresh/reconnect history: Task 2 adds server-projected history, Task 4 consumes it.
- Cursor defaults to present: Task 3 adds initial present-key cursor seeding.
- No replay from beginning: Task 3 test asserts initial cursor is the present entry.
- Preserve user review cursor: existing hook tests plus Task 3 keep append cursor semantics.
- Hidden-info safety: Task 2 tests private visible-event filtering.
- No server command or persisted local controls: no task adds server mutation or cursor storage.
- Existing duplicate/repeated behavior: Task 5 runs existing spotlight tests.
