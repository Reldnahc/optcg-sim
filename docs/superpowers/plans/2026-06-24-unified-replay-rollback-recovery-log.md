# Unified Replay, Recovery, and Rollback Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make completed replay reconstruction, active match crash recovery, and rollback restore share one deterministic checkpoint-plus-entry system so valid replay artifacts do not depend on UI action indexes, transport envelopes, current legal-action ordering, saved viewer frames, or full final-state blobs.

**Architecture:** The server resolves each accepted client request into an exact deterministic operation before mutating the match. That accepted operation is written to a shared deterministic log with before/after sequence and hash metadata; replay and recovery consume that log, while live rollback continues restoring from authoritative `GameState` checkpoints until the shared checkpoint owner can replace the duplicated storage safely.

**Tech Stack:** TypeScript strict mode, `@optcg/types`, `@optcg/engine-core`, `packages/match-server`, Vitest, Redis persistence, Postgres replay rows, canonical state hashing.

---

## Why This Exists

The current replay system has the right database columns but the wrong authority model. New completed replays write `deterministicEntries`, but those entries are currently compacted `StoredSessionRecord` objects. The replay reducer then tries to reconstruct game state from `record.envelope.request`.

That means a completed replay can depend on:

- `submitAction.actionIndex`
- current `getLegalActions()` ordering
- current special-case replay code for mulligan and phase advance
- current server request wrapper shape
- saved snapshots if reconstruction fails
- disabled final hash verification when timer state is present

That is not deterministic enough. It also means active match recovery has the same failure mode, because `dev-local-match-recovery.ts` replays `record.envelope` through `createMatchSessionRuntime(...).applyEnvelope(record.envelope)`.

The target shape is:

```text
client envelope
  -> server validates envelope and request hash
  -> server resolves exact accepted deterministic operation
  -> shared deterministic executor applies that operation
  -> server records deterministic entry with before/after seq/hash
  -> audit log records transport envelope separately
  -> replay/recovery apply the deterministic entries, not the envelope
```

Rollback already has the correct core primitive: a saved authoritative `GameState` checkpoint. Do not break that while introducing the shared log. The first implementation must preserve `LocalRollbackPoint.state` restore behavior exactly, then make rollback checkpoints visible to the same log/checkpoint module used by replay and recovery.

## Spec Authority

Use these sections as the highest local authority for the implementation:

- `specs/08-replay-rollback-recovery.md`, section `08-replay-rollback-recovery.s002`: replay reconstructs from initial state/deck orders, versions, ordered actions, ordered decision responses, checkpoint hashes, and optional snapshots.
- `specs/08-replay-rollback-recovery.md`, section `08-replay-rollback-recovery.s004`: client envelopes, timestamps, connection IDs, and signatures are audit metadata only; deterministic replay inputs are `Action`, `DecisionResponse`, and system events.
- `specs/08-replay-rollback-recovery.md`, section `08-replay-rollback-recovery.s005`: replay must store a pinned manifest snapshot or reference, not consult live card data.
- `specs/08-replay-rollback-recovery.md`, section `08-replay-rollback-recovery.s006`: checkpoints store state hashes and optional snapshot references, including after rollback.
- `specs/18-acceptance-tests.md`, section `18-acceptance-tests.s015`: `RPL-001` requires post-game replay to reveal hidden information required for exact reconstruction.
- `specs/18-acceptance-tests.md`, section `18-acceptance-tests.s016`: `CONTRACT-005` requires replay reconstruction source.

## Non-Negotiable Invariants

- New replay artifacts must never use `ClientActionEnvelope`, `SessionActionRequest`, `submitAction.actionIndex`, `clientActionId`, timestamps, signatures, connection ids, or transport metadata as deterministic replay authority.
- New replay artifacts may store envelopes only in `auditEntries`.
- The exact `Action`, exact `DecisionResponse`, or exact system operation accepted by the server must be persisted at the same boundary where it is applied.
- Replay and recovery must apply deterministic entries through the same executor.
- Recovery must verify per-entry sequence and hash metadata. A mismatch freezes the match instead of continuing from a corrupt state.
- Live rollback restore must continue restoring from a cloned `GameState` checkpoint. The first implementation must not replace rollback restore with replay reduction.
- Rollback checkpoints, recovery snapshots, and replay checkpoints must share type definitions and hash verification rules.
- Timer behavior must be represented deterministically or excluded from the replay hash scope explicitly. A final hash gate must not be silently disabled.
- Legacy envelope-shaped replay rows may have an isolated compatibility adapter, but that adapter must be version-gated and must not be used for new replay rows.
- Hidden information needed for post-game replay may be present in completed replay artifacts. Live player/spectator views must remain filtered.

## Current Code Boundaries

### Files To Create

- `packages/types/src/replay.ts`
  - Owns shared deterministic replay, recovery, checkpoint, and audit-reference types.
  - Exported from `packages/types/src/index.ts`.
- `packages/engine-core/src/replay/deterministic-operation.ts`
  - Applies one deterministic operation to a `GameState`.
  - Owns phase/mulligan continuation policy currently duplicated in match-server and replay reducer.
- `packages/engine-core/src/replay/deterministic-entry.ts`
  - Applies one `DeterministicMatchEntry`, validates before/after seq/hash, and returns a frame/result.
- `packages/match-server/src/deterministic-entry-builder.ts`
  - Converts accepted local apply results into `StoredDeterministicSessionRecord`.
  - Keeps server audit metadata out of shared engine-core.
- `packages/match-server/src/deterministic-entry-legacy.ts`
  - Version-gated adapter for old envelope-shaped rows only.
- `packages/match-server/src/deterministic-recovery.ts`
  - Replaces envelope replay in `dev-local-match-recovery.ts` with deterministic entry replay.

### Files To Modify

- `packages/types/src/index.ts`
  - Export `./replay.js`.
- `packages/match-server/src/session-types.ts`
  - Add deterministic record fields and persistence snapshot fields while retaining compatibility with existing `actions` and `decisions`.
- `packages/match-server/src/local-match.ts`
  - Split "resolve action from current legal actions" from "apply resolved deterministic operation".
  - Return accepted deterministic operation metadata from `applyLocalDevAction` and `applyLocalDevDecision`.
- `packages/match-server/src/match-session.ts`
  - Store exact deterministic records for accepted requests.
  - Store compact envelope records as audit only.
- `packages/match-server/src/redis-match-persistence.ts`
  - Persist deterministic entries for active match recovery.
  - Read legacy `actions` and `decisions` until all active dev matches are recreated.
- `packages/match-server/src/dev-local-match-recovery.ts`
  - Use deterministic entry replay and checkpoint verification.
- `packages/match-server/src/local-completed-match-record.ts`
  - Write deterministic entries into `replay.deterministicEntries`.
  - Write envelope/session metadata into `replay.auditEntries`.
  - Stop using full `finalState` as routine replay authority.
- `packages/match-server/src/postgres-completed-match.ts`
  - Preserve JSON shape and projection; validate new `replayFormatVersion`.
- `packages/match-server/src/replay-frame-reconstruction.ts`
  - Consume engine-core deterministic frame reconstruction only.
  - Keep saved snapshot fallback only for legacy rows or explicit debug rows.
- `packages/engine-core/src/replay/artifact-reducer.ts`
  - Replace envelope parser with deterministic entry reducer.
- `contracts/database-schema-v6.sql`
  - Keep existing `deterministic_entries`, `audit_entries`, and `checkpoints` columns.
  - Add constraints only if needed for version format; no new full-state JSON column is required.
- `docs/superpowers/specs/2026-06-24-replay-viewer-design.md`
  - Amend wording so `finalState` is optional debug/storage data, not required routine replay authority.

### Tests To Add Or Modify

- `packages/types/src/replay.test.ts`
- `packages/engine-core/src/replay/deterministic-operation.test.ts`
- `packages/engine-core/src/replay/deterministic-entry.test.ts`
- `packages/engine-core/src/replay/artifact-reducer.test.ts`
- `packages/match-server/src/match-session.test.ts`
- `packages/match-server/src/dev-local-match-recovery.test.ts`
- `packages/match-server/src/local-completed-match-record.test.ts`
- `packages/match-server/src/replay-frame-reconstruction.test.ts`
- `packages/match-server/src/match-http-server-replay.test.ts`
- `tests/contracts/database-schema-v6.test.mjs` or the existing DB schema validator test if that is where replay constraints are asserted.

## Shared Data Contract

Create `packages/types/src/replay.ts` with this contract. The names are intentionally explicit so replay, recovery, and rollback code cannot confuse transport/audit metadata with deterministic inputs.

```ts
import type {
  Action,
  DecisionId,
  DecisionResponse,
  EngineEventId,
  GameState,
  MatchId,
  PlayerId,
  StateSeq,
} from "./index.js";

export type ReplayHashScope = "gameplay-v1" | "operational-v1";

export interface DeterministicEntryVerification {
  readonly stateSeqBefore: StateSeq;
  readonly actionSeqBefore: number;
  readonly stateHashBefore: string;
  readonly stateSeqAfter: StateSeq;
  readonly actionSeqAfter: number;
  readonly stateHashAfter: string;
  readonly hashScope: ReplayHashScope;
}

export type DeterministicSystemOperation =
  | {
      readonly type: "requestRollbackConsent";
      readonly playerId: PlayerId;
      readonly rollbackPointId: string;
      readonly approvingPlayerId: PlayerId;
      readonly decisionId: DecisionId;
      readonly prompt: string;
    }
  | {
      readonly type: "cancelRollbackConsent";
      readonly playerId: PlayerId;
      readonly rollbackPointId: string;
      readonly decisionId?: DecisionId;
    }
  | {
      readonly type: "restoreRollbackPoint";
      readonly rollbackPointId: string;
      readonly requestedBy: PlayerId;
      readonly approvedBy: PlayerId;
      readonly restoredStateHash: string;
      readonly restoredStateSeq: StateSeq;
      readonly restoredActionSeq: number;
    };

export type DeterministicMatchEntry =
  | {
      readonly formatVersion: "deterministic-entry-v1";
      readonly matchId: MatchId;
      readonly entrySeq: number;
      readonly kind: "action";
      readonly playerId: PlayerId;
      readonly action: Action;
      readonly verification: DeterministicEntryVerification;
    }
  | {
      readonly formatVersion: "deterministic-entry-v1";
      readonly matchId: MatchId;
      readonly entrySeq: number;
      readonly kind: "decision";
      readonly playerId: PlayerId;
      readonly decisionId: DecisionId;
      readonly response: DecisionResponse;
      readonly verification: DeterministicEntryVerification;
    }
  | {
      readonly formatVersion: "deterministic-entry-v1";
      readonly matchId: MatchId;
      readonly entrySeq: number;
      readonly kind: "system";
      readonly operation: DeterministicSystemOperation;
      readonly verification: DeterministicEntryVerification;
    };

export interface DeterministicCheckpoint {
  readonly checkpointVersion: "deterministic-checkpoint-v1";
  readonly matchId: MatchId;
  readonly checkpointId: string;
  readonly reason:
    | "initial"
    | "turnStart"
    | "rollbackPoint"
    | "rollbackRestore"
    | "recoverySnapshot"
    | "matchEnd";
  readonly stateSeq: StateSeq;
  readonly actionSeq: number;
  readonly stateHash: string;
  readonly hashScope: ReplayHashScope;
  readonly eventId?: EngineEventId;
  readonly snapshot?: GameState;
  readonly snapshotRef?: string;
}
```

Implementation notes:

- If `StateSeq` is not exported cleanly through `@optcg/types`, export it from `packages/types/src/primitives.ts` through `index.ts` before adding this file.
- `DeterministicSystemOperation` is deliberately narrow. Do not add a catch-all `{ type: string; payload: unknown }` for new rows.
- `requestRollbackConsent` and `cancelRollbackConsent` are included because both mutate `pendingDecision`/rollback state today. If implementation cannot replay them deterministically in the first pass, new recovery snapshots must fail closed around in-flight rollback consent instead of pretending those transitions are covered.
- The rollback restore operation records what was restored, but live rollback restore must still use the checkpoint snapshot, not replay reduction.
- `ReplayHashScope` fixes the timer problem. `gameplay-v1` excludes wall-clock timer drift; `operational-v1` includes timer state only after timer operations are logged deterministically.

## Hash Policy

The existing `hashCanonicalStateValue(input.match.state)` includes enough state to mismatch when live timer state changes but replay logs lack timer inputs. Do not keep disabling final hash verification.

Implement a named hash helper:

```ts
export const hashReplayGameplayState = (state: GameState): string => {
  const clone = structuredClone(state);
  clone.timers = {
    drainingPlayerId: clone.timers.drainingPlayerId,
    players: Object.fromEntries(
      Object.entries(clone.timers.players).map(([playerId, timer]) => [
        playerId,
        { ...timer, remainingMs: 0, isRunning: false },
      ]),
    ),
    ...(clone.timers.disconnects === undefined
      ? {}
      : {
          disconnects: Object.fromEntries(
            Object.entries(clone.timers.disconnects).map(
              ([playerId, timer]) => {
                const {
                  currentDisconnectElapsedMs: _elapsed,
                  disconnectStartedRemainingMs: _startedRemaining,
                  ...stableTimer
                } = timer;
                return [
                  playerId,
                  {
                    ...stableTimer,
                    remainingMs: 0,
                    isRunning: false,
                  },
                ];
              },
            ),
          ),
        }),
  };
  return hashCanonicalStateValue(clone);
};
```

This uses the current `TimerState` shape from `packages/types/src/runtime.ts`: `drainingPlayerId`, `players`, and optional `disconnects`. The required behavior is:

- `gameplay-v1` replay hashes must ignore wall-clock elapsed timer fields.
- `gameplay-v1` may keep timer ownership/active-player identity, but must normalize all remaining elapsed milliseconds and running flags so local wall-clock drain cannot change replay verification.
- Do not assign optional timer fields to `undefined`; `canonicalSerializeStateValue()` rejects enumerable `undefined`. Omit volatile optional disconnect fields by destructuring them out.
- `operational-v1` hashes must include timer fields only after accepted timer operations are recorded as deterministic entries.
- Every deterministic entry stores its hash scope.
- Completed replay `finalStateHash` must use the same scope declared by entries/checkpoints.
- Add a unit test that changes only `TimerState.players[*].remainingMs`, `isRunning`, and disconnect elapsed fields and proves `hashReplayStateForScope(state, "gameplay-v1")` remains stable while `hashReplayStateForScope(state, "operational-v1")` changes.

## Task 1: Add Failing Contract Tests For The Current Drift

**Files:**

- Create: `packages/engine-core/src/replay/deterministic-entry.test.ts`
- Modify: `packages/engine-core/src/replay/artifact-reducer.test.ts`
- Modify: `packages/match-server/src/dev-local-match-recovery.test.ts`
- Modify: `packages/match-server/src/local-completed-match-record.test.ts`

- [ ] **Step 1: Add an engine-core test proving envelope entries are rejected for new replay format**

Add this test to `packages/engine-core/src/replay/artifact-reducer.test.ts`:

```ts
test("rejects envelope-shaped entries as deterministic replay authority", () => {
  const initialState = minimalReplayState();
  const result = reconstructReplayArtifactStates({
    initialState,
    deterministicEntries: [
      {
        envelope: {
          request: {
            type: "submitAction",
            playerId: "player-1",
            actionIndex: 0,
          },
        },
      },
    ],
    expectedFinalStateHash: undefined,
  });

  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.match(result.reason, /deterministic entry/i);
  }
});
```

Use the existing helper pattern in `artifact-reducer.test.ts` for `minimalReplayState()`. If no helper exists, extract the smallest existing valid state fixture in that file into a named local helper.

- [ ] **Step 2: Add a match-server test proving completed replays do not store envelopes as deterministic entries**

In `packages/match-server/src/local-completed-match-record.test.ts`, add:

```ts
test("stores exact deterministic entries separately from audit envelopes", () => {
  const completed = buildCompletedMatchWithOneAcceptedAction();
  const record = buildLocalCompletedMatchRecord(completed);

  assert.ok(record);
  assert.equal(record.replay.replayFormatVersion, "dev-local-v2");
  assert.equal(record.replay.deterministicEntries[0]?.kind, "action");
  assert.equal(
    Object.hasOwn(record.replay.deterministicEntries[0] as object, "envelope"),
    false,
  );
  assert.equal(record.replay.auditEntries[0]?.type, "clientEnvelope");
});
```

Use existing test setup helpers in the file. If `buildCompletedMatchWithOneAcceptedAction()` does not exist, create a local helper in the test file that uses the same setup code as the current "stores reconstructable replay state" test.

- [ ] **Step 3: Add a recovery test proving recovery does not call `applyEnvelope` for deterministic replay**

In `packages/match-server/src/dev-local-match-recovery.test.ts`, add a test with a deterministic entry whose audit envelope has a stale or impossible `actionIndex`, but whose exact `action` is valid.

```ts
test("recovers from deterministic entries without re-resolving audit envelope action indexes", async () => {
  const fixture = createRecoverableMatchWithOneExactAction();
  const snapshot = {
    ...fixture.snapshot,
    deterministicLogVersion: "deterministic-entry-v1",
    deterministicEntriesSinceSnapshot: [fixture.entry],
    actions: [
      {
        envelope: {
          ...fixture.auditEnvelope,
          request: {
            type: "submitAction",
            playerId: fixture.playerId,
            actionIndex: 9999,
          },
        },
        result: fixture.sessionResult,
        recordedAt: fixture.recordedAt,
      },
    ],
    decisions: [],
  };

  const recovered = await recoverOneSnapshot(snapshot);

  assert.equal(recovered.status, "active");
  assert.equal(
    recovered.match.state.seq,
    fixture.entry.verification.stateSeqAfter,
  );
});
```

Create the helper functions in the test file using existing registry/session recovery fixtures. The important assertion is that the impossible audit action index does not matter when the deterministic entry is present.

- [ ] **Step 4: Run the narrow tests and confirm they fail**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/replay/artifact-reducer.test.ts packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/dev-local-match-recovery.test.ts
```

Expected result:

- At least one failure shows envelope entries are still accepted or written as deterministic entries.
- At least one failure shows recovery still depends on `record.envelope`.

- [ ] **Step 5: Do not commit the red state**

Do not commit intentionally failing tests. Keep the test changes in the worktree while implementing the next tasks, or fold each red test into the task that makes it pass. The first commit containing these tests must be green. If the executor needs to pause after this task, stash only these test edits with an explicit message instead of leaving the branch in a red committed state.

## Task 2: Add Shared Replay Types

**Files:**

- Create: `packages/types/src/replay.ts`
- Modify: `packages/types/src/index.ts`
- Create: `packages/types/src/replay.test.ts`
- Modify: `packages/types/src/export-ownership.manifest.ts` if the export cohesion test requires it.

- [ ] **Step 1: Add type export tests**

Create `packages/types/src/replay.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type {
  DeterministicMatchEntry,
  DeterministicCheckpoint,
} from "./replay.js";
import type { MatchId, PlayerId, StateSeq } from "./primitives.js";

describe("replay shared types", () => {
  test("represents deterministic action entries without transport envelopes", () => {
    const entry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: "match-1" as MatchId,
      entrySeq: 0,
      kind: "action",
      playerId: "player-1" as PlayerId,
      action: { type: "endMainPhase" },
      verification: {
        stateSeqBefore: 1 as StateSeq,
        actionSeqBefore: 0,
        stateHashBefore: "before",
        stateSeqAfter: 2 as StateSeq,
        actionSeqAfter: 1,
        stateHashAfter: "after",
        hashScope: "gameplay-v1",
      },
    };

    expect(entry.kind).toBe("action");
  });

  test("represents rollback checkpoints with optional snapshots", () => {
    const checkpoint: DeterministicCheckpoint = {
      checkpointVersion: "deterministic-checkpoint-v1",
      matchId: "match-1" as MatchId,
      checkpointId: "rollback:1:0:event-1",
      reason: "rollbackPoint",
      stateSeq: 1 as StateSeq,
      actionSeq: 0,
      stateHash: "hash",
      hashScope: "gameplay-v1",
    };

    expect(checkpoint.reason).toBe("rollbackPoint");
  });
});
```

- [ ] **Step 2: Create `packages/types/src/replay.ts`**

Use the full contract from the "Shared Data Contract" section. Import from narrower local files instead of `./index.js` if a circular type-only import trips lint:

```ts
import type { Action, DecisionResponse } from "./decisions.js";
import type { GameState } from "./game-state.js";
import type {
  DecisionId,
  EngineEventId,
  MatchId,
  PlayerId,
  StateSeq,
} from "./primitives.js";
```

- [ ] **Step 3: Export the types**

Modify `packages/types/src/index.ts`:

```ts
export type * from "./replay.js";
```

Place it near `runtime.js` or after `decisions.js`; keep the file alphabetical only if the existing test enforces that.

- [ ] **Step 4: Update export ownership manifest if required**

Run:

```bash
corepack pnpm exec vitest run packages/types/src/export-cohesion.test.ts packages/types/src/replay.test.ts
```

If `export-cohesion.test.ts` reports a missing owner for the replay exports, add the new export names to `packages/types/src/export-ownership.manifest.ts` under the same ownership style used by nearby runtime/game-state exports.

- [ ] **Step 5: Run type package tests**

```bash
corepack pnpm exec vitest run packages/types/src/replay.test.ts packages/types/src/export-cohesion.test.ts packages/types/src/index.test.ts
corepack pnpm exec tsc -p packages/types/tsconfig.json --noEmit
```

Expected result: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/replay.ts packages/types/src/replay.test.ts packages/types/src/index.ts packages/types/src/export-ownership.manifest.ts
git commit -m "feat: add deterministic replay log types"
```

Only stage `export-ownership.manifest.ts` if it changed.

## Task 3: Move Deterministic Operation Application Into Engine-Core

**Files:**

- Create: `packages/engine-core/src/replay/deterministic-operation.ts`
- Create: `packages/engine-core/src/replay/deterministic-operation.test.ts`
- Modify: `packages/engine-core/src/index.ts`
- Later tasks will remove duplicated continuation code from match-server and `artifact-reducer.ts`.

- [ ] **Step 1: Write tests for action, decision, and rollback-system operation application**

Create `packages/engine-core/src/replay/deterministic-operation.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { DeterministicMatchEntry } from "@optcg/types";
import { applyDeterministicOperation } from "./deterministic-operation.js";
import { createReplayOperationFixture } from "./test-fixtures.js";

describe("applyDeterministicOperation", () => {
  test("applies exact action objects without legal action index lookup", () => {
    const fixture = createReplayOperationFixture();
    const entry: DeterministicMatchEntry = fixture.actionEntry({
      action: { type: "endMainPhase" },
    });

    const result = applyDeterministicOperation(fixture.initialState, entry);

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.label).toBe("endMainPhase");
      expect(result.result.state.seq).toBe(entry.verification.stateSeqAfter);
    }
  });

  test("applies exact decision responses by decision id", () => {
    const fixture = createReplayOperationFixture({ pendingMulligan: true });
    const entry: DeterministicMatchEntry = fixture.decisionEntry({
      response: { type: "mulligan", keep: true },
    });

    const result = applyDeterministicOperation(fixture.initialState, entry);

    expect(result.status).toBe("applied");
  });

  test("rejects rollback restore entries without a checkpoint resolver", () => {
    const fixture = createReplayOperationFixture();
    const entry = fixture.rollbackRestoreEntry();

    const result = applyDeterministicOperation(fixture.initialState, entry);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/checkpoint/i);
    }
  });
});
```

If `test-fixtures.js` does not exist in `packages/engine-core/src/replay`, create a small test-only helper file in the same folder. Keep it limited to replay tests.

- [ ] **Step 2: Implement `applyDeterministicOperation`**

Create `packages/engine-core/src/replay/deterministic-operation.ts`:

```ts
import type {
  DeterministicCheckpoint,
  DeterministicMatchEntry,
  EngineResult,
  GameState,
} from "@optcg/types";
import { applyAction } from "../actions.js";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  enterMainPhase,
} from "../turn/phases.js";
import {
  respondToMulliganDecision,
  startMulliganFlow,
} from "../setup/mulligan.js";
import type { PreMulliganSetupGameState } from "../setup/initial-state.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";

export type DeterministicCheckpointResolver = (
  checkpointId: string,
) => DeterministicCheckpoint | undefined;

export type ApplyDeterministicOperationResult =
  | {
      readonly status: "applied";
      readonly result: EngineResult;
      readonly label: string;
    }
  | {
      readonly status: "failed";
      readonly reason: string;
    };

const hasErrors = (
  result: EngineResult,
): result is EngineResult & {
  readonly errors: NonNullable<EngineResult["errors"]>;
} => result.errors !== undefined && result.errors.length > 0;

const combinedEngineResult = (
  result: EngineResult,
  events: EngineResult["events"],
): EngineResult => ({
  ...result,
  events,
});

const advanceToMainPhase = (state: GameState): EngineResult => {
  const events: EngineResult["events"] = [];
  let current = state;
  let currentHash = "";
  for (let stepCount = 0; stepCount < 4; stepCount += 1) {
    if (
      current.turn.phase === "main" ||
      current.status.type !== "active" ||
      current.pendingDecision !== undefined ||
      current.battle !== undefined
    ) {
      return combinedEngineResult(
        { state: current, events, stateHash: currentHash },
        events,
      );
    }
    if (current.turn.phase === "refresh") {
      const result = advanceRefreshPhase(current);
      events.push(...result.events);
      if (hasErrors(result)) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      currentHash = result.stateHash;
      continue;
    }
    if (current.turn.phase === "draw") {
      const result = advanceDrawPhase(current);
      events.push(...result.events);
      if (hasErrors(result)) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      currentHash = result.stateHash;
      continue;
    }
    if (current.turn.phase === "don") {
      const donResult = advanceDonPhase(current);
      events.push(...donResult.events);
      if (hasErrors(donResult)) {
        return combinedEngineResult(donResult, events);
      }
      current = donResult.state;
      currentHash = donResult.stateHash;
      if (current.pendingDecision !== undefined) {
        continue;
      }
      const mainResult = enterMainPhase(current);
      events.push(...mainResult.events);
      if (hasErrors(mainResult)) {
        return combinedEngineResult(mainResult, events);
      }
      current = mainResult.state;
      currentHash = mainResult.stateHash;
      continue;
    }
    return combinedEngineResult(
      { state: current, events, stateHash: currentHash },
      events,
    );
  }
  return combinedEngineResult(
    { state: current, events, stateHash: currentHash },
    events,
  );
};

const startMulliganAfterSetupIfReady = (result: EngineResult): EngineResult => {
  if (
    hasErrors(result) ||
    result.state.status.type !== "setup" ||
    result.state.pendingDecision !== undefined
  ) {
    return result;
  }
  const started = startMulliganFlow(result.state as PreMulliganSetupGameState);
  return combinedEngineResult(started, [...result.events, ...started.events]);
};

const autoAdvanceMandatoryTurnFlow = (result: EngineResult): EngineResult => {
  if (hasErrors(result)) {
    return result;
  }
  const advanced = advanceToMainPhase(result.state);
  return combinedEngineResult(advanced, [...result.events, ...advanced.events]);
};

const finalizeDeterministicResult = (result: EngineResult): EngineResult =>
  autoAdvanceMandatoryTurnFlow(startMulliganAfterSetupIfReady(result));

export const applyDeterministicOperation = (
  state: GameState,
  entry: DeterministicMatchEntry,
  checkpoints?: DeterministicCheckpointResolver,
): ApplyDeterministicOperationResult => {
  if (entry.kind === "action") {
    return {
      status: "applied",
      result: finalizeDeterministicResult(applyAction(state, entry.action)),
      label: entry.action.type,
    };
  }
  if (entry.kind === "decision") {
    const action = {
      type: "respondToDecision" as const,
      decisionId: entry.decisionId,
      response: entry.response,
    };
    const result =
      entry.response.type === "mulligan"
        ? respondToMulliganDecision(state, action)
        : applyAction(state, action);
    return {
      status: "applied",
      result: finalizeDeterministicResult(result),
      label: "respondToDecision",
    };
  }
  if (entry.operation.type === "restoreRollbackPoint") {
    const checkpoint = checkpoints?.(entry.operation.rollbackPointId);
    if (checkpoint?.snapshot === undefined) {
      return {
        status: "failed",
        reason: `Rollback checkpoint ${entry.operation.rollbackPointId} is not available.`,
      };
    }
    const restored = structuredClone(checkpoint.snapshot);
    restored.seq = entry.operation.restoredStateSeq;
    restored.actionSeq = entry.operation.restoredActionSeq;
    return {
      status: "applied",
      result: {
        state: restored,
        events: [],
        stateHash: entry.operation.restoredStateHash,
      },
      label: "restoreRollbackPoint",
    };
  }
  if (entry.operation.type === "requestRollbackConsent") {
    const next = structuredClone(state);
    next.seq = (Number(state.seq) + 1) as GameState["seq"];
    next.pendingDecision = {
      id: entry.operation.decisionId,
      type: "rollbackConsent",
      playerId: entry.operation.approvingPlayerId,
      prompt: entry.operation.prompt,
      causedBy: { type: "ruleProcess", name: "rollbackRequest" },
      visibility: {
        type: "private",
        playerId: entry.operation.approvingPlayerId,
      },
      rollbackPointId: entry.operation.rollbackPointId,
    };
    return {
      status: "applied",
      result: {
        state: next,
        events: [],
        stateHash: hashCanonicalStateValue(next),
      },
      label: "requestRollbackConsent",
    };
  }
  if (entry.operation.type === "cancelRollbackConsent") {
    const next = structuredClone(state);
    next.seq = (Number(state.seq) + 1) as GameState["seq"];
    delete next.pendingDecision;
    return {
      status: "applied",
      result: {
        state: next,
        events: [],
        stateHash: hashCanonicalStateValue(next),
      },
      label: "cancelRollbackConsent",
    };
  }
  return {
    status: "failed",
    reason: `Unsupported deterministic system operation ${entry.operation.type}.`,
  };
};
```

The request/cancel branches must be backed by tests. They intentionally replay the state transition, not the match-server consent bookkeeping; match-server rollback bookkeeping is restored from recovery context, while `GameState.pendingDecision` must be deterministic.

Adjust imports if `@optcg/types` exposes paths differently. Keep all code in engine-core free of React, Redis, Postgres, and HTTP.

- [ ] **Step 3: Export the executor**

Modify `packages/engine-core/src/index.ts`:

```ts
export {
  applyDeterministicOperation,
  type ApplyDeterministicOperationResult,
  type DeterministicCheckpointResolver,
} from "./replay/deterministic-operation.js";
```

- [ ] **Step 4: Run tests**

```bash
corepack pnpm exec vitest run packages/engine-core/src/replay/deterministic-operation.test.ts
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected result: new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine-core/src/replay/deterministic-operation.ts packages/engine-core/src/replay/deterministic-operation.test.ts packages/engine-core/src/index.ts
git commit -m "feat: apply deterministic replay operations"
```

## Task 4: Add Entry Verification Reducer

**Files:**

- Create: `packages/engine-core/src/replay/deterministic-entry.ts`
- Create or modify: `packages/engine-core/src/replay/deterministic-entry.test.ts`
- Modify: `packages/engine-core/src/replay/artifact-reducer.ts`

- [ ] **Step 1: Write verification tests**

In `packages/engine-core/src/replay/deterministic-entry.test.ts`, add:

```ts
import { describe, expect, test } from "vitest";
import { applyDeterministicEntry } from "./deterministic-entry.js";
import { createReplayOperationFixture } from "./test-fixtures.js";

describe("applyDeterministicEntry", () => {
  test("fails before applying when state hash before does not match", () => {
    const fixture = createReplayOperationFixture();
    const entry = fixture.actionEntry({
      action: { type: "endMainPhase" },
      verification: { stateHashBefore: "wrong-before" },
    });

    const result = applyDeterministicEntry(fixture.initialState, entry);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/before/i);
    }
  });

  test("fails after applying when state hash after does not match", () => {
    const fixture = createReplayOperationFixture();
    const entry = fixture.actionEntry({
      action: { type: "endMainPhase" },
      verification: { stateHashAfter: "wrong-after" },
    });

    const result = applyDeterministicEntry(fixture.initialState, entry);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/after/i);
    }
  });
});
```

- [ ] **Step 2: Implement `applyDeterministicEntry`**

Create `packages/engine-core/src/replay/deterministic-entry.ts`:

```ts
import type {
  DeterministicCheckpoint,
  DeterministicMatchEntry,
  GameState,
} from "@optcg/types";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  applyDeterministicOperation,
  type DeterministicCheckpointResolver,
} from "./deterministic-operation.js";

export type DeterministicEntryApplyResult =
  | {
      readonly status: "applied";
      readonly state: GameState;
      readonly stateHash: string;
      readonly label: string;
    }
  | {
      readonly status: "failed";
      readonly reason: string;
    };

export const hashReplayStateForScope = (
  state: GameState,
  hashScope: DeterministicMatchEntry["verification"]["hashScope"],
): string => {
  if (hashScope === "gameplay-v1") {
    const clone = structuredClone(state);
    clone.timers = {
      drainingPlayerId: clone.timers.drainingPlayerId,
      players: Object.fromEntries(
        Object.entries(clone.timers.players).map(([playerId, timer]) => [
          playerId,
          { ...timer, remainingMs: 0, isRunning: false },
        ]),
      ),
      ...(clone.timers.disconnects === undefined
        ? {}
        : {
            disconnects: Object.fromEntries(
              Object.entries(clone.timers.disconnects).map(
                ([playerId, timer]) => {
                  const {
                    currentDisconnectElapsedMs: _elapsed,
                    disconnectStartedRemainingMs: _startedRemaining,
                    ...stableTimer
                  } = timer;
                  return [
                    playerId,
                    {
                      ...stableTimer,
                      remainingMs: 0,
                      isRunning: false,
                    },
                  ];
                },
              ),
            ),
          }),
    };
    return hashCanonicalStateValue(clone);
  }
  return hashCanonicalStateValue(state);
};

export const checkpointResolverFromList = (
  checkpoints: readonly DeterministicCheckpoint[],
): DeterministicCheckpointResolver => {
  const byId = new Map(
    checkpoints.map((checkpoint) => [checkpoint.checkpointId, checkpoint]),
  );
  return (checkpointId) => byId.get(checkpointId);
};

export const applyDeterministicEntry = (
  state: GameState,
  entry: DeterministicMatchEntry,
  checkpoints?: DeterministicCheckpointResolver,
): DeterministicEntryApplyResult => {
  const beforeHash = hashReplayStateForScope(
    state,
    entry.verification.hashScope,
  );
  if (state.seq !== entry.verification.stateSeqBefore) {
    return {
      status: "failed",
      reason: `State sequence before mismatch: expected ${String(
        entry.verification.stateSeqBefore,
      )}, got ${String(state.seq)}.`,
    };
  }
  if (state.actionSeq !== entry.verification.actionSeqBefore) {
    return {
      status: "failed",
      reason: `Action sequence before mismatch: expected ${String(
        entry.verification.actionSeqBefore,
      )}, got ${String(state.actionSeq)}.`,
    };
  }
  if (beforeHash !== entry.verification.stateHashBefore) {
    return {
      status: "failed",
      reason: "State hash before deterministic entry does not match.",
    };
  }

  const applied = applyDeterministicOperation(state, entry, checkpoints);
  if (applied.status === "failed") {
    return applied;
  }
  if (applied.result.errors !== undefined) {
    return {
      status: "failed",
      reason: applied.result.errors
        .map((error) => ("reason" in error ? error.reason : error.type))
        .join("; "),
    };
  }

  const after = applied.result.state;
  const afterHash = hashReplayStateForScope(
    after,
    entry.verification.hashScope,
  );
  if (after.seq !== entry.verification.stateSeqAfter) {
    return {
      status: "failed",
      reason: `State sequence after mismatch: expected ${String(
        entry.verification.stateSeqAfter,
      )}, got ${String(after.seq)}.`,
    };
  }
  if (after.actionSeq !== entry.verification.actionSeqAfter) {
    return {
      status: "failed",
      reason: `Action sequence after mismatch: expected ${String(
        entry.verification.actionSeqAfter,
      )}, got ${String(after.actionSeq)}.`,
    };
  }
  if (afterHash !== entry.verification.stateHashAfter) {
    return {
      status: "failed",
      reason: "State hash after deterministic entry does not match.",
    };
  }

  return {
    status: "applied",
    state: after,
    stateHash: afterHash,
    label: applied.label,
  };
};
```

Adjust timer field names to the real `TimerState` type. If `TimerState` cannot be normalized safely in this task, keep only `operational-v1` in the type guard and add a failing timer hash test before enabling `gameplay-v1`.

- [ ] **Step 3: Export deterministic entry helpers**

Modify `packages/engine-core/src/index.ts` before any match-server task imports `hashReplayStateForScope`:

```ts
export {
  applyDeterministicEntry,
  checkpointResolverFromList,
  hashReplayStateForScope,
  type DeterministicEntryApplyResult,
} from "./replay/deterministic-entry.js";
```

Update `packages/engine-core/src/package-boundary.test.ts` so the package-root export is covered.

- [ ] **Step 4: Run tests**

```bash
corepack pnpm exec vitest run packages/engine-core/src/replay/deterministic-entry.test.ts
corepack pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected result: new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine-core/src/replay/deterministic-entry.ts packages/engine-core/src/replay/deterministic-entry.test.ts packages/engine-core/src/index.ts packages/engine-core/src/package-boundary.test.ts
git commit -m "feat: verify deterministic replay entries"
```

## Prerequisite Task: Establish Rollback Checkpoint Ownership

**Files:**

- Modify: `packages/match-server/src/local-rollback.ts`
- Modify: `packages/match-server/src/local-rollback.test.ts`

Do this before Task 5. Later tasks return rollback metadata containing `DeterministicCheckpoint`, persist `deterministicCheckpoints`, and recover rollback system entries from `match.rollback.checkpoints`; those tasks are not implementable until checkpoint ownership exists.

- [ ] **Step 1: Add checkpoint archive to rollback state**

Add `checkpoints: DeterministicCheckpoint[]` to `LocalRollbackState`, initialize it in `createLocalRollbackState`, and preserve it through request/cancel/resolve helpers.

- [ ] **Step 2: Archive checkpoint snapshots when rollback points are recorded**

When `recordRollbackPoint` creates a visible rollback point, also create the `DeterministicCheckpoint` for the same cloned `previousState` and append it to `rollback.checkpoints`. Visible rollback `points` may still be trimmed by `maxPoints`; checkpoint archive entries must remain for the match duration because completed replay restore entries may reference older checkpoints.

- [ ] **Step 3: Add checkpoint ownership tests**

Add tests proving:

- recording a rollback point appends both a visible point and an archived checkpoint
- trimming visible rollback points does not remove archived checkpoints
- checkpoint `stateHash` matches `hashReplayStateForScope(previousState, "gameplay-v1")`
- checkpoint `snapshot` is a cloned `GameState`, not the mutable live object

- [ ] **Step 4: Run and commit**

```bash
corepack pnpm exec vitest run packages/match-server/src/local-rollback.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
git add packages/match-server/src/local-rollback.ts packages/match-server/src/local-rollback.test.ts
git commit -m "feat: archive rollback checkpoints"
```

## Task 5: Refactor Match-Server Action Resolution

**Files:**

- Modify: `packages/match-server/src/local-match.ts`
- Modify: `packages/match-server/src/local-match.test.ts` if present, otherwise `packages/match-server/src/match-session.test.ts`

- [ ] **Step 1: Add tests proving resolved action is returned**

Add tests around `applyLocalDevAction` and `applyLocalDevDecision`:

```ts
test("applyLocalDevAction returns the exact action accepted by the engine", () => {
  const match = createLocalActionFixture();
  const result = applyLocalDevAction(match, {
    playerId: match.state.turn.turnPlayerId,
    actionIndex: 0,
    includeSnapshot: false,
  });

  assert.deepEqual(result.deterministicOperation, {
    kind: "action",
    action: { type: "endMainPhase" },
  });
});

test("applyLocalDevDecision returns the exact decision response accepted by the engine", () => {
  const match = createPendingDecisionFixture();
  const response = { type: "mulligan" as const, keep: true };
  const result = applyLocalDevDecision(match, {
    playerId: match.state.pendingDecision.playerId,
    decisionId: match.state.pendingDecision.id,
    response,
    includeSnapshot: false,
  });

  assert.deepEqual(result.deterministicOperation, {
    kind: "decision",
    decisionId: match.state.pendingDecision.id,
    response,
  });
});
```

Use existing setup helpers in match-server tests. Do not assert a printed label or action index.

- [ ] **Step 2: Update result types**

In `packages/match-server/src/local-match.ts`, extend `ApplyLocalDevActionResult`:

```ts
export type LocalDeterministicOperation =
  | { readonly kind: "action"; readonly action: Action }
  | {
      readonly kind: "decision";
      readonly decisionId: DecisionId;
      readonly response: DecisionResponse;
    }
  | {
      readonly kind: "system";
      readonly operation: DeterministicSystemOperation;
    };

export interface ApplyLocalDevActionResult {
  readonly stateSeq: number;
  readonly actionSeq?: number;
  readonly stateHash: string;
  readonly snapshot?: DevMatchSnapshot;
  readonly errors: readonly string[];
  readonly deterministicOperation?: LocalDeterministicOperation;
}
```

Import the needed shared types from `@optcg/types`.

- [ ] **Step 3: Split action resolution from apply**

Add a local helper near `executableActions`:

```ts
const resolveExecutableAction = (
  state: GameState,
  playerId: PlayerId,
  actionIndex: number,
  selectedDonInstanceIds: readonly InstanceId[] | undefined,
): Action | undefined => {
  const action = executableActions(state, playerId).find(
    (candidate) => candidate.index === actionIndex,
  );
  if (action === undefined) {
    return undefined;
  }
  if (action.type === "attachDon" && selectedDonInstanceIds !== undefined) {
    return {
      ...action,
      selectedDonInstanceIds: [...selectedDonInstanceIds],
    };
  }
  return action;
};
```

If `executableActions()` currently returns decorated objects with an `apply` callback rather than `Action` directly, introduce:

```ts
interface ResolvedExecutableAction {
  readonly action: Action;
  readonly apply: (state: GameState) => EngineResult;
}
```

The important rule is that `ResolvedExecutableAction.action` must be the serializable engine `Action` that will be persisted.

- [ ] **Step 4: Add rollback metadata before returning deterministic operations**

Before editing `applyLocalDevDecision`, extend `LocalRollbackMutationResult` in `local-rollback.ts` with the final metadata shape used by the deterministic log:

```ts
readonly rollbackRequest?: {
  readonly rollbackPointId: string;
  readonly requestedBy: PlayerId;
  readonly approvingPlayerId: PlayerId;
  readonly decisionId: DecisionId;
  readonly prompt: string;
};
readonly rollbackRestore?: {
  readonly rollbackPointId: string;
  readonly requestedBy: PlayerId;
  readonly approvedBy: PlayerId;
  readonly checkpoint: DeterministicCheckpoint;
};
readonly rollbackCancel?: {
  readonly rollbackPointId: string;
  readonly playerId: PlayerId;
  readonly decisionId?: DecisionId;
};
```

Populate `rollbackRequest` in `requestRollbackConsent`, `rollbackRestore` in approved `resolveRollbackConsent`, and `rollbackCancel` in declined `resolveRollbackConsent` plus `cancelRollbackConsent`. Do this before returning deterministic rollback operations so Task 5 and Task 10 use the same shape.

- [ ] **Step 5: Return deterministic operation after accepted apply**

In `applyLocalDevAction`, after errors are empty and before returning:

```ts
return localActionResult(match, errors, input.includeSnapshot, {
  kind: "action",
  action: resolved.action,
});
```

For rollback consent actions that delegate to `applyLocalDevDecision`, preserve the delegated decision operation.

In `applyLocalDevDecision`, return:

```ts
return localActionResult(match, errors, input.includeSnapshot, {
  kind: "decision",
  decisionId: input.decisionId,
  response: input.response,
});
```

For rollback consent:

```ts
if (result.errors.length > 0) {
  return localActionResult(match, result.errors, input.includeSnapshot);
}

const operation =
  input.response.allow && result.rollbackRestore !== undefined
    ? {
        type: "restoreRollbackPoint" as const,
        rollbackPointId: result.rollbackRestore.rollbackPointId,
        requestedBy: result.rollbackRestore.requestedBy,
        approvedBy: input.playerId,
        restoredStateHash: hashReplayStateForScope(result.state, "gameplay-v1"),
        restoredStateSeq: result.state.seq,
        restoredActionSeq: result.state.actionSeq,
      }
    : result.rollbackCancel === undefined
      ? undefined
      : {
          type: "cancelRollbackConsent" as const,
          playerId: result.rollbackCancel.playerId,
          rollbackPointId: result.rollbackCancel.rollbackPointId,
          ...(result.rollbackCancel.decisionId === undefined
            ? {}
            : { decisionId: result.rollbackCancel.decisionId }),
        };

if (operation === undefined) {
  return localActionResult(
    match,
    ["Rollback consent resolved without deterministic rollback metadata."],
    input.includeSnapshot,
  );
}

return localActionResult(match, result.errors, input.includeSnapshot, {
  kind: "system",
  operation,
});
```

For direct rollback requests and cancellations, also return deterministic system operations:

```ts
export const requestLocalDevRollback = (
  match: LocalDevMatch,
  input: RequestLocalDevRollbackInput,
): ApplyLocalDevActionResult => {
  const result = requestRollbackConsent(match.state, match.rollback, input);
  match.state = result.state;
  match.rollback = result.rollback;
  if (result.errors.length > 0) {
    return localActionResult(match, result.errors, undefined);
  }
  if (result.rollbackRequest === undefined) {
    return localActionResult(
      match,
      ["Rollback request accepted without deterministic rollback metadata."],
      undefined,
    );
  }
  return localActionResult(match, result.errors, undefined, {
    kind: "system",
    operation: {
      type: "requestRollbackConsent",
      playerId: input.playerId,
      rollbackPointId: result.rollbackRequest.rollbackPointId,
      approvingPlayerId: result.rollbackRequest.approvingPlayerId,
      decisionId: result.rollbackRequest.decisionId,
      prompt: result.rollbackRequest.prompt,
    },
  });
};
```

Use the same pattern for `cancelLocalDevRollback`, returning `cancelRollbackConsent` with `rollbackCancel` metadata. Accepted rollback mutations without matching metadata must return a server error instead of persisting a partial deterministic entry.

- [ ] **Step 6: Run narrow tests**

```bash
corepack pnpm exec vitest run packages/match-server/src/match-session.test.ts packages/match-server/src/local-rollback.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
```

Expected result: local apply result tests pass and rollback tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/match-server/src/local-match.ts packages/match-server/src/local-rollback.ts packages/match-server/src/match-session.test.ts packages/match-server/src/local-rollback.test.ts
git commit -m "feat: expose exact deterministic operations from local match"
```

Only stage test files that actually changed.

## Task 6: Build Stored Deterministic Session Records

**Files:**

- Create: `packages/match-server/src/deterministic-entry-builder.ts`
- Modify: `packages/match-server/src/session-types.ts`
- Modify: `packages/match-server/src/match-session.ts`
- Modify: `packages/match-server/src/match-session.test.ts`

- [ ] **Step 1: Extend session record types**

In `packages/match-server/src/session-types.ts`, add:

```ts
import type {
  DeterministicCheckpoint,
  DeterministicMatchEntry,
} from "@optcg/types";

export interface StoredSessionAuditRecord {
  readonly type: "clientEnvelope";
  readonly envelope: ClientActionEnvelope;
  readonly result: SessionActionResult;
  readonly recordedAt: string;
}

export interface StoredDeterministicSessionRecord {
  readonly deterministicEntry: DeterministicMatchEntry;
  readonly audit: StoredSessionAuditRecord;
}

export interface StoredDeterministicCheckpointRecord {
  readonly checkpoint: DeterministicCheckpoint;
  readonly recordedAt: string;
}
```

`StoredDeterministicSessionRecord.audit` is the only place the accepted client envelope, request hash, protocol version, timestamps, and client action id belong. Do not copy those transport fields into `DeterministicMatchEntry`.

Then update persistence snapshots:

```ts
export interface MatchPersistenceSnapshot {
  readonly metadata: MatchSessionMetadata;
  readonly state: GameState;
  readonly manifest: MatchCardManifest;
  readonly recoveryContext?: MatchRecoveryContext;
  readonly deterministicLogVersion?: "deterministic-entry-v1";
  readonly deterministicEntriesSinceSnapshot?: readonly StoredDeterministicSessionRecord[];
  readonly deterministicCheckpoints?: readonly StoredDeterministicCheckpointRecord[];
  readonly actions: readonly StoredSessionRecord[];
  readonly decisions: readonly StoredSessionRecord[];
}
```

Keep `actions` and `decisions` for legacy active snapshots until a cleanup migration removes them. Do not store the full deterministic match log in active Redis snapshots. A Redis snapshot generation is a base `state` plus a tail list of deterministic entries accepted after that exact state was saved. Completed replay persistence gets the full log from runtime memory, not from `MatchPersistenceSnapshot`.

`deterministicCheckpoints` is different: it is an archive of checkpoint snapshots needed to apply restore entries in the tail and to build completed replay artifacts. It may include rollback checkpoints created before the current snapshot state because a later `restoreRollbackPoint` operation can reference them.

- [ ] **Step 2: Add builder tests**

Create `packages/match-server/src/deterministic-entry-builder.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildStoredDeterministicSessionRecord } from "./deterministic-entry-builder.js";
import { createAcceptedApplyFixture } from "./test-fixtures.js";

describe("buildStoredDeterministicSessionRecord", () => {
  test("builds an action entry with exact operation and envelope only in audit", () => {
    const fixture = createAcceptedApplyFixture({ kind: "action" });

    const record = buildStoredDeterministicSessionRecord(fixture.input);

    expect(record.deterministicEntry.kind).toBe("action");
    expect("envelope" in record.deterministicEntry).toBe(false);
    expect(record.audit.type).toBe("clientEnvelope");
    expect(record.audit.envelope.clientActionId).toBe(
      fixture.input.envelope.clientActionId,
    );
  });
});
```

- [ ] **Step 3: Implement builder**

Create `packages/match-server/src/deterministic-entry-builder.ts`:

```ts
import type { DeterministicMatchEntry } from "@optcg/types";
import { hashReplayStateForScope } from "@optcg/engine-core";
import type {
  ClientActionEnvelope,
  SessionActionResult,
  StoredDeterministicSessionRecord,
  StoredSessionAuditRecord,
} from "./session-types.js";
import type { LocalDeterministicOperation } from "./local-match.js";

export interface BuildStoredDeterministicSessionRecordInput {
  readonly matchId: DeterministicMatchEntry["matchId"];
  readonly entrySeq: number;
  readonly envelope: ClientActionEnvelope;
  readonly result: SessionActionResult;
  readonly deterministicOperation: LocalDeterministicOperation;
  readonly stateSeqBefore: DeterministicMatchEntry["verification"]["stateSeqBefore"];
  readonly actionSeqBefore: number;
  readonly stateHashBefore: string;
  readonly stateSeqAfter: DeterministicMatchEntry["verification"]["stateSeqAfter"];
  readonly actionSeqAfter: number;
  readonly stateHashAfter: string;
  readonly recordedAt: string;
}

const auditRecord = (
  input: BuildStoredDeterministicSessionRecordInput,
): StoredSessionAuditRecord => ({
  type: "clientEnvelope",
  envelope: input.envelope,
  result: input.result,
  recordedAt: input.recordedAt,
});

export const buildStoredDeterministicSessionRecord = (
  input: BuildStoredDeterministicSessionRecordInput,
): StoredDeterministicSessionRecord => {
  const verification = {
    stateSeqBefore: input.stateSeqBefore,
    actionSeqBefore: input.actionSeqBefore,
    stateHashBefore: input.stateHashBefore,
    stateSeqAfter: input.stateSeqAfter,
    actionSeqAfter: input.actionSeqAfter,
    stateHashAfter: input.stateHashAfter,
    hashScope: "gameplay-v1" as const,
  };
  const base = {
    formatVersion: "deterministic-entry-v1" as const,
    matchId: input.matchId,
    entrySeq: input.entrySeq,
    verification,
  };
  const deterministicEntry: DeterministicMatchEntry =
    input.deterministicOperation.kind === "action"
      ? {
          ...base,
          kind: "action",
          playerId: input.envelope.playerId,
          action: input.deterministicOperation.action,
        }
      : input.deterministicOperation.kind === "decision"
        ? {
            ...base,
            kind: "decision",
            playerId: input.envelope.playerId,
            decisionId: input.deterministicOperation.decisionId,
            response: input.deterministicOperation.response,
          }
        : {
            ...base,
            kind: "system",
            operation: input.deterministicOperation.operation,
          };

  return {
    deterministicEntry,
    audit: auditRecord(input),
  };
};
```

Remove unused imports during implementation. `hashReplayStateForScope` belongs in the call site if the builder only receives hashes.

- [ ] **Step 4: Store deterministic records in runtime**

In `packages/match-server/src/match-session.ts`, capture before state metadata before `applyRequest`:

```ts
const stateSeqBefore = local.state.seq;
const actionSeqBefore = local.state.actionSeq;
const stateHashBefore = hashReplayStateForScope(local.state, "gameplay-v1");
const applied = applyRequest(local, envelope.request, includeActionSnapshots);
```

After accepted apply:

```ts
if (result.accepted && applied.deterministicOperation !== undefined) {
  const deterministicRecord = buildStoredDeterministicSessionRecord({
    matchId: local.state.matchId,
    entrySeq: deterministicRecords.length,
    envelope,
    result,
    deterministicOperation: applied.deterministicOperation,
    stateSeqBefore,
    actionSeqBefore,
    stateHashBefore,
    stateSeqAfter: local.state.seq,
    actionSeqAfter: local.state.actionSeq,
    stateHashAfter: hashReplayStateForScope(local.state, "gameplay-v1"),
    recordedAt,
  });
  deterministicRecords.push(deterministicRecord);
  pendingDeterministicRecords.push(deterministicRecord);
}
```

Keep legacy `records`, `pendingActions`, and `pendingDecisions` during this task. They still support idempotency and legacy persistence until Redis is updated.

- [ ] **Step 5: Expose deterministic records and checkpoints**

Update `MatchSessionRuntime`:

```ts
deterministicRecords: () => readonly StoredDeterministicSessionRecord[];
deterministicCheckpoints: () => readonly StoredDeterministicCheckpointRecord[];
```

Ensure idempotency returns the original result without appending a duplicate deterministic entry or checkpoint. Task 10 will populate checkpoint records from rollback point creation; this task should create the runtime storage and accessors even if the checkpoint list is initially empty.

- [ ] **Step 6: Run tests**

```bash
corepack pnpm exec vitest run packages/match-server/src/deterministic-entry-builder.test.ts packages/match-server/src/match-session.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
```

Expected result: match-session idempotency tests pass and deterministic records are only appended for accepted requests.

- [ ] **Step 7: Commit**

```bash
git add packages/match-server/src/session-types.ts packages/match-server/src/match-session.ts packages/match-server/src/deterministic-entry-builder.ts packages/match-server/src/deterministic-entry-builder.test.ts packages/match-server/src/match-session.test.ts
git commit -m "feat: record accepted deterministic match entries"
```

## Task 7: Persist Deterministic Entries In Redis Snapshots

**Files:**

- Modify: `packages/match-server/src/redis-match-persistence.ts`
- Modify: `packages/match-server/src/session-service.ts`
- Modify: `packages/match-server/src/dev-local-match-registry.ts`
- Modify: `packages/match-server/src/redis-match-persistence.test.ts` if present.
- Modify: `packages/match-server/src/dev-local-match-registry.test.ts`

- [ ] **Step 1: Add Redis persistence tests**

Add a test that saves a base snapshot with an empty deterministic tail, appends a post-snapshot entry, and reloads the exact tail entry:

```ts
test("persists deterministic session records for recovery", async () => {
  const persistence = createTestRedisMatchPersistence();
  const snapshot = createPersistenceSnapshot({
    deterministicLogVersion: "deterministic-entry-v1",
    deterministicEntriesSinceSnapshot: [],
    deterministicCheckpoints: [createStoredDeterministicCheckpoint()],
    actions: [],
    decisions: [],
  });
  const tailRecord = createStoredDeterministicRecord();

  await persistence.saveSnapshot(snapshot);
  await persistence.appendDeterministicEntry({
    matchId: snapshot.metadata.matchId,
    record: tailRecord,
  });
  const loaded = await persistence.loadSnapshot(snapshot.metadata.matchId);

  assert.deepEqual(
    loaded?.deterministicEntriesSinceSnapshot?.map(
      (record) => record.deterministicEntry,
    ),
    [tailRecord.deterministicEntry],
  );
  assert.deepEqual(
    loaded?.deterministicCheckpoints?.map((record) => record.checkpoint),
    snapshot.deterministicCheckpoints.map((record) => record.checkpoint),
  );
});
```

- [ ] **Step 2: Update persistence interface implementation**

In `redis-match-persistence.ts`, add one Redis list for deterministic tail records on each snapshot generation:

```ts
const snapshotKeys = matchKeys.snapshot(generation);
snapshotKeys.deterministicEntriesSinceSnapshot;
```

Write deterministic tail entries and deterministic checkpoints in `saveSnapshot`, and append post-snapshot accepted entries in a new method:

```ts
appendDeterministicEntry(input: {
  readonly matchId: MatchId;
  readonly record: StoredDeterministicSessionRecord;
}): Promise<void>;
```

Do not remove `appendAction` and `appendDecision` yet. Legacy active snapshots may still contain those lists.

- [ ] **Step 3: Wire session flush**

In `match-session.ts`, add pending deterministic records to `flushPersistence()` before or alongside legacy action/decision appends:

```ts
for (const record of pendingDeterministicRecords.splice(0)) {
  await persistence.appendDeterministicEntry({
    matchId: local.state.matchId,
    record,
  });
}
```

If a persistence write fails, preserve the existing error behavior; do not silently drop pending deterministic records.

- [ ] **Step 4: Save only post-snapshot deterministic tail entries in snapshots**

In `saveSnapshot()`, include:

```ts
deterministicLogVersion: "deterministic-entry-v1",
deterministicEntriesSinceSnapshot: [],
deterministicCheckpoints: deterministicCheckpoints.map(compactStoredDeterministicCheckpointRecord),
```

The snapshot `state` is already current, so replaying the full log from that same state would double-apply old entries. After a snapshot save succeeds, clear any pending deterministic append records whose mutations are already represented by the saved state. Future accepted requests append to the current generation's `deterministicEntriesSinceSnapshot` list. Keep a separate in-memory `deterministicRecords` array for completed replay persistence.

The compact form for tail records must remove action snapshots from the audit result just like `compactStoredSessionRecord` does for legacy records. Checkpoint snapshots may remain full `GameState` snapshots because rollback restore cannot reconstruct without them until object-storage checkpoint references exist.

- [ ] **Step 5: Run Redis/session tests**

```bash
corepack pnpm exec vitest run packages/match-server/src/match-session.test.ts packages/match-server/src/dev-local-match-registry.test.ts packages/match-server/src/redis-match-persistence.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
```

If `redis-match-persistence.test.ts` does not exist, run the test file that currently covers persistence snapshots.

- [ ] **Step 6: Commit**

```bash
git add packages/match-server/src/session-types.ts packages/match-server/src/match-session.ts packages/match-server/src/redis-match-persistence.ts packages/match-server/src/session-service.ts packages/match-server/src/dev-local-match-registry.ts packages/match-server/src/dev-local-match-registry.test.ts
git commit -m "feat: persist deterministic entries for recovery"
```

Stage the Redis persistence test file only if it exists or was created.

## Task 8: Rewrite Active Recovery To Use Deterministic Entries

**Files:**

- Create: `packages/match-server/src/deterministic-recovery.ts`
- Modify: `packages/match-server/src/dev-local-match-recovery.ts`
- Modify: `packages/match-server/src/dev-local-match-recovery.test.ts`

- [ ] **Step 1: Implement deterministic recovery helper**

Create `packages/match-server/src/deterministic-recovery.ts`:

```ts
import {
  applyDeterministicEntry,
  checkpointResolverFromList,
} from "@optcg/engine-core";
import type { LocalDevMatch } from "./local-match.js";
import type {
  MatchPersistenceSnapshot,
  StoredDeterministicSessionRecord,
} from "./session-types.js";
import { replayLegacyRecoveryRecords } from "./deterministic-entry-legacy.js";

const applyDeterministicRecoveryEntry = (
  match: LocalDevMatch,
  record: StoredDeterministicSessionRecord,
  checkpointResolver: ReturnType<typeof checkpointResolverFromList>,
): string | undefined => {
  const entry = record.deterministicEntry;
  let nextRollback = match.rollback;
  if (entry.kind === "system") {
    const operation = entry.operation;
    if (operation.type === "requestRollbackConsent") {
      nextRollback = {
        ...match.rollback,
        pendingRequest: {
          rollbackPointId: operation.rollbackPointId,
          requestedBy: operation.playerId,
          approvingPlayerId: operation.approvingPlayerId,
        },
      };
    }
    if (operation.type === "cancelRollbackConsent") {
      const { pendingRequest: _pendingRequest, ...withoutPending } =
        match.rollback;
      nextRollback = withoutPending;
    }
    if (operation.type === "restoreRollbackPoint") {
      const checkpoint = checkpointResolver(operation.rollbackPointId);
      if (checkpoint === undefined) {
        return `rollback checkpoint ${operation.rollbackPointId} missing`;
      }
      const { pendingRequest: _pendingRequest, ...withoutPending } =
        match.rollback;
      nextRollback = {
        ...withoutPending,
        points: match.rollback.points.filter(
          (point) => point.stateSeq <= checkpoint.stateSeq,
        ),
        checkpoints: match.rollback.checkpoints,
      };
    }
  }

  const result = applyDeterministicEntry(
    match.state,
    entry,
    checkpointResolver,
  );
  if (result.status === "failed") {
    return result.reason;
  }
  match.state = result.state;
  match.rollback = nextRollback;
  return undefined;
};

export const replayDeterministicRecoveryEntries = (
  match: LocalDevMatch,
  snapshot: MatchPersistenceSnapshot,
): string | undefined => {
  const records = snapshot.deterministicEntriesSinceSnapshot;
  if (snapshot.deterministicLogVersion === "deterministic-entry-v1") {
    if (records === undefined) {
      return "deterministic recovery tail entries missing";
    }
    if (records.length === 0) {
      return undefined;
    }
  } else {
    if (snapshot.actions.length > 0 || snapshot.decisions.length > 0) {
      return replayLegacyRecoveryRecords(match, snapshot);
    }
    if (records !== undefined && records.length > 0) {
      return "deterministic recovery entries missing deterministic log version";
    }
    return undefined;
  }

  const checkpoints = [
    ...(snapshot.deterministicCheckpoints?.map((record) => record.checkpoint) ??
      []),
    ...(snapshot.recoveryContext?.rollback.checkpoints ?? []),
  ];
  const checkpointResolver = checkpointResolverFromList(checkpoints);
  for (const record of records) {
    const error = applyDeterministicRecoveryEntry(
      match,
      record,
      checkpointResolver,
    );
    if (error !== undefined) {
      return `deterministic replay failed at entry ${String(
        record.deterministicEntry.entrySeq,
      )}: ${error}`;
    }
  }
  return undefined;
};
```

This helper starts from `match.state`, which is the recovered base snapshot state. Therefore it must read only `deterministicEntriesSinceSnapshot`, never the completed-match full deterministic log. Rollback system entries must update both `match.state` and `match.rollback`; engine-core only owns `GameState` replay, while match-server owns rollback consent bookkeeping. The checkpoint resolver line must use `snapshot.deterministicCheckpoints` plus rollback context checkpoints established by the prerequisite checkpoint-ownership task. If those checkpoint archives are unavailable, fail closed on rollback system tail entries instead of replaying only half of the state.

- [ ] **Step 2: Replace envelope recovery replay**

In `dev-local-match-recovery.ts`, replace:

```ts
const replayError = replayRecoveryRecords(match, snapshot);
```

with:

```ts
const replayError = replayDeterministicRecoveryEntries(match, snapshot);
```

Keep the old `replayRecoveryRecords` function only inside `deterministic-entry-legacy.ts`, export it as `replayLegacyRecoveryRecords`, and call it only for unversioned legacy snapshots with no deterministic entries.

- [ ] **Step 3: Fail closed on missing deterministic entries for new snapshots**

Add a top-level optional `deterministicLogVersion`. New snapshots must include `deterministicEntriesSinceSnapshot` even if empty:

```ts
readonly deterministicLogVersion?: "deterministic-entry-v1";
readonly deterministicEntriesSinceSnapshot?: readonly StoredDeterministicSessionRecord[];
```

Recovery behavior:

- `deterministicLogVersion === "deterministic-entry-v1"` and `deterministicEntriesSinceSnapshot` missing: freeze match with `"deterministic recovery tail entries missing"`.
- no version and legacy actions/decisions present: use legacy adapter if allowed for active dev recovery.
- no version and deterministic entries present: freeze match with `"deterministic recovery entries missing deterministic log version"`.
- no version and no records: recover initial snapshot.

- [ ] **Step 4: Run recovery tests**

Before running, add a focused test that proves a recovered base snapshot is not double-applied:

```ts
test("recovery replays only entries accepted after the saved snapshot", async () => {
  const fixture = createRecoverableMatchWithTwoExactActions();
  const snapshot = {
    ...fixture.snapshotAfterFirstAction,
    deterministicLogVersion: "deterministic-entry-v1",
    deterministicEntriesSinceSnapshot: [fixture.secondEntry],
    actions: [],
    decisions: [],
  };

  const recovered = await recoverOneSnapshot(snapshot);

  assert.equal(recovered.status, "active");
  assert.equal(
    recovered.match.state.seq,
    fixture.secondEntry.deterministicEntry.verification.stateSeqAfter,
  );
});
```

This test must fail if `snapshot.deterministicEntriesSinceSnapshot` is replaced with the full completed-match deterministic log.

Also add rollback tail recovery tests:

```ts
test("recovery applies rollback request tail to state and rollback bookkeeping", async () => {
  const fixture = createSnapshotBeforeRollbackRequest();
  const recovered = await recoverOneSnapshot({
    ...fixture.snapshot,
    deterministicLogVersion: "deterministic-entry-v1",
    deterministicEntriesSinceSnapshot: [fixture.requestRollbackEntry],
    deterministicCheckpoints: fixture.checkpoints,
    actions: [],
    decisions: [],
  });
  const requestEntry = fixture.requestRollbackEntry.deterministicEntry;
  if (
    requestEntry.kind !== "system" ||
    requestEntry.operation.type !== "requestRollbackConsent"
  ) {
    throw new Error("fixture did not create a rollback request system entry");
  }

  assert.equal(recovered.status, "active");
  assert.equal(
    recovered.match.state.pendingDecision?.id,
    requestEntry.operation.decisionId,
  );
  assert.equal(
    recovered.match.rollback.pendingRequest?.rollbackPointId,
    fixture.rollbackPointId,
  );
});

test("recovery applies approved rollback restore tail to state and rollback bookkeeping", async () => {
  const fixture = createSnapshotBeforeRollbackRestore();
  const recovered = await recoverOneSnapshot({
    ...fixture.snapshot,
    deterministicLogVersion: "deterministic-entry-v1",
    deterministicEntriesSinceSnapshot: [fixture.restoreRollbackEntry],
    deterministicCheckpoints: fixture.checkpoints,
    actions: [],
    decisions: [],
  });

  assert.equal(recovered.status, "active");
  assert.equal(recovered.match.state.seq, fixture.restoredStateSeq);
  assert.equal(recovered.match.rollback.pendingRequest, undefined);
  assert.equal(
    recovered.match.rollback.points.some(
      (point) => point.stateSeq > fixture.restoreCheckpoint.stateSeq,
    ),
    false,
  );
});
```

```bash
corepack pnpm exec vitest run packages/match-server/src/dev-local-match-recovery.test.ts packages/match-server/src/dev-local-match-registry.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
```

Expected result: recovery no longer depends on envelope action indexes.

- [ ] **Step 5: Commit**

```bash
git add packages/match-server/src/deterministic-recovery.ts packages/match-server/src/dev-local-match-recovery.ts packages/match-server/src/dev-local-match-recovery.test.ts packages/match-server/src/session-types.ts
git commit -m "feat: recover active matches from deterministic entries"
```

## Task 9: Write Completed Replays With Exact Entries

**Files:**

- Modify: `packages/match-server/src/local-completed-match-record.ts`
- Modify: `packages/match-server/src/local-completed-match-record.test.ts`
- Modify: `packages/match-server/src/postgres-completed-match.ts`
- Modify: `packages/match-server/src/postgres-completed-match.test.ts`
- Modify: `packages/client/src/replay-client.test.ts` if the client fixture asserts old shapes.

- [ ] **Step 1: Change completed replay payload**

In `buildLocalCompletedMatchRecord`, change:

```ts
deterministicEntries: input.records.map((record) => jsonObject(record)),
auditEntries: input.match.state.audit.map((entry) => jsonObject(entry)),
```

to:

```ts
deterministicEntries: input.deterministicRecords.map((record) =>
  jsonObject(record.deterministicEntry),
),
auditEntries: [
  ...input.deterministicRecords.map((record) => jsonObject(record.audit)),
  ...input.match.state.audit.map((entry) => jsonObject(entry)),
],
checkpoints: input.deterministicCheckpoints.map((record) =>
  jsonObject(record.checkpoint),
),
```

Update `BuildLocalCompletedMatchRecordInput` so callers pass `deterministicRecords`.
Also add `deterministicCheckpoints` from `runtime.deterministicCheckpoints()` or the active match rollback checkpoint archive. Do not derive checkpoints from only `match.rollback.points`, because visible rollback points can be trimmed while old `restoreRollbackPoint` entries still need their checkpoint snapshots.

- [ ] **Step 2: Bump replay format**

Change:

```ts
replayFormatVersion: "dev-local-v1",
```

to:

```ts
replayFormatVersion: "dev-local-v2",
```

Rows with `dev-local-v2` must fail closed if `deterministicEntries` contain envelope-shaped objects.

- [ ] **Step 3: Use replay gameplay hash**

Change `initialStateHash` and `finalStateHash` for replay artifacts to use the same hash scope as entries:

```ts
const finalStateHash = hashReplayStateForScope(
  input.match.state,
  "gameplay-v1",
);
const initialStateHash = hashReplayStateForScope(
  createLocalDevMatch(input.setup).state,
  "gameplay-v1",
);
```

Keep match table `final_state_hash` behavior unchanged if product code expects operational full-state hash there. Replay row hash scope must be explicit.

- [ ] **Step 4: Keep compact reconstruction source**

Preserve the current compact setup source in `initialDeckOrders`. Do not reintroduce full `initialSnapshot` or `finalState` row bloat for normal dev replays.

Expected normal row shape:

```ts
initialSnapshot: null,
initialDeckOrders,
deterministicEntries: exact entries,
auditEntries: envelopes plus engine audit,
checkpoints,
finalState: null,
```

- [ ] **Step 5: Run persistence tests**

```bash
corepack pnpm exec vitest run packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/postgres-completed-match.test.ts packages/client/src/replay-client.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
```

Expected result: completed replay tests assert exact deterministic entries and separate audit entries.

- [ ] **Step 6: Commit**

```bash
git add packages/match-server/src/local-completed-match-record.ts packages/match-server/src/local-completed-match-record.test.ts packages/match-server/src/postgres-completed-match.ts packages/match-server/src/postgres-completed-match.test.ts packages/client/src/replay-client.test.ts
git commit -m "feat: store exact deterministic replay entries"
```

## Task 10: Thread Rollback Checkpoints Through Restore Entries

**Files:**

- Modify: `packages/match-server/src/local-rollback.ts`
- Modify: `packages/match-server/src/local-rollback.test.ts`
- Modify: `packages/match-server/src/session-types.ts`
- Modify: `packages/match-server/src/deterministic-entry-builder.ts`

- [ ] **Step 1: Verify rollback checkpoint archive shape**

The prerequisite task already added `LocalRollbackState.checkpoints` and `LocalRollbackPoint.checkpoint`. Confirm the shape is still:

```ts
export interface LocalRollbackState {
  enabled: boolean;
  maxPoints: number;
  points: LocalRollbackPoint[];
  checkpoints: DeterministicCheckpoint[];
  pendingRequest?: LocalRollbackRequest;
}

interface LocalRollbackPoint {
  rollbackPointId: string;
  eventId?: string;
  eventSeq: number;
  stateSeq: number;
  actionSeq: number;
  label: string;
  state: GameState;
  checkpoint: DeterministicCheckpoint;
}
```

When creating a point, the checkpoint must still be:

```ts
const checkpoint: DeterministicCheckpoint = {
  checkpointVersion: "deterministic-checkpoint-v1",
  matchId: previousState.matchId,
  checkpointId: rollbackPointId,
  reason: "rollbackPoint",
  stateSeq: previousState.seq,
  actionSeq: previousState.actionSeq,
  stateHash: hashReplayStateForScope(previousState, "gameplay-v1"),
  hashScope: "gameplay-v1",
  ...(anchor.id === undefined ? {} : { eventId: anchor.id }),
  snapshot: cloneGameState(previousState),
};
```

Do not move live restore away from `point.state`. The checkpoint archive is for deterministic recovery and completed replay reconstruction; the `state` field remains the source for live restore in this task.

- [ ] **Step 2: Populate the metadata shape defined in Task 5**

Task 5 defines `rollbackRequest`, `rollbackRestore`, and `rollbackCancel` on `LocalRollbackMutationResult`. In this task, make sure the checkpoint projection is attached to the same `rollbackRestore` shape:

```ts
readonly rollbackRestore?: {
  readonly rollbackPointId: string;
  readonly requestedBy: PlayerId;
  readonly approvedBy: PlayerId;
  readonly checkpoint: DeterministicCheckpoint;
};
```

In `resolveRollbackConsent`, when `allow` is true, return that metadata with the selected rollback point checkpoint. When `allow` is false, return `rollbackCancel`; do not create a restore operation.

- [ ] **Step 3: Add rollback non-regression tests**

In `local-rollback.test.ts`, add:

```ts
test("approved rollback still restores from saved GameState checkpoint", () => {
  const fixture = createRollbackFixtureAfterPublicEvent();
  const beforeRestorePoint = fixture.rollback.points[0];

  const result = resolveRollbackConsent(
    fixture.currentState,
    fixture.rollback,
    {
      playerId: fixture.approvingPlayerId,
      decisionId: fixture.decisionId,
      response: { type: "rollbackConsent", allow: true },
    },
  );

  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    {
      ...result.state,
      seq: beforeRestorePoint.state.seq,
      actionSeq: beforeRestorePoint.state.actionSeq,
    },
    beforeRestorePoint.state,
  );
  assert.equal(
    result.rollbackRestore?.checkpoint.checkpointId,
    beforeRestorePoint.rollbackPointId,
  );
  assert.equal(
    result.rollbackRestore?.checkpoint.stateHash,
    beforeRestorePoint.checkpoint.stateHash,
  );
  assert.equal(Number(result.state.seq), Number(fixture.currentState.seq) + 1);
  assert.equal(result.state.actionSeq, fixture.currentState.actionSeq + 1);
});
```

Normalize `seq` and `actionSeq` in the deep-equality assertion because current restore intentionally bumps them. Then assert the bumped values explicitly so the deterministic replay executor has to reproduce the live behavior.

- [ ] **Step 4: Build deterministic rollback entries**

In `applyLocalDevDecision`, when rollback consent is approved, create a `system` deterministic operation of type `restoreRollbackPoint` using `result.rollbackRestore`. When rollback consent is declined, record a `system` operation `cancelRollbackConsent` using `result.rollbackCancel` so replay can reach the same state without implying a gameplay effect occurred.

- [ ] **Step 5: Run rollback tests**

```bash
corepack pnpm exec vitest run packages/match-server/src/local-rollback.test.ts packages/match-server/src/match-session.test.ts packages/match-server/src/dev-local-match-recovery.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
```

Expected result: live rollback tests pass before and after deterministic entry recording.

- [ ] **Step 6: Commit**

```bash
git add packages/match-server/src/local-rollback.ts packages/match-server/src/local-rollback.test.ts packages/match-server/src/local-match.ts packages/match-server/src/session-types.ts packages/match-server/src/deterministic-entry-builder.ts
git commit -m "feat: expose rollback checkpoints to deterministic log"
```

## Task 11: Rewrite Replay Artifact Reducer To Consume Deterministic Entries Only

**Files:**

- Modify: `packages/engine-core/src/replay/artifact-reducer.ts`
- Modify: `packages/engine-core/src/replay/artifact-reducer.test.ts`
- Modify: `packages/engine-core/src/replay/smoke-*.test.ts`
- Modify: `packages/engine-core/src/replay/smoke-test-support.ts`

- [ ] **Step 1: Replace `replayActionFromEntry`**

Remove envelope parsing and action-index lookup from `artifact-reducer.ts`.

Extend `reconstructReplayArtifactStates` input to accept decoded deterministic checkpoints:

```ts
export const reconstructReplayArtifactStates = ({
  checkpoints,
  deterministicEntries,
  expectedFinalStateHash,
  initialState,
}: {
  readonly initialState: GameState;
  readonly deterministicEntries: readonly unknown[];
  readonly checkpoints?: readonly unknown[];
  readonly expectedFinalStateHash?: string | undefined;
}): ReplayArtifactReconstructionResult => {
  const decodedCheckpoints = decodeDeterministicCheckpoints(checkpoints ?? []);
  if (decodedCheckpoints.status === "failed") {
    return { status: "failed", reason: decodedCheckpoints.reason };
  }
  const checkpointResolver = checkpointResolverFromList(
    decodedCheckpoints.checkpoints,
  );
  // reducer loop below
};
```

`decodeDeterministicCheckpoints()` must validate `checkpointVersion`, `checkpointId`, `stateSeq`, `actionSeq`, `stateHash`, `hashScope`, and require `snapshot` for any checkpoint referenced by a `restoreRollbackPoint` operation. Checkpoint snapshots are allowed in completed replay artifacts because post-game replays are full-information artifacts.

The reducer loop should become:

```ts
for (const [actionIndex, entry] of deterministicEntries.entries()) {
  const decoded = decodeDeterministicEntry(entry);
  if (decoded.status === "failed") {
    return { status: "failed", reason: decoded.reason, actionIndex };
  }
  const result = applyDeterministicEntry(
    current,
    decoded.entry,
    checkpointResolver,
  );
  if (result.status === "failed") {
    return { status: "failed", reason: result.reason, actionIndex };
  }
  current = result.state;
  frames.push({
    index: frames.length,
    actionIndex,
    label: result.label,
    state: structuredClone(current),
    stateHash: result.stateHash,
  });
}
```

`decodeDeterministicEntry()` must validate:

- object shape
- `formatVersion === "deterministic-entry-v1"`
- known `kind`
- no `envelope` property
- required verification fields
- no catch-all system operation

- [ ] **Step 2: Keep legacy adapter separate**

If old tests still require envelope-shaped fixtures, move that behavior to `packages/match-server/src/deterministic-entry-legacy.ts`, not engine-core. Engine-core should only reduce canonical deterministic entries.

- [ ] **Step 3: Update smoke replay fixtures**

Update `smoke-test-support.ts` so generated replay smoke scenarios emit `DeterministicMatchEntry[]`, not raw action steps or envelope-like objects.

Every fixture action step should already know the exact `Action`; wrap it with before/after hashes from the fixture runner.

- [ ] **Step 4: Re-enable final hash verification**

Pass `expectedFinalStateHash` through again using the same hash scope:

```ts
const finalStateHash = frames.at(-1)?.stateHash ?? stateHash;
if (
  expectedFinalStateHash !== undefined &&
  expectedFinalStateHash !== finalStateHash
) {
  return {
    status: "failed",
    reason: "Replay reconstruction final hash mismatch.",
  };
}
```

No comment should say final hash verification is disabled because of timers after this task.

- [ ] **Step 5: Run engine replay tests**

```bash
corepack pnpm exec vitest run packages/engine-core/src/replay
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected result: envelope-shaped entries fail; deterministic smoke fixtures pass; final hash mismatch tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/engine-core/src/replay/artifact-reducer.ts packages/engine-core/src/replay/artifact-reducer.test.ts packages/engine-core/src/replay/deterministic-entry.ts packages/engine-core/src/replay/smoke-test-support.ts
git add packages/engine-core/src/replay/smoke-drift.test.ts packages/engine-core/src/replay/smoke-vanilla-combat.test.ts packages/engine-core/src/replay/smoke-play-card.test.ts packages/engine-core/src/replay/smoke-terminal.test.ts
git commit -m "feat: reconstruct replays from deterministic entries"
```

If different smoke tests changed, list those exact files instead of staging the whole `packages/engine-core/src/replay` directory. Review staged files before committing:

```bash
git diff --cached --name-only
```

## Task 12: Update Replay Frame Reconstruction And Viewer Contract

**Files:**

- Modify: `packages/match-server/src/replay-frame-reconstruction.ts`
- Modify: `packages/match-server/src/replay-frame-reconstruction.test.ts`
- Modify: `packages/match-server/src/match-http-server-replay.test.ts`
- Modify: `packages/client/src/react/ReplayViewerPage.test.tsx` or current test file path.
- Modify: `docs/superpowers/specs/2026-06-24-replay-viewer-design.md`

- [ ] **Step 1: Remove new-row saved snapshot fallback**

In `replay-frame-reconstruction.ts`, behavior must be:

- `dev-local-v2`: reconstruct from `initialDeckOrders`/`initialSnapshot` plus deterministic entries. Fail closed if entries are invalid.
- `dev-local-v2`: pass `replay.checkpoints ?? []` into `reconstructReplayArtifactStates` so rollback restore entries resolve from the checkpoint archive.
- `dev-local-v1`: use legacy adapter or saved snapshots if available, with a visible compatibility status.

- [ ] **Step 2: Add tests**

Add:

```ts
test("dev-local-v2 fails closed when deterministic entries are envelope-shaped", () => {
  const result = reconstructReplayFrames(
    replayDetail({
      replayFormatVersion: "dev-local-v2",
      deterministicEntries: [
        {
          envelope: { request: { type: "submitAction" } },
          result: { snapshot: validSavedSnapshot() },
        },
      ],
    }),
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /deterministic/i);
});
```

This intentionally uses the current legacy fallback shape, where saved frame data is embedded under `deterministicEntries[].result.snapshot`. For `dev-local-v2`, that legacy snapshot must not rescue an invalid deterministic entry.

Add:

```ts
test("dev-local-v2 reconstructs rollback restore from replay checkpoints", () => {
  const rollbackCheckpoint = validRollbackCheckpointWithSnapshot();
  const result = reconstructReplayFrames(
    replayDetail({
      replayFormatVersion: "dev-local-v2",
      deterministicEntries: restoreRollbackPointEntries(rollbackCheckpoint),
      checkpoints: [rollbackCheckpoint],
    }),
  );

  assert.equal(result.status, "ready");
});
```

Add:

```ts
test("dev-local-v2 verifies final replay hash", () => {
  const result = reconstructReplayFrames(
    replayDetail({
      replayFormatVersion: "dev-local-v2",
      deterministicEntries: validDeterministicEntries(),
      finalStateHash: "wrong-final-hash",
    }),
  );

  assert.equal(result.status, "failed");
  assert.match(result.reason, /final hash/i);
});
```

- [ ] **Step 3: Update design doc**

Change the replay viewer design doc line that lists normal replay data so it reads:

```md
- optional `finalState` only for debug export, legacy compatibility, or external artifact storage
```

and explicitly state:

```md
New replay rows must reconstruct from the deterministic log and reconstruction source. Saved frames and final snapshots are not normal replay authority.
```

- [ ] **Step 4: Run replay route and viewer tests**

```bash
corepack pnpm exec vitest run packages/match-server/src/replay-frame-reconstruction.test.ts packages/match-server/src/match-http-server-replay.test.ts packages/client/src/react/ReplayViewerPage.test.tsx packages/client/src/react/replay-match-client.test.ts
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
```

Use the actual ReplayViewerPage test file extension in the repo if it is `.test.ts` instead of `.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add packages/match-server/src/replay-frame-reconstruction.ts packages/match-server/src/replay-frame-reconstruction.test.ts packages/match-server/src/match-http-server-replay.test.ts packages/client/src/react/ReplayViewerPage.test.tsx packages/client/src/react/replay-match-client.test.ts docs/superpowers/specs/2026-06-24-replay-viewer-design.md
git commit -m "fix: require deterministic replay reconstruction for new rows"
```

Only stage existing test paths that changed.

## Task 13: Add Schema And Contract Guards

**Files:**

- Modify: `contracts/database-schema-v6.sql`
- Modify: `tools/validate-database-schema.ts` if schema tests need stronger replay checks.
- Modify: `tests/contracts` replay/schema tests.

- [ ] **Step 1: Confirm existing columns are sufficient**

The existing table already has:

```sql
deterministic_entries JSONB NOT NULL,
audit_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
initial_snapshot JSONB,
initial_deck_orders JSONB,
final_state JSONB,
CHECK (initial_snapshot IS NOT NULL OR (rng_seed_revealed IS NOT NULL AND initial_deck_orders IS NOT NULL))
```

Do not add a required `final_state` column. That would recreate the file-size bloat.

- [ ] **Step 2: Add a replay format guard if supported by validator**

If the schema validator supports JSONB shape checks, add a check that `deterministic_entries` is an array:

```sql
CHECK (jsonb_typeof(deterministic_entries) = 'array'),
CHECK (jsonb_typeof(audit_entries) = 'array'),
CHECK (jsonb_typeof(checkpoints) = 'array')
```

If the validator or target Postgres version rejects those checks in this repo, add a contract test against `contracts/database-schema-v6.sql` instead.

- [ ] **Step 3: Add contract test for reconstruction source and no required final snapshot**

Add assertions:

```js
assert.match(schema, /deterministic_entries JSONB NOT NULL/u);
assert.match(schema, /audit_entries JSONB NOT NULL DEFAULT '\[\]'::jsonb/u);
assert.match(
  schema,
  /CHECK \(initial_snapshot IS NOT NULL OR \(rng_seed_revealed IS NOT NULL AND initial_deck_orders IS NOT NULL\)\)/u,
);
assert.doesNotMatch(schema, /final_state JSONB NOT NULL/u);
```

- [ ] **Step 4: Run contracts**

```bash
corepack pnpm run contracts:validate-db-schema
corepack pnpm exec vitest run tests/contracts
```

Expected result: contract tests pass.

- [ ] **Step 5: Commit**

```bash
git diff --name-only
git add contracts/database-schema-v6.sql tools/validate-database-schema.ts tests/contracts/database-schema-v6.test.mjs
git commit -m "test: guard replay reconstruction schema"
```

Only stage files that actually changed.

## Task 14: Remove New-Code Dependence On Legacy Envelope Logs

**Files:**

- Modify: `packages/match-server/src/match-session.ts`
- Modify: `packages/match-server/src/session-types.ts`
- Modify: `packages/match-server/src/redis-match-persistence.ts`
- Modify: tests touched by those files.

- [ ] **Step 1: Add source scan test**

Add a focused test under `tests/lint`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("replay reducers do not inspect client envelopes", () => {
  const reducer = readFileSync(
    "packages/engine-core/src/replay/artifact-reducer.ts",
    "utf8",
  );

  assert.doesNotMatch(reducer, /envelope/u);
  assert.doesNotMatch(reducer, /actionIndex/u);
  assert.doesNotMatch(reducer, /ClientActionEnvelope/u);
});
```

If lint tests use Vitest instead of `node:test`, follow the existing test style.

- [ ] **Step 2: Keep legacy fields write-compatible but not authoritative**

`StoredSessionRecord` can remain for:

- idempotency
- audit display
- legacy active match recovery during transition

It must not feed:

- `replay.deterministicEntries`
- `dev-local-v2` replay reconstruction
- deterministic recovery when `deterministicLogVersion` is present

- [ ] **Step 3: Run tool/lint tests**

```bash
corepack pnpm exec vitest run tests/lint
corepack pnpm run test:tooling
```

Expected result: source scan passes.

- [ ] **Step 4: Commit**

```bash
git diff --name-only
git add tests/lint/replay-envelope-authority.test.mjs packages/match-server/src/match-session.ts packages/match-server/src/session-types.ts packages/match-server/src/redis-match-persistence.ts
git commit -m "test: prevent replay envelope authority regression"
```

Only stage files that actually changed.

## Task 15: End-To-End Replay, Recovery, And Rollback Proof

**Files:**

- Modify: `packages/match-server/src/dev-local-match-registry.test.ts`
- Modify: `packages/match-server/src/match-http-server-replay.test.ts`
- Modify: `packages/match-server/src/replay-frame-reconstruction.test.ts`
- Modify: `packages/client/src/react/ReplayViewerPage.test.tsx` if client needs fixture update.

- [ ] **Step 1: Add end-to-end completed replay test**

Test flow:

1. Create a dev match.
2. Submit at least two actions through normal HTTP/registry envelope path.
3. Complete the game or force a terminal test state using existing helpers.
4. Build/persist completed match record.
5. Fetch `/api/replays/:matchId`.
6. Assert `frameReconstruction.status === "ready"`.
7. Assert frame count equals initial frame plus deterministic entries.
8. Assert no deterministic entry has `envelope`.

Core assertion:

```ts
assert.equal(detail.frameReconstruction.status, "ready");
assert.equal(
  detail.frameReconstruction.frames.length,
  detail.replay.deterministicEntries.length + 1,
);
assert.equal(
  detail.replay.deterministicEntries.some((entry) => "envelope" in entry),
  false,
);
```

- [ ] **Step 2: Add end-to-end active recovery test**

Test flow:

1. Create registry with persistence.
2. Apply one or more envelopes.
3. Save snapshot.
4. Create a fresh registry/session service.
5. Recover persisted sessions.
6. Assert recovered state hash equals the original state hash.
7. Assert changing an audit envelope action index does not change recovery.

- [ ] **Step 3: Add rollback recovery test**

Test flow:

1. Create match with rollback enabled.
2. Apply an action that creates a rollback point.
3. Request rollback.
4. Approve rollback.
5. Assert live restore matches existing rollback behavior.
6. Assert deterministic entries include `system.restoreRollbackPoint`.
7. Reconstruct frames from initial source plus deterministic entries.
8. Assert the frame after restore has the restored checkpoint hash.

- [ ] **Step 4: Run focused integration tests**

```bash
corepack pnpm exec vitest run packages/match-server/src/dev-local-match-registry.test.ts packages/match-server/src/match-http-server-replay.test.ts packages/match-server/src/replay-frame-reconstruction.test.ts
```

Expected result: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/match-server/src/dev-local-match-registry.test.ts packages/match-server/src/match-http-server-replay.test.ts packages/match-server/src/replay-frame-reconstruction.test.ts packages/client/src/react/ReplayViewerPage.test.tsx
git commit -m "test: prove replay recovery and rollback share deterministic log"
```

Only stage client test if changed.

## Task 16: Full Verification And Deployment Readiness

**Files:**

- No required code changes.

- [ ] **Step 1: Run canonical checks**

```bash
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run coverage
corepack pnpm run verify
```

If `coverage` is too slow in the local environment, run it before final push in CI and report that it was skipped locally with the reason.

- [ ] **Step 2: Check replay row size on a sample match**

Use an existing local script or add a one-off test assertion that compares old and new payload size. The accepted target:

- New compact replay row should be close to the pre-full-snapshot size.
- New row must not contain full `initialSnapshot` or `finalState` by default.
- Deterministic entries grow with action count, not with full board snapshots per action.

Example local measurement:

```ts
const rawBytes = Buffer.byteLength(JSON.stringify(record.replay), "utf8");
assert.ok(rawBytes < 25_000);
```

Do not hardcode `25_000` as a permanent product limit unless test fixture size is stable. For a fixture test, compare against a full-state version:

```ts
assert.ok(compactBytes < fullSnapshotBytes * 0.25);
```

- [ ] **Step 3: Inspect git status**

```bash
git status --short
```

Expected result:

- Only intended files are modified.
- If another agent has unrelated UI changes, leave them unstaged and mention them.

- [ ] **Step 4: Final commit if verification required fixes**

```bash
git add <only-files-changed-for-verification-fixes>
git commit -m "fix: stabilize deterministic replay verification"
```

- [ ] **Step 5: Push only after user asks**

```bash
git push origin dev
```

Do not change branches without explicit user approval.

## Legacy Migration Policy

Legacy replay rows and active snapshots fall into three buckets:

- `dev-local-v2` or `deterministicLogVersion === "deterministic-entry-v1"`: must use deterministic entries; envelope-shaped deterministic entries are invalid.
- `dev-local-v1` completed replay rows: may use the isolated legacy adapter or saved snapshots; UI must show compatibility status if reconstruction is not fully deterministic.
- Active Redis snapshots without deterministic log version: recover through the legacy adapter only during transition. After one release cycle or after all dev sessions are recreated, remove the adapter.

Do not silently upgrade old envelope rows into deterministic rows without replaying them under the pinned engine version and verifying hashes. A mechanical shape conversion from `actionIndex` to `Action` under current code would bake in the same drift bug.

## Rollback Safety Notes

Rollback is the risk area. Keep these rules during implementation:

- `resolveRollbackConsent(... allow: true)` must still restore the cloned `GameState` from the selected rollback point.
- The deterministic rollback entry is a record of what happened and a replay/recovery input. It is not the live restore mechanism in the first implementation.
- The rollback point checkpoint must include a snapshot until object-storage snapshot references exist.
- Declined rollback consent must not be rendered or stored as if a gameplay effect resolved.
- Recovery must fail closed if a rollback restore entry references a missing checkpoint snapshot.
- Rollback point trimming may trim visible rollback point views, but must not trim archived deterministic checkpoint snapshots during the match. Completed replay and recovery restore entries may still reference older checkpoint ids.

## Self-Review Checklist

- Spec coverage: replay deterministic source, manifest pinning, checkpoint hashes, hidden information, and DB reconstruction source are each covered by a task.
- Current bug coverage: action-index drift, envelope recovery drift, timer final-hash mismatch, full-state row bloat, and rollback restore non-regression are each covered by tests.
- Type consistency: `DeterministicMatchEntry`, `DeterministicCheckpoint`, `StoredDeterministicSessionRecord`, and `StoredSessionAuditRecord` are defined before later tasks use them.
- No new authority whitelist: no task uses card ids, action labels, envelope request types, shape ids, or legal-action indexes as replay certification.
- Package boundaries: engine-core stays free of React, Redis, Postgres, and HTTP; match-server owns audit envelopes and persistence.
