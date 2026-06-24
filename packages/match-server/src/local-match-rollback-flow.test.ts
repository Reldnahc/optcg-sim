import { strict as assert } from "node:assert";
import { beforeAll, describe, test } from "vitest";
import type { PlayerId } from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  applyLocalDevAction,
  applyLocalDevDecision,
  cancelLocalDevRollback,
  createLocalDevMatch,
  getLocalDevSnapshot,
  requestLocalDevRollback,
  type DevMatchSetup,
} from "./local-match.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

const setupClone = (): DevMatchSetup => structuredClone(premadeSetup);

const createTestMatch = () => createLocalDevMatch(setupClone());

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

const mustPlayerSnapshot = (
  snapshot: ReturnType<typeof getLocalDevSnapshot>,
  playerId: PlayerId,
) => {
  const player = snapshot.players[playerId];
  if (player === undefined) {
    throw new Error(`Missing snapshot for ${String(playerId)}.`);
  }
  return player;
};

const deterministicOperation = (result: unknown): unknown =>
  (result as { readonly deterministicOperation?: unknown })
    .deterministicOperation;

const completeSetupIfPresent = (
  match: ReturnType<typeof createLocalDevMatch>,
): ReturnType<typeof getLocalDevSnapshot> => {
  let snapshot = getLocalDevSnapshot(match);
  for (const playerId of [p1, p2]) {
    const playerSnapshot = mustPlayerSnapshot(snapshot, playerId);
    const setupAction = playerSnapshot.actions.find((action) =>
      action.label.includes("during setup"),
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

const keepBothPlayersAndAdvance = (
  match: ReturnType<typeof createLocalDevMatch>,
): ReturnType<typeof getLocalDevSnapshot> => {
  let snapshot = completeSetupIfPresent(match);
  applyLocalDevAction(match, {
    playerId: p1,
    actionIndex: actionIndexByLabel(
      mustPlayerSnapshot(snapshot, p1).actions,
      "Keep hand",
    ),
  });
  snapshot = getLocalDevSnapshot(match);
  applyLocalDevAction(match, {
    playerId: p2,
    actionIndex: actionIndexByLabel(
      mustPlayerSnapshot(snapshot, p2).actions,
      "Keep hand",
    ),
  });
  snapshot = getLocalDevSnapshot(match);
  const advanceAction = mustPlayerSnapshot(snapshot, p1).actions.find(
    (action) => action.label.includes("Advance to main phase"),
  );
  if (advanceAction !== undefined) {
    applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: advanceAction.index,
    });
  }
  return getLocalDevSnapshot(match);
};

describe("local dev match rollback flow", () => {
  test("records rollback points before accepted actions and asks the opponent for consent", () => {
    const match = createTestMatch();
    const before = keepBothPlayersAndAdvance(match);
    const endMainIndex = actionIndexByLabel(
      mustPlayerSnapshot(before, p1).actions,
      "End turn",
    );
    const applied = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: endMainIndex,
    });
    assert.deepEqual(applied.errors, []);
    const after = getLocalDevSnapshot(match);
    const rollbackPoint = after.rollback?.points.find(
      (point) => point.stateSeq === before.stateSeq,
    );
    if (rollbackPoint === undefined) {
      throw new Error("Expected rollback point for state before end main.");
    }

    const requested = requestLocalDevRollback(match, {
      playerId: p1,
      rollbackPointId: rollbackPoint.rollbackPointId,
    });

    assert.deepEqual(requested.errors, []);
    const requestedOperation = deterministicOperation(requested);
    assert.equal(
      typeof requestedOperation === "object" && requestedOperation !== null,
      true,
    );
    const snapshot = getLocalDevSnapshot(match);
    const pendingRequest = snapshot.rollback?.pendingRequest;
    if (pendingRequest === undefined) {
      throw new Error("Expected pending rollback request.");
    }
    assert.deepEqual(requestedOperation, {
      kind: "system",
      operation: {
        type: "requestRollbackConsent",
        playerId: p1,
        rollbackPointId: rollbackPoint.rollbackPointId,
        approvingPlayerId: p2,
        decisionId: mustPlayerSnapshot(snapshot, p2).view.pendingDecision?.id,
        prompt: mustPlayerSnapshot(snapshot, p2).view.pendingDecision?.prompt,
      },
    });
    assert.equal(pendingRequest.requestedBy, p1);
    assert.equal(pendingRequest.approvingPlayerId, p2);
    assert.equal(
      mustPlayerSnapshot(snapshot, p2).view.pendingDecision?.type,
      "rollbackConsent",
    );
    assert.equal(
      mustPlayerSnapshot(snapshot, p1).view.pendingDecision,
      undefined,
    );
  });

  test("restores the requested rollback point after opponent consent", () => {
    const match = createTestMatch();
    const before = keepBothPlayersAndAdvance(match);
    const endMainIndex = actionIndexByLabel(
      mustPlayerSnapshot(before, p1).actions,
      "End turn",
    );
    const applied = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: endMainIndex,
    });
    assert.deepEqual(applied.errors, []);
    const afterAction = getLocalDevSnapshot(match);
    assert.equal(afterAction.turn.turnPlayerId, p2);
    const rollbackPoint = afterAction.rollback?.points.find(
      (point) => point.stateSeq === before.stateSeq,
    );
    if (rollbackPoint === undefined) {
      throw new Error("Expected rollback point for state before end main.");
    }
    const requested = requestLocalDevRollback(match, {
      playerId: p1,
      rollbackPointId: rollbackPoint.rollbackPointId,
    });
    assert.deepEqual(requested.errors, []);
    const decision = mustPlayerSnapshot(getLocalDevSnapshot(match), p2).view
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
    assert.deepEqual(deterministicOperation(accepted), {
      kind: "system",
      operation: {
        type: "restoreRollbackPoint",
        rollbackPointId: rollbackPoint.rollbackPointId,
        requestedBy: p1,
        approvedBy: p2,
        restoredStateHash: (accepted as { readonly stateHash?: unknown })
          .stateHash,
        restoredStateSeq: accepted.stateSeq,
        restoredActionSeq: accepted.actionSeq,
      },
    });
    const restored = getLocalDevSnapshot(match);
    assert.equal(restored.turn.turnPlayerId, before.turn.turnPlayerId);
    assert.equal(restored.turn.phase, before.turn.phase);
    assert.equal(restored.stateSeq > afterAction.stateSeq, true);
    assert.equal(restored.rollback?.pendingRequest, undefined);
    assert.equal(
      mustPlayerSnapshot(restored, p1).view.pendingDecision,
      undefined,
    );
    assert.equal(
      mustPlayerSnapshot(restored, p2).view.pendingDecision,
      undefined,
    );
  });

  test("restores pending gameplay decisions when rolling back before a decision response", () => {
    const match = createTestMatch();
    const initial = getLocalDevSnapshot(match);
    const setupAction = mustPlayerSnapshot(initial, p1).actions.find((action) =>
      action.label.includes("during setup"),
    );
    if (setupAction === undefined) {
      throw new Error("Expected p1 setup action.");
    }
    const appliedSetup = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: setupAction.index,
    });
    assert.deepEqual(appliedSetup.errors, []);
    const setupPoint = getLocalDevSnapshot(match).rollback?.points.find(
      (point) => point.stateSeq === initial.stateSeq,
    );
    if (setupPoint === undefined) {
      throw new Error(
        "Expected rollback point before setup decision response.",
      );
    }
    const main = keepBothPlayersAndAdvance(match);
    assert.equal(main.turn.phase, "main");

    const requested = requestLocalDevRollback(match, {
      playerId: p1,
      rollbackPointId: setupPoint.rollbackPointId,
    });
    assert.deepEqual(requested.errors, []);
    const decision = mustPlayerSnapshot(getLocalDevSnapshot(match), p2).view
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
    const restored = getLocalDevSnapshot(match);
    assert.equal(
      mustPlayerSnapshot(restored, p1).view.pendingDecision?.type,
      "selectCards",
    );
    assert.equal(
      mustPlayerSnapshot(restored, p2).view.pendingDecision,
      undefined,
    );
  });

  test("denying rollback consent clears the request without rewinding", () => {
    const match = createTestMatch();
    const before = keepBothPlayersAndAdvance(match);
    const endMainIndex = actionIndexByLabel(
      mustPlayerSnapshot(before, p1).actions,
      "End turn",
    );
    const applied = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: endMainIndex,
    });
    assert.deepEqual(applied.errors, []);
    const afterAction = getLocalDevSnapshot(match);
    const rollbackPoint = afterAction.rollback?.points.find(
      (point) => point.stateSeq === before.stateSeq,
    );
    if (rollbackPoint === undefined) {
      throw new Error("Expected rollback point for state before end main.");
    }
    const requested = requestLocalDevRollback(match, {
      playerId: p1,
      rollbackPointId: rollbackPoint.rollbackPointId,
    });
    assert.deepEqual(requested.errors, []);
    const decision = mustPlayerSnapshot(getLocalDevSnapshot(match), p2).view
      .pendingDecision;
    if (decision?.type !== "rollbackConsent") {
      throw new Error("Expected rollback consent decision.");
    }

    const denied = applyLocalDevDecision(match, {
      playerId: p2,
      decisionId: decision.id,
      response: { type: "rollbackConsent", allow: false },
    });

    assert.deepEqual(denied.errors, []);
    assert.deepEqual(deterministicOperation(denied), {
      kind: "system",
      operation: {
        type: "cancelRollbackConsent",
        playerId: p2,
        rollbackPointId: rollbackPoint.rollbackPointId,
        decisionId: decision.id,
      },
    });
    const current = getLocalDevSnapshot(match);
    assert.equal(current.turn.turnPlayerId, afterAction.turn.turnPlayerId);
    assert.equal(current.turn.phase, afterAction.turn.phase);
    assert.equal(current.rollback?.pendingRequest, undefined);
  });

  test("requester can cancel a pending rollback request without rewinding", () => {
    const match = createTestMatch();
    const before = keepBothPlayersAndAdvance(match);
    const endMainIndex = actionIndexByLabel(
      mustPlayerSnapshot(before, p1).actions,
      "End turn",
    );
    const applied = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: endMainIndex,
    });
    assert.deepEqual(applied.errors, []);
    const afterAction = getLocalDevSnapshot(match);
    const rollbackPoint = afterAction.rollback?.points.find(
      (point) => point.stateSeq === before.stateSeq,
    );
    if (rollbackPoint === undefined) {
      throw new Error("Expected rollback point for state before end main.");
    }
    const requested = requestLocalDevRollback(match, {
      playerId: p1,
      rollbackPointId: rollbackPoint.rollbackPointId,
    });
    assert.deepEqual(requested.errors, []);
    const decisionId = mustPlayerSnapshot(getLocalDevSnapshot(match), p2).view
      .pendingDecision?.id;

    const cancelled = cancelLocalDevRollback(match, { playerId: p1 });

    assert.deepEqual(cancelled.errors, []);
    assert.deepEqual(deterministicOperation(cancelled), {
      kind: "system",
      operation: {
        type: "cancelRollbackConsent",
        playerId: p1,
        rollbackPointId: rollbackPoint.rollbackPointId,
        decisionId,
      },
    });
    const current = getLocalDevSnapshot(match);
    assert.equal(current.turn.turnPlayerId, afterAction.turn.turnPlayerId);
    assert.equal(current.turn.phase, afterAction.turn.phase);
    assert.equal(current.rollback?.pendingRequest, undefined);
    assert.equal(
      mustPlayerSnapshot(current, p1).view.pendingDecision,
      undefined,
    );
    assert.equal(
      mustPlayerSnapshot(current, p2).view.pendingDecision,
      undefined,
    );
  });
});
