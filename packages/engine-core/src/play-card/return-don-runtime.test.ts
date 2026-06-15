import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EffectDefinition,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../action-test-fixtures.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./core.js";
import { hasPlayCardAction, setupMainPlayState } from "./test-fixtures.js";

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

const setActiveDonCount = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], String(playerId));
  const source = must([...player.costArea, ...player.donDeck][0], "DON source");
  player.costArea = Array.from({ length: count }, (_, index) => ({
    ...source,
    instanceId:
      `${String(source.instanceId)}:active:${String(index)}` as CardInstance["instanceId"],
    zone: { zone: "costArea", playerId, slot: "cost", index },
    state: "active",
  }));
  player.donDeck = [];
};

const setupImplementedDslReturnDonCharacter = (
  state: GameState,
  card: CardInstance,
): void => {
  const effectDefinitionId = "def-direct-return-don-character";
  const resolved = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 8,
    power: 10000,
    effectText:
      "[On Play] If your Leader has the {Impel Down} type, your opponent returns 1 DON!! card from their field to their DON!! deck.\n[On K.O.] Your opponent returns 4 DON!! cards from their field to their DON!! deck.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "r1",
      sourceTextHash: "source-hash",
    },
  });
  const base = reviewedOnPlayDrawDefinition(card.cardId, resolved.support);
  const onPlayReturnDon: EffectDefinition["effects"][number] = {
    ...must(base.effects[0], "base effect"),
    id: "effect-direct-return-don-on-play" as EffectDefinition["effects"][number]["id"],
    condition: {
      type: "hasCardInZone",
      player: "self",
      zone: "leaderArea",
      filter: { categories: ["leader"], typesAny: ["Impel Down"] },
    },
    effect: { type: "returnDon", count: 1, player: "opponent" },
    sourcePresencePolicy: "mustRemainInSameZone",
    trigger: { type: "onPlay" },
  };
  const onKOReturnDon: EffectDefinition["effects"][number] = {
    ...must(base.effects[0], "base effect"),
    id: "effect-direct-return-don-on-ko" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    effect: { type: "returnDon", count: 4, player: "opponent" },
    sourcePresencePolicy: "resolveFromDestinationZone",
    trigger: { type: "onKO" },
  };
  const definition: EffectDefinition = {
    ...base,
    effects: [onPlayReturnDon, onKOReturnDon],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[card.cardId] = resolved;
};

test("implemented-dsl Character with direct return-DON bodies plays and pauses for opponent DON choice", () => {
  const state = setupMainPlayState();
  setActiveDonCount(state, p1, 8);
  setActiveDonCount(state, p2, 4);
  const p1State = must(state.players[p1], "p1");
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    types: ["Impel Down"],
  };
  const character = must(p1State.hand[0], "return-DON character");
  setupImplementedDslReturnDonCharacter(state, character);

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), character),
    true,
  );

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: character.instanceId,
  });
  const payDecision = must(result.state.pendingDecision, "play payment");
  assert.equal(result.errors, undefined);
  assert.equal(payDecision.type, "payCost");
  assert.equal(payDecision.playerId, p1);

  const paid = applyPlayCardTestAction(result.state, {
    type: "respondToDecision",
    decisionId: payDecision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: must(result.state.players[p1], "paid p1")
        .costArea.slice(0, 8)
        .map((don) => don.instanceId),
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision?.type, "payCost");
  assert.equal(paid.state.pendingDecision.playerId, p2);
  assert.equal(paid.state.pendingDecision.cost.type, "returnDon");
  assert.deepEqual(paid.state.pendingDecision.paymentOptions, [
    { id: "returnDon", type: "returnDon", count: 1 },
  ]);
});
