# Spotlight Playback Display Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the client effect spotlight so playback history/cursor state is independent from visual display/timer/pending-decision freeze state. Pending decisions must not interrupt a player who is reviewing past entries; fast-forward must jump to the latest entry, which can be a pending decision; and the spotlight must eventually show nothing when normal playback reaches the present and the latest item has finished.

**Architecture:** Keep `useEffectSpotlight` as the public React hook and split its internals into a playback helper module and a display helper module. Playback owns server/live source ingestion, dedupe, cursor, pause/play, rewind, step-forward, auto-advance, and fast-forward semantics. Display owns the currently rendered card/effect text, dwell timing, and live pending-decision pinning. The hook composes both layers and preserves existing component props.

**Tech Stack:** TypeScript, React hooks, Vitest, ESLint, pnpm workspace.

---

## File Structure

```
packages/client/src/react/use-effect-spotlight.ts
packages/client/src/react/use-effect-spotlight-playback.ts
packages/client/src/react/use-effect-spotlight-display.ts
packages/client/src/react/use-effect-spotlight.test.ts
```

`use-effect-spotlight.ts` remains the public API surface. Re-export helper functions/types currently imported by tests so existing imports stay stable.

---

## Public Behavior Contract

- The controls stay visible whenever the hook is mounted with `controls`, including when the current cursor is hidden.
- `rewind` moves from hidden present state to the newest history entry.
- `pause` freezes the cursor where it currently is.
- `play` resumes normal timing from the cursor.
- `stepForward` moves one entry toward present and is disabled/hidden when already at present.
- `catchUp` is the UI fast-forward action and jumps to the newest known entry instead of clearing local playback state.
- A live pending-decision entry pins only when the playback cursor reaches that entry through normal timing or `catchUp`.
- A live pending-decision entry appended while the player is viewing older history must not change the current cursor or display.
- Resolved entries still dwell for `minimumDwellMs`, then advance. When the cursor advances beyond the newest resolved entry, the spotlight hides.
- Server history remains the source of durable history. Local playback commands must never delete `entries`.

---

## Task 1: Add Playback Layer Tests

- [ ] Edit `packages/client/src/react/use-effect-spotlight.test.ts`.
- [ ] Add these tests in the existing `describe("advanceSpotlightPlayback", ...)` block.

```ts
it("fast-forwards to the latest pending decision entry", () => {
  const playback: EffectSpotlightPlaybackState = {
    entries: [
      playbackEntry({ mode: "resolved", key: "server:1", timestamp: 100 }),
      playbackEntry({ mode: "live", key: "live:2", timestamp: 200 }),
    ],
    cursorIndex: 0,
    paused: true,
  };

  const next = advanceSpotlightPlayback(playback, "catchUp");

  expect(next.cursorIndex).toBe(1);
  expect(next.paused).toBe(false);
  expect(next.entries).toHaveLength(2);
});

it("does not interrupt past review when a live pending decision is appended", () => {
  const initial = appendSpotlightPlaybackSources(
    { entries: [], cursorIndex: undefined, paused: false },
    [
      playbackSource({ mode: "resolved", key: "server:1", timestamp: 100 }),
      playbackSource({ mode: "resolved", key: "server:2", timestamp: 200 }),
    ],
  );
  const reviewingPast = { ...initial, cursorIndex: 0, paused: true };

  const next = appendSpotlightPlaybackSources(reviewingPast, [
    playbackSource({ mode: "live", key: "live:3", timestamp: 300 }),
  ]);

  expect(next.cursorIndex).toBe(0);
  expect(next.paused).toBe(true);
  expect(next.entries.map((entry) => entry.key)).toEqual([
    "server:1",
    "server:2",
    "live:3",
  ]);
});
```

- [ ] Add this test in the existing hook `describe("useEffectSpotlight", ...)` block.

```ts
it("keeps showing a reviewed past entry when a pending decision arrives", () => {
  const { result, rerender } = renderHook(
    ({ sources, activeEffectText }) =>
      useEffectSpotlight({
        player,
        sources,
        activeEffectText,
        matchingCardsByInstanceId,
        minimumDwellMs: 1000,
        controls: true,
      }),
    {
      initialProps: {
        sources: [
          playbackSource({ mode: "resolved", key: "server:1", timestamp: 100 }),
          playbackSource({ mode: "resolved", key: "server:2", timestamp: 200 }),
        ],
        activeEffectText: undefined as string | undefined,
      },
    },
  );

  act(() => result.current.controls?.rewind());
  act(() => result.current.controls?.rewind());
  act(() => result.current.controls?.pause());

  rerender({
    sources: [
      playbackSource({ mode: "resolved", key: "server:1", timestamp: 100 }),
      playbackSource({ mode: "resolved", key: "server:2", timestamp: 200 }),
      playbackSource({ mode: "live", key: "live:3", timestamp: 300 }),
    ],
    activeEffectText: "Choose one character.",
  });

  expect(result.current.card?.instanceId).toBe("instance-1");
  expect(result.current.activeEffectText).toBe("Effect 1");
  expect(result.current.controls?.canStepForward).toBe(true);
});
```

- [ ] Run the focused test and confirm the new fast-forward assertion fails before implementation.

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected result: the new `fast-forwards to the latest pending decision entry` test fails because current `catchUp` hides the cursor instead of jumping to the latest entry.

---

## Task 2: Extract And Fix Playback Layer

- [ ] Create `packages/client/src/react/use-effect-spotlight-playback.ts`.
- [ ] Move playback-only types and helpers from `use-effect-spotlight.ts` into the new file:
  - `EffectSpotlightSourceMode`
  - `EffectSpotlightSource`
  - `EffectSpotlightPlaybackEntry`
  - `EffectSpotlightPlaybackState`
  - `EffectSpotlightPlaybackCommand`
  - `appendSpotlightPlaybackSources`
  - `advanceSpotlightPlayback`
  - `consumeSpotlightSourceSignatures`
  - `consumeResolvedSpotlightSourceKeys`
  - `queuedResolvedSpotlightSources`
  - source signature helpers used only by playback
- [ ] Add this exported helper in `use-effect-spotlight-playback.ts`.

```ts
export const currentSpotlightPlaybackEntry = (
  playback: EffectSpotlightPlaybackState,
): EffectSpotlightPlaybackEntry | undefined => {
  if (playback.cursorIndex === undefined) {
    return undefined;
  }

  return playback.entries[playback.cursorIndex];
};
```

- [ ] Implement `advanceSpotlightPlayback` with these command semantics.

```ts
export const advanceSpotlightPlayback = (
  state: EffectSpotlightPlaybackState,
  command: EffectSpotlightPlaybackCommand,
): EffectSpotlightPlaybackState => {
  if (command === "pause") {
    return { ...state, paused: true };
  }

  if (command === "play") {
    return { ...state, paused: false };
  }

  if (command === "catchUp") {
    return {
      ...state,
      cursorIndex:
        state.entries.length === 0 ? undefined : state.entries.length - 1,
      paused: false,
    };
  }

  if (command === "rewind") {
    const currentIndex = state.cursorIndex ?? state.entries.length;
    const cursorIndex = Math.max(0, currentIndex - 1);

    return {
      ...state,
      cursorIndex: state.entries.length === 0 ? undefined : cursorIndex,
    };
  }

  if (command === "stepForward" || command === "autoAdvance") {
    if (state.cursorIndex === undefined) {
      return state;
    }

    const nextIndex = state.cursorIndex + 1;
    return {
      ...state,
      cursorIndex: nextIndex >= state.entries.length ? undefined : nextIndex,
    };
  }

  return state;
};
```

- [ ] Preserve append behavior that does not move a defined cursor.

```ts
const nextCursorIndex =
  state.cursorIndex === undefined &&
  state.entries.length === 0 &&
  nextEntries.length > 0
    ? 0
    : state.cursorIndex;
```

- [ ] Update `packages/client/src/react/use-effect-spotlight.ts` to import playback helpers from the new file and re-export the moved public test helpers.

```ts
export type {
  EffectSpotlightPlaybackCommand,
  EffectSpotlightPlaybackEntry,
  EffectSpotlightPlaybackState,
  EffectSpotlightSource,
  EffectSpotlightSourceMode,
} from "./use-effect-spotlight-playback.js";
export {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  consumeResolvedSpotlightSourceKeys,
  consumeSpotlightSourceSignatures,
  currentSpotlightPlaybackEntry,
  queuedResolvedSpotlightSources,
} from "./use-effect-spotlight-playback.js";
```

- [ ] Run the focused test.

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected result: playback tests pass or only display/hook tests added later remain absent.

- [ ] Commit this slice.

```powershell
git status --short
git add packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/use-effect-spotlight.test.ts
git commit -m "Split spotlight playback state"
```

---

## Task 3: Add Display Layer Tests

- [ ] Edit `packages/client/src/react/use-effect-spotlight.test.ts`.
- [ ] Import the new display helper from `use-effect-spotlight.ts` after it is re-exported in Task 4.

```ts
import {
  effectSpotlightDisplayForEntry,
  type EffectSpotlightState,
} from "./use-effect-spotlight.js";
```

- [ ] Add this describe block near the existing display model tests.

```ts
describe("effectSpotlightDisplayForEntry", () => {
  it("hides immediately when there is no playback cursor entry", () => {
    const previous: EffectSpotlightState = {
      activeEffectText: "Effect 1",
      card: matchingCardsByInstanceId.get("instance-1"),
      shownAtMs: 1000,
      visibleUntilMs: 3000,
      pinned: false,
    };

    expect(
      effectSpotlightDisplayForEntry({
        entry: undefined,
        nowMs: 1500,
        previous,
        minimumDwellMs: 1000,
        activeEffectText: undefined,
      }),
    ).toBeUndefined();
  });

  it("pins a live cursor entry while an active pending decision exists", () => {
    const entry = playbackEntry({
      mode: "live",
      key: "live:1",
      timestamp: 100,
    });

    const next = effectSpotlightDisplayForEntry({
      entry,
      nowMs: 2000,
      previous: undefined,
      minimumDwellMs: 1000,
      activeEffectText: "Choose one character.",
    });

    expect(next?.activeEffectText).toBe("Choose one character.");
    expect(next?.card?.instanceId).toBe("instance-1");
    expect(next?.pinned).toBe(true);
    expect(next?.visibleUntilMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("uses resolved entry text and dwell timing without pinning", () => {
    const entry = playbackEntry({
      mode: "resolved",
      key: "server:1",
      timestamp: 100,
    });

    const next = effectSpotlightDisplayForEntry({
      entry,
      nowMs: 2000,
      previous: undefined,
      minimumDwellMs: 1000,
      activeEffectText: "Choose one character.",
    });

    expect(next?.activeEffectText).toBe("Effect 1");
    expect(next?.pinned).toBe(false);
    expect(next?.visibleUntilMs).toBe(3000);
  });
});
```

- [ ] Run the focused test and confirm it fails because the helper does not exist yet.

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected result: TypeScript/Vitest fails on missing `effectSpotlightDisplayForEntry`.

---

## Task 4: Extract Display Layer And Rewire Hook

- [ ] Create `packages/client/src/react/use-effect-spotlight-display.ts`.
- [ ] Move `EffectSpotlightState` into the new file.
- [ ] Add this display input type and helper.

```ts
import type { EffectSpotlightPlaybackEntry } from "./use-effect-spotlight-playback.js";

export interface EffectSpotlightState {
  readonly activeEffectText: string;
  readonly card: PlayerCardView | undefined;
  readonly shownAtMs: number;
  readonly visibleUntilMs: number;
  readonly pinned: boolean;
}

interface EffectSpotlightDisplayInput {
  readonly entry: EffectSpotlightPlaybackEntry | undefined;
  readonly nowMs: number;
  readonly previous: EffectSpotlightState | undefined;
  readonly minimumDwellMs: number;
  readonly activeEffectText: string | undefined;
}

export const effectSpotlightDisplayForEntry = ({
  entry,
  nowMs,
  previous,
  minimumDwellMs,
  activeEffectText,
}: EffectSpotlightDisplayInput): EffectSpotlightState | undefined => {
  if (entry === undefined) {
    return undefined;
  }

  const text = entry.mode === "live" ? activeEffectText : entry.effectText;
  if (text === undefined || text.length === 0) {
    return undefined;
  }

  const sameEntry =
    previous?.card?.instanceId === entry.card.instanceId &&
    previous.activeEffectText === text;
  const shownAtMs = sameEntry ? previous.shownAtMs : nowMs;
  const pinned = entry.mode === "live" && activeEffectText !== undefined;

  return {
    activeEffectText: text,
    card: entry.card,
    shownAtMs,
    visibleUntilMs: pinned
      ? Number.POSITIVE_INFINITY
      : shownAtMs + minimumDwellMs,
    pinned,
  };
};
```

- [ ] Preserve the current public `effectSpotlightModel` export as a compatibility wrapper for older tests and callers.

```ts
export const effectSpotlightModel = ({
  active,
  nowMs,
  previous,
  minimumDwellMs,
}: {
  readonly active:
    | Pick<EffectSpotlightState, "activeEffectText" | "card">
    | undefined;
  readonly nowMs: number;
  readonly previous: EffectSpotlightState | undefined;
  readonly minimumDwellMs: number;
}): EffectSpotlightState | undefined => {
  if (active === undefined) {
    return previous !== undefined && nowMs < previous.visibleUntilMs
      ? previous
      : undefined;
  }

  const sameEntry =
    previous?.card?.instanceId === active.card?.instanceId &&
    previous.activeEffectText === active.activeEffectText;
  const shownAtMs = sameEntry ? previous.shownAtMs : nowMs;

  return {
    ...active,
    shownAtMs,
    visibleUntilMs: shownAtMs + minimumDwellMs,
    pinned: false,
  };
};
```

- [ ] Update `packages/client/src/react/use-effect-spotlight.ts` imports to use both helper modules.

```ts
import {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  consumeResolvedSpotlightSourceKeys,
  consumeSpotlightSourceSignatures,
  currentSpotlightPlaybackEntry,
  queuedResolvedSpotlightSources,
  type EffectSpotlightPlaybackCommand,
  type EffectSpotlightPlaybackState,
  type EffectSpotlightSource,
} from "./use-effect-spotlight-playback.js";
import {
  effectSpotlightDisplayForEntry,
  effectSpotlightModel,
  type EffectSpotlightState,
} from "./use-effect-spotlight-display.js";
```

- [ ] In `useEffectSpotlight`, replace the current active/live/resolved model construction with a single current-entry display calculation.

```ts
const currentEntry = currentSpotlightPlaybackEntry(playback);

useEffect(() => {
  const nowMs = Date.now();
  setModel((previous) =>
    effectSpotlightDisplayForEntry({
      entry: currentEntry,
      nowMs,
      previous,
      minimumDwellMs,
      activeEffectText,
    }),
  );
}, [activeEffectText, currentEntry, minimumDwellMs]);
```

- [ ] Keep live source signature consumption tied to actually displaying a live cursor entry.

```ts
useEffect(() => {
  if (currentEntry?.mode !== "live") {
    return;
  }

  consumedLiveSignaturesRef.current = consumeSpotlightSourceSignatures(
    consumedLiveSignaturesRef.current,
    [currentEntry.source],
  );
}, [currentEntry]);
```

- [ ] Replace the auto-advance timer effect with this behavior.

```ts
useEffect(() => {
  if (
    model === undefined ||
    currentEntry === undefined ||
    playback.paused ||
    model.pinned
  ) {
    return;
  }

  const remainingMs = Math.max(0, model.visibleUntilMs - Date.now());
  const timer = window.setTimeout(() => {
    if (currentEntry.mode === "resolved") {
      consumedResolvedSourceKeysRef.current =
        consumeResolvedSpotlightSourceKeys(
          consumedResolvedSourceKeysRef.current,
          [currentEntry.source],
        );
    }

    setPlayback((previous) =>
      advanceSpotlightPlayback(previous, "autoAdvance"),
    );
  }, remainingMs);

  return () => window.clearTimeout(timer);
}, [currentEntry, model, playback.paused]);
```

- [ ] Update `catchUp` control to jump to latest without clearing playback entries.

```ts
const catchUp = useCallback(() => {
  setPlayback((previous) => advanceSpotlightPlayback(previous, "catchUp"));
}, []);
```

- [ ] Continue returning stable control shape.

```ts
const controls = useMemo<EffectSpotlightControls | undefined>(() => {
  if (!showControls) {
    return undefined;
  }

  const canRewind = playback.entries.length > 0;
  const canStepForward =
    playback.cursorIndex !== undefined &&
    playback.cursorIndex < playback.entries.length - 1;
  const canCatchUp =
    playback.cursorIndex !== undefined &&
    playback.cursorIndex < playback.entries.length - 1;

  return {
    canRewind,
    canStepForward,
    canCatchUp,
    paused: playback.paused,
    rewind,
    pause,
    play,
    stepForward,
    catchUp,
  };
}, [catchUp, pause, play, playback, rewind, showControls, stepForward]);
```

- [ ] Re-export display helpers from `use-effect-spotlight.ts`.

```ts
export type { EffectSpotlightState } from "./use-effect-spotlight-display.js";
export {
  effectSpotlightDisplayForEntry,
  effectSpotlightModel,
} from "./use-effect-spotlight-display.js";
```

- [ ] Run the focused test.

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected result: all spotlight hook/model tests pass.

- [ ] Commit this slice.

```powershell
git status --short
git add packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight-display.ts packages/client/src/react/use-effect-spotlight.test.ts
git commit -m "Split spotlight display timing"
```

---

## Task 5: Add Regression Tests For Normal Playback And Fast-Forward To Pending

- [ ] Add these tests to the hook `describe("useEffectSpotlight", ...)` block.

```ts
it("fast-forward displays the latest pending decision instead of hiding", () => {
  const { result } = renderHook(() =>
    useEffectSpotlight({
      player,
      sources: [
        playbackSource({ mode: "resolved", key: "server:1", timestamp: 100 }),
        playbackSource({ mode: "live", key: "live:2", timestamp: 200 }),
      ],
      activeEffectText: "Choose one character.",
      matchingCardsByInstanceId,
      minimumDwellMs: 1000,
      controls: true,
    }),
  );

  act(() => result.current.controls?.pause());
  act(() => result.current.controls?.rewind());
  act(() => result.current.controls?.catchUp());

  expect(result.current.card?.instanceId).toBe("instance-1");
  expect(result.current.activeEffectText).toBe("Choose one character.");
  expect(result.current.controls?.canCatchUp).toBe(false);
});

it("hides after normal playback reaches the newest resolved entry", () => {
  vi.useFakeTimers();
  try {
    const { result } = renderHook(() =>
      useEffectSpotlight({
        player,
        sources: [
          playbackSource({ mode: "resolved", key: "server:1", timestamp: 100 }),
          playbackSource({ mode: "resolved", key: "server:2", timestamp: 200 }),
        ],
        activeEffectText: undefined,
        matchingCardsByInstanceId,
        minimumDwellMs: 1000,
        controls: true,
      }),
    );

    expect(result.current.activeEffectText).toBe("Effect 1");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.activeEffectText).toBe("Effect 2");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.activeEffectText).toBeUndefined();
    expect(result.current.controls).toBeDefined();
  } finally {
    vi.useRealTimers();
  }
});

it("does not auto-advance a live pending decision until it is resolved", () => {
  vi.useFakeTimers();
  try {
    const { result, rerender } = renderHook(
      ({ sources, activeEffectText }) =>
        useEffectSpotlight({
          player,
          sources,
          activeEffectText,
          matchingCardsByInstanceId,
          minimumDwellMs: 1000,
          controls: true,
        }),
      {
        initialProps: {
          sources: [
            playbackSource({ mode: "live", key: "live:1", timestamp: 100 }),
          ],
          activeEffectText: "Choose one character." as string | undefined,
        },
      },
    );

    expect(result.current.activeEffectText).toBe("Choose one character.");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.activeEffectText).toBe("Choose one character.");

    rerender({
      sources: [
        playbackSource({ mode: "resolved", key: "server:1", timestamp: 200 }),
      ],
      activeEffectText: undefined,
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.activeEffectText).toBeUndefined();
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] Run the focused test.

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts
```

Expected result: all spotlight regression tests pass.

- [ ] Commit this slice.

```powershell
git status --short
git add packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/use-effect-spotlight-display.ts packages/client/src/react/use-effect-spotlight.test.ts
git commit -m "Fix spotlight playback pending behavior"
```

---

## Task 6: Focused Verification

- [ ] Run the spotlight and related client tests.

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/effect-spotlight-source.test.ts packages/client/src/react/effect-spotlight.test.ts packages/client/src/react/playmat-structure.test.ts
```

Expected result: all listed test files pass.

- [ ] Run TypeScript for the client package.

```powershell
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected result: no type errors.

- [ ] Run ESLint on changed spotlight files.

```powershell
corepack pnpm exec eslint packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/use-effect-spotlight-display.ts packages/client/src/react/use-effect-spotlight.test.ts --max-warnings=0
```

Expected result: no lint errors or warnings.

- [ ] Inspect changed files.

```powershell
git diff --stat HEAD
git diff -- packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/use-effect-spotlight-display.ts packages/client/src/react/use-effect-spotlight.test.ts
```

Expected result: changes are limited to the spotlight hook/helpers/tests.

- [ ] Commit any verification-only cleanup if needed. Do not create an empty commit.

```powershell
git status --short
git add packages/client/src/react/use-effect-spotlight.ts packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/use-effect-spotlight-display.ts packages/client/src/react/use-effect-spotlight.test.ts
git commit -m "Verify spotlight playback split"
```

---

## Task 7: Final Response Checklist

- [ ] Report the commits created during execution.
- [ ] Report the verification commands and their outcomes.
- [ ] Mention that fast-forward now jumps to the latest entry, pending decisions only pin when reached, and normal playback hides after the latest resolved entry finishes.
- [ ] Mention any command that could not be run and why.
