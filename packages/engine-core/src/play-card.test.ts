import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EngineResult,
  GameState,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./play-card.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  hasPlayCardAction,
  respondToDecisionActions,
  setupFullCharacterPlayState,
  setupMainPlayState,
  setupOccupiedStagePlayState,
  toTestCardRef,
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

test("nonzero playCard creates payCost decision and legal decision responses for decision player only", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });

  const first = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(first.errors, undefined);
  assert.equal(first.state.pendingDecision?.type, "payCost");
  assert.deepEqual(
    first.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.deepEqual(
    first.events.map((event) => event.visibility),
    [{ type: "public" }, { type: "public" }],
  );

  const legalForP1 = getPlayCardLegalActions(first.state, p1);
  const legalForP2 = getPlayCardLegalActions(first.state, p2);
  assert.equal(
    legalForP1.some((action) => action.type === "respondToDecision"),
    true,
  );
  assert.equal(
    legalForP2.some((action) => action.type === "respondToDecision"),
    false,
  );
});

test("valid respondToDecision payment resolves nonzero Character play", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const selected = must(
    must(opened.state.players[p1], "p1").costArea[0],
    "don0",
  );
  const selected2 = must(
    must(opened.state.players[p1], "p1").costArea[1],
    "don1",
  );

  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const resolvedP1 = must(resolved.state.players[p1], "p1");
  const played = must(resolvedP1.characters[0], "played character");
  assert.equal(played.instanceId, card.instanceId);
  assert.equal(played.turnPlayed, state.turn.globalTurn);
  assert.equal(
    resolvedP1.costArea.filter((don) => don.state === "rested").length >= 2,
    true,
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "costPaid",
      "decisionResolved",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(
    resolved.events.map((event) => event.visibility),
    [
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "replayOnly" },
    ],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("valid respondToDecision payment resolves nonzero Stage play", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.hand[1], "stage");
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 2,
  });
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: stage.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const selected = must(
    must(opened.state.players[p1], "p1").costArea[0],
    "don0",
  );
  const selected2 = must(
    must(opened.state.players[p1], "p1").costArea[1],
    "don1",
  );

  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p1], "p1").stage?.instanceId,
    stage.instanceId,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("zero-cost playCard resolves directly for Character without payCost decision", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "character");
  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 0,
    power: 2000,
  });

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: character.instanceId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  const played = must(
    must(result.state.players[p1], "p1").characters[0],
    "played",
  );
  assert.equal(played.instanceId, character.instanceId);
  assert.equal(played.turnPlayed, state.turn.globalTurn);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "cardMoved", "cardPlayed", "ruleProcessingChecked"],
  );
});

test("zero-cost playCard resolves directly for Stage without payCost decision", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.hand[1], "stage");
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 0,
  });

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: stage.instanceId,
  });
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    must(result.state.players[p1], "p1").stage?.instanceId,
    stage.instanceId,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "cardMoved", "cardPlayed", "ruleProcessingChecked"],
  );
  assert.deepEqual(
    result.events.map((event) => event.visibility),
    [
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "replayOnly" },
    ],
  );
});

test("getLegalActions includes payable Stage replacement and Character overflow play", () => {
  const occupiedStage = setupOccupiedStagePlayState(1);
  const fullCharacters = setupFullCharacterPlayState(1);

  assert.equal(
    hasPlayCardAction(
      getPlayCardLegalActions(occupiedStage.state, p1),
      occupiedStage.newStage,
    ),
    true,
  );
  assert.equal(
    hasPlayCardAction(
      getPlayCardLegalActions(fullCharacters.state, p1),
      fullCharacters.newCharacter,
    ),
    true,
  );
});

test("zero-cost Stage replacement trashes old Stage before placing new Stage", () => {
  const { state, newStage, oldStage } = setupOccupiedStagePlayState(0);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newStage.instanceId,
  });

  assert.equal(result.errors, undefined);
  const p1State = must(result.state.players[p1], "p1");
  assert.equal(p1State.stage?.instanceId, newStage.instanceId);
  assert.equal(
    must(p1State.trash[0], "trash stage").instanceId,
    oldStage.instanceId,
  );
  assert.equal(p1State.trash[0]?.zone.index, 0);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "cardRevealed",
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  const oldStageMove = must(
    result.events.find(
      (event) =>
        event.type === "cardMoved" &&
        (event.payload as { instanceId?: CardInstance["instanceId"] })
          .instanceId === oldStage.instanceId,
    ),
    "old stage movement",
  );
  const newStageMove = must(
    result.events.find(
      (event) =>
        event.type === "cardMoved" &&
        (event.payload as { instanceId?: CardInstance["instanceId"] })
          .instanceId === newStage.instanceId,
    ),
    "new stage movement",
  );
  assert.equal(oldStageMove.seq < newStageMove.seq, true);
  assert.equal(
    result.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("nonzero occupied-Stage play pays before replacing old Stage", () => {
  const { state, newStage, oldStage } = setupOccupiedStagePlayState(2);

  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newStage.instanceId,
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "payCost");
  assert.equal(
    must(opened.state.players[p1], "opened p1").stage?.instanceId,
    oldStage.instanceId,
  );
  assert.deepEqual(
    opened.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );

  const openedP1 = must(opened.state.players[p1], "opened p1");
  const selected = must(openedP1.costArea[0], "don0");
  const selected2 = must(openedP1.costArea[1], "don1");
  const beforeInvalid = JSON.stringify(opened.state);
  const invalid = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId],
    },
  });
  assert.equal(invalid.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), beforeInvalid);

  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(resolved.errors, undefined);
  const resolvedP1 = must(resolved.state.players[p1], "resolved p1");
  assert.equal(resolvedP1.stage?.instanceId, newStage.instanceId);
  assert.equal(
    must(resolvedP1.trash[0], "trash stage").instanceId,
    oldStage.instanceId,
  );
  assert.equal(resolvedP1.costArea[0]?.state, "rested");
  assert.equal(resolvedP1.costArea[1]?.state, "rested");
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "costPaid",
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
});

test("Stage replacement fails closed when old Stage has attached DON!! state", () => {
  const { state, newStage } = setupOccupiedStagePlayState(0);
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.stage, "stage");
  p1State.stage = {
    ...stage,
    attachedDon: ["invalid-stage-don" as CardInstance["instanceId"]],
  };
  const before = JSON.stringify(state);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newStage.instanceId,
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("zero-cost Character overflow creates SelectCardsDecision with controlled Character candidates", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });

  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "overflow decision");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p1);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    existingCharacters.map((card) => card.instanceId),
  );
  assert.deepEqual(
    {
      min: decision.request.min,
      max: decision.request.max,
      zone: decision.request.zone,
    },
    { min: 1, max: 1, zone: "characterArea" },
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.some(
      (card) => card.instanceId === newCharacter.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
});

test("nonzero Character overflow creates payCost first and SelectCardsDecision after payment", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(2);
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "payCost");

  const openedP1 = must(opened.state.players[p1], "opened p1");
  const selected = must(openedP1.costArea[0], "don0");
  const selected2 = must(openedP1.costArea[1], "don1");
  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });

  assert.equal(resolved.errors, undefined);
  const decision = must(resolved.state.pendingDecision, "overflow decision");
  assert.equal(decision.type, "selectCards");
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    existingCharacters.map((card) => card.instanceId),
  );
  assert.equal(
    must(resolved.state.players[p1], "p1").costArea[0]?.state,
    "rested",
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["costPaid", "decisionResolved", "decisionCreated"],
  );
});

test("Character overflow legal actions expose matching card responses only to decision player", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");

  const legalForP1 = respondToDecisionActions(
    getPlayCardLegalActions(opened.state, p1),
  );
  const legalForP2 = respondToDecisionActions(
    getPlayCardLegalActions(opened.state, p2),
  );

  assert.deepEqual(
    legalForP1.map((action) => ({
      decisionId: action.decisionId,
      response: action.response,
    })),
    existingCharacters.map((character) => ({
      decisionId: decision.id,
      response: {
        type: "cards",
        cards: [
          {
            instanceId: character.instanceId,
            cardId: character.cardId,
            playerId: p1,
            zone: character.zone,
          },
        ],
      },
    })),
  );
  assert.deepEqual(legalForP2, []);
});

test("valid Character overflow response trashes selected Character and places new Character", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);
  const attachedDon = must(must(state.players[p1], "p1").costArea[0], "don");
  const selectedCharacter = must(existingCharacters[2], "selected character");
  selectedCharacter.attachedDon = [attachedDon.instanceId];
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");

  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: selectedCharacter.instanceId,
          cardId: selectedCharacter.cardId,
          playerId: p1,
          zone: selectedCharacter.zone,
        },
      ],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const resolvedP1 = must(resolved.state.players[p1], "p1");
  assert.equal(resolvedP1.characters.length, 5);
  assert.equal(
    resolvedP1.characters.some(
      (card) => card.instanceId === selectedCharacter.instanceId,
    ),
    false,
  );
  assert.equal(resolvedP1.characters[4]?.instanceId, newCharacter.instanceId);
  assert.equal(
    must(resolvedP1.trash[0], "trashed character").instanceId,
    selectedCharacter.instanceId,
  );
  assert.equal(
    resolvedP1.costArea.find(
      (card) => card.instanceId === attachedDon.instanceId,
    )?.state,
    "rested",
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "donReturned",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("Character overflow rejects stale, wrong-player, wrong-card, missing, and multi-card responses without mutation", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const selectedCharacter = must(existingCharacters[0], "selected character");
  const before = JSON.stringify(opened.state);
  const run = (
    action:
      | Extract<Action, { type: "playCard" }>
      | Extract<Action, { type: "respondToDecision" }>,
  ) => {
    const result = applyPlayCardTestAction(opened.state, action);
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(opened.state), before);
  };

  run({
    type: "respondToDecision",
    decisionId: `${String(decision.id)}:stale` as typeof decision.id,
    response: { type: "cards", cards: [toTestCardRef(selectedCharacter, p1)] },
  });
  const wrongPlayerState = {
    ...opened.state,
    pendingDecision: { ...decision, playerId: p2 },
  };
  const wrongPlayerBefore = JSON.stringify(wrongPlayerState);
  const wrongPlayer = applyPlayCardTestAction(wrongPlayerState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [toTestCardRef(selectedCharacter, p1)] },
  });
  assert.equal(wrongPlayer.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(wrongPlayerState), wrongPlayerBefore);
  run({
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });
  run({
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        toTestCardRef(must(existingCharacters[0], "first"), p1),
        toTestCardRef(must(existingCharacters[1], "second"), p1),
      ],
    },
  });
  run({
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: newCharacter.instanceId,
          cardId: newCharacter.cardId,
          playerId: p1,
          zone: newCharacter.zone,
        },
      ],
    },
  });
  run({
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "payment", optionId: "restDon" },
  });
});

test("respondToDecision rejects duplicate/forged DON!! selections without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 2000,
  });
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const validDon = must(
    must(opened.state.players[p1], "p1").costArea[0],
    "don",
  );
  const before = JSON.stringify(opened.state);

  const duplicate = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [validDon.instanceId, validDon.instanceId],
    },
  });
  assert.equal(duplicate.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const forged = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [
        validDon.instanceId,
        "forged-don" as CardInstance["instanceId"],
      ],
    },
  });
  assert.equal(forged.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);
});

test("respondToDecision rejects invalid payment variants without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 2000,
  });
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const openedP1 = must(opened.state.players[p1], "opened p1");
  const selected = must(openedP1.costArea[0], "don0");
  const selected2 = must(openedP1.costArea[1], "don1");
  const wrongPlayerDon = must(
    must(opened.state.players[p2], "opened p2").costArea[0],
    "p2 don",
  );
  const before = JSON.stringify(opened.state);

  const wrongDecision = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: `${String(decision.id)}:wrong` as typeof decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(wrongDecision.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const insufficient = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId],
    },
  });
  assert.equal(insufficient.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const wrongPlayerSelection = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, wrongPlayerDon.instanceId],
    },
  });
  assert.equal(wrongPlayerSelection.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const restedState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        costArea: openedP1.costArea.map((don) =>
          don.instanceId === selected.instanceId
            ? { ...don, state: "rested" }
            : don,
        ),
      },
    },
  };
  const restedBefore = JSON.stringify(restedState);
  const rested = applyPlayCardTestAction(restedState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(rested.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(restedState), restedBefore);

  const attachedState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        leader: {
          ...openedP1.leader,
          attachedDon: [selected.instanceId],
        },
        costArea: openedP1.costArea
          .filter((don) => don.instanceId !== selected.instanceId)
          .map((don, index) => ({
            ...don,
            zone: { zone: "costArea", playerId: p1, slot: "cost", index },
          })),
      },
    },
  };
  const attachedBefore = JSON.stringify(attachedState);
  const attached = applyPlayCardTestAction(attachedState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(attached.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(attachedState), attachedBefore);

  const staleState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        hand: openedP1.hand
          .filter((handCard) => handCard.instanceId !== card.instanceId)
          .map((handCard, index) => ({
            ...handCard,
            zone: { zone: "hand", playerId: p1, slot: "hand", index },
          })),
      },
    },
  };
  const staleBefore = JSON.stringify(staleState);
  const stale = applyPlayCardTestAction(staleState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(stale.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(staleState), staleBefore);
});

test("getLegalActions includes supported [Main] vanilla Event play only under main-phase turn-player constraints", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  const unsupported = must(p1State.hand[1], "unsupported");

  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 1,
    effectText: " [Main] ",
  });
  state.cardManifest.cards[unsupported.cardId] = resolvedCard({
    cardId: unsupported.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] draw 1",
  });

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), eventCard),
    true,
  );
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), unsupported),
    false,
  );
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p2), eventCard),
    false,
  );

  state.turn.phase = "don";
  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), eventCard),
    false,
  );
});

test("getLegalActions omits Event play for invalid timing text, trigger text, missing manifest, and unsupported status", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const missingMain = must(p1State.hand[0], "missing-main");
  const counter = must(p1State.hand[1], "counter");
  const trigger = must(p1State.hand[2], "trigger");
  const missingManifest = must(p1State.hand[3], "missing-manifest");
  const unsupported = must(p1State.hand[4], "unsupported");

  state.cardManifest.cards[missingMain.cardId] = resolvedCard({
    cardId: missingMain.cardId,
    category: "event",
    cost: 1,
    effectText: "",
  });
  state.cardManifest.cards[counter.cardId] = resolvedCard({
    cardId: counter.cardId,
    category: "event",
    cost: 1,
    effectText: "[Counter]",
  });
  state.cardManifest.cards[trigger.cardId] = resolvedCard({
    cardId: trigger.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main]",
    triggerText: "[Trigger] something",
  });
  state.cardManifest.cards[unsupported.cardId] = {
    ...resolvedCard({
      cardId: unsupported.cardId,
      category: "event",
      cost: 1,
      effectText: "[Main]",
    }),
    support: {
      ...resolvedCard({
        cardId: unsupported.cardId,
        category: "event",
      }).support,
      status: "unsupported",
    },
  };

  const legal = getPlayCardLegalActions(state, p1);
  assert.equal(hasPlayCardAction(legal, missingMain), false);
  assert.equal(hasPlayCardAction(legal, counter), false);
  assert.equal(hasPlayCardAction(legal, trigger), false);
  assert.equal(hasPlayCardAction(legal, missingManifest), false);
  assert.equal(hasPlayCardAction(legal, unsupported), false);
});

test("nonzero [Main] Event play creates payCost and valid payment moves card hand->trash with expected events", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 2,
    effectText: "[Main]",
  });

  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });
  assert.equal(opened.state.pendingDecision?.type, "payCost");
  assert.deepEqual(
    opened.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.equal(
    respondToDecisionActions(getPlayCardLegalActions(opened.state, p2)).length,
    0,
  );

  const p1Opened = must(opened.state.players[p1], "p1 opened");
  const don0 = must(p1Opened.costArea[0], "don0");
  const don1 = must(p1Opened.costArea[1], "don1");
  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don0.instanceId, don1.instanceId],
    },
  });
  assert.equal(resolved.errors, undefined);
  const resolvedP1 = must(resolved.state.players[p1], "resolved p1");
  assert.equal(
    resolvedP1.hand.some((card) => card.instanceId === eventCard.instanceId),
    false,
  );
  assert.equal(
    must(resolvedP1.trash[0], "trash 0").instanceId,
    eventCard.instanceId,
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "costPaid",
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("zero-cost [Main] Event play resolves directly to trash with expected events", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 0,
    effectText: "[Main]",
  });

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  const resultP1 = must(result.state.players[p1], "result p1");
  assert.equal(
    resultP1.hand.some((card) => card.instanceId === eventCard.instanceId),
    false,
  );
  assert.equal(
    must(resultP1.trash[0], "trash 0").instanceId,
    eventCard.instanceId,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "cardRevealed",
      "cardMoved",
      "cardTrashed",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
});
