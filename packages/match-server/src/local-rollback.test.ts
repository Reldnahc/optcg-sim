import { strict as assert } from "node:assert";
import { test } from "vitest";

import { hashReplayStateForScope } from "@optcg/engine-core";
import type {
  EngineEvent,
  EngineEventId,
  MatchId,
  StateSeq,
} from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { createLocalDevMatch } from "./local-match.js";
import {
  createLocalRollbackState,
  recordRollbackPoint,
  requestRollbackConsent,
  resolveRollbackConsent,
} from "./local-rollback.js";

const publicEvent = (id: string, seq: number): EngineEvent =>
  ({
    id: id as EngineEventId,
    seq,
    type: "testEvent",
    payload: {},
    createdAtStateSeq: 0 as StateSeq,
    visibility: { type: "public" },
  }) as unknown as EngineEvent;

test("recording a rollback point archives a deterministic checkpoint snapshot", async () => {
  const setup = await createFixtureDevMatchSetup(
    "rollback-checkpoint-archive-match" as MatchId,
  );
  const match = createLocalDevMatch(setup);
  const previousState = structuredClone(match.state);

  const rollback = recordRollbackPoint(
    createLocalRollbackState({ enabled: true }),
    previousState,
    [publicEvent("event-1", 1)],
  );

  assert.equal(rollback.points.length, 1);
  assert.equal(rollback.checkpoints.length, 1);
  const checkpoint = rollback.checkpoints[0];
  assert.ok(checkpoint !== undefined);
  assert.equal(checkpoint.checkpointVersion, "deterministic-checkpoint-v1");
  assert.equal(checkpoint.matchId, previousState.matchId);
  assert.equal(checkpoint.checkpointId, rollback.points[0]?.rollbackPointId);
  assert.equal(checkpoint.reason, "rollbackPoint");
  assert.equal(checkpoint.stateSeq, previousState.seq);
  assert.equal(checkpoint.actionSeq, previousState.actionSeq);
  assert.equal(
    checkpoint.stateHash,
    hashReplayStateForScope(previousState, "gameplay-v1"),
  );
  assert.notEqual(checkpoint.snapshot, previousState);

  previousState.seq = 99 as StateSeq;

  assert.notEqual(checkpoint.snapshot?.seq, previousState.seq);
});

test("visible rollback point trimming does not trim archived checkpoints", async () => {
  const setup = await createFixtureDevMatchSetup(
    "rollback-checkpoint-trim-match" as MatchId,
  );
  const match = createLocalDevMatch(setup);
  const firstState = structuredClone(match.state);
  const secondState = structuredClone(match.state);
  secondState.seq = (Number(firstState.seq) + 1) as StateSeq;
  secondState.actionSeq = firstState.actionSeq + 1;

  const firstRollback = recordRollbackPoint(
    createLocalRollbackState({ enabled: true, maxPoints: 1 }),
    firstState,
    [publicEvent("event-1", 1)],
  );
  const secondRollback = recordRollbackPoint(firstRollback, secondState, [
    publicEvent("event-2", 2),
  ]);

  assert.equal(secondRollback.points.length, 1);
  assert.equal(secondRollback.points[0]?.stateSeq, secondState.seq);
  assert.equal(secondRollback.checkpoints.length, 2);
  assert.deepEqual(
    secondRollback.checkpoints.map((checkpoint) => checkpoint.stateSeq),
    [firstState.seq, secondState.seq],
  );
});

test("approved rollback still restores from saved GameState checkpoint", async () => {
  const setup = await createFixtureDevMatchSetup(
    "rollback-approved-restore-match" as MatchId,
  );
  const match = createLocalDevMatch(setup);
  const previousState = structuredClone(match.state);
  const rollback = recordRollbackPoint(
    createLocalRollbackState({ enabled: true }),
    previousState,
    [publicEvent("event-1", 1)],
  );
  const beforeRestorePoint = rollback.points[0];
  if (beforeRestorePoint === undefined) {
    throw new Error("Expected rollback point.");
  }
  const currentState = structuredClone(previousState);
  currentState.seq = (Number(previousState.seq) + 1) as StateSeq;
  currentState.actionSeq = previousState.actionSeq + 1;
  delete currentState.pendingDecision;
  const requester = setup.playerOrder[0];
  const approvingPlayerId = setup.playerOrder[1];
  const request = requestRollbackConsent(currentState, rollback, {
    playerId: requester,
    rollbackPointId: beforeRestorePoint.rollbackPointId,
    expectedStateSeq: currentState.seq,
  });
  const decisionId = request.rollbackRequest?.decisionId;
  if (decisionId === undefined) {
    throw new Error("Expected rollback consent decision.");
  }

  const result = resolveRollbackConsent(request.state, request.rollback, {
    playerId: approvingPlayerId,
    decisionId,
    response: { type: "rollbackConsent", allow: true },
  });

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
  assert.equal(Number(result.state.seq), Number(request.state.seq) + 1);
  assert.equal(result.state.actionSeq, request.state.actionSeq + 1);
});
