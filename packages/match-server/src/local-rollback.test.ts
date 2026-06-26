import { strict as assert } from "node:assert";
import { beforeAll, describe, test } from "vitest";

import type {
  EngineEvent,
  EngineEventId,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  applyLocalDevAction,
  applyLocalDevDecision,
  createLocalDevMatch,
  getLocalDevSnapshot,
  requestLocalDevRollback,
  type DevMatchSetup,
} from "./local-match.js";
import {
  createLocalRollbackState,
  recordRollbackPoint,
} from "./local-rollback.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

const createTestMatch = () =>
  createLocalDevMatch(structuredClone(premadeSetup));

const rollbackAnchorEvent = (seq: number): EngineEvent => ({
  id: `event:rollback-retention:${String(seq)}` as EngineEventId,
  seq,
  type: "phaseStarted",
  payload: {},
  visibility: { type: "public" },
  createdAtStateSeq: seq as StateSeq,
});

const playerSnapshot = (
  snapshot: ReturnType<typeof getLocalDevSnapshot>,
  playerId: PlayerId,
) => {
  const player = snapshot.players[playerId];
  if (player === undefined) {
    throw new Error(`Missing snapshot for ${String(playerId)}.`);
  }
  return player;
};

const actionIndexByLabel = (
  labels: readonly { label: string; index: number }[],
  needle: string,
): number => {
  const action = labels.find((candidate) => candidate.label.includes(needle));
  if (action === undefined) {
    throw new Error(`Missing action label containing ${needle}.`);
  }
  return action.index;
};

const completeSetupIfPresent = (
  match: ReturnType<typeof createLocalDevMatch>,
): ReturnType<typeof getLocalDevSnapshot> => {
  let snapshot = getLocalDevSnapshot(match);
  for (const playerId of [p1, p2]) {
    const setupAction = playerSnapshot(snapshot, playerId).actions.find(
      (action) => action.label.includes("during setup"),
    );
    if (setupAction === undefined) {
      continue;
    }
    const result = applyLocalDevAction(match, {
      playerId,
      actionIndex: setupAction.index,
    });
    assert.deepEqual(result.errors, []);
    snapshot = getLocalDevSnapshot(match);
  }
  return snapshot;
};

const advanceToMain = (
  match: ReturnType<typeof createLocalDevMatch>,
): ReturnType<typeof getLocalDevSnapshot> => {
  let snapshot = completeSetupIfPresent(match);
  const p1Keep = applyLocalDevAction(match, {
    playerId: p1,
    actionIndex: actionIndexByLabel(
      playerSnapshot(snapshot, p1).actions,
      "Keep hand",
    ),
  });
  assert.deepEqual(p1Keep.errors, []);
  snapshot = getLocalDevSnapshot(match);
  const p2Keep = applyLocalDevAction(match, {
    playerId: p2,
    actionIndex: actionIndexByLabel(
      playerSnapshot(snapshot, p2).actions,
      "Keep hand",
    ),
  });
  assert.deepEqual(p2Keep.errors, []);
  snapshot = getLocalDevSnapshot(match);
  const advanceAction = playerSnapshot(snapshot, p1).actions.find((action) =>
    action.label.includes("Advance to main phase"),
  );
  if (advanceAction !== undefined) {
    const advanced = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: advanceAction.index,
    });
    assert.deepEqual(advanced.errors, []);
  }
  return getLocalDevSnapshot(match);
};

describe("local rollback memory policy", () => {
  test("keeps only the five most recent rollback points by default", () => {
    const match = createTestMatch();
    let rollback = createLocalRollbackState(undefined);

    for (let index = 1; index <= 6; index += 1) {
      const previousState = structuredClone(match.state);
      previousState.seq = index as StateSeq;
      previousState.actionSeq = index;
      rollback = recordRollbackPoint(rollback, previousState, [
        rollbackAnchorEvent(index),
      ]);
    }

    assert.equal(rollback.points.length, 5);
    assert.deepEqual(
      rollback.points.map((point) => point.stateSeq),
      [2, 3, 4, 5, 6],
    );
  });

  test("does not duplicate the card manifest inside rollback points", () => {
    const match = createTestMatch();
    const previousState = structuredClone(match.state);
    previousState.seq = 1 as StateSeq;
    previousState.actionSeq = 1;

    const rollback = recordRollbackPoint(
      createLocalRollbackState(undefined),
      previousState,
      [rollbackAnchorEvent(1)],
    );

    assert.equal(JSON.stringify(rollback).includes("cardManifest"), false);
  });

  test("does not duplicate event or audit history inside rollback points", () => {
    const match = createTestMatch();
    const previousState = structuredClone(match.state);
    previousState.seq = 1 as StateSeq;
    previousState.actionSeq = 1;

    const rollback = recordRollbackPoint(
      createLocalRollbackState(undefined),
      previousState,
      [rollbackAnchorEvent(1)],
    );
    const serialized = JSON.stringify(rollback);

    assert.equal(serialized.includes('"eventJournal":'), false);
    assert.equal(serialized.includes('"audit":'), false);
  });

  test("restores event and audit history prefixes after rollback consent", () => {
    const match = createTestMatch();
    const before = advanceToMain(match);
    const beforeState = structuredClone(match.state);
    const endTurnAction = playerSnapshot(before, p1).actions.find((action) =>
      action.label.includes("End turn"),
    );
    if (endTurnAction === undefined) {
      throw new Error("Expected end turn action.");
    }
    const ended = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: endTurnAction.index,
    });
    assert.deepEqual(ended.errors, []);
    assert.equal(
      match.state.eventJournal.length > beforeState.eventJournal.length,
      true,
    );
    const rollbackPoint = getLocalDevSnapshot(match).rollback?.points.find(
      (point) => point.stateSeq === before.stateSeq,
    );
    if (rollbackPoint === undefined) {
      throw new Error("Expected rollback point for pre-end-turn state.");
    }
    const requested = requestLocalDevRollback(match, {
      playerId: p1,
      rollbackPointId: rollbackPoint.rollbackPointId,
    });
    assert.deepEqual(requested.errors, []);
    const decision = playerSnapshot(getLocalDevSnapshot(match), p2).view
      .pendingDecision;
    if (decision?.type !== "rollbackConsent") {
      throw new Error("Expected rollback consent decision.");
    }

    const accepted = applyLocalDevDecision(match, {
      playerId: p2,
      decisionId: decision.id,
      response: { type: "rollbackConsent", allow: true },
    });

    assert.deepEqual(accepted.errors, []);
    assert.deepEqual(match.state.eventJournal, beforeState.eventJournal);
    assert.deepEqual(match.state.audit, beforeState.audit);
  });

  test("clears rollback points after an accepted terminal action", () => {
    const match = createTestMatch();
    const snapshot = advanceToMain(match);
    const concedeAction = playerSnapshot(snapshot, p1).actions.find(
      (action) => action.type === "concede",
    );
    if (concedeAction === undefined) {
      throw new Error("Expected concede action.");
    }

    const applied = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: concedeAction.index,
    });

    assert.deepEqual(applied.errors, []);
    const terminal = getLocalDevSnapshot(match);
    assert.equal(terminal.status, "completed");
    assert.ok(terminal.rollback !== undefined);
    assert.equal(terminal.rollback.points.length, 0);
    assert.equal(terminal.rollback.pendingRequest, undefined);
  });
});
