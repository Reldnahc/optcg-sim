import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  ContinuousEffectRecord,
  EffectDefinition,
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

const addCelestialDragonsHandCostReduction = (
  state: GameState,
  value = -1,
): void => {
  const source = must(state.players[p1], "p1").leader;
  state.continuousEffects.push({
    id: "test:cost-reduction",
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: source.controller,
      zone: source.zone,
      category: "leader",
      colors: [],
      keywords: [],
    },
    controller: p1,
    duration: { type: "permanent" },
    createdBy: { type: "ruleProcess", name: "test" },
    createdAtStateSeq: state.seq,
    modifier: {
      layer: "costAdd",
      target: {
        type: "allMatching",
        zone: "hand",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Celestial Dragons"],
          cost: { min: 2 },
        },
      },
      operation: { type: "addCost", value },
    },
  } satisfies ContinuousEffectRecord);
};

const addStageDerivedCelestialDragonsHandCostReduction = (
  state: GameState,
): void => {
  const player = must(state.players[p1], "p1");
  const stageSource = must(player.hand[3], "stage source");
  player.stage = {
    ...stageSource,
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const support = {
    status: "implemented-dsl" as const,
    effectDefinitionId: "test-stage-cost-reduction",
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "stage-cost-reduction-source",
    behaviorHash: "stage-cost-reduction-behavior",
  };
  state.cardManifest.cards[player.stage.cardId] = {
    ...resolvedCard({
      cardId: player.stage.cardId,
      category: "stage",
      cost: 7,
      support,
    }),
    effectText:
      "[Your Turn] The cost of playing {Celestial Dragons} type Character cards with a cost of 2 or more from your hand will be reduced by 1.",
    types: ["Mary Geoise"],
  };
  const definition: EffectDefinition = {
    cardId: player.stage.cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: "stage:cost-reduction" as EffectDefinition["effects"][number]["id"],
        category: "permanent",
        trigger: { type: "permanent" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "modifyCost",
          player: "self",
          sourceZone: "hand",
          value: -1,
          duration: {
            type: "whileConditionTrue",
            condition: { type: "yourTurn" },
          },
          filter: {
            categories: ["character"],
            typesAny: ["Celestial Dragons"],
            cost: { min: 2 },
          },
        },
      },
    ],
    metadata: {
      rulesVersion: support.rulesVersion,
      sourceTextHash: support.sourceTextHash,
      effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
      tested: true,
      reviewedBy: "test",
      reviewedAt: "2026-05-26T00:00:00.000Z",
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: definition,
  };
};

const addSelfHandRelativeDonCostReduction = (
  state: GameState,
  card: CardInstance,
): void => {
  const support = {
    status: "implemented-dsl" as const,
    effectDefinitionId: "test-self-hand-relative-don-cost-reduction",
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "self-hand-relative-don-cost-reduction-source",
    behaviorHash: "self-hand-relative-don-cost-reduction-behavior",
  };
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 5,
    power: 5000,
    support,
  });
  const definition: EffectDefinition = {
    cardId: card.cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: "self-hand-relative-don-cost-reduction" as EffectDefinition["effects"][number]["id"],
        category: "permanent",
        trigger: { type: "permanent" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "modifyCost",
          player: "self",
          sourceZone: "hand",
          target: { type: "self" },
          value: -3,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "fieldCountDifference",
              minuend: {
                player: "opponent",
                filter: { categories: ["don"] },
              },
              subtrahend: {
                player: "self",
                filter: { categories: ["don"] },
              },
              op: "gte",
              value: 2,
            },
          },
        },
      },
    ],
    metadata: {
      rulesVersion: support.rulesVersion,
      sourceTextHash: support.sourceTextHash,
      effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
      tested: true,
      reviewedBy: "test",
      reviewedAt: "2026-05-26T00:00:00.000Z",
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: definition,
  };
};

const extendOpponentCostAreaToFive = (state: GameState): void => {
  const opponent = must(state.players[p2], "p2");
  const source = must(opponent.costArea[0], "opponent DON source");
  const moved = Array.from({ length: 2 }, (_, offset) => ({
    ...source,
    instanceId:
      `${String(source.instanceId)}:extra:${String(offset)}` as CardInstance["instanceId"],
    zone: {
      zone: "costArea" as const,
      playerId: p2,
      slot: "cost" as const,
      index: opponent.costArea.length + offset,
    },
    state: "active" as const,
  }));
  opponent.costArea = [...opponent.costArea, ...moved];
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

test("playCard uses continuous cost reductions when checking and paying play cost", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "celestial dragon");
  state.cardManifest.cards[card.cardId] = {
    ...resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 4,
      power: 5000,
    }),
    types: ["Celestial Dragons"],
  };
  addCelestialDragonsHandCostReduction(state);

  const action = getPlayCardLegalActions(state, p1).find(
    (candidate) =>
      candidate.type === "playCard" &&
      candidate.cardInstanceId === card.instanceId,
  );

  assert.ok(action !== undefined, "expected reduced-cost play action");
  assert.equal(action.type, "playCard");
  assert.equal(action.costPayment?.selectedDonInstanceIds?.length, 3);
  const result = applyPlayCardTestAction(state, action);
  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 after").costArea.filter(
      (don) => don.state === "rested",
    ).length,
    3,
  );
});

test("playCard uses derived stage cost reductions for cards in hand", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "celestial dragon");
  state.cardManifest.cards[card.cardId] = {
    ...resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 4,
      power: 5000,
    }),
    types: ["Celestial Dragons"],
  };
  addStageDerivedCelestialDragonsHandCostReduction(state);

  const action = getPlayCardLegalActions(state, p1).find(
    (candidate) =>
      candidate.type === "playCard" &&
      candidate.cardInstanceId === card.instanceId,
  );

  assert.ok(action !== undefined, "expected stage-reduced play action");
  assert.equal(action.type, "playCard");
  assert.equal(action.costPayment?.selectedDonInstanceIds?.length, 3);
});

test("playCard uses hand-sourced self cost reduction when relative DON condition passes", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "self cost reducer");
  addSelfHandRelativeDonCostReduction(state, card);
  extendOpponentCostAreaToFive(state);

  const action = getPlayCardLegalActions(state, p1).find(
    (candidate) =>
      candidate.type === "playCard" &&
      candidate.cardInstanceId === card.instanceId,
  );

  assert.ok(action !== undefined, "expected reduced-cost play action");
  assert.equal(action.type, "playCard");
  assert.equal(action.costPayment?.selectedDonInstanceIds?.length, 2);
});

test("playCard ignores hand-sourced self cost reduction when relative DON condition fails", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "self cost reducer");
  addSelfHandRelativeDonCostReduction(state, card);

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), card),
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
