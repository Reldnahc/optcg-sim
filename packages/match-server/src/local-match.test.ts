import { strict as assert } from "node:assert";
import { beforeAll, describe, test } from "vitest";
import type { CardId, PlayerId } from "@optcg/types";

import {
  applyLocalDevAction,
  applyLocalDevDecision,
  createLocalDevMatch,
  createPremadeDevMatchSetup,
  getLocalDevSnapshot,
  type DevMatchSetup,
} from "./local-match.js";
import { createDefaultDevFixtureFetch } from "./default-dev-fixture-fetch.test-support.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const op13079 = "OP13-079" as CardId;
const op13099 = "OP13-099" as CardId;

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createPremadeDevMatchSetup({
    fetchCard: createDefaultDevFixtureFetch(),
  });
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

const mustCard = (setup: DevMatchSetup, cardId: CardId) => {
  const card = setup.cardManifest.cards[cardId];
  if (card === undefined) {
    throw new Error(`Missing manifest card ${String(cardId)}.`);
  }
  return card;
};

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
  applyLocalDevAction(match, {
    playerId: p1,
    actionIndex: actionIndexByLabel(
      mustPlayerSnapshot(snapshot, p1).actions,
      "Advance to main phase",
    ),
  });
  return getLocalDevSnapshot(match);
};

const advanceUntilPlayable = (
  match: ReturnType<typeof createLocalDevMatch>,
): ReturnType<typeof getLocalDevSnapshot> => {
  let snapshot = keepBothPlayersAndAdvance(match);
  for (let step = 0; step < 20; step += 1) {
    const activeSnapshot = mustPlayerSnapshot(
      snapshot,
      snapshot.activePlayerId,
    );
    if (
      activeSnapshot.actions.some((action) => action.label.startsWith("Play "))
    ) {
      return snapshot;
    }
    const nextAction = activeSnapshot.actions.find(
      (action) =>
        action.label.includes("Advance to main phase") ||
        action.label.includes("End main phase"),
    );
    if (nextAction === undefined) {
      return snapshot;
    }
    const result = applyLocalDevAction(match, {
      playerId: snapshot.activePlayerId,
      actionIndex: nextAction.index,
    });
    assert.deepEqual(result.errors, []);
    snapshot = getLocalDevSnapshot(match);
  }
  return snapshot;
};

describe("local dev match", () => {
  test("premade dev setup uses the default fixture cards with generated effect definitions", () => {
    const setup = setupClone();
    const expectedDeckIds = [
      "OP13-080",
      "OP13-082",
      "OP13-083",
      "OP13-084",
      "OP13-089",
      "OP13-091",
      "OP13-099",
    ];

    assert.equal(setup.players[0].leaderCardId, "OP13-079");
    assert.equal(setup.players[1].leaderCardId, "OP13-079");
    assert.equal(setup.shuffleDecks, true);
    assert.deepEqual(
      setup.players[0].deckCardIds,
      setup.players[1].deckCardIds,
    );
    for (const cardId of expectedDeckIds) {
      assert.equal(
        setup.players[0].deckCardIds.filter((candidate) => candidate === cardId)
          .length,
        4,
      );
    }

    const leader = mustCard(setup, op13079);
    assert.equal(leader.name, "Imu");
    assert.equal(leader.category, "leader");
    assert.equal(leader.support.status, "implemented-dsl");
    assert.ok(leader.support.effectDefinitionId);
    assert.ok(
      setup.cardManifest.effectDefinitions?.[leader.support.effectDefinitionId],
    );

    const stage = mustCard(setup, op13099);
    assert.equal(stage.category, "stage");
    assert.equal(
      stage.variants[0]?.stockImageFull?.startsWith("https://"),
      true,
    );
    assert.equal(Object.hasOwn(stage, "card_number"), false);
  });

  test("premade dev match shuffles decks before opening hands", () => {
    const setup = setupClone();
    const match = createLocalDevMatch(setup);
    completeSetupIfPresent(match);
    const snapshot = getLocalDevSnapshot(match);
    const handIds = mustPlayerSnapshot(snapshot, p1).view.self.hand.map(
      (card) => card.cardId,
    );

    assert.notDeepEqual(handIds, setup.players[0].deckCardIds.slice(0, 5));
  });

  test("exposes filtered player views and server-owned action indexes", () => {
    const match = createTestMatch();
    const snapshot = getLocalDevSnapshot(match);
    const p1Snapshot = mustPlayerSnapshot(snapshot, p1);
    const p2Snapshot = mustPlayerSnapshot(snapshot, p2);

    assert.deepEqual(Object.keys(snapshot.players).sort(), ["p1", "p2"]);
    assert.equal(p1Snapshot.view.playerId, p1);
    assert.equal(p1Snapshot.view.pendingDecision?.type, "selectCards");
    assert.equal(p2Snapshot.view.pendingDecision, undefined);
    assert.equal(typeof p1Snapshot.view.opponent.handCount, "number");
    assert.equal("hand" in p1Snapshot.view.opponent, false);
    assert.equal(JSON.stringify(snapshot).includes("cardManifest"), false);
    assert.ok(
      p1Snapshot.actions.some((action) =>
        action.label.includes("during setup"),
      ),
    );
    assert.ok(
      p1Snapshot.actions.every(
        (action) =>
          typeof action.index === "number" &&
          !Object.prototype.hasOwnProperty.call(action, "raw"),
      ),
    );
  });

  test("applies the current server action by player and index", () => {
    const match = createTestMatch();
    const before = completeSetupIfPresent(match);
    const keepIndex = actionIndexByLabel(
      mustPlayerSnapshot(before, p1).actions,
      "Keep hand",
    );

    const result = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: keepIndex,
    });

    assert.deepEqual(result.errors, []);
    const after = getLocalDevSnapshot(match);
    assert.equal(mustPlayerSnapshot(after, p1).view.pendingDecision, undefined);
    assert.equal(
      mustPlayerSnapshot(after, p2).view.pendingDecision?.type,
      "mulligan",
    );
  });

  test("applies explicit filtered card decision responses by decision id", () => {
    const match = createTestMatch();
    const before = getLocalDevSnapshot(match);
    const p1Snapshot = mustPlayerSnapshot(before, p1);
    const decision = p1Snapshot.view.pendingDecision;
    if (decision?.type !== "selectCards") {
      throw new Error("Expected p1 setup selectCards decision.");
    }
    const candidate = decision.candidates[0]?.card;
    if (candidate === undefined) {
      throw new Error("Expected a public candidate for the decision player.");
    }

    const result = applyLocalDevDecision(match, {
      playerId: p1,
      decisionId: decision.id,
      response: { type: "cards", cards: [candidate] },
    });

    assert.deepEqual(result.errors, []);
    assert.equal(
      getLocalDevSnapshot(match).players[p1]?.view.pendingDecision,
      undefined,
    );
  });

  test("exposes server-owned phase advancement after mulligans complete", () => {
    const match = createTestMatch();
    const main = keepBothPlayersAndAdvance(match);

    assert.equal(main.status, "active");
    assert.equal(main.turn.phase, "main");
    assert.ok(
      mustPlayerSnapshot(main, p1).actions.some((action) =>
        action.label.includes("End main phase"),
      ),
    );
  });

  test("play-card payment decisions are labeled as payment, not generic response", () => {
    const match = createTestMatch();
    const main = advanceUntilPlayable(match);
    const activePlayerId = main.activePlayerId;
    const playAction = mustPlayerSnapshot(main, activePlayerId).actions.find(
      (action) => action.label.startsWith("Play "),
    );
    if (playAction === undefined) {
      throw new Error("Missing playable card action.");
    }

    const opened = applyLocalDevAction(match, {
      playerId: activePlayerId,
      actionIndex: playAction.index,
    });

    assert.deepEqual(opened.errors, []);
    const payment = getLocalDevSnapshot(match);
    const labels = mustPlayerSnapshot(payment, activePlayerId).actions.map(
      (action) => action.label,
    );
    assert.ok(labels.some((label) => label.includes("Pay cost")));
    assert.equal(
      labels.some((label) => label.includes("Respond to")),
      false,
    );
  });

  test("rejects a stale action index without mutating the match", () => {
    const match = createTestMatch();
    const before = getLocalDevSnapshot(match);

    const result = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: 999,
    });

    assert.deepEqual(result.errors, ["Action index 999 is not legal for p1."]);
    assert.equal(getLocalDevSnapshot(match).stateSeq, before.stateSeq);
  });

  test("rejects stale action requests after another action advances the state", () => {
    const match = createTestMatch();
    const before = keepBothPlayersAndAdvance(match);
    const endMainIndex = actionIndexByLabel(
      mustPlayerSnapshot(before, p1).actions,
      "End main phase",
    );
    const first = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: endMainIndex,
      expectedStateSeq: before.stateSeq,
    });
    assert.deepEqual(first.errors, []);
    const afterFirst = getLocalDevSnapshot(match);

    const stale = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: endMainIndex,
      expectedStateSeq: before.stateSeq,
    });

    assert.deepEqual(stale.errors, [
      "Action request is stale for p1; refresh the current match state.",
    ]);
    assert.equal(getLocalDevSnapshot(match).stateSeq, afterFirst.stateSeq);
  });

  test("boots from a premade match setup carrying manifest and player decks", () => {
    const setup = setupClone();
    const match = createLocalDevMatch(setup);
    const snapshot = getLocalDevSnapshot(match);

    assert.equal(
      snapshot.players[p1]?.view.self.leader.cardId,
      setup.players[0].leaderCardId,
    );
    assert.equal(
      snapshot.players[p2]?.view.self.leader.cardId,
      setup.players[1].leaderCardId,
    );
    const p1Snapshot = mustPlayerSnapshot(snapshot, p1);
    const p2Snapshot = mustPlayerSnapshot(snapshot, p2);
    assert.equal(
      p1Snapshot.view.self.deckCount,
      setup.players[0].deckCardIds.length -
        p1Snapshot.view.self.hand.length -
        p1Snapshot.view.self.life.count,
    );
    assert.equal(
      p2Snapshot.view.self.deckCount,
      setup.players[1].deckCardIds.length -
        p2Snapshot.view.self.hand.length -
        p2Snapshot.view.self.life.count,
    );
    assert.equal(
      match.state.cardManifest.manifestHash,
      setup.cardManifest.manifestHash,
    );
  });
});
