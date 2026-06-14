import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { must, p1, p2, resolvedCard } from "../../action-test-fixtures.js";
import { computeView } from "../../view/compute-view.js";

test("activate main supports leader-type-gated direct target power modification", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const leader = p1State.leader;
  const opponentCharacterSource = must(p2State.hand[0], "p2 hand card");
  p2State.characters = [
    {
      ...opponentCharacterSource,
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
    },
  ];
  p2State.hand = p2State.hand.slice(1);
  state.cardManifest.cards[opponentCharacterSource.cardId] = resolvedCard({
    cardId: opponentCharacterSource.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  const effectId = toEffectId("activate-main-leader-type-power");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-type-power",
    effectId,
    oncePerTurn: true,
  });
  state.cardManifest.cards[leader.cardId] = {
    ...must(state.cardManifest.cards[leader.cardId], "leader metadata"),
    types: ["Alabasta"],
  };
  const effectBlock = must(definition.effects[0], "activate main effect");
  effectBlock.condition = {
    type: "hasCardInZone",
    player: "self",
    zone: "leaderArea",
    filter: { categories: ["leader"], typesAny: ["Alabasta"] },
  };
  effectBlock.effect = {
    type: "modifyPower",
    target: {
      type: "choose",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "opponent",
        zone: "characterArea",
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: { categories: ["character"] },
      },
    },
    value: -1000,
    duration: { type: "thisTurn" },
  };

  const legal = getLegalActions(state, p1);
  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === leader.instanceId &&
        action.effectId === effectId,
    ),
    true,
  );

  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });

  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "target decision");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.playerId, p1);
});

test("activate main applies all-target dynamic power from DON attached to source", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  const source = must(p1State.characters[0], "p1 source Character");
  const attachedDonA = must(p1State.costArea[0], "p1 first DON");
  const attachedDonB = must(p1State.donDeck[0], "p1 second DON");
  p1State.characters[0] = {
    ...source,
    attachedDon: [attachedDonA.instanceId, attachedDonB.instanceId],
    turnPlayed: state.turn.globalTurn,
  };
  p1State.costArea = [];
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  const opponentCharacterSource = must(p2State.hand[0], "p2 hand card");
  p2State.characters = [
    {
      ...opponentCharacterSource,
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
    },
  ];
  p2State.hand = p2State.hand.slice(1);
  state.cardManifest.cards[opponentCharacterSource.cardId] = resolvedCard({
    cardId: opponentCharacterSource.cardId,
    category: "character",
    cost: 2,
    power: 5000,
  });
  const effectId = toEffectId("activate-main-attached-don-power");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(source.cardId),
    category: "character",
    definitionId: "def-activate-main-attached-don-power",
    effectId,
    oncePerTurn: true,
  });
  const effectBlock = must(definition.effects[0], "activate main effect");
  effectBlock.condition = { type: "sourcePlayedThisTurn" };
  effectBlock.effect = {
    type: "modifyPower",
    target: {
      type: "all",
      zone: "characterArea",
      player: "opponent",
      filter: { categories: ["character"] },
    },
    value: {
      type: "countAttachedDon",
      target: { type: "self" },
      per: 1,
      multiplier: -1000,
    },
    duration: { type: "thisTurn" },
  };

  const legal = getLegalActions(state, p1);
  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === source.instanceId &&
        action.effectId === effectId,
    ),
    true,
  );

  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    effectId,
  });

  assert.equal(result.errors, undefined);
  const view = computeView(result.state);
  assert.equal(
    view.cards[opponentCharacterSource.instanceId]?.currentPower,
    3000,
  );
});
