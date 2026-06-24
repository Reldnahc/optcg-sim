# Replay Viewer Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/replays/:matchId` open as a simulator-looking replay player with reconstructed frames, step controls, scrub, and play/pause.

**Architecture:** The match server owns replay reconstruction because the client package must not import `@optcg/engine-core`. Replay APIs return read-only frame snapshots that the client feeds into the existing `MatchApp` board. Saved action snapshots remain a compatibility source, but new completed matches must persist enough initial/final engine state for deterministic reconstruction and drift verification.

**Tech Stack:** TypeScript, React, Vitest, `@optcg/engine-core`, existing match-server replay repository/API, existing client `MatchApp`.

---

## File Structure

- Modify `packages/match-server/src/local-completed-match-record.ts`: persist reconstructable replay state for new completed matches.
- Modify `packages/match-server/src/local-completed-match-record.test.ts`: replace the compact-only expectation with reconstructable replay payload assertions.
- Create `packages/match-server/src/replay-frame-reconstruction.ts`: convert a `CompletedMatchReplayDetail` artifact into API frame records using saved snapshots first, and fail closed when reconstruction data is unavailable.
- Create `packages/match-server/src/replay-frame-reconstruction.test.ts`: prove frames are generated, saved snapshots are not treated as the only successful artifact shape, and missing data reports a clear failure.
- Modify `packages/match-server/src/replay-route.ts`: expose frame data in `GET /api/replays/:matchId`.
- Modify `packages/match-server/src/match-http-server-replay.test.ts`: assert replay detail responses include frames or reconstruction failure metadata.
- Modify `packages/client/src/replay-client.ts`: add replay frame and failure types to the replay detail contract.
- Modify `packages/client/src/replay-client.test.ts`: assert frame fields are read from the replay detail response.
- Modify `packages/client/src/react/replay-match-client.ts`: build `ReplayFrame[]` from server-provided frames first, with legacy saved snapshot extraction as compatibility.
- Modify `packages/client/src/react/replay-match-client.test.ts`: cover server-provided frame conversion and reconstruction failure.
- Modify `packages/client/src/react/ReplayViewerPage.tsx`: make the successful path always use `MatchApp`, add transport controls with play/pause/scrub/speed, and reserve metadata/raw entry rendering for failure.
- Modify `packages/client/src/react/ReplayViewerPage.test.ts`: cover successful simulator-surface rendering and failure-only fallback.
- Modify CSS in the existing client stylesheet that already owns `.replay-match-controls` and `.replay-viewer-*` styles.

---

### Task 1: Persist Reconstructable Replay State

**Files:**

- Modify: `packages/match-server/src/local-completed-match-record.ts`
- Modify: `packages/match-server/src/local-completed-match-record.test.ts`

- [ ] **Step 1: Write the failing persistence test**

In `packages/match-server/src/local-completed-match-record.test.ts`, rename the first test and change the replay assertions to require initial and final state:

```ts
test("stores reconstructable replay state for completed matches", async () => {
  const setup = await createPremadeDevMatchSetup({
    matchId: "22222222-2222-2222-2222-222222222222" as MatchId,
    fetchCard: createDefaultDevFixtureFetch(),
  });
  const match = createLocalDevMatch(setup);
  match.state.status = { type: "completed", winner: setup.playerOrder[0] };

  const record = buildLocalCompletedMatchRecord({
    match,
    setup,
    seats: {
      [setup.playerOrder[0]]: {
        playerId: setup.playerOrder[0],
        deckSubmission: readySubmission("first-hash", "OP01-001"),
      },
      [setup.playerOrder[1]]: {
        playerId: setup.playerOrder[1],
        deckSubmission: readySubmission("second-hash", "OP05-060"),
      },
    },
    firstPlayerChoice: {
      source: "game-one-random-chooser",
      chooserPlayerId: setup.playerOrder[0],
      choice: "goFirst",
      resolvedFirstPlayerId: setup.playerOrder[0],
    },
    records: [],
    endedAt: "2026-06-08T00:10:00.000Z",
  });

  expect(record).toBeDefined();
  expect(record?.replay.initialSnapshot).toMatchObject({
    matchId: setup.matchId,
    status: { type: "mulligan" },
  });
  expect(record?.replay.finalState).toMatchObject({
    matchId: setup.matchId,
    status: { type: "completed", winner: setup.playerOrder[0] },
  });
  expect(record?.replay.initialDeckOrders).toEqual({
    [setup.playerOrder[0]]: setup.players[0].deckCardIds.map(String),
    [setup.playerOrder[1]]: setup.players[1].deckCardIds.map(String),
  });
  expect(record?.replay.initialStateHash).toBeTruthy();
  expect(record?.replay.finalStateHash).toBe(record?.finalStateHash);
  expect(JSON.stringify(record?.replay.manifestSnapshot)).not.toContain(
    "generated-dev-support",
  );
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm.cmd run test -- packages/match-server/src/local-completed-match-record.test.ts
```

Expected: the renamed test fails because `initialSnapshot` and `finalState` are still `null`.

- [ ] **Step 3: Persist cloned engine states**

In `packages/match-server/src/local-completed-match-record.ts`, import `createLocalDevMatch` and hash the actual initial engine state:

```ts
import {
  createLocalDevMatch,
  type DevMatchSetup,
  type LocalDevMatch,
} from "./local-match.js";
```

Replace the replay state section in `buildLocalCompletedMatchRecord` with:

```ts
const initialMatch = createLocalDevMatch(input.setup);
const initialSnapshot = jsonObject(initialMatch.state);
const finalState = jsonObject(input.match.state);
const initialStateHash = hashCanonicalStateValue(initialMatch.state);
```

Then set:

```ts
      initialStateHash,
      finalStateHash,
      initialSnapshot,
      initialDeckOrders,
      deterministicEntries: input.records.map((record) => jsonObject(record)),
      auditEntries: input.match.state.audit.map((entry) => jsonObject(entry)),
      checkpoints: [],
      finalState,
```

- [ ] **Step 4: Run the persistence test**

Run:

```powershell
npm.cmd run test -- packages/match-server/src/local-completed-match-record.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/local-completed-match-record.ts packages/match-server/src/local-completed-match-record.test.ts
git commit -m "feat: persist reconstructable replay state"
```

---

### Task 2: Add Server Replay Frame Reconstruction Result

**Files:**

- Create: `packages/match-server/src/replay-frame-reconstruction.ts`
- Create: `packages/match-server/src/replay-frame-reconstruction.test.ts`

- [ ] **Step 1: Write failing tests for frame reconstruction**

Create `packages/match-server/src/replay-frame-reconstruction.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { CompletedMatchReplayDetail } from "./postgres-completed-match.js";
import { reconstructReplayFrames } from "./replay-frame-reconstruction.js";

const detail = (
  replay: Record<string, unknown>,
): CompletedMatchReplayDetail => ({
  matchId: "match-1",
  status: "completed",
  gameType: "dev",
  formatId: "dev",
  lobbyId: "lobby-1",
  winnerUserId: null,
  winnerSeatId: "p1",
  startedAt: "2026-06-13T00:00:00.000Z",
  endedAt: "2026-06-13T00:10:00.000Z",
  turnCount: 1,
  actionCount: 1,
  players: [
    {
      seatId: "p1",
      userId: null,
      displayName: "Player",
      leaderCardNumber: "OP01-001",
      result: "win",
      isWinner: true,
    },
  ],
  replay,
});

const snapshot = {
  stateSeq: 1,
  actionSeq: 0,
  stateHash: "hash-1",
  status: "mulligan",
  activePlayerId: "p1",
  players: {
    p1: {
      view: { self: {}, opponent: {}, timers: { players: {} } },
      actions: [],
    },
  },
};

describe("reconstructReplayFrames", () => {
  test("uses saved deterministic snapshots as compatibility frames", () => {
    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v1",
        manifestSnapshot: { cards: {} },
        deterministicEntries: [
          { envelope: { request: { type: "playCard" } }, result: { snapshot } },
        ],
      }),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.frames).toEqual([
      {
        index: 0,
        actionIndex: 0,
        label: "playCard",
        snapshot,
      },
    ]);
  });

  test("uses initial snapshot and final state as reconstructable artifact evidence", () => {
    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v1",
        initialSnapshot: { matchId: "match-1", status: { type: "mulligan" } },
        finalState: { matchId: "match-1", status: { type: "completed" } },
        deterministicEntries: [],
      }),
    );

    expect(result.status).toBe("failed");
    if (result.status !== "failed") {
      return;
    }
    expect(result.reason).toContain("engine replay reducer is not available");
  });

  test("fails closed when no frame or reconstruction data exists", () => {
    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v1",
        deterministicEntries: [],
      }),
    );

    expect(result).toEqual({
      status: "failed",
      reason:
        "Replay artifact does not contain saved frames or reconstructable engine state.",
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm.cmd run test -- packages/match-server/src/replay-frame-reconstruction.test.ts
```

Expected: import failure because `replay-frame-reconstruction.ts` does not exist.

- [ ] **Step 3: Implement the reconstruction result model**

Create `packages/match-server/src/replay-frame-reconstruction.ts`:

```ts
import type { CompletedMatchReplayDetail } from "./postgres-completed-match.js";

export interface ReplayApiFrame {
  readonly index: number;
  readonly actionIndex: number;
  readonly label: string;
  readonly snapshot: unknown;
}

export type ReplayFrameReconstructionResult =
  | {
      readonly status: "ready";
      readonly frames: readonly ReplayApiFrame[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly actionIndex?: number | undefined;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const labelForEntry = (entry: unknown, index: number): string => {
  if (!isRecord(entry) || !isRecord(entry["envelope"])) {
    return `Action ${String(index + 1)}`;
  }
  const request = entry["envelope"]["request"];
  if (!isRecord(request)) {
    return `Action ${String(index + 1)}`;
  }
  const type = request["type"];
  return typeof type === "string" && type.length > 0
    ? type
    : `Action ${String(index + 1)}`;
};

const savedSnapshotForEntry = (entry: unknown): unknown | undefined => {
  if (!isRecord(entry) || !isRecord(entry["result"])) {
    return undefined;
  }
  const snapshot = entry["result"]["snapshot"];
  return isRecord(snapshot) && isRecord(snapshot["players"])
    ? snapshot
    : undefined;
};

const savedSnapshotFrames = (
  entries: readonly unknown[],
): readonly ReplayApiFrame[] =>
  entries.flatMap((entry, actionIndex) => {
    const snapshot = savedSnapshotForEntry(entry);
    if (snapshot === undefined) {
      return [];
    }
    return [
      {
        index: actionIndex,
        actionIndex,
        label: labelForEntry(entry, actionIndex),
        snapshot,
      },
    ];
  });

export const reconstructReplayFrames = (
  detail: CompletedMatchReplayDetail,
): ReplayFrameReconstructionResult => {
  const deterministicEntries = Array.isArray(
    detail.replay["deterministicEntries"],
  )
    ? detail.replay["deterministicEntries"]
    : [];
  const frames = savedSnapshotFrames(deterministicEntries);
  if (frames.length > 0) {
    return { status: "ready", frames };
  }
  if (
    isRecord(detail.replay["initialSnapshot"]) &&
    isRecord(detail.replay["finalState"])
  ) {
    return {
      status: "failed",
      reason:
        "Replay artifact is reconstructable, but the engine replay reducer is not available yet.",
    };
  }
  return {
    status: "failed",
    reason:
      "Replay artifact does not contain saved frames or reconstructable engine state.",
  };
};
```

- [ ] **Step 4: Run the frame reconstruction tests**

Run:

```powershell
npm.cmd run test -- packages/match-server/src/replay-frame-reconstruction.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/replay-frame-reconstruction.ts packages/match-server/src/replay-frame-reconstruction.test.ts
git commit -m "feat: add replay frame reconstruction result"
```

---

### Task 3: Return Replay Frames From the Detail API

**Files:**

- Modify: `packages/match-server/src/replay-route.ts`
- Modify: `packages/match-server/src/match-http-server-replay.test.ts`

- [ ] **Step 1: Write failing HTTP route assertions**

In `packages/match-server/src/match-http-server-replay.test.ts`, update `replayDetail()` so its replay contains one saved snapshot:

```ts
const replayDetail = (): CompletedMatchReplayDetail => ({
  ...replaySummary(),
  replay: {
    replayFormatVersion: "dev-local-v1",
    deterministicEntries: [
      {
        envelope: { request: { type: "playCard" } },
        result: {
          snapshot: {
            stateSeq: 1,
            actionSeq: 1,
            stateHash: "hash-1",
            status: "main",
            activePlayerId: "p1",
            players: {
              p1: {
                view: { self: {}, opponent: {}, timers: { players: {} } },
                actions: [],
              },
            },
          },
        },
      },
    ],
  },
});
```

Then update the two replay detail response assertions to expect:

```ts
const body = await response.json();
assert.equal(body.replay.matchId, "match-1");
assert.equal(body.frameReconstruction.status, "ready");
assert.equal(body.frameReconstruction.frames.length, 1);
assert.equal(body.frameReconstruction.frames[0].label, "playCard");
```

- [ ] **Step 2: Run the failing HTTP tests**

Run:

```powershell
npm.cmd run test -- packages/match-server/src/match-http-server-replay.test.ts
```

Expected: tests fail because the detail route does not return `frameReconstruction`.

- [ ] **Step 3: Add frame reconstruction to the route response**

In `packages/match-server/src/replay-route.ts`, import:

```ts
import { reconstructReplayFrames } from "./replay-frame-reconstruction.js";
```

In the replay detail success branch, replace:

```ts
sendJson(response, 200, { replay });
```

with:

```ts
sendJson(response, 200, {
  replay,
  frameReconstruction: reconstructReplayFrames(replay),
});
```

- [ ] **Step 4: Run route and reconstruction tests**

Run:

```powershell
npm.cmd run test -- packages/match-server/src/match-http-server-replay.test.ts packages/match-server/src/replay-frame-reconstruction.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/match-server/src/replay-route.ts packages/match-server/src/match-http-server-replay.test.ts
git commit -m "feat: return replay frames from detail api"
```

---

### Task 4: Teach the Client Replay Contract About Frames

**Files:**

- Modify: `packages/client/src/replay-client.ts`
- Modify: `packages/client/src/replay-client.test.ts`

- [ ] **Step 1: Write the failing client contract test**

In `packages/client/src/replay-client.test.ts`, update the detail response fixture to include `frameReconstruction`:

```ts
frameReconstruction: {
  status: "ready",
  frames: [
    {
      index: 0,
      actionIndex: 0,
      label: "playCard",
      snapshot: { stateSeq: 1, players: { p1: { view: {}, actions: [] } } },
    },
  ],
},
```

Then assert:

```ts
assert.equal(replay.frameReconstruction.status, "ready");
if (replay.frameReconstruction.status === "ready") {
  assert.equal(replay.frameReconstruction.frames[0]?.label, "playCard");
}
```

- [ ] **Step 2: Run the failing client test**

Run:

```powershell
npm.cmd run test -- packages/client/src/replay-client.test.ts
```

Expected: TypeScript/test failure because `ReplayDetail` has no `frameReconstruction`.

- [ ] **Step 3: Add client frame types**

In `packages/client/src/replay-client.ts`, add:

```ts
export interface ReplayFramePayload {
  readonly index: number;
  readonly actionIndex: number;
  readonly label: string;
  readonly snapshot: unknown;
}

export type ReplayFrameReconstructionPayload =
  | {
      readonly status: "ready";
      readonly frames: readonly ReplayFramePayload[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly actionIndex?: number | undefined;
    };
```

Add this field to `ReplayDetail`:

```ts
readonly frameReconstruction?: ReplayFrameReconstructionPayload | undefined;
```

- [ ] **Step 4: Run the client replay tests**

Run:

```powershell
npm.cmd run test -- packages/client/src/replay-client.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/client/src/replay-client.ts packages/client/src/replay-client.test.ts
git commit -m "feat: add replay frame client contract"
```

---

### Task 5: Prefer API Frames in the Match Client Adapter

**Files:**

- Modify: `packages/client/src/react/replay-match-client.ts`
- Modify: `packages/client/src/react/replay-match-client.test.ts`

- [ ] **Step 1: Write failing adapter tests**

In `packages/client/src/react/replay-match-client.test.ts`, add:

```ts
test("creates playback frames from server-provided frame snapshots", () => {
  const frames = replayFramesFromDetail({
    matchId: "match-1",
    manifestSnapshot: {
      cards: {
        "OP01-001": {
          cardId: "OP01-001",
          name: "Leader",
          category: "leader",
        },
      },
    },
    frameReconstruction: {
      status: "ready",
      frames: [
        {
          index: 0,
          actionIndex: 0,
          label: "Initial state",
          snapshot,
        },
      ],
    },
    deterministicEntries: [],
  });

  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.label, "Initial state");
});
```

- [ ] **Step 2: Run the failing adapter test**

Run:

```powershell
npm.cmd run test -- packages/client/src/react/replay-match-client.test.ts
```

Expected: type failure because `replayFramesFromDetail` does not accept `frameReconstruction`.

- [ ] **Step 3: Update `replayFramesFromDetail` input**

In `packages/client/src/react/replay-match-client.ts`, import the payload type:

```ts
import type { ReplayFrameReconstructionPayload } from "../replay-client.js";
```

Extend the input type:

```ts
readonly frameReconstruction?: ReplayFrameReconstructionPayload | undefined;
```

Before legacy deterministic entry extraction, add:

```ts
if (input.frameReconstruction?.status === "ready") {
  return input.frameReconstruction.frames.flatMap((frame) => {
    const snapshot = frame.snapshot;
    if (!isRecord(snapshot) || !isRecord(snapshot["players"])) {
      return [];
    }
    const playerId = Object.keys(snapshot.players)[0] as PlayerId | undefined;
    if (playerId === undefined) {
      return [];
    }
    const cards = replayCatalog(input.manifestSnapshot, [
      ...Object.keys(snapshot.players).map((id) => id as PlayerId),
    ]);
    return [
      {
        index: frame.index,
        label: frame.label,
        clientState: {
          matchId: input.matchId as MatchId,
          seat: {
            matchId: input.matchId as MatchId,
            playerId,
            sessionToken: "replay",
          },
          snapshot: snapshot as unknown as MatchSnapshot,
          cards,
        },
      },
    ];
  });
}
```

- [ ] **Step 4: Pass frame reconstruction from `ReplayViewerPage`**

In `packages/client/src/react/ReplayViewerPage.tsx`, change:

```ts
replayFramesFromDetail({
  matchId: replay.matchId,
  manifestSnapshot: replay.replay.manifestSnapshot,
  deterministicEntries: replay.replay.deterministicEntries ?? [],
});
```

to:

```ts
replayFramesFromDetail({
  matchId: replay.matchId,
  manifestSnapshot: replay.replay.manifestSnapshot,
  frameReconstruction: replay.frameReconstruction,
  deterministicEntries: replay.replay.deterministicEntries ?? [],
});
```

- [ ] **Step 5: Run adapter and viewer tests**

Run:

```powershell
npm.cmd run test -- packages/client/src/react/replay-match-client.test.ts packages/client/src/react/ReplayViewerPage.test.ts
```

Expected: all tests pass. If a viewer fallback assertion fails, update that assertion in this task so API-backed frames are treated as the successful simulator path.

- [ ] **Step 6: Commit**

```powershell
git add packages/client/src/react/replay-match-client.ts packages/client/src/react/replay-match-client.test.ts packages/client/src/react/ReplayViewerPage.tsx
git commit -m "feat: render replay api frames"
```

---

### Task 6: Replace Basic Replay Controls With Transport Controls

**Files:**

- Modify: `packages/client/src/react/ReplayViewerPage.tsx`
- Modify: `packages/client/src/react/ReplayViewerPage.test.ts`

- [ ] **Step 1: Write failing transport control tests**

In `packages/client/src/react/ReplayViewerPage.test.ts`, update `ReplayPlaybackControls` tests to assert:

```ts
assert.match(html, /aria-label="Previous replay frame"/u);
assert.match(html, /aria-label="Next replay frame"/u);
assert.match(html, /aria-label="Play replay"/u);
assert.match(html, /type="range"/u);
assert.match(html, /Frame 1 \/ 3/u);
```

- [ ] **Step 2: Run the failing viewer test**

Run:

```powershell
npm.cmd run test -- packages/client/src/react/ReplayViewerPage.test.ts
```

Expected: fails because controls only render previous/next buttons and a label.

- [ ] **Step 3: Extend `ReplayPlaybackControlsProps`**

In `ReplayViewerPage.tsx`, replace the props interface with:

```ts
export interface ReplayPlaybackControlsProps {
  readonly frameLabel: string;
  readonly selectedFrameIndex: number;
  readonly frameCount: number;
  readonly playing: boolean;
  readonly speedMs: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onTogglePlay: () => void;
  readonly onSelectFrame: (index: number) => void;
  readonly onSelectSpeedMs: (speedMs: number) => void;
}
```

- [ ] **Step 4: Render transport controls**

Replace `ReplayPlaybackControls` with:

```tsx
export const ReplayPlaybackControls = ({
  frameLabel,
  selectedFrameIndex,
  frameCount,
  playing,
  speedMs,
  onPrevious,
  onNext,
  onTogglePlay,
  onSelectFrame,
  onSelectSpeedMs,
}: ReplayPlaybackControlsProps): React.JSX.Element => (
  <div className="replay-transport" aria-label="Replay transport">
    <button
      type="button"
      aria-label="Previous replay frame"
      disabled={selectedFrameIndex <= 0}
      onClick={onPrevious}
    >
      Previous
    </button>
    <button
      type="button"
      aria-label={playing ? "Pause replay" : "Play replay"}
      onClick={onTogglePlay}
    >
      {playing ? "Pause" : "Play"}
    </button>
    <button
      type="button"
      aria-label="Next replay frame"
      disabled={selectedFrameIndex >= frameCount - 1}
      onClick={onNext}
    >
      Next
    </button>
    <input
      aria-label="Replay frame"
      type="range"
      min={0}
      max={Math.max(0, frameCount - 1)}
      value={selectedFrameIndex}
      onChange={(event) => {
        onSelectFrame(Number(event.currentTarget.value));
      }}
    />
    <select
      aria-label="Replay speed"
      value={speedMs}
      onChange={(event) => {
        onSelectSpeedMs(Number(event.currentTarget.value));
      }}
    >
      <option value={1200}>0.5x</option>
      <option value={700}>1x</option>
      <option value={350}>2x</option>
    </select>
    <span>{`Frame ${String(selectedFrameIndex + 1)} / ${String(frameCount)}`}</span>
    <strong>{frameLabel}</strong>
  </div>
);
```

- [ ] **Step 5: Add playback state and auto-advance**

In `ReplayViewerPage`, add:

```ts
const [playing, setPlaying] = useState(false);
const [speedMs, setSpeedMs] = useState(700);
```

Add effect:

```ts
useEffect(() => {
  if (!playing || frames.length <= 1) {
    return;
  }
  const timer = window.setTimeout(() => {
    setFrameIndex((current) => {
      const next = Math.min(frames.length - 1, current + 1);
      if (next >= frames.length - 1) {
        setPlaying(false);
      }
      return next;
    });
  }, speedMs);
  return () => {
    window.clearTimeout(timer);
  };
}, [frames.length, playing, speedMs, selectedFrameIndex]);
```

Pass the new props:

```tsx
playing={playing}
speedMs={speedMs}
onTogglePlay={() => {
  setPlaying((current) => !current);
}}
onSelectFrame={(index) => {
  setFrameIndex(Math.max(0, Math.min(frames.length - 1, index)));
}}
onSelectSpeedMs={setSpeedMs}
```

- [ ] **Step 6: Run viewer tests**

Run:

```powershell
npm.cmd run test -- packages/client/src/react/ReplayViewerPage.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/client/src/react/ReplayViewerPage.tsx packages/client/src/react/ReplayViewerPage.test.ts
git commit -m "feat: add replay transport controls"
```

---

### Task 7: Make Fallback Explicitly Failure-Only

**Files:**

- Modify: `packages/client/src/react/ReplayViewerPage.tsx`
- Modify: `packages/client/src/react/ReplayViewerPage.test.ts`

- [ ] **Step 1: Write failing fallback tests**

Add a test that renders `ReplayViewerPageView` with a failed reconstruction and asserts:

```ts
assert.match(html, /Replay reconstruction failed/u);
assert.match(html, /checkpoint hash mismatch/u);
assert.match(html, /Entries/u);
```

Also update the old fallback test so it no longer treats zero frames as normal board absence. It should assert the failure message is present.

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm.cmd run test -- packages/client/src/react/ReplayViewerPage.test.ts
```

Expected: failure because the current fallback says board playback is unavailable instead of reconstruction failed.

- [ ] **Step 3: Add failure prop to `ReplayViewerPageView`**

Extend `ReplayViewerPageViewProps`:

```ts
readonly frameReconstruction?: ReplayFrameReconstructionPayload | undefined;
```

Render failure text when ready but no frames:

```tsx
const reconstructionFailure =
  frameReconstruction?.status === "failed"
    ? frameReconstruction.reason
    : "Replay reconstruction did not produce any frames.";
```

Replace “Board playback is not available for this replay artifact yet.” with:

```tsx
<p>{`Replay reconstruction failed: ${reconstructionFailure}`}</p>
```

Pass `frameReconstruction={replay?.frameReconstruction}` from `ReplayViewerPage`.

- [ ] **Step 4: Run fallback tests**

Run:

```powershell
npm.cmd run test -- packages/client/src/react/ReplayViewerPage.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/client/src/react/ReplayViewerPage.tsx packages/client/src/react/ReplayViewerPage.test.ts
git commit -m "fix: make replay fallback reconstruction failure"
```

---

### Task 8: Add the Durable Engine Replay Reducer

**Files:**

- Create: `packages/engine-core/src/replay/artifact-reducer.ts`
- Create: `packages/engine-core/src/replay/artifact-reducer.test.ts`
- Modify: `packages/engine-core/src/index.ts`
- Modify: `packages/match-server/src/replay-frame-reconstruction.ts`
- Modify: `packages/match-server/src/replay-frame-reconstruction.test.ts`

- [ ] **Step 1: Write failing engine reducer tests**

Create `packages/engine-core/src/replay/artifact-reducer.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { reconstructReplayArtifactStates } from "./artifact-reducer.js";

describe("reconstructReplayArtifactStates", () => {
  test("returns the initial state as the first frame for an artifact with no actions", () => {
    const initialState = {
      matchId: "match-1",
      seq: 1,
      actionSeq: 0,
      status: { type: "completed", winner: "p1" },
      players: {},
      eventJournal: [],
    };
    const result = reconstructReplayArtifactStates({
      initialState,
      deterministicEntries: [],
      expectedFinalStateHash: undefined,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]?.label).toBe("Initial state");
  });
});
```

- [ ] **Step 2: Run the failing engine test**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/replay/artifact-reducer.test.ts
```

Expected: import failure because `artifact-reducer.ts` does not exist.

- [ ] **Step 3: Implement the initial reducer skeleton**

Create `packages/engine-core/src/replay/artifact-reducer.ts`:

```ts
import type { GameState } from "@optcg/types";
import { hashCanonicalStateValue } from "../state/canonical-state.js";

export interface ReplayArtifactStateFrame {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly state: GameState;
  readonly stateHash: string;
}

export type ReplayArtifactReconstructionResult =
  | {
      readonly status: "ready";
      readonly frames: readonly ReplayArtifactStateFrame[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly actionIndex?: number | undefined;
    };

export const reconstructReplayArtifactStates = ({
  expectedFinalStateHash,
  initialState,
}: {
  readonly initialState: GameState;
  readonly deterministicEntries: readonly unknown[];
  readonly expectedFinalStateHash?: string | undefined;
}): ReplayArtifactReconstructionResult => {
  const stateHash = hashCanonicalStateValue(initialState);
  if (
    expectedFinalStateHash !== undefined &&
    expectedFinalStateHash !== stateHash
  ) {
    return {
      status: "failed",
      reason: "Replay reconstruction final hash mismatch.",
    };
  }
  return {
    status: "ready",
    frames: [
      {
        index: 0,
        actionIndex: null,
        label: "Initial state",
        state: structuredClone(initialState),
        stateHash,
      },
    ],
  };
};
```

Export it from `packages/engine-core/src/index.ts`:

```ts
export { reconstructReplayArtifactStates } from "./replay/artifact-reducer.js";
export type {
  ReplayArtifactReconstructionResult,
  ReplayArtifactStateFrame,
} from "./replay/artifact-reducer.js";
```

- [ ] **Step 4: Add bounded persisted-action decoding**

Extend `packages/engine-core/src/replay/artifact-reducer.test.ts` with this failing unsupported-action test:

```ts
test("fails closed for persisted entries without a replayable request", () => {
  const initialState = {
    matchId: "match-1",
    seq: 1,
    actionSeq: 0,
    status: { type: "main" },
    players: {},
    eventJournal: [],
  };
  const result = reconstructReplayArtifactStates({
    initialState,
    deterministicEntries: [{ envelope: { request: { type: "unknown" } } }],
    expectedFinalStateHash: undefined,
  });

  expect(result).toEqual({
    status: "failed",
    reason: "Unsupported replay action unknown.",
    actionIndex: 0,
  });
});
```

Then add this decoder to `packages/engine-core/src/replay/artifact-reducer.ts`:

```ts
import type {
  Action,
  DecisionId,
  DecisionResponse,
  GameState,
  InstanceId,
  PlayerId,
} from "@optcg/types";
import { applyAction } from "../actions.js";
```

```ts
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const replayActionFromEntry = (
  entry: unknown,
):
  | {
      readonly status: "ready";
      readonly action: Action;
      readonly label: string;
    }
  | { readonly status: "failed"; readonly reason: string } => {
  if (!isRecord(entry) || !isRecord(entry["envelope"])) {
    return { status: "failed", reason: "Replay entry is missing an envelope." };
  }
  const request = entry["envelope"]["request"];
  if (!isRecord(request) || typeof request["type"] !== "string") {
    return {
      status: "failed",
      reason: "Replay entry is missing a request type.",
    };
  }
  const type = request["type"];
  if (type === "endMainPhase") {
    return { status: "ready", action: { type }, label: type };
  }
  if (type === "playCard" && typeof request["cardInstanceId"] === "string") {
    return {
      status: "ready",
      action: {
        type,
        cardInstanceId: request["cardInstanceId"] as InstanceId,
      },
      label: type,
    };
  }
  if (type === "concede" && typeof request["playerId"] === "string") {
    return {
      status: "ready",
      action: {
        type,
        playerId: request["playerId"] as PlayerId,
      },
      label: type,
    };
  }
  if (
    type === "respondToDecision" &&
    typeof request["decisionId"] === "string" &&
    isRecord(request["response"])
  ) {
    return {
      status: "ready",
      action: {
        type,
        decisionId: request["decisionId"] as DecisionId,
        response: request["response"] as unknown as DecisionResponse,
      },
      label: type,
    };
  }
  return { status: "failed", reason: `Unsupported replay action ${type}.` };
};
```

Replace the skeleton body after the initial frame with:

```ts
const frames: ReplayArtifactStateFrame[] = [
  {
    index: 0,
    actionIndex: null,
    label: "Initial state",
    state: structuredClone(initialState),
    stateHash,
  },
];
let current = structuredClone(initialState);
for (const [actionIndex, entry] of deterministicEntries.entries()) {
  const decoded = replayActionFromEntry(entry);
  if (decoded.status === "failed") {
    return { status: "failed", reason: decoded.reason, actionIndex };
  }
  const result = applyAction(current, decoded.action);
  if (result.errors !== undefined) {
    return {
      status: "failed",
      reason: result.errors.map((error) => error.reason).join("; "),
      actionIndex,
    };
  }
  current = result.state;
  frames.push({
    index: frames.length,
    actionIndex,
    label: decoded.label,
    state: structuredClone(current),
    stateHash: result.stateHash,
  });
}
```

- [ ] **Step 5: Wire server reconstruction to engine reducer**

In `packages/match-server/src/replay-frame-reconstruction.ts`, import:

```ts
import {
  computeView,
  reconstructReplayArtifactStates,
} from "@optcg/engine-core";
import type { ReplayArtifactStateFrame } from "@optcg/engine-core";
import type { GameState, PlayerId } from "@optcg/types";
```

When `initialSnapshot` and `finalStateHash` are present, call the reducer and convert each engine frame to a replay API frame by projecting a replay-visible snapshot for each player:

```ts
const snapshotForFrame = (frame: ReplayArtifactStateFrame): unknown => ({
  stateSeq: frame.state.seq,
  actionSeq: frame.state.actionSeq,
  stateHash: frame.stateHash,
  status: frame.state.status.type,
  turn: frame.state.turn,
  activePlayerId:
    frame.state.pendingDecision?.playerId ?? frame.state.turn.turnPlayerId,
  players: Object.fromEntries(
    Object.keys(frame.state.players).map((playerId) => [
      playerId,
      {
        view: computeView(frame.state, playerId as PlayerId),
        actions: [],
      },
    ]),
  ),
});
```

- [ ] **Step 6: Run engine and server reconstruction tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/replay/artifact-reducer.test.ts packages/match-server/src/replay-frame-reconstruction.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add packages/engine-core/src/replay/artifact-reducer.ts packages/engine-core/src/replay/artifact-reducer.test.ts packages/engine-core/src/index.ts packages/match-server/src/replay-frame-reconstruction.ts packages/match-server/src/replay-frame-reconstruction.test.ts
git commit -m "feat: reconstruct replay frames from engine artifacts"
```

---

### Task 9: Final Verification and Deployment

**Files:**

- Verify only.

- [ ] **Step 1: Run focused replay tests**

Run:

```powershell
npm.cmd run test -- packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/replay-frame-reconstruction.test.ts packages/match-server/src/match-http-server-replay.test.ts packages/client/src/replay-client.test.ts packages/client/src/react/replay-match-client.test.ts packages/client/src/react/ReplayViewerPage.test.ts
```

Expected: all listed test files pass.

- [ ] **Step 2: Run canonical checks**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
```

Expected: all pass.

- [ ] **Step 3: Build the client UI**

Run:

```powershell
corepack pnpm --filter @optcg/client build:ui
```

Expected: Vite build succeeds and emits `packages/client/dist`.

- [ ] **Step 4: Push dev**

Run:

```powershell
git status --short
git push origin dev
```

Expected: worktree is clean before push, and `dev` updates on origin.

- [ ] **Step 5: Verify live route after deployment**

After the image deploys, check:

```powershell
$list = Invoke-RestMethod -Uri "https://sim-dev.poneglyph.one/api/replays" -TimeoutSec 30
$matchId = $list.replays[0].matchId
$detail = Invoke-RestMethod -Uri "https://sim-dev.poneglyph.one/api/replays/$matchId" -TimeoutSec 30
$detail.frameReconstruction.status
```

Expected: `ready` for a replay with saved snapshots or reconstructable engine state. If it returns `failed`, verify the reason is specific and the page displays that reason instead of the old generic metadata fallback.
