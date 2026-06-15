# Spotlight Playback Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework effect spotlight history/playback so server history is durable and replayable while the client owns local cursor, dwell, rewind, play, and fast-forward behavior.

**Architecture:** Split spotlight into a server timeline, a client playback cursor, and a display session. The server projects ordered entries with structured identity and current-pending metadata. The client merges timeline updates without semantic "seen" suppression, resets the 2 second dwell whenever the cursor enters an entry, and implements fast-forward as local pending-or-empty state.

**Tech Stack:** TypeScript, React hooks, Vitest, `@optcg/types`, `@optcg/engine-core`, `@optcg/client`.

---

## File Structure

- Modify `packages/types/src/effect-presentation.ts`
  - Extend `EffectSpotlightHistoryEntry` with structured timeline fields while retaining `key`, `mode`, and `active` for compatibility.
- Modify `packages/engine-core/src/view/effect-spotlight-history.ts`
  - Make this the canonical server timeline projector.
  - Add structured semantic identity helpers.
  - Replace matching resolved entries with current live pending entries by semantic identity, not by display key parsing.
- Modify `packages/engine-core/src/view/effect-spotlight-history.test.ts`
  - Cover structured fields, search selection/remainder projection, and live-pending replacement.
- Modify `packages/client/src/react/use-effect-spotlight-playback.ts`
  - Convert playback to a timeline/cursor state machine.
  - Add merge-by-id and live-to-resolved in-place replacement by `semanticKey`.
  - Implement fast-forward as pending-or-empty, not "jump to latest historical entry."
- Modify `packages/client/src/react/use-effect-spotlight-display.ts`
  - Pin via structured `pendingDecisionId`, not `key.startsWith`.
  - Reset dwell whenever cursor enters an entry.
- Modify `packages/client/src/react/use-effect-spotlight.ts`
  - Wire timeline-aware playback and display sessions.
  - Keep controls visible after history exists.
- Modify `packages/client/src/react/MatchApp.tsx`
  - Pass whether `activeSources` came from server history so client can disable legacy signature suppression on server timelines.
- Modify `packages/client/src/react/effect-spotlight-source.ts`
  - Keep only fallback behavior for missing server history.
  - Do not duplicate server timeline semantics for normal match views.
- Modify tests:
  - `packages/client/src/react/use-effect-spotlight.test.ts`
  - `packages/client/src/react/effect-spotlight-source.test.ts`
  - `packages/client/src/react/playmat-structure.test.ts`

---

### Task 1: Add Structured Spotlight Timeline Types

**Files:**

- Modify: `packages/types/src/effect-presentation.ts`
- Test: `packages/types/src/effect-presentation.test.ts`

- [ ] **Step 1: Write the type-level regression test**

Add this test to `packages/types/src/effect-presentation.test.ts`:

```ts
test("allows structured spotlight timeline entries without parsing display keys", () => {
  const active: ActiveEffectTextPresentation = {
    source: {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    },
    textKind: "effect",
    activeSpanIds: ["span:search:selection"],
  };

  const entry: EffectSpotlightHistoryEntry = {
    id: "resolved:event:1:span:search:selection",
    key: "event:1:span:search:selection",
    semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
    mode: "resolved",
    status: "resolved",
    active,
    resolvedEventId: "event:1" as EngineEventId,
    queueEntryId: "queue-entry:1" as QueueEntryId,
    effectBlockId: "effect:block:1" as EffectId,
  };

  expect(entry.pendingDecisionId).toBeUndefined();
  expect(entry.semanticKey).toContain("span:search:selection");
});
```

Update the import block in that test file to include:

```ts
import type {
  ActiveEffectTextPresentation,
  EffectSpotlightHistoryEntry,
} from "./effect-presentation.js";
import type {
  CardId,
  EffectId,
  EngineEventId,
  InstanceId,
  PlayerId,
  QueueEntryId,
} from "./index.js";
```

- [ ] **Step 2: Run the type test and verify it fails**

Run:

```bash
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts
```

Expected: FAIL because `EffectSpotlightHistoryEntry` does not yet have `id`, `semanticKey`, `status`, `resolvedEventId`, `queueEntryId`, or `effectBlockId`.

- [ ] **Step 3: Extend the shared spotlight entry type**

In `packages/types/src/effect-presentation.ts`, add this import:

```ts
import type {
  DecisionId,
  EffectId,
  EngineEventId,
  QueueEntryId,
} from "./primitives.js";
```

Replace `EffectSpotlightHistoryEntry` with:

```ts
export type EffectSpotlightHistoryEntryStatus = "pending" | "resolved";

export interface EffectSpotlightHistoryEntry {
  readonly id: string;
  readonly key: string;
  readonly semanticKey: string;
  readonly mode: "live" | "resolved";
  readonly status: EffectSpotlightHistoryEntryStatus;
  readonly active: ActiveEffectTextPresentation;
  readonly pendingDecisionId?: DecisionId;
  readonly resolvedEventId?: EngineEventId;
  readonly queueEntryId?: QueueEntryId;
  readonly effectBlockId?: EffectId;
}
```

- [ ] **Step 4: Run the type test and verify it passes**

Run:

```bash
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/effect-presentation.ts packages/types/src/effect-presentation.test.ts
git commit -m "Add structured spotlight timeline entry type"
```

---

### Task 2: Normalize Server Timeline Projection

**Files:**

- Modify: `packages/engine-core/src/view/effect-spotlight-history.ts`
- Test: `packages/engine-core/src/view/effect-spotlight-history.test.ts`
- Update expectations in: `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`, `packages/types/src/view.test.ts`

- [ ] **Step 1: Add failing server projection tests**

Append these tests to `packages/engine-core/src/view/effect-spotlight-history.test.ts`:

```ts
it("projects structured resolved search timeline entries", () => {
  const event = resolvedSearchEvent("event:search", [
    "span:search:selection",
    "span:search:remaining",
  ]);

  const history = effectSpotlightHistoryFromPlayerViewState({
    activeEffectText: undefined,
    events: [event],
    pendingDecisionId: undefined,
  });

  expect(
    history?.entries.map((entry) => ({
      id: entry.id,
      key: entry.key,
      semanticKey: entry.semanticKey,
      status: entry.status,
      mode: entry.mode,
      activeSpanIds: entry.active.activeSpanIds,
      resolvedEventId: entry.resolvedEventId,
    })),
  ).toEqual([
    {
      id: "resolved:event:search:span:search:selection",
      key: "event:search:span:search:selection",
      semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
      status: "resolved",
      mode: "resolved",
      activeSpanIds: ["span:search:selection"],
      resolvedEventId: "event:search",
    },
    {
      id: "resolved:event:search:span:search:remaining",
      key: "event:search:span:search:remaining",
      semanticKey: "p1|source-1|OP00-001|effect|span:search:remaining",
      status: "resolved",
      mode: "resolved",
      activeSpanIds: ["span:search:remaining"],
      resolvedEventId: "event:search",
    },
  ]);
});

it("replaces a resolved current pending span with the live pending entry", () => {
  const event = resolvedSearchEvent("event:search", [
    "span:search:selection",
    "span:search:remaining",
  ]);

  const history = effectSpotlightHistoryFromPlayerViewState({
    activeEffectText: {
      source,
      textKind: "effect",
      activeSpanIds: ["span:search:remaining"],
    },
    events: [event],
    pendingDecisionId: "decision:orderCards:search",
  });

  expect(
    history?.entries.map((entry) => ({
      id: entry.id,
      semanticKey: entry.semanticKey,
      status: entry.status,
      mode: entry.mode,
      pendingDecisionId: entry.pendingDecisionId,
      activeSpanIds: entry.active.activeSpanIds,
    })),
  ).toEqual([
    {
      id: "resolved:event:search:span:search:selection",
      semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
      status: "resolved",
      mode: "resolved",
      pendingDecisionId: undefined,
      activeSpanIds: ["span:search:selection"],
    },
    {
      id: "pending:decision:orderCards:search:p1|source-1|OP00-001|effect|span:search:remaining",
      semanticKey: "p1|source-1|OP00-001|effect|span:search:remaining",
      status: "pending",
      mode: "live",
      pendingDecisionId: "decision:orderCards:search",
      activeSpanIds: ["span:search:remaining"],
    },
  ]);
});
```

- [ ] **Step 2: Run the server projection test and verify it fails**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/view/effect-spotlight-history.test.ts
```

Expected: FAIL because the projector does not populate structured fields.

- [ ] **Step 3: Implement structured server entry helpers**

In `packages/engine-core/src/view/effect-spotlight-history.ts`, add `EffectId` and `QueueEntryId` to the existing `@optcg/types` import, then add helpers near the existing validation helpers:

```ts
const effectEventPayload = (
  event: EngineEvent,
): {
  readonly queueEntryId?: string;
  readonly effectBlockId?: string;
} => {
  if (!isObjectRecord(event.payload)) {
    return {};
  }
  const queueEntryId = event.payload["queueEntryId"];
  const effectBlockId = event.payload["effectBlockId"];
  return {
    ...(typeof queueEntryId === "string" ? { queueEntryId } : {}),
    ...(typeof effectBlockId === "string" ? { effectBlockId } : {}),
  };
};

const semanticKeyForActive = (active: ActiveEffectTextPresentation): string =>
  [
    String(active.source.playerId),
    String(active.source.instanceId),
    String(active.source.cardId),
    active.textKind ?? "effect",
    active.activeSpanIds.join("\n"),
  ].join("|");

const pendingEntryId = (
  pendingDecisionId: DecisionId | string,
  active: ActiveEffectTextPresentation,
): string =>
  `pending:${String(pendingDecisionId)}:${semanticKeyForActive(active)}`;

const resolvedEntryId = (
  event: EngineEvent,
  active: ActiveEffectTextPresentation,
): string => `resolved:${String(event.id)}:${active.activeSpanIds.join("\n")}`;
```

- [ ] **Step 4: Populate structured fields for resolved entries**

Update `playedCardEntryForEvent` to return:

```ts
const active: ActiveEffectTextPresentation = {
  source: {
    playerId: playerId as PlayerId,
    instanceId: instanceId as InstanceId,
    cardId: cardId as CardId,
  },
  textKind: "effect",
  activeSpanIds: [],
};
return {
  id: resolvedEntryId(event, active),
  key: String(event.id),
  semanticKey: semanticKeyForActive(active),
  mode: "resolved",
  status: "resolved",
  resolvedEventId: event.id,
  active,
};
```

Add this helper below `resolvedEntryId`:

```ts
const resolvedEntryForActive = ({
  active,
  event,
  key,
}: {
  readonly active: ActiveEffectTextPresentation;
  readonly event: EngineEvent;
  readonly key: string;
}): EffectSpotlightHistoryEntry => {
  const metadata = effectEventPayload(event);
  return {
    id: resolvedEntryId(event, active),
    key,
    semanticKey: semanticKeyForActive(active),
    mode: "resolved",
    status: "resolved",
    active,
    resolvedEventId: event.id,
    ...(metadata.queueEntryId === undefined
      ? {}
      : { queueEntryId: metadata.queueEntryId as QueueEntryId }),
    ...(metadata.effectBlockId === undefined
      ? {}
      : { effectBlockId: metadata.effectBlockId as EffectId }),
  };
};
```

Then replace the body of `resolvedEntriesForEvent` after `splitSpanIds` is calculated with:

```ts
if (splitSpanIds.length === 0) {
  return [
    resolvedEntryForActive({
      active: presentation,
      event,
      key: String(event.id),
    }),
  ];
}
return splitSpanIds.map((spanId) =>
  resolvedEntryForActive({
    active: {
      ...presentation,
      activeSpanIds: [spanId],
    },
    event,
    key: `${String(event.id)}:${spanId}`,
  }),
);
```

- [ ] **Step 5: Populate structured fields for live pending entries**

Replace the live entry construction in `effectSpotlightHistoryFromPlayerViewState` with:

```ts
const liveEntry =
  activeEffectText === undefined ||
  (matchingResolvedEntryKey !== undefined && pendingDecisionId === undefined)
    ? undefined
    : {
        id:
          pendingDecisionId === undefined
            ? `active:${semanticKeyForActive(activeEffectText)}`
            : pendingEntryId(pendingDecisionId, activeEffectText),
        key: liveEntryKey(activeEffectText, pendingDecisionId),
        semanticKey: semanticKeyForActive(activeEffectText),
        mode: "live" as const,
        status: "pending" as const,
        active: activeEffectText,
        ...(pendingDecisionId === undefined
          ? {}
          : { pendingDecisionId: pendingDecisionId as DecisionId }),
      };
```

Filter matching resolved entries by `semanticKey` when a live entry exists:

```ts
const historyEntries =
  liveEntry === undefined
    ? entries
    : [
        ...entries.filter(
          (entry) => entry.semanticKey !== liveEntry.semanticKey,
        ),
        liveEntry,
      ];
```

- [ ] **Step 6: Update old projection expectations**

Update `packages/engine-core/src/view/filter-state-effect-presentation.test.ts` and `packages/types/src/view.test.ts` expectations so each spotlight entry includes:

```ts
id: "resolved:event:spotlight-history:resolved:span:body:draw",
semanticKey: "p1|history-source-instance|OP00-001|effect|span:body:draw",
status: "resolved",
resolvedEventId: "event:spotlight-history:resolved",
```

For entries with no active span ids, use an empty final semantic key segment and an id ending in the event id followed by `:`.

- [ ] **Step 7: Run focused server/view tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/types/src/view.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/types/src/view.test.ts packages/engine-core/src/view/effect-spotlight-history.ts packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts
git commit -m "Normalize server spotlight timeline projection"
```

---

### Task 3: Redesign Client Playback State Around Timeline Cursor

**Files:**

- Modify: `packages/client/src/react/use-effect-spotlight-playback.ts`
- Modify: `packages/client/src/react/use-effect-spotlight.ts`
- Test: `packages/client/src/react/use-effect-spotlight.test.ts`

- [ ] **Step 1: Add failing playback state-machine tests**

Add these tests to `packages/client/src/react/use-effect-spotlight.test.ts`:

```ts
it("replaces a displayed live entry with its resolved timeline entry without queueing a duplicate", () => {
  const liveSelection = source(
    "decision:select|source-1||span:search:selection",
    "span:search:selection",
    "live",
  );
  const resolvedSelection = {
    ...source(
      "event:resolved:span:search:selection",
      "span:search:selection",
      "resolved",
    ),
    id: "resolved:event:resolved:span:search:selection",
    semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
    status: "resolved" as const,
  };
  const previous = {
    entries: [
      {
        ...liveSelection,
        id: "pending:decision:select:p1|source-1|OP00-001|effect|span:search:selection",
        semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
        status: "pending" as const,
        pendingDecisionId: "decision:select" as DecisionId,
      },
    ],
    cursorIndex: 0,
    paused: false,
    fastForwarded: false,
  };

  const next = appendSpotlightPlaybackSources({
    consumedKeys: new Set<string>(),
    previous,
    sources: [resolvedSelection],
    sourceKind: "serverTimeline",
  });

  expect(next.entries.map((entry) => entry.key)).toEqual([
    "event:resolved:span:search:selection",
  ]);
  expect(next.cursorIndex).toBe(0);
});

it("fast-forward clears to empty when there is no pending timeline entry", () => {
  const next = advanceSpotlightPlayback({
    command: "catchUp",
    state: {
      entries: [
        source("event:first", "span:first"),
        source("event:second", "span:second"),
      ],
      cursorIndex: 0,
      paused: true,
      fastForwarded: false,
    },
  });

  expect(next.cursorIndex).toBeUndefined();
  expect(next.paused).toBe(false);
  expect(next.fastForwarded).toBe(true);
});

it("rewind after fast-forward to empty lands on the latest historical entry", () => {
  const fastForwarded = advanceSpotlightPlayback({
    command: "catchUp",
    state: {
      entries: [
        source("event:first", "span:first"),
        source("event:second", "span:second"),
      ],
      cursorIndex: 0,
      paused: true,
      fastForwarded: false,
    },
  });

  const rewound = advanceSpotlightPlayback({
    command: "rewind",
    state: fastForwarded,
  });

  expect(rewound.cursorIndex).toBe(1);
  expect(rewound.paused).toBe(true);
});

it("rewind from a pinned pending present lands on the previous timeline entry", () => {
  const pending = {
    ...source(
      "decision:decision-1|source-1||span:pending",
      "span:pending",
      "live",
    ),
    id: "pending:decision-1:p1|source-1|OP00-001|effect|span:pending",
    semanticKey: "p1|source-1|OP00-001|effect|span:pending",
    status: "pending" as const,
    pendingDecisionId: "decision-1" as DecisionId,
  };
  const fastForwarded = advanceSpotlightPlayback({
    command: "catchUp",
    state: {
      entries: [source("event:first", "span:first"), pending],
      cursorIndex: 0,
      paused: true,
      fastForwarded: false,
    },
  });

  const rewound = advanceSpotlightPlayback({
    command: "rewind",
    state: fastForwarded,
  });

  expect(fastForwarded.cursorIndex).toBe(1);
  expect(rewound.cursorIndex).toBe(0);
  expect(rewound.paused).toBe(true);
});
```

Update the type import block in `packages/client/src/react/use-effect-spotlight.test.ts` to include `DecisionId`:

```ts
import type {
  CardId,
  DecisionId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
} from "@optcg/types";
```

Update the `source` test helper so it returns server-compatible fields:

```ts
const source = (
  key: string,
  spanId: EffectTextSpanId,
  mode: "live" | "resolved" = "resolved",
) => ({
  active: {
    source: {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    },
    activeSpanIds: [spanId],
  },
  id: key,
  key,
  semanticKey: `p1|source-1|OP00-001|effect|${spanId}`,
  mode,
  status: mode === "live" ? ("pending" as const) : ("resolved" as const),
});
```

- [ ] **Step 2: Run the playback tests and verify they fail**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected: FAIL because playback has no `fastForwarded` state, no source kind, and fast-forward still jumps to latest history.

- [ ] **Step 3: Update playback types**

In `packages/client/src/react/use-effect-spotlight-playback.ts`, replace the current `EffectSpotlightActiveSourceInput` interface and `EffectSpotlightPlaybackEntry` alias with the structured history entry type:

```ts
import type { EffectSpotlightHistoryEntry } from "@optcg/types";

export type EffectSpotlightSourceKind = "serverTimeline" | "legacyFallback";

export type EffectSpotlightActiveSourceInput = EffectSpotlightHistoryEntry;

export type EffectSpotlightPlaybackEntry = EffectSpotlightActiveSourceInput;

export interface EffectSpotlightPlaybackState {
  readonly entries: readonly EffectSpotlightPlaybackEntry[];
  readonly cursorIndex: number | undefined;
  readonly paused: boolean;
  readonly fastForwarded: boolean;
}
```

Add `sourceKind` to `appendSpotlightPlaybackSources` input:

```ts
readonly sourceKind?: EffectSpotlightSourceKind | undefined;
```

Update the initial playback state in `packages/client/src/react/use-effect-spotlight.ts`:

```ts
const [playback, setPlayback] = useState<EffectSpotlightPlaybackState>({
  entries: [],
  cursorIndex: undefined,
  paused: false,
  fastForwarded: false,
});
```

- [ ] **Step 4: Merge server timeline entries by id and semantic key**

In `appendSpotlightPlaybackSources`, before pushing a source, add this server timeline replacement branch:

```ts
if (sourceKind === "serverTimeline") {
  const semanticIndex = previous.entries.findIndex(
    (entry) => entry.semanticKey === source.semanticKey,
  );
  if (semanticIndex >= 0) {
    entries ??= [...previous.entries];
    entries[semanticIndex] = source;
    queuedKeys.add(source.key);
    continue;
  }
}
```

Keep key dedupe after this branch. Restrict signature suppression to legacy fallback:

```ts
if (
  sourceKind !== "serverTimeline" &&
  source.mode === "resolved" &&
  suppressedResolvedSignatures !== undefined &&
  sourceSignaturesConsumed(suppressedResolvedSignatures, source)
) {
  releaseSpotlightSourceExactSignatures(suppressedResolvedSignatures, source);
  continue;
}
```

- [ ] **Step 5: Change fast-forward behavior**

In `advanceSpotlightPlayback`, replace the `catchUp` branch with:

```ts
if (command === "catchUp") {
  const pendingIndex = state.entries.findIndex(
    (entry) => entry.status === "pending",
  );
  return {
    ...state,
    cursorIndex: pendingIndex >= 0 ? pendingIndex : undefined,
    paused: false,
    fastForwarded: true,
  };
}
```

In the `rewind` branch, keep existing history and make `cursorIndex === undefined` rewind to `presentIndex`:

```ts
cursorIndex:
  cursorIndex === undefined ? presentIndex : Math.max(0, cursorIndex - 1),
paused: true,
fastForwarded: false,
```

When `play`, `stepForward`, or `autoAdvance` returns a visible cursor, set `fastForwarded: false`.

- [ ] **Step 6: Run playback tests**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected: PASS after updating existing test expectations that previously expected fast-forward to show latest resolved history.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight.test.ts
git commit -m "Normalize spotlight playback cursor state"
```

---

### Task 4: Reset Display Dwell on Cursor Entry and Pin by Structured Pending Id

**Files:**

- Modify: `packages/client/src/react/use-effect-spotlight-display.ts`
- Modify: `packages/client/src/react/use-effect-spotlight.ts`
- Test: `packages/client/src/react/use-effect-spotlight.test.ts`

- [ ] **Step 1: Add failing display session tests**

Add these tests to `packages/client/src/react/use-effect-spotlight.test.ts`:

```ts
it("starts a fresh dwell when rewinding to an entry that was displayed before", () => {
  const previous: EffectSpotlightState = {
    active: source("event:first", "span:first").active,
    activeKey: "event:first",
    activeMode: "resolved",
    sourceInstanceId: "source-1",
    activeSpanIds: ["span:first"],
    shownAtMs: 1_000,
    visibleUntilMs: 3_000,
    pinned: false,
  };

  const display = effectSpotlightDisplayForEntry({
    nowMs: 10_000,
    previous,
    minimumDwellMs: 2_000,
    graceMs: 800,
    entry: source("event:first", "span:first"),
    pendingDecisionId: undefined,
    cursorVersion: 2,
    previousCursorVersion: 1,
  });

  expect(display?.shownAtMs).toBe(10_000);
  expect(display?.visibleUntilMs).toBe(12_000);
});

it("pins live entries by structured pending decision id instead of key text", () => {
  const display = effectSpotlightDisplayForEntry({
    nowMs: 1_000,
    previous: undefined,
    minimumDwellMs: 2_000,
    graceMs: 800,
    entry: {
      ...source("not-a-decision-prefix", "span:pending", "live"),
      pendingDecisionId: "decision-1" as DecisionId,
      status: "pending",
    },
    pendingDecisionId: "decision-1",
    cursorVersion: 1,
    previousCursorVersion: undefined,
  });

  expect(display?.pinned).toBe(true);
});
```

- [ ] **Step 2: Run the display tests and verify they fail**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected: FAIL because `effectSpotlightDisplayForEntry` does not accept cursor versions and still parses pending identity from key text.

- [ ] **Step 3: Extend display input with cursor version**

In `packages/client/src/react/use-effect-spotlight-display.ts`, add fields:

```ts
readonly cursorVersion?: number | undefined;
readonly previousCursorVersion?: number | undefined;
```

to `EffectSpotlightDisplayInput`.

Update `sameActivePresentation` checks so the previous display is reused only when the cursor version did not change:

```ts
const sameCursorEntry =
  cursorVersion === undefined ||
  previousCursorVersion === undefined ||
  cursorVersion === previousCursorVersion;
```

Pass `previous: sameCursorEntry ? previous : undefined` into `effectSpotlightModel`.

- [ ] **Step 4: Pin by structured pending decision id**

Replace `liveEntryMatchesPendingDecision` with:

```ts
const liveEntryMatchesPendingDecision = (
  entry: EffectSpotlightPlaybackEntry,
  pendingDecisionId: DecisionId | string | undefined,
): boolean =>
  pendingDecisionId !== undefined &&
  entry.mode === "live" &&
  entry.pendingDecisionId === pendingDecisionId;
```

- [ ] **Step 5: Track cursor version in `useEffectSpotlight`**

In `packages/client/src/react/use-effect-spotlight.ts`, add:

```ts
const [cursorVersion, setCursorVersion] = useState(0);
const previousCursorKey = useRef<string | undefined>();
```

After `currentSource` is computed, add an effect:

```ts
useEffect(() => {
  const nextKey = currentSource?.id ?? currentSource?.key;
  if (previousCursorKey.current !== nextKey) {
    previousCursorKey.current = nextKey;
    setCursorVersion((value) => value + 1);
  }
}, [currentSource]);
```

Pass `cursorVersion` into `effectSpotlightDisplayForEntry`.

- [ ] **Step 6: Run display/playback tests**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/react/use-effect-spotlight-display.ts packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight.test.ts
git commit -m "Reset spotlight dwell on cursor entry"
```

---

### Task 5: Wire Server Timeline Mode Through MatchApp

**Files:**

- Modify: `packages/client/src/react/use-effect-spotlight.ts`
- Modify: `packages/client/src/react/MatchApp.tsx`
- Modify: `packages/client/src/react/effect-spotlight-source.ts`
- Test: `packages/client/src/react/playmat-structure.test.ts`
- Test: `packages/client/src/react/effect-spotlight-source.test.ts`

- [ ] **Step 1: Add failing structure test**

Update `packages/client/src/react/playmat-structure.test.ts` with:

```ts
expect(source).toMatch(
  /sourceKind: effectSpotlightHistory === undefined\s+\? "legacyFallback"\s+:\s+"serverTimeline"/u,
);
```

Keep the existing assertions for `effectSpotlightHistory` and `initialCursorKey`.

- [ ] **Step 2: Run structure test and verify it fails**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/playmat-structure.test.ts
```

Expected: FAIL because `sourceKind` is not wired.

- [ ] **Step 3: Add `sourceKind` to the hook input**

In `packages/client/src/react/use-effect-spotlight.ts`, add to `UseEffectSpotlightInput`:

```ts
readonly sourceKind?: EffectSpotlightSourceKind | undefined;
```

Import/export `EffectSpotlightSourceKind` from playback:

```ts
type EffectSpotlightSourceKind,
```

Pass it into `appendSpotlightPlaybackSources`:

```ts
sourceKind,
```

- [ ] **Step 4: Wire server timeline mode from MatchApp**

In `packages/client/src/react/MatchApp.tsx`, add this prop to `useEffectSpotlight`:

```ts
sourceKind:
  effectSpotlightHistory === undefined
    ? "legacyFallback"
    : "serverTimeline",
```

- [ ] **Step 5: Make legacy fallback entries conform to the structured input type**

In `packages/client/src/react/effect-spotlight-source.ts`, add `EffectSpotlightHistoryEntry` to the type imports and replace the local interface:

```ts
import type {
  ActiveEffectTextPresentation,
  CardId,
  EffectSpotlightHistoryEntry,
  EngineEvent,
  InstanceId,
  PlayerView,
  PlayerId,
} from "@optcg/types";

export type EffectSpotlightActiveSource = EffectSpotlightHistoryEntry;
```

In `packages/client/src/react/effect-spotlight-source.ts`, add this helper near `liveKey`:

```ts
const semanticKeyForActive = (active: ActiveEffectTextPresentation): string =>
  [
    String(active.source.playerId),
    String(active.source.instanceId),
    String(active.source.cardId),
    active.textKind ?? "effect",
    active.activeSpanIds.join("\n"),
  ].join("|");

const structuredFallbackSource = ({
  active,
  key,
  mode,
}: {
  readonly active: ActiveEffectTextPresentation;
  readonly key: string;
  readonly mode: "live" | "resolved";
}): EffectSpotlightActiveSource => ({
  active,
  id: key,
  key,
  semanticKey: semanticKeyForActive(active),
  mode,
  status: mode === "live" ? "pending" : "resolved",
});
```

Change each object literal returned by `playedCardPresentation`, `resolvedSpotlightSourcesForEvent`, and `activeEffectTextSourceForSpotlight` to call `structuredFallbackSource(...)` instead of returning only `{ active, key, mode }`.

- [ ] **Step 6: Keep fallback tests focused on fallback only**

In `packages/client/src/react/effect-spotlight-source.test.ts`, update describe labels from generic spotlight source behavior to fallback behavior:

```ts
describe("legacy activeEffectTextForSpotlight fallback", () => {
```

Do not change fallback production behavior in this task beyond structured type compatibility.

- [ ] **Step 7: Run client bridge tests**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/playmat-structure.test.ts packages/client/src/react/effect-spotlight-source.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/react/MatchApp.tsx packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/effect-spotlight-source.ts packages/client/src/react/effect-spotlight-source.test.ts packages/client/src/react/playmat-structure.test.ts
git commit -m "Use server timeline mode for spotlight playback"
```

---

### Task 6: Add Searcher End-to-End Spotlight Regression Tests

**Files:**

- Modify: `packages/engine-core/src/view/effect-spotlight-history.test.ts`
- Modify: `packages/client/src/react/use-effect-spotlight.test.ts`

- [ ] **Step 1: Add search lifecycle server test**

Add a test to `packages/engine-core/src/view/effect-spotlight-history.test.ts`:

```ts
it("projects search selection resolved plus search remainder pending in order", () => {
  const event = resolvedSearchEvent("event:search", [
    "span:search:selection",
    "span:search:remaining",
  ]);

  const history = effectSpotlightHistoryFromPlayerViewState({
    activeEffectText: {
      source,
      textKind: "effect",
      activeSpanIds: ["span:search:remaining"],
    },
    events: [event],
    pendingDecisionId: "decision:orderCards:search",
  });

  expect(history?.entries.map((entry) => entry.active.activeSpanIds)).toEqual([
    ["span:search:selection"],
    ["span:search:remaining"],
  ]);
  expect(history?.entries.map((entry) => entry.status)).toEqual([
    "resolved",
    "pending",
  ]);
  expect(history?.presentKey).toBe(history?.entries.at(-1)?.key);
});
```

- [ ] **Step 2: Add client search lifecycle playback test**

Add a test to `packages/client/src/react/use-effect-spotlight.test.ts`:

```ts
it("keeps search selection for dwell, then advances to pending remainder", () => {
  const liveSelection = {
    ...source(
      "decision:select|source-1||span:search:selection",
      "span:search:selection",
      "live",
    ),
    id: "pending:decision:select:p1|source-1|OP00-001|effect|span:search:selection",
    semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
    pendingDecisionId: "decision:select" as DecisionId,
  };
  const resolvedSelection = {
    ...source("event:search:span:search:selection", "span:search:selection"),
    id: "resolved:event:search:span:search:selection",
    semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
  };
  const liveRemainder = {
    ...source(
      "decision:order|source-1||span:search:remaining",
      "span:search:remaining",
      "live",
    ),
    id: "pending:decision:order:p1|source-1|OP00-001|effect|span:search:remaining",
    semanticKey: "p1|source-1|OP00-001|effect|span:search:remaining",
    pendingDecisionId: "decision:order" as DecisionId,
  };

  const playback = appendSpotlightPlaybackSources({
    consumedKeys: new Set<string>(),
    previous: {
      entries: [liveSelection],
      cursorIndex: 0,
      paused: false,
      fastForwarded: false,
    },
    sources: [resolvedSelection, liveRemainder],
    sourceKind: "serverTimeline",
  });
  const selectionDisplay = effectSpotlightModelForPlayback({
    nowMs: 1_000,
    previous: undefined,
    minimumDwellMs: 2_000,
    graceMs: 800,
    playback,
    fallbackMode: "live",
    pendingDecisionId: "decision:order",
  });
  const advancedPlayback = advanceSpotlightPlayback({
    command: "autoAdvance",
    state: playback,
  });
  const remainderDisplay = effectSpotlightModelForPlayback({
    nowMs: 3_000,
    previous: selectionDisplay,
    minimumDwellMs: 2_000,
    graceMs: 800,
    playback: advancedPlayback,
    fallbackMode: "live",
    pendingDecisionId: "decision:order",
  });

  expect(playback.entries.map((entry) => entry.key)).toEqual([
    "event:search:span:search:selection",
    "decision:order|source-1||span:search:remaining",
  ]);
  expect(selectionDisplay?.activeSpanIds).toEqual(["span:search:selection"]);
  expect(selectionDisplay?.pinned).toBe(false);
  expect(advancedPlayback.cursorIndex).toBe(1);
  expect(remainderDisplay?.activeSpanIds).toEqual(["span:search:remaining"]);
  expect(remainderDisplay?.pinned).toBe(true);
});
```

- [ ] **Step 3: Run search regression tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/view/effect-spotlight-history.test.ts packages/client/src/react/use-effect-spotlight.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine-core/src/view/effect-spotlight-history.test.ts packages/client/src/react/use-effect-spotlight.test.ts
git commit -m "Cover normalized search spotlight playback"
```

---

### Task 7: Final Verification

**Files:**

- No production edits expected.

- [ ] **Step 1: Run focused test suites**

Run:

```bash
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts packages/types/src/view.test.ts packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/effect-spotlight-source.test.ts packages/client/src/react/playmat-structure.test.ts packages/client/src/react/effect-spotlight.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run package typecheck**

Run:

```bash
corepack pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: worktree clean, with commits for structured type, server timeline, client playback, display dwell, bridge wiring, and search regression coverage.

- [ ] **Step 4: Commit verification-only changes if needed**

If verification required only formatting/test expectation updates, commit them:

```bash
git add <changed-files>
git commit -m "Stabilize spotlight playback verification"
```

If no files changed, do not create an empty commit.
