import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./play-card.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  hasPlayCardAction,
  setupMainPlayState,
} from "./play-card-test-fixtures.js";

const applyPlayCardTestAction = (
  state: GameState,
  action:
    | Extract<Action, { type: "playCard" }>
    | Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  if (action.type === "playCard") {
    return applyPlayCard(state, action);
  }
  const result = applyPlayCardDecisionResponse(state, action);
  assert.ok(result !== null, "expected play-card decision response");
  return result;
};
test("applyAction playCard rejects forged card instance references without mutation", () => {
  const state = setupMainPlayState();
  const before = JSON.stringify(state);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: "forged-card" as CardInstance["instanceId"],
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("applyAction playCard rejects nonzero cards without enough active DON!!", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 2000,
  });
  p1State.costArea = p1State.costArea.slice(0, 1);
  const before = JSON.stringify(state);

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), card),
    false,
  );
  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(JSON.stringify(state), before);
});

test("applyAction playCard rejects Character or Stage cards without printed cost", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    power: 2000,
  });
  const before = JSON.stringify(state);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("getLegalActions includes playCard for supported vanilla Character and Stage in turn-player hand", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "character");
  const stage = must(p1State.hand[1], "stage");
  const unsupported = must(p1State.hand[2], "unsupported");

  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 1,
    power: 2000,
    effectText: "",
    triggerText: "",
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 1,
  });
  state.cardManifest.cards[unsupported.cardId] = {
    ...resolvedCard({
      cardId: unsupported.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    }),
    support: {
      ...resolvedCard({
        cardId: unsupported.cardId,
        category: "character",
      }).support,
      status: "unsupported",
    },
  };

  const legal = getPlayCardLegalActions(state, p1);
  assert.equal(hasPlayCardAction(legal, character), true);
  assert.equal(hasPlayCardAction(legal, stage), true);
  assert.equal(hasPlayCardAction(legal, unsupported), false);
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p2), character),
    false,
  );
});

test("getLegalActions omits playCard when card play preconditions fail", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "character");
  const highCost = must(p1State.hand[1], "high-cost character");
  const stage = must(p1State.hand[2], "stage");
  const missingManifest = must(p1State.hand[3], "missing manifest");
  const missingCost = must(p1State.hand[4], "missing cost");

  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 1,
    power: 2000,
  });
  state.cardManifest.cards[highCost.cardId] = resolvedCard({
    cardId: highCost.cardId,
    category: "character",
    cost: 4,
    power: 2000,
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 1,
    effectText: "[Main] draw a card.",
  });
  state.cardManifest.cards[missingCost.cardId] = resolvedCard({
    cardId: missingCost.cardId,
    category: "character",
    power: 2000,
  });
  p1State.costArea = p1State.costArea.slice(0, 3).map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p1, slot: "cost", index },
    state: index === 0 ? "active" : "rested",
  }));
  const legal = getPlayCardLegalActions(state, p1);
  assert.equal(hasPlayCardAction(legal, character), true);
  assert.equal(hasPlayCardAction(legal, highCost), false);
  assert.equal(hasPlayCardAction(legal, stage), false);
  assert.equal(hasPlayCardAction(legal, missingManifest), false);
  assert.equal(hasPlayCardAction(legal, missingCost), false);

  const fullCharacters = setupMainPlayState();
  const fullP1 = must(fullCharacters.players[p1], "full p1");
  const fullCharacter = must(fullP1.hand[0], "full character");
  fullCharacters.cardManifest.cards[fullCharacter.cardId] = resolvedCard({
    cardId: fullCharacter.cardId,
    category: "character",
    cost: 1,
    power: 2000,
  });
  fullP1.characters = Array.from({ length: 5 }, (_, index) => ({
    ...fullCharacter,
    instanceId:
      `${String(fullCharacter.instanceId)}:full:${String(index)}` as CardInstance["instanceId"],
    zone: { zone: "characterArea", playerId: p1, slot: "character", index },
    state: "active",
  }));
  assert.equal(
    hasPlayCardAction(
      getPlayCardLegalActions(fullCharacters, p1),
      fullCharacter,
    ),
    true,
  );
  fullP1.characters = [
    ...fullP1.characters,
    {
      ...fullCharacter,
      instanceId:
        `${String(fullCharacter.instanceId)}:overflow-corrupt` as CardInstance["instanceId"],
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 5,
      },
      state: "active",
    },
  ];
  assert.equal(
    hasPlayCardAction(
      getPlayCardLegalActions(fullCharacters, p1),
      fullCharacter,
    ),
    false,
  );

  const occupiedStage = setupMainPlayState();
  const stageP1 = must(occupiedStage.players[p1], "stage p1");
  const stageCard = must(stageP1.hand[1], "stage card");
  occupiedStage.cardManifest.cards[stageCard.cardId] = resolvedCard({
    cardId: stageCard.cardId,
    category: "stage",
    cost: 1,
  });
  stageP1.stage = {
    ...stageCard,
    instanceId:
      `${String(stageCard.instanceId)}:existing` as CardInstance["instanceId"],
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
    state: "active",
  };
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(occupiedStage, p1), stageCard),
    true,
  );

  const battleState = setupMainPlayState();
  const battleP1 = must(battleState.players[p1], "battle p1");
  const battleCard = must(battleP1.hand[0], "battle card");
  battleState.cardManifest.cards[battleCard.cardId] = resolvedCard({
    cardId: battleCard.cardId,
    category: "character",
    cost: 1,
    power: 2000,
  });
  const leaderRef = {
    instanceId: battleP1.leader.instanceId,
    cardId: battleP1.leader.cardId,
    playerId: p1,
  };
  battleState.battle = {
    attacker: leaderRef,
    originalTarget: leaderRef,
    currentTarget: leaderRef,
    step: "counter",
    damageCount: 1,
  };
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(battleState, p1), battleCard),
    false,
  );
});

test("applyAction playCard rejects direct costPayment on initial action", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 1,
    power: 1000,
  });
  const before = JSON.stringify(state);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
    costPayment: { optionId: "restDon", selectedDonInstanceIds: [] },
  });
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});
