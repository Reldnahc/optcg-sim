# Replay Display Artifact Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace on-demand replay frame reconstruction with a completed-match display artifact that the replay viewer can load and play locally.

**Architecture:** Rollback and replay display are separate artifacts. Rollback keeps deterministic entries and checkpoints for audit/recovery. Replay viewing reads precomputed, compact, versioned display frames written while live action snapshots still exist, then uses `MatchApp` with local play/pause/seek controls.

**Tech Stack:** TypeScript, Vitest, React, Node HTTP server, Postgres JSONB replay persistence, existing `MatchApp` and `createBoardViewModel`.

---

## Source Of Truth

This plan replaces `docs/superpowers/plans/2026-06-24-unified-replay-rollback-recovery-log.md`, which has been deleted because replay viewing should not depend on rollback reconstruction.

Useful historical commits:

- `f871a65a` and `db8b9145`: correct viewer shape, `MatchApp` plus transport controls.
- `e54000da` and `28fed1df`: correct data-flow shape, replay detail supplies board frames and the client steps locally.
- `f940dd1a`: wrong pivot, frame viewing starts reconstructing from engine artifacts at read time.

Do not restore the old payload literally. The old payload used full snapshot-shaped frames and grew too large. Restore the product/data-flow shape and replace the payload with compact display frames.

## Hard Requirements

- New replays must not call `reconstructReplayArtifactStates` for normal viewer rendering.
- Opening a replay must be a cheap replay-detail read, not an engine replay loop.
- Viewer play, pause, next, previous, and seek must not call `/api/replays/:matchId/frames`.
- Rollback deterministic entries and checkpoints must remain intact.
- Replay display frames must be versioned as `display-v1`.
- Replay display frames must not duplicate full event history in every frame.
- Hidden/private state must not be exposed through replay display frames.
- Legacy frame reconstruction may remain only as a named fallback for old rows without `display-v1`.

## Concrete Current-Code Seams

- `packages/match-server/src/session-types.ts`
  - `StoredDeterministicSessionRecord` is the right place to attach a server-internal display frame, because accepted deterministic records are already passed into completed-match persistence.
- `packages/match-server/src/match-session.ts`
  - `createMatchSessionRuntime()` still has `result.snapshot` immediately after `applyRequest(...)`; this is the point to build compact display frames before `compactSessionResult(...)` strips snapshots from persisted action/audit data.
- `packages/match-server/src/deterministic-entry-builder.ts`
  - `buildStoredDeterministicSessionRecord(...)` should accept an optional `replayDisplayFrame` and copy it onto the returned record. It must not put display data inside `deterministicEntry`.
- `packages/match-server/src/local-completed-match-record.ts`
  - `buildLocalCompletedMatchRecord(...)` receives `deterministicRecords`; it should collect their `replayDisplayFrame` values into one `replayDisplayArtifact`.
- `packages/match-server/src/postgres-completed-match.ts`
  - `match_replays` SQL currently has no display artifact field. Add `replay_display_artifact` to the contract and repository SQL, then expose it in public replay detail.
- `packages/client/src/react/ReplayViewerPage.tsx`
  - Current code fetches frame chunks. Replace that with a one-time replay detail fetch and local frame array.

---

### Task 1: Add Replay Display Artifact Types And Compact Snapshot Projection

**Files:**

- Create: `packages/match-server/src/replay-display-artifact.ts`
- Create: `packages/match-server/src/replay-display-artifact.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/match-server/src/replay-display-artifact.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { PlayerId } from "@optcg/types";

import {
  createReplayDisplayArtifact,
  createReplayDisplayFrameFromSnapshot,
  isReplayDisplayArtifactV1,
  replayDisplayArtifactByteSize,
} from "./replay-display-artifact.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

const p1 = "p1" as PlayerId;

const snapshot = (eventSeqs: readonly number[]): DevMatchSnapshot =>
  ({
    stateSeq: 10,
    actionSeq: 4,
    stateHash: "hash-10",
    status: "active",
    turn: {
      turnPlayerId: p1,
      globalTurn: 1,
      playerTurn: 1,
      phase: "main",
      hasAttacked: false,
      hasPlayedDonThisTurn: false,
      hasPlayedCharacterThisTurn: false,
    },
    activePlayerId: p1,
    players: {
      [p1]: {
        view: {
          self: { leader: { instanceId: "leader-1", cardId: "L1" } },
          opponent: {},
          timers: { players: {} },
          events: eventSeqs.map((seq) => ({ id: `event-${seq}`, seq })),
        },
        actions: [{ index: 0, type: "endTurn", label: "End turn" }],
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("replay display artifact", () => {
  test("creates versioned display-v1 artifacts", () => {
    const frame = createReplayDisplayFrameFromSnapshot({
      index: 0,
      actionIndex: null,
      label: "Initial state",
      snapshot: snapshot([1, 2]),
      previousEventSeqByPlayer: new Map(),
    });
    const artifact = createReplayDisplayArtifact({ frames: [frame.frame] });

    expect(artifact).toMatchObject({
      replayDisplayVersion: "display-v1",
      frameCount: 1,
      frames: [{ index: 0, label: "Initial state" }],
    });
    expect(isReplayDisplayArtifactV1(artifact)).toBe(true);
  });

  test("stores per-frame event deltas instead of repeated full event history", () => {
    const first = createReplayDisplayFrameFromSnapshot({
      index: 0,
      actionIndex: null,
      label: "Initial state",
      snapshot: snapshot([1, 2]),
      previousEventSeqByPlayer: new Map(),
    });
    const second = createReplayDisplayFrameFromSnapshot({
      index: 1,
      actionIndex: 0,
      label: "endTurn",
      snapshot: snapshot([1, 2, 3]),
      previousEventSeqByPlayer: first.nextEventSeqByPlayer,
    });

    expect(first.frame.snapshot.players[p1]?.view.events).toHaveLength(2);
    expect(second.frame.snapshot.players[p1]?.view.events).toEqual([
      { id: "event-3", seq: 3 },
    ]);
    expect(second.frame.snapshot.players[p1]?.actions).toEqual([]);
  });

  test("rejects malformed artifacts", () => {
    expect(
      isReplayDisplayArtifactV1({ replayDisplayVersion: "display-v1" }),
    ).toBe(false);
    expect(
      isReplayDisplayArtifactV1({
        replayDisplayVersion: "display-v1",
        frameCount: 1,
        frames: [{ index: "0" }],
      }),
    ).toBe(false);
  });

  test("reports canonical JSON byte size", () => {
    const artifact = createReplayDisplayArtifact({ frames: [] });

    expect(replayDisplayArtifactByteSize(artifact)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/replay-display-artifact.test.ts
```

Expected: fail with a missing `replay-display-artifact.js` module.

- [ ] **Step 3: Implement `replay-display-artifact.ts`**

Create `packages/match-server/src/replay-display-artifact.ts`:

```ts
import type { PlayerId, PlayerView } from "@optcg/types";

import { canonicalJson } from "./canonical-json.js";
import type {
  DevMatchSnapshot,
  DevPlayerSnapshot,
} from "./dev-snapshot-types.js";

export interface ReplayDisplayPlayerSnapshotV1 {
  readonly view: PlayerView;
  readonly actions: readonly [];
}

export interface ReplayDisplaySnapshotV1 {
  readonly stateSeq: number;
  readonly actionSeq: number;
  readonly stateHash: string;
  readonly status: string;
  readonly turn: DevMatchSnapshot["turn"];
  readonly activePlayerId: PlayerId;
  readonly playerLabels?: DevMatchSnapshot["playerLabels"];
  readonly players: Readonly<Record<PlayerId, ReplayDisplayPlayerSnapshotV1>>;
}

export interface ReplayDisplayFrameV1 {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly stateSeq: number;
  readonly actionSeq: number;
  readonly status: string;
  readonly activePlayerId: PlayerId;
  readonly snapshot: ReplayDisplaySnapshotV1;
}

export interface ReplayDisplayArtifactV1 {
  readonly replayDisplayVersion: "display-v1";
  readonly frameCount: number;
  readonly frames: readonly ReplayDisplayFrameV1[];
}

export interface ReplayDisplayFrameResult {
  readonly frame: ReplayDisplayFrameV1;
  readonly nextEventSeqByPlayer: ReadonlyMap<PlayerId, number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const eventSeq = (event: unknown): number | undefined =>
  isRecord(event) && typeof event["seq"] === "number"
    ? event["seq"]
    : undefined;

const compactViewEvents = (
  view: PlayerView,
  previousMaxSeq: number,
): PlayerView["events"] =>
  view.events.filter((event) => {
    const seq = eventSeq(event);
    return seq === undefined || seq > previousMaxSeq;
  });

const nextEventSeq = (
  player: DevPlayerSnapshot,
  previousMaxSeq: number,
): number =>
  player.view.events.reduce((maxSeq, event) => {
    const seq = eventSeq(event);
    return seq === undefined ? maxSeq : Math.max(maxSeq, seq);
  }, previousMaxSeq);

export const createReplayDisplayFrameFromSnapshot = ({
  actionIndex,
  index,
  label,
  previousEventSeqByPlayer,
  snapshot,
}: {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly snapshot: DevMatchSnapshot;
  readonly previousEventSeqByPlayer: ReadonlyMap<PlayerId, number>;
}): ReplayDisplayFrameResult => {
  const next = new Map(previousEventSeqByPlayer);
  const players = Object.fromEntries(
    Object.entries(snapshot.players).map(([playerId, player]) => {
      const typedPlayerId = playerId as PlayerId;
      const previousMaxSeq = previousEventSeqByPlayer.get(typedPlayerId) ?? 0;
      next.set(typedPlayerId, nextEventSeq(player, previousMaxSeq));
      return [
        typedPlayerId,
        {
          view: {
            ...player.view,
            events: compactViewEvents(player.view, previousMaxSeq),
          },
          actions: [],
        },
      ] as const;
    }),
  ) as Record<PlayerId, ReplayDisplayPlayerSnapshotV1>;
  const displaySnapshot: ReplayDisplaySnapshotV1 = {
    stateSeq: snapshot.stateSeq,
    actionSeq: snapshot.actionSeq,
    stateHash: snapshot.stateHash,
    status: snapshot.status,
    turn: snapshot.turn,
    activePlayerId: snapshot.activePlayerId,
    ...(snapshot.playerLabels === undefined
      ? {}
      : { playerLabels: snapshot.playerLabels }),
    players,
  };
  return {
    frame: {
      index,
      actionIndex,
      label,
      stateSeq: snapshot.stateSeq,
      actionSeq: snapshot.actionSeq,
      status: snapshot.status,
      activePlayerId: snapshot.activePlayerId,
      snapshot: displaySnapshot,
    },
    nextEventSeqByPlayer: next,
  };
};

export const createReplayDisplayArtifact = ({
  frames,
}: {
  readonly frames: readonly ReplayDisplayFrameV1[];
}): ReplayDisplayArtifactV1 => ({
  replayDisplayVersion: "display-v1",
  frameCount: frames.length,
  frames,
});

const isReplayDisplayFrameV1 = (
  value: unknown,
): value is ReplayDisplayFrameV1 =>
  isRecord(value) &&
  typeof value["index"] === "number" &&
  (typeof value["actionIndex"] === "number" || value["actionIndex"] === null) &&
  typeof value["label"] === "string" &&
  typeof value["stateSeq"] === "number" &&
  typeof value["actionSeq"] === "number" &&
  typeof value["status"] === "string" &&
  typeof value["activePlayerId"] === "string" &&
  isRecord(value["snapshot"]);

export const isReplayDisplayArtifactV1 = (
  value: unknown,
): value is ReplayDisplayArtifactV1 =>
  isRecord(value) &&
  value["replayDisplayVersion"] === "display-v1" &&
  typeof value["frameCount"] === "number" &&
  Array.isArray(value["frames"]) &&
  value["frames"].length === value["frameCount"] &&
  value["frames"].every(isReplayDisplayFrameV1);

export const replayDisplayArtifactByteSize = (
  artifact: ReplayDisplayArtifactV1,
): number => Buffer.byteLength(canonicalJson(artifact), "utf8");
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/replay-display-artifact.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/match-server/src/replay-display-artifact.ts packages/match-server/src/replay-display-artifact.test.ts
git commit -m "feat: add replay display artifact contract"
```

---

### Task 2: Attach Display Frames To Deterministic Records At Capture Time

**Files:**

- Modify: `packages/match-server/src/session-types.ts`
- Modify: `packages/match-server/src/deterministic-entry-builder.ts`
- Modify: `packages/match-server/src/match-session.ts`
- Modify: `packages/match-server/src/match-session.test.ts`

- [ ] **Step 1: Add a failing assertion to the existing persistence test**

In `packages/match-server/src/match-session.test.ts`, update the existing test named `persists accepted records and server-only snapshots`. After the assertion that `loadedAfterFlush?.deterministicEntriesSinceSnapshot` has length `1`, add:

```ts
const deterministicRecord =
  loadedAfterFlush?.deterministicEntriesSinceSnapshot?.[0];
expect(deterministicRecord?.replayDisplayFrame).toMatchObject({
  index: 0,
  actionIndex: 0,
  label: "submitAction",
  snapshot: {
    players: expect.any(Object),
  },
});
expect(JSON.stringify(deterministicRecord?.audit.result)).not.toContain(
  "snapshot",
);
expect(JSON.stringify(deterministicRecord?.deterministicEntry)).not.toContain(
  "snapshot",
);
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/match-session.test.ts
```

Expected: fail because `replayDisplayFrame` is undefined.

- [ ] **Step 3: Extend stored deterministic records**

In `packages/match-server/src/session-types.ts`, import the type:

```ts
import type { ReplayDisplayFrameV1 } from "./replay-display-artifact.js";
```

Extend `StoredDeterministicSessionRecord`:

```ts
export interface StoredDeterministicSessionRecord {
  readonly deterministicEntry: DeterministicMatchEntry;
  readonly audit: StoredSessionAuditRecord;
  readonly replayDisplayFrame?: ReplayDisplayFrameV1 | undefined;
}
```

- [ ] **Step 4: Pass the optional frame through the deterministic entry builder**

In `packages/match-server/src/deterministic-entry-builder.ts`, add to `BuildStoredDeterministicSessionRecordInput`:

```ts
readonly replayDisplayFrame?: StoredDeterministicSessionRecord["replayDisplayFrame"];
```

Update `buildStoredDeterministicSessionRecord`:

```ts
export const buildStoredDeterministicSessionRecord = (
  input: BuildStoredDeterministicSessionRecordInput,
): StoredDeterministicSessionRecord => ({
  deterministicEntry: deterministicEntry(input),
  audit: auditRecord(input),
  ...(input.replayDisplayFrame === undefined
    ? {}
    : { replayDisplayFrame: input.replayDisplayFrame }),
});
```

- [ ] **Step 5: Build display frames in `match-session.ts`**

In `packages/match-server/src/match-session.ts`, import:

```ts
import { createReplayDisplayFrameFromSnapshot } from "./replay-display-artifact.js";
```

Inside `createMatchSessionRuntime`, add after `const deterministicCheckpointIds = new Set<string>();`:

```ts
let replayDisplayFrameCount = 0;
let replayDisplayEventSeqByPlayer = new Map<PlayerId, number>();
```

When calling `buildStoredDeterministicSessionRecord`, compute the optional frame immediately before the call:

```ts
const displayFrameResult =
  result.snapshot === undefined
    ? undefined
    : createReplayDisplayFrameFromSnapshot({
        index: replayDisplayFrameCount,
        actionIndex: entrySeq,
        label: envelope.request.type,
        snapshot: result.snapshot,
        previousEventSeqByPlayer: replayDisplayEventSeqByPlayer,
      });
if (displayFrameResult !== undefined) {
  replayDisplayFrameCount += 1;
  replayDisplayEventSeqByPlayer = new Map(
    displayFrameResult.nextEventSeqByPlayer,
  );
}
```

Pass it into the builder:

```ts
replayDisplayFrame: displayFrameResult?.frame,
```

Do not add display frames for rejected actions.

- [ ] **Step 6: Preserve frame data during compaction**

In `compactStoredDeterministicSessionRecord`, keep the field:

```ts
...(record.replayDisplayFrame === undefined
  ? {}
  : { replayDisplayFrame: record.replayDisplayFrame }),
```

- [ ] **Step 7: Run the session tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/match-session.test.ts packages/match-server/src/deterministic-entry-builder.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/match-server/src/session-types.ts packages/match-server/src/deterministic-entry-builder.ts packages/match-server/src/match-session.ts packages/match-server/src/match-session.test.ts
git commit -m "feat: capture replay display frames in session records"
```

---

### Task 3: Persist Display Artifact On Completed Matches And In Replay SQL

**Files:**

- Modify: `contracts/database-schema-v6.sql`
- Modify: `specs/10-database-schema.md`
- Modify: `tests/contracts/database-schema-contract.test.mjs`
- Modify: `packages/match-server/src/local-completed-match-record.ts`
- Modify: `packages/match-server/src/local-completed-match-record.test.ts`
- Modify: `packages/match-server/src/postgres-completed-match.ts`
- Modify: `packages/match-server/src/postgres-completed-match.test.ts`

- [ ] **Step 1: Write the failing local completed-match test**

In `packages/match-server/src/local-completed-match-record.test.ts`, add a focused test that builds a completed record with one deterministic record containing `replayDisplayFrame`. Use the existing imports and helpers in this file. The assertion must be:

```ts
expect(record?.replay.replayDisplayArtifact).toMatchObject({
  replayDisplayVersion: "display-v1",
  frameCount: 1,
  frames: [{ label: "submitAction" }],
});
expect(JSON.stringify(record?.replay.deterministicEntries)).not.toContain(
  "replayDisplayFrame",
);
expect(JSON.stringify(record?.replay.deterministicEntries)).not.toContain(
  "snapshot",
);
```

- [ ] **Step 2: Run the failing local completed-match test**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/local-completed-match-record.test.ts
```

Expected: fail because `replayDisplayArtifact` is not written.

- [ ] **Step 3: Write display artifact in `local-completed-match-record.ts`**

Import:

```ts
import { createReplayDisplayArtifact } from "./replay-display-artifact.js";
```

Before the returned object, add:

```ts
const replayDisplayArtifact = createReplayDisplayArtifact({
  frames: input.deterministicRecords.flatMap((record) =>
    record.replayDisplayFrame === undefined ? [] : [record.replayDisplayFrame],
  ),
});
```

Add to `replay`:

```ts
replayDisplayArtifact: jsonObject(replayDisplayArtifact),
```

- [ ] **Step 4: Add `replay_display_artifact` to the schema contract**

In `contracts/database-schema-v6.sql`, add this column to `CREATE TABLE match_replays` after `checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb,`:

```sql
  replay_display_artifact JSONB NOT NULL DEFAULT '{"replayDisplayVersion":"display-v1","frameCount":0,"frames":[]}'::jsonb,
```

Add this check near the existing JSON checks:

```sql
  CHECK (jsonb_typeof(replay_display_artifact) = 'object'),
```

Make the same column/check change in the explanatory snippet in `specs/10-database-schema.md`.

- [ ] **Step 5: Update the database contract test**

In `tests/contracts/database-schema-contract.test.mjs`, add:

```js
assert.match(schemaSql, /replay_display_artifact\s+JSONB\s+NOT\s+NULL/i);
assert.match(
  schemaSql,
  /CHECK\s*\(\s*jsonb_typeof\s*\(\s*replay_display_artifact\s*\)\s*=\s*'object'\s*\)/i,
);
```

- [ ] **Step 6: Wire `postgres-completed-match.ts` writes**

In `CompletedMatchReplayRecord`, add:

```ts
readonly replayDisplayArtifact: JsonObject;
```

In `replayValues`, insert `jsonParam(replay.replayDisplayArtifact)` after `jsonParam(replay.checkpoints)`.

In `createSaveReplaySql`, add `replay_display_artifact` after `checkpoints`, add one new `$` placeholder cast as `::jsonb`, and renumber the following placeholders by one.

In the `ON CONFLICT` update list, add:

```sql
    replay_display_artifact = EXCLUDED.replay_display_artifact,
```

- [ ] **Step 7: Wire replay detail reads**

In both `replayDetailSql` and `replayPublicDetailSql`, add:

```sql
'replayDisplayArtifact', replay.replay_display_artifact,
```

to the `jsonb_build_object(...)` replay payload. Public detail must include it because the viewer uses public replay detail.

- [ ] **Step 8: Write and run persistence tests**

In `packages/match-server/src/postgres-completed-match.test.ts`, update the replay fixture object used by the save/read round-trip to include:

```ts
replayDisplayArtifact: {
  replayDisplayVersion: "display-v1",
  frameCount: 1,
  frames: [
    {
      index: 0,
      actionIndex: null,
      label: "Initial state",
      stateSeq: 1,
      actionSeq: 0,
      status: "active",
      activePlayerId: "p1",
      snapshot: { players: {} },
    },
  ],
},
```

Assert the read replay contains the same `replayDisplayArtifact`.

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/postgres-completed-match.test.ts tests/contracts/database-schema-contract.test.mjs
```

Expected: pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add contracts/database-schema-v6.sql specs/10-database-schema.md tests/contracts/database-schema-contract.test.mjs packages/match-server/src/local-completed-match-record.ts packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/postgres-completed-match.ts packages/match-server/src/postgres-completed-match.test.ts
git commit -m "feat: persist replay display artifacts"
```

---

### Task 4: Serve Display Artifact And Stop Detail-Time Frame Reconstruction

**Files:**

- Modify: `packages/match-server/src/replay-route.ts`
- Modify: `packages/match-server/src/match-http-server-replay.test.ts`
- Modify: `packages/client/src/replay-client.ts`
- Modify: `packages/client/src/replay-client.test.ts`

- [ ] **Step 1: Update replay route tests for display-v1 detail**

In `packages/match-server/src/match-http-server-replay.test.ts`, update `replayDetail()` so `replay.replay` includes:

```ts
replayDisplayArtifact: {
  replayDisplayVersion: "display-v1",
  frameCount: 1,
  frames: [
    {
      index: 0,
      actionIndex: null,
      label: "Initial state",
      stateSeq: 1,
      actionSeq: 0,
      status: "active",
      activePlayerId: "p1",
      snapshot: {
        stateSeq: 1,
        actionSeq: 0,
        stateHash: "hash-1",
        status: "active",
        turn: {},
        activePlayerId: "p1",
        players: {
          p1: {
            view: { self: {}, opponent: {}, timers: { players: {} }, events: [] },
            actions: [],
          },
        },
      },
    },
  ],
},
```

Update `assertReplayDetailBody` so expected public detail includes `replayDisplayArtifact` and still has `frameReconstruction === undefined`.

- [ ] **Step 2: Add a no-frame-endpoint viewer contract test**

In the same test file, add:

```ts
test("display-v1 replay detail does not require frame chunk reconstruction", async () => {
  const repository = createFakeReplayRepository();
  const server = await createMatchHttpServer({
    createDefaultMatch: false,
    replayRepository: repository,
  });
  await server.listen(0, "127.0.0.1");
  try {
    const response = await fetch(`${server.url()}/api/replays/match-1`);
    const body = (await response.json()) as {
      replay?: CompletedMatchReplayDetail;
      frameReconstruction?: unknown;
    };

    assert.equal(response.status, 200);
    assert.equal(body.frameReconstruction, undefined);
    assert.equal(
      body.replay?.replay["replayDisplayArtifact"] !== undefined,
      true,
    );
    assert.deepEqual(repository.detailCalls, []);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 3: Run the route test**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/match-http-server-replay.test.ts
```

Expected: pass after public replay detail includes `replayDisplayArtifact`. If it fails, fix repository fake expectations and `replay-route.ts`; do not add frame reconstruction to detail.

- [ ] **Step 4: Add client replay payload types**

In `packages/client/src/replay-client.ts`, add:

```ts
export interface ReplayDisplayFramePayload {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly stateSeq: number;
  readonly actionSeq: number;
  readonly status: string;
  readonly activePlayerId: string;
  readonly snapshot: unknown;
}

export interface ReplayDisplayArtifactPayload {
  readonly replayDisplayVersion: "display-v1";
  readonly frameCount: number;
  readonly frames: readonly ReplayDisplayFramePayload[];
}
```

Add to `ReplayPayload`:

```ts
readonly replayDisplayArtifact?: ReplayDisplayArtifactPayload | undefined;
```

- [ ] **Step 5: Add client parser test**

In `packages/client/src/replay-client.test.ts`, add a `getReplay` response fixture with `replay.replayDisplayArtifact` and assert:

```ts
assert.equal(
  replay.replay.replayDisplayArtifact?.replayDisplayVersion,
  "display-v1",
);
assert.equal(replay.frameReconstruction, undefined);
```

Run:

```bash
corepack pnpm exec vitest run packages/client/src/replay-client.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/match-server/src/replay-route.ts packages/match-server/src/match-http-server-replay.test.ts packages/client/src/replay-client.ts packages/client/src/replay-client.test.ts
git commit -m "feat: serve replay display artifacts"
```

---

### Task 5: Restore One-Load Local Replay Viewer Playback

**Files:**

- Create: `packages/client/src/react/replay-display-frame.ts`
- Create: `packages/client/src/react/replay-display-frame.test.ts`
- Modify: `packages/client/src/react/ReplayViewerPage.tsx`
- Modify: `packages/client/src/react/ReplayViewerPage.test.ts`
- Modify: `packages/client/src/react/replay-match-client.ts`
- Modify: `packages/client/src/react/replay-match-client.test.ts`

- [ ] **Step 1: Write the failing display adapter test**

Create `packages/client/src/react/replay-display-frame.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { replayFramesFromDisplayArtifact } from "./replay-display-frame.js";

describe("replay display frame adapter", () => {
  test("converts display-v1 frames into replay frames", () => {
    const frames = replayFramesFromDisplayArtifact({
      matchId: "match-1",
      manifestSnapshot: {
        cards: {
          L1: { cardId: "L1", name: "Leader", category: "leader" },
        },
      },
      artifact: {
        replayDisplayVersion: "display-v1",
        frameCount: 1,
        frames: [
          {
            index: 0,
            actionIndex: null,
            label: "Initial state",
            stateSeq: 1,
            actionSeq: 0,
            status: "active",
            activePlayerId: "p1",
            snapshot: {
              stateSeq: 1,
              actionSeq: 0,
              status: "active",
              players: {
                p1: {
                  view: {
                    self: { leader: { instanceId: "leader-1", cardId: "L1" } },
                    opponent: {},
                    events: [],
                  },
                  actions: [],
                },
              },
            },
          },
        ],
      },
    });

    expect(frames).toHaveLength(1);
    expect(frames[0]?.index).toBe(0);
    expect(frames[0]?.label).toBe("Initial state");
    expect(frames[0]?.clientState.seat.playerId).toBe("p1");
  });
});
```

- [ ] **Step 2: Run the failing adapter test**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/replay-display-frame.test.ts
```

Expected: fail because `replay-display-frame.ts` does not exist.

- [ ] **Step 3: Extract reusable frame/catalog helpers**

In `packages/client/src/react/replay-match-client.ts`, export `replayFrameFromSnapshot` or move it and its manifest catalog helpers into `replay-display-frame.ts`. Keep `createReplayMatchClient` in `replay-match-client.ts`.

The new adapter must validate `snapshot.players` before casting:

```ts
export const replayFramesFromDisplayArtifact = (input: {
  readonly matchId: string;
  readonly manifestSnapshot: unknown;
  readonly artifact: ReplayDisplayArtifactPayload;
}): readonly ReplayFrame[] =>
  input.artifact.frames.flatMap((frame) => {
    if (!isRecord(frame.snapshot) || !isRecord(frame.snapshot["players"])) {
      return [];
    }
    return replayFrameFromSnapshot({
      frameIndex: frame.index,
      label: frame.label,
      manifestSnapshot: input.manifestSnapshot,
      matchId: input.matchId,
      snapshot: frame.snapshot as unknown as MatchSnapshot,
    });
  });
```

- [ ] **Step 4: Rewrite `ReplayViewerPage.tsx` to remove chunk loading**

Remove these concerns from `ReplayViewerPage.tsx`:

- `ReplayFrameChunkPayload`
- `ReplayFrameReconstructionPayload`
- `useRef`
- `initialReplayFrameChunkLimit`
- `playbackReplayFrameChunkLimit`
- `replayFrameWindowForIndex`
- `frameChunkToReplayFrames`
- `mergeReplayFrames`
- `framesByIndex`
- `frameCount`
- `frameError`
- `framesRequestLoading`
- `loadingFrameWindowRef`
- the `useEffect` that calls `client.getReplayFrames(...)`

Add:

```ts
const frames = useMemo(
  () =>
    replay?.replay.replayDisplayArtifact === undefined
      ? []
      : replayFramesFromDisplayArtifact({
          matchId: replay.matchId,
          manifestSnapshot: replay.replay.manifestSnapshot,
          artifact: replay.replay.replayDisplayArtifact,
        }),
  [replay],
);
```

Derive:

```ts
const boardFrameCount = frames.length;
const selectedFrameIndex =
  boardFrameCount === 0 ? 0 : Math.min(frameIndex, boardFrameCount - 1);
const selectedFrame = frames[selectedFrameIndex];
```

Keep the existing play/pause/previous/next/range/speed control behavior, but advance only when `selectedFrame !== undefined`.

- [ ] **Step 5: Update viewer tests**

In `packages/client/src/react/ReplayViewerPage.test.ts`:

- remove source-scan tests that require `getReplayFrames`
- add a test that renders a display-v1 replay and confirms no frame endpoint call is made
- add a test that selecting a range frame changes local frame state
- keep the existing no-overlap/transport tests if they still apply

The network assertion should use the existing fake replay client pattern in the file. It must fail if `getReplayFrames` is called.

- [ ] **Step 6: Run focused client tests**

Run:

```bash
corepack pnpm exec vitest run packages/client/src/react/replay-display-frame.test.ts packages/client/src/react/replay-match-client.test.ts packages/client/src/react/ReplayViewerPage.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/client/src/react/replay-display-frame.ts packages/client/src/react/replay-display-frame.test.ts packages/client/src/react/replay-match-client.ts packages/client/src/react/replay-match-client.test.ts packages/client/src/react/ReplayViewerPage.tsx packages/client/src/react/ReplayViewerPage.test.ts
git commit -m "feat: play replay display frames locally"
```

---

### Task 6: Isolate Or Remove Legacy Frame Reconstruction

**Files:**

- Modify: `packages/match-server/src/replay-route.ts`
- Modify/Delete: `packages/match-server/src/replay-frame-cache.ts`
- Modify/Delete: `packages/match-server/src/replay-frame-cache.test.ts`
- Modify/Delete: `packages/match-server/src/replay-frame-worker.ts`
- Modify/Delete: `packages/match-server/src/replay-frame-worker-dispatch.ts`
- Modify: `packages/match-server/src/replay-frame-reconstruction.ts`
- Modify: `packages/match-server/src/replay-frame-reconstruction.test.ts`
- Modify: `packages/client/src/replay-client.ts`

- [ ] **Step 1: Search for remaining normal-frame callers**

Run:

```bash
rg -n "getReplayFrames|/frames|replayFrameCache|reconstructReplayFramesOffThread|replay-frame-worker|replay-frame-cache" packages
```

Expected after Task 5: no client viewer code calls `getReplayFrames`; only server legacy route/tests may remain.

- [ ] **Step 2: Rename the fallback explicitly**

If old replay support is kept, rename server-only concepts so the danger is visible:

- `ReplayFrameCache` -> `LegacyReplayFrameCache`
- `createReplayFrameCache` -> `createLegacyReplayFrameCache`
- `reconstructReplayFrames` route usage -> `legacyReplayFrameReconstruction`

Keep the `/api/replays/:matchId/frames` route only for old rows without `replayDisplayArtifact`. It must return a `410` or a clear failed payload for display-v1 rows so the viewer cannot accidentally depend on it.

- [ ] **Step 3: Add regression test for display-v1 frame route**

In `match-http-server-replay.test.ts`, add:

```ts
test("display-v1 replays do not use the legacy frame endpoint", async () => {
  const repository = createFakeReplayRepository();
  const server = await createMatchHttpServer({
    createDefaultMatch: false,
    replayRepository: repository,
  });
  await server.listen(0, "127.0.0.1");
  try {
    const response = await fetch(
      `${server.url()}/api/replays/match-1/frames?start=0&limit=1`,
    );
    const body = (await response.json()) as { errors?: readonly string[] };

    assert.equal(response.status, 410);
    assert.match(body.errors?.[0] ?? "", /display artifact/i);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 4: Delete worker files if no legacy caller remains**

If the search in Step 1 shows no required legacy caller, delete:

- `packages/match-server/src/replay-frame-cache.ts`
- `packages/match-server/src/replay-frame-cache.test.ts`
- `packages/match-server/src/replay-frame-worker.ts`
- `packages/match-server/src/replay-frame-worker-dispatch.ts`

If legacy support remains, keep the files renamed as legacy and do not import them from normal replay detail.

- [ ] **Step 5: Run server replay tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/match-http-server-replay.test.ts packages/match-server/src/replay-frame-reconstruction.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/match-server/src packages/client/src/replay-client.ts
git commit -m "fix: isolate legacy replay frame reconstruction"
```

---

### Task 7: Add Replay Size And Hidden-Information Guards

**Files:**

- Modify: `packages/match-server/src/replay-display-artifact.ts`
- Modify: `packages/match-server/src/replay-display-artifact.test.ts`
- Modify: `packages/match-server/src/local-completed-match-record.test.ts`

- [ ] **Step 1: Add size helper**

In `replay-display-artifact.ts`, add:

```ts
export const replayDisplayAverageFrameByteSize = (
  artifact: ReplayDisplayArtifactV1,
): number =>
  artifact.frameCount === 0
    ? 0
    : Math.ceil(replayDisplayArtifactByteSize(artifact) / artifact.frameCount);
```

- [ ] **Step 2: Add size budget test**

In `replay-display-artifact.test.ts`, add:

```ts
test("synthetic compact frames stay below the replay display size budget", () => {
  const frames = Array.from(
    { length: 10 },
    (_, index) =>
      createReplayDisplayFrameFromSnapshot({
        index,
        actionIndex: index === 0 ? null : index - 1,
        label: index === 0 ? "Initial state" : "submitAction",
        snapshot: snapshot([index + 1]),
        previousEventSeqByPlayer: new Map(),
      }).frame,
  );
  const artifact = createReplayDisplayArtifact({ frames });

  expect(replayDisplayArtifactByteSize(artifact)).toBeLessThan(25_000);
  expect(replayDisplayAverageFrameByteSize(artifact)).toBeLessThan(2_500);
});
```

- [ ] **Step 3: Add completed-record size assertion**

In `local-completed-match-record.test.ts`, assert the real fixture completed record has a byte size and average frame size logged in the assertion failure:

```ts
const artifact = record?.replay.replayDisplayArtifact;
expect(artifact).toBeDefined();
if (artifact === undefined) {
  throw new Error("Expected replay display artifact.");
}
const byteSize = Buffer.byteLength(JSON.stringify(artifact), "utf8");
expect(byteSize, `display artifact bytes: ${String(byteSize)}`).toBeLessThan(
  250_000,
);
```

Use this as a first guard. If it fails, inspect the artifact and remove repeated data before raising the limit.

- [ ] **Step 4: Add hidden/private string guard**

Add an assertion to the completed-record test:

```ts
const serialized = JSON.stringify(artifact);
expect(serialized).not.toContain("rng");
expect(serialized).not.toContain("deckCardIds");
expect(serialized).not.toContain("donDeckCardIds");
expect(serialized).not.toContain("hidden");
```

- [ ] **Step 5: Run size and hidden-info tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/replay-display-artifact.test.ts packages/match-server/src/local-completed-match-record.test.ts tests/hidden-info
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/match-server/src/replay-display-artifact.ts packages/match-server/src/replay-display-artifact.test.ts packages/match-server/src/local-completed-match-record.test.ts
git commit -m "test: guard replay display artifact size"
```

---

### Task 8: Full Verification, Deployment Readiness, And Push

**Files:**

- No planned source edits.

- [ ] **Step 1: Run focused replay checks**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/replay-display-artifact.test.ts packages/match-server/src/match-session.test.ts packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/postgres-completed-match.test.ts packages/match-server/src/match-http-server-replay.test.ts packages/client/src/replay-client.test.ts packages/client/src/react/replay-display-frame.test.ts packages/client/src/react/replay-match-client.test.ts packages/client/src/react/ReplayViewerPage.test.ts tests/contracts/database-schema-contract.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
corepack pnpm run typecheck
```

Expected: pass.

- [ ] **Step 3: Run full verify**

Run:

```bash
corepack pnpm run verify
```

Expected: pass.

- [ ] **Step 4: Record exact replay size numbers**

Run the focused completed-record test with the size assertion enabled and record the artifact byte size and average bytes per frame in the final response. If the test output does not print the number, temporarily inspect the artifact in the test or with a local script, then remove any temporary code before committing.

- [ ] **Step 5: Check worktree**

Run:

```bash
git status --short --branch
```

Expected: no unstaged or uncommitted files.

- [ ] **Step 6: Push**

Run:

```bash
git push origin dev
```

Expected: push succeeds.

---

## Self-Review Checklist For The Implementer

- [ ] `display-v1` replay detail works without `/frames`.
- [ ] `ReplayViewerPage.tsx` no longer imports or calls `getReplayFrames`.
- [ ] `reconstructReplayArtifactStates` is not used for display-v1 viewing.
- [ ] `deterministicEntries` still contain only deterministic entry data.
- [ ] `audit.result` still does not persist full snapshots.
- [ ] `replay_display_artifact` is included in contract SQL, spec SQL, save SQL, detail SQL, and public detail SQL.
- [ ] Rollback tests still pass.
- [ ] Hidden-info tests still pass.
- [ ] Full `corepack pnpm run verify` passes.
- [ ] Final response includes replay artifact byte counts.

## Review Loop Notes

This version removed the non-implementable parts from the first draft:

- Removed fake helper names such as `createTestMatchSession`, `validActionForCurrentState`, `requestReplayDetail`, and `replayWithDisplayArtifact`.
- Replaced conditional persistence guidance with an explicit `replay_display_artifact` JSONB column.
- Replaced full `DevMatchSnapshot` storage with compact display snapshots that strip legal actions and store event deltas.
- Anchored tests to real current files and existing test names.
- Added schema/spec/test updates required by the repo authority order.
