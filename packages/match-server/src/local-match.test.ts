import { strict as assert } from "node:assert";
import { beforeAll, describe, test } from "vitest";
import type { CardId, EngineEventId, PlayerId } from "@optcg/types";

import {
  applyLocalDevAction,
  applyLocalDevDecision,
  createLocalDevMatch,
  getLocalDevCardCatalogForPlayer,
  getLocalDevSnapshot,
  type DevMatchSetup,
} from "./local-match.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const op13079 = "OP13-079" as CardId;
const op13099 = "OP13-099" as CardId;

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

  test("per-player card catalogs include opponent public card metadata under the opponent owner", () => {
    const match = createTestMatch();
    const snapshot = getLocalDevSnapshot(match);
    const p1View = mustPlayerSnapshot(snapshot, p1).view;
    const opponentLeader = p1View.opponent.leader;

    const catalog = getLocalDevCardCatalogForPlayer(match, p1);
    const entry =
      catalog.players[opponentLeader.owner]?.cards[opponentLeader.cardId];
    if (entry === undefined) {
      throw new Error("Missing opponent leader catalog entry.");
    }

    assert.equal(opponentLeader.owner, p2);
    assert.equal(entry.name, "Imu");
    assert.equal(entry.effectText?.startsWith("Under the rules"), true);
    assert.equal(entry.imageUrl?.startsWith("https://"), true);
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

  test("applies explicit mulligan decision responses by decision id", () => {
    const match = createTestMatch();
    const before = completeSetupIfPresent(match);
    const p1Decision = mustPlayerSnapshot(before, p1).view.pendingDecision;
    if (p1Decision?.type !== "mulligan") {
      throw new Error("Expected p1 mulligan decision.");
    }

    const result = applyLocalDevDecision(match, {
      playerId: p1,
      decisionId: p1Decision.id,
      response: { type: "mulligan", keep: true },
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

  test("auto-resolves mandatory refresh draw and don gates after ending main", () => {
    const match = createTestMatch();
    const main = keepBothPlayersAndAdvance(match);
    const endMain = actionIndexByLabel(
      mustPlayerSnapshot(main, p1).actions,
      "End main phase",
    );

    const result = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: endMain,
    });

    assert.deepEqual(result.errors, []);
    const after = getLocalDevSnapshot(match);
    assert.equal(after.turn.turnPlayerId, p2);
    assert.equal(after.turn.phase, "main");
    assert.equal(after.activePlayerId, p2);
    assert.ok(
      mustPlayerSnapshot(after, p2).actions.some((action) =>
        action.label.includes("End main phase"),
      ),
    );
    assert.equal(
      mustPlayerSnapshot(after, p2).actions.some((action) =>
        action.label.includes("Advance to main phase"),
      ),
      false,
    );
  });

  test("nonzero play-card action pays canonical DON without opening payment modal", () => {
    const match = createTestMatch();
    const main = advanceUntilPlayable(match);
    const activePlayerId = main.activePlayerId;
    const playAction = mustPlayerSnapshot(main, activePlayerId).actions.find(
      (action) => action.label.startsWith("Play "),
    );
    if (playAction === undefined) {
      throw new Error("Missing playable card action.");
    }

    const result = applyLocalDevAction(match, {
      playerId: activePlayerId,
      actionIndex: playAction.index,
    });

    assert.deepEqual(result.errors, []);
    const afterPlay = getLocalDevSnapshot(match);
    assert.notEqual(
      mustPlayerSnapshot(afterPlay, activePlayerId).view.pendingDecision?.type,
      "payCost",
    );
    assert.equal(
      mustPlayerSnapshot(afterPlay, activePlayerId).actions.some((action) =>
        action.label.includes("Pay cost"),
      ),
      false,
    );
  });

  test("optional card-cost payment metadata survives dev snapshot projection", () => {
    const match = createTestMatch();
    const main = keepBothPlayersAndAdvance(match);
    const leaderActivate = mustPlayerSnapshot(main, p1).actions.find(
      (action) =>
        action.label === "Activate effect" &&
        action.placement?.instanceId ===
          mustPlayerSnapshot(main, p1).view.self.leader.instanceId,
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
    const actions = mustPlayerSnapshot(snapshot, p1).actions;
    const decline = actions.find(
      (action) => action.decisionPayment?.kind === "paymentDeclined",
    );
    const cardCostActions = actions.filter(
      (action) => action.decisionPayment?.kind === "cardCost",
    );

    assert.equal(
      mustPlayerSnapshot(snapshot, p1).view.pendingDecision?.type,
      "payCost",
    );
    assert.ok(decline, "expected decline metadata");
    assert.ok(cardCostActions.length > 0, "expected card-cost metadata");
    assert.ok(
      cardCostActions.every(
        (action) =>
          action.decisionPayment?.kind === "cardCost" &&
          action.decisionPayment.operation === "trash" &&
          action.decisionPayment.chooseLabel === "Choose card to trash" &&
          action.decisionPayment.selectedCardInstanceIds.length === 1,
      ),
    );
  });

  test("attack action labels include their target", () => {
    const match = createTestMatch();
    let snapshot = keepBothPlayersAndAdvance(match);
    for (let step = 0; step < 2; step += 1) {
      const current = mustPlayerSnapshot(snapshot, snapshot.activePlayerId);
      const endMain = current.actions.find((action) =>
        action.label.includes("End main phase"),
      );
      if (endMain === undefined) {
        throw new Error("Expected end-main action while setting up attack.");
      }
      const result = applyLocalDevAction(match, {
        playerId: snapshot.activePlayerId,
        actionIndex: endMain.index,
      });
      assert.deepEqual(result.errors, []);
      snapshot = getLocalDevSnapshot(match);
    }
    const p1Snapshot = mustPlayerSnapshot(snapshot, p1);
    const attacker = p1Snapshot.view.self.leader;
    const target = p1Snapshot.view.opponent.leader;
    const attackAction = p1Snapshot.actions.find(
      (action) =>
        action.type === "declareAttack" &&
        action.placement?.instanceId === attacker.instanceId,
    );

    if (attackAction === undefined) {
      throw new Error("Expected a leader attack action.");
    }

    assert.match(attackAction.label, /Attack .+ into .+/u);
    assert.equal(attackAction.label.includes(String(target.cardId)), true);
    void snapshot;
  });

  test("attack action metadata exposes attacker and target instance ids", () => {
    const match = createTestMatch();
    let snapshot = keepBothPlayersAndAdvance(match);
    for (let step = 0; step < 2; step += 1) {
      const current = mustPlayerSnapshot(snapshot, snapshot.activePlayerId);
      const endMain = current.actions.find((action) =>
        action.label.includes("End main phase"),
      );
      if (endMain === undefined) {
        throw new Error("Expected end-main action while setting up attack.");
      }
      const result = applyLocalDevAction(match, {
        playerId: snapshot.activePlayerId,
        actionIndex: endMain.index,
      });
      assert.deepEqual(result.errors, []);
      snapshot = getLocalDevSnapshot(match);
    }
    const p1Snapshot = mustPlayerSnapshot(snapshot, p1);
    const attackAction = p1Snapshot.actions.find(
      (action) => action.type === "declareAttack",
    );
    if (attackAction === undefined) {
      throw new Error("Expected attack action metadata.");
    }

    assert.deepEqual(attackAction.attack, {
      attackerInstanceId: p1Snapshot.view.self.leader.instanceId,
      targetInstanceId: p1Snapshot.view.opponent.leader.instanceId,
    });
  });

  test("counter-step pass action is labeled as ending the counter phase", () => {
    const match = createTestMatch();
    let snapshot = keepBothPlayersAndAdvance(match);
    for (let step = 0; step < 2; step += 1) {
      const current = mustPlayerSnapshot(snapshot, snapshot.activePlayerId);
      const endMain = current.actions.find((action) =>
        action.label.includes("End main phase"),
      );
      if (endMain === undefined) {
        throw new Error("Expected end-main action while setting up attack.");
      }
      const result = applyLocalDevAction(match, {
        playerId: snapshot.activePlayerId,
        actionIndex: endMain.index,
      });
      assert.deepEqual(result.errors, []);
      snapshot = getLocalDevSnapshot(match);
    }
    const attackAction = mustPlayerSnapshot(snapshot, p1).actions.find(
      (action) => action.type === "declareAttack",
    );
    if (attackAction === undefined) {
      throw new Error("Expected an attack action.");
    }

    const opened = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: attackAction.index,
    });

    assert.deepEqual(opened.errors, []);
    const counterLabels = mustPlayerSnapshot(
      getLocalDevSnapshot(match),
      p2,
    ).actions.map((action) => action.label);
    assert.ok(counterLabels.includes("End counter phase"));
    assert.equal(counterLabels.includes("Choose 0 card"), false);
  });

  test("OP13-084 projects its own active base-power change in the filtered view", () => {
    const match = createTestMatch();
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const sourceIndex = p1State.deck.findIndex(
      (card) => card.cardId === ("OP13-084" as CardId),
    );
    if (sourceIndex < 0) {
      throw new Error("Missing OP13-084 in p1 deck.");
    }
    const [source] = p1State.deck.splice(sourceIndex, 1);
    if (source === undefined) {
      throw new Error("Failed to remove OP13-084 from p1 deck.");
    }
    source.zone = {
      zone: "characterArea",
      playerId: p1,
      slot: "character",
      index: 0,
    };
    source.state = "active";
    source.turnPlayed = 1;
    p1State.characters = [source];
    p1State.deck = p1State.deck.map((card, index) => ({
      ...card,
      zone: { zone: "deck", playerId: p1, slot: "deck", index },
    }));
    const trashCards = p1State.deck.splice(0, 10).map((card, index) => ({
      ...card,
      zone: {
        zone: "trash" as const,
        playerId: p1,
        slot: "trash" as const,
        index,
      },
    }));
    p1State.trash = trashCards;
    match.state.turn.phase = "main";
    match.state.turn.turnPlayerId = p1;
    match.state.turn.globalTurn = 3;
    match.state.turn.playerTurnCounts[p1] = 2;

    const snapshot = getLocalDevSnapshot(match);
    const character = mustPlayerSnapshot(snapshot, p1).view.self.characters[0];
    const catalog = getLocalDevCardCatalogForPlayer(match, p1);

    assert.equal(character?.cardId, "OP13-084");
    assert.equal(character.printedPower, 5000);
    assert.equal(character.currentPower, 7000);
    assert.equal(catalog.players[p1]?.cards["OP13-084" as CardId]?.power, 5000);
  });

  test("real dev characters on field do not block leader attacks", () => {
    const match = createTestMatch();
    keepBothPlayersAndAdvance(match);
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const sourceIndex = p1State.deck.findIndex(
      (card) => card.cardId === ("OP13-084" as CardId),
    );
    if (sourceIndex < 0) {
      throw new Error("Missing OP13-084 in p1 deck.");
    }
    const [source] = p1State.deck.splice(sourceIndex, 1);
    if (source === undefined) {
      throw new Error("Failed to remove OP13-084 from p1 deck.");
    }
    source.zone = {
      zone: "characterArea",
      playerId: p1,
      slot: "character",
      index: 0,
    };
    source.state = "active";
    source.turnPlayed = 1;
    p1State.characters = [source];
    p1State.deck = p1State.deck.map((card, index) => ({
      ...card,
      zone: { zone: "deck", playerId: p1, slot: "deck", index },
    }));
    match.state.turn.phase = "main";
    match.state.turn.turnPlayerId = p1;
    match.state.turn.globalTurn = 3;
    match.state.turn.playerTurnCounts[p1] = 2;

    const snapshot = getLocalDevSnapshot(match);
    const attackAction = mustPlayerSnapshot(snapshot, p1).actions.find(
      (action) =>
        action.type === "declareAttack" &&
        action.placement?.instanceId === p1State.leader.instanceId,
    );
    if (attackAction === undefined) {
      throw new Error(
        `Expected leader attack action with character in play; actions were: ${mustPlayerSnapshot(
          snapshot,
          p1,
        )
          .actions.map((action) => action.label)
          .join(", ")}`,
      );
    }

    const opened = applyLocalDevAction(match, {
      playerId: p1,
      actionIndex: attackAction.index,
    });

    assert.deepEqual(opened.errors, []);
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

  test("player card catalog includes cards from visible reveal events", () => {
    const match = createTestMatch();
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const revealed = p1State.deck[0];
    if (revealed === undefined) {
      throw new Error("Missing reveal card in p1 deck.");
    }
    match.state.eventJournal.push({
      id: "event:test:public-reveal" as EngineEventId,
      seq: 1,
      type: "cardRevealed",
      payload: {
        revealId: "reveal:test:public",
        cards: [
          {
            instanceId: revealed.instanceId,
            cardId: revealed.cardId,
            playerId: p1,
          },
        ],
        origin: "topOfDeck",
      },
      visibility: { type: "public" },
      createdAtStateSeq: match.state.seq,
    });

    const catalog = getLocalDevCardCatalogForPlayer(match, p2);

    assert.equal(
      catalog.players[p1]?.cards[revealed.cardId]?.cardId,
      revealed.cardId,
    );
  });

  test("player card catalog keys persistent revealed cards by revealed card owner", () => {
    const match = createTestMatch();
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const revealed = p1State.deck[0];
    if (revealed === undefined) {
      throw new Error("Missing reveal card in p1 deck.");
    }
    match.state.revealedCards.push({
      id: "reveal:search-reveal:test",
      cards: [
        {
          instanceId: revealed.instanceId,
          cardId: revealed.cardId,
          playerId: p1,
        },
      ],
      visibility: { type: "public" },
      origin: "topOfDeck",
      createdAtStateSeq: match.state.seq,
      cleanupPolicy: "returnToOrigin",
    });

    const catalog = getLocalDevCardCatalogForPlayer(match, p2);

    assert.equal(
      catalog.players[p1]?.cards[revealed.cardId]?.cardId,
      revealed.cardId,
    );
    assert.equal(catalog.players[p2]?.cards[revealed.cardId], undefined);
  });
});
