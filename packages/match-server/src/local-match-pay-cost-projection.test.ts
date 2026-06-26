import { strict as assert } from "node:assert";
import { beforeAll, describe, test } from "vitest";
import type { PlayerId } from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  applyLocalDevAction,
  createLocalDevMatch,
  getLocalDevSnapshot,
  type DevMatchSetup,
} from "./local-match.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

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

const keepBothPlayersAndAdvance = (
  match: ReturnType<typeof createLocalDevMatch>,
): ReturnType<typeof getLocalDevSnapshot> => {
  let snapshot = getLocalDevSnapshot(match);
  for (const playerId of [p1, p2]) {
    const setupAction = mustPlayerSnapshot(snapshot, playerId).actions.find(
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

describe("local dev pay-cost projection", () => {
  test("projects card-cost payment groups onto the player snapshot", () => {
    const match = createLocalDevMatch(structuredClone(premadeSetup));
    const main = keepBothPlayersAndAdvance(match);
    const leader = mustPlayerSnapshot(main, p1).view.self.leader;
    const leaderActivate = mustPlayerSnapshot(main, p1).actions.find(
      (action) =>
        action.label === "Activate effect" &&
        action.placement?.instanceId === leader.instanceId,
    );
    if (leaderActivate === undefined) {
      throw new Error("Missing leader activate effect action.");
    }

    const activated = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: leaderActivate.index,
    });
    assert.deepEqual(activated.errors, []);

    const snapshot = getLocalDevSnapshot(match);
    const playerSnapshot = mustPlayerSnapshot(snapshot, p1);
    const actions = playerSnapshot.actions;
    const decline = actions.find(
      (action) => action.decisionPayment?.kind === "paymentDeclined",
    );
    const cardCostActions = actions.filter(
      (action) => action.decisionPayment?.kind === "cardCost",
    );
    const pendingDecision = playerSnapshot.view.pendingDecision;
    if (pendingDecision?.type !== "payCost") {
      throw new Error("Expected payCost pending decision.");
    }
    const payCostInteraction = playerSnapshot.payCostInteraction;
    if (payCostInteraction === undefined) {
      throw new Error("Expected projected pay-cost interaction.");
    }
    const payCostGroup = payCostInteraction.groups[0];
    if (payCostGroup === undefined) {
      throw new Error("Expected projected pay-cost group.");
    }

    assert.ok(decline, "expected decline metadata");
    assert.equal(decline.responseKey, "decline");
    assert.equal(payCostInteraction.decisionId, pendingDecision.id);
    assert.equal(payCostInteraction.declineActionIndex, decline.index);
    assert.equal(payCostGroup.operation, "trash");
    assert.deepEqual(payCostGroup.source, { zone: "hand", playerId: p1 });
    assert.deepEqual(
      payCostGroup.cardActions.map((action) => action.actionIndex),
      cardCostActions.map((action) => action.index),
    );
  });
});
