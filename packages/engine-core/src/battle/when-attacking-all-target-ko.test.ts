import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  PlayerId,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { applyDeclareAttack } from "./actions.js";
import {
  cardRef,
  setupAttackState,
  withWhenAttackingDrawEffect,
} from "./test-fixtures.js";

const massKoThenLifeMovementSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "ko-self-characters-except-source",
      connector: "always",
      effect: {
        type: "ko",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: { categories: ["character"], excludeSelf: true },
        },
      },
    },
    {
      id: "ko-opponent-characters",
      connector: "then",
      effect: {
        type: "ko",
        target: {
          type: "all",
          zone: "characterArea",
          player: "opponent",
          filter: { categories: ["character"], excludeSelf: true },
        },
      },
    },
    {
      id: "add-top-deck-card-to-life",
      connector: "then",
      effect: {
        type: "moveCards",
        min: 0,
        count: 1,
        from: { player: "self", zone: "deck", position: "top" },
        to: { player: "self", zone: "life", position: "top" },
        order: "original",
      },
    },
    {
      id: "trash-opponent-top-life-card",
      connector: "then",
      effect: {
        type: "moveCards",
        min: 0,
        count: 1,
        from: { player: "opponent", zone: "life", position: "top" },
        to: { player: "opponent", zone: "trash" },
        order: "original",
      },
    },
  ],
});

const parserShapedMassKoThenLifeMovementSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: {
        type: "sequence",
        effects: massKoThenLifeMovementSequence().effects.slice(0, 2),
      },
    },
    {
      connector: "then",
      effect: {
        type: "sequence",
        effects: massKoThenLifeMovementSequence().effects.slice(2),
      },
    },
  ],
});

const addCharacter = (params: {
  card: CardInstance;
  index: number;
  playerId: PlayerId;
  state: ReturnType<typeof setupAttackState>;
}): CardInstance => {
  const player = must(params.state.players[params.playerId], "player");
  const character: CardInstance = {
    ...params.card,
    zone: {
      zone: "characterArea",
      playerId: params.playerId,
      slot: "character",
      index: params.index,
    },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  };
  player.characters = [...player.characters, character];
  player.hand = player.hand
    .filter((card) => card.instanceId !== params.card.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: params.playerId, slot: "hand", index },
    }));
  params.state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    power: 5000,
  });
  return character;
};

const setupAllKoTrashFromHandReplacementDefinition = (
  state: ReturnType<typeof setupAttackState>,
  source: CardInstance,
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: source.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "all-ko-trash-from-hand-replacement-rules",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "all-ko-trash-from-hand-replacement-source",
    behaviorHash: "all-ko-trash-from-hand-replacement-behavior",
    effectDefinitionId: `definition:${String(source.cardId)}:all-ko-trash-from-hand-replacement`,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support,
  });
  const when: Extract<Effect, { type: "replacement" }>["when"] = {
    type: "wouldBeKOd",
    sourceKind: "cardEffect",
    sourceControllerRelation: "any",
    target: {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: { categories: ["character"] },
    },
  };
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "replacement:any-source-all-ko-trash-from-hand" as EffectDefinition["effects"][number]["id"],
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
        filter: {
          categories: ["character"],
          power: { min: 6000 },
        },
      },
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: support.sourceTextHash,
        rulesVersion: support.rulesVersion,
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-06-16T00:00:00.000Z",
      },
    },
  };
  return effectBlock;
};

test("When Attacking all-character K.O. removes both sides before life movement even when the attack target is K.O.'d", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const attackTarget = must(p2State.characters[0], "attack target");
  const selfTarget = addCharacter({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "self target"),
    index: 1,
  });
  const opponentTarget = addCharacter({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "opponent target"),
    index: 1,
  });
  const definition = withWhenAttackingDrawEffect(
    state,
    attacker,
    "def-when-attacking-all-target-ko",
  );
  const effect = must(definition.effects[0], "When Attacking effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-when-attacking-all-target-ko": {
      ...definition,
      effects: [
        { ...effect, effect: parserShapedMassKoThenLifeMovementSequence() },
      ],
    },
  };

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(attackTarget, p2),
  });
  const decision = must(opened.state.pendingDecision, "deck-to-life decision");
  const openedP1 = must(opened.state.players[p1], "opened p1");
  const openedP2 = must(opened.state.players[p2], "opened p2");

  assert.equal(opened.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");
  assert.equal(
    openedP1.characters.some((card) => card.instanceId === attacker.instanceId),
    true,
  );
  assert.equal(
    openedP1.trash.some((card) => card.instanceId === selfTarget.instanceId),
    true,
  );
  for (const target of [attackTarget, opponentTarget]) {
    assert.equal(
      openedP2.trash.some((card) => card.instanceId === target.instanceId),
      true,
    );
  }

  const addedLife = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 0 },
  });

  assert.equal(addedLife.errors, undefined);
  assert.equal(addedLife.state.pendingDecision?.type, "chooseQuantity");
});

test("When Attacking all-character K.O. resumes after one of multiple trash-from-hand replacement choices", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const attackTarget = must(p2State.characters[0], "attack target");
  const selfTarget = addCharacter({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "self target"),
    index: 1,
  });
  const replacementSource = addCharacter({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[0], "replacement source"),
      cardId: "all-ko-trash-replacement-source" as CardInstance["cardId"],
    },
    index: 2,
  });
  const secondReplacementSource = addCharacter({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[0], "second replacement source"),
      cardId:
        "second-all-ko-trash-replacement-source" as CardInstance["cardId"],
    },
    index: 3,
  });
  const costCard: CardInstance = {
    ...must(p1State.hand[0], "replacement cost card"),
    cardId: "replacement-cost-6000" as CardInstance["cardId"],
  };
  p1State.hand = [
    costCard,
    ...p1State.hand.slice(1).map((card, index) => ({
      ...card,
      zone: {
        zone: "hand" as const,
        playerId: p1,
        slot: "hand" as const,
        index: index + 1,
      },
    })),
  ];
  state.cardManifest.cards[costCard.cardId] = resolvedCard({
    cardId: costCard.cardId,
    category: "character",
    power: 6000,
  });
  const opponentTarget = addCharacter({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "opponent target"),
    index: 1,
  });
  const replacementEffect = setupAllKoTrashFromHandReplacementDefinition(
    state,
    replacementSource,
  );
  const secondReplacementEffect = setupAllKoTrashFromHandReplacementDefinition(
    state,
    secondReplacementSource,
  );
  const definition = withWhenAttackingDrawEffect(
    state,
    attacker,
    "def-when-attacking-all-target-ko-trash-replacement",
  );
  const effect = must(definition.effects[0], "When Attacking effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-when-attacking-all-target-ko-trash-replacement": {
      ...definition,
      effects: [
        { ...effect, effect: parserShapedMassKoThenLifeMovementSequence() },
      ],
    },
  };

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(attackTarget, p2),
  });
  const replacementDecision = must(
    opened.state.pendingDecision,
    "replacement decision",
  );
  assert.equal(opened.errors, undefined);
  assert.equal(replacementDecision.type, "chooseReplacement");
  const selectedReplacementId = `${String(replacementSource.instanceId)}:${String(
    replacementEffect.id,
  )}`;
  assert.deepEqual(
    new Set(replacementDecision.replacementIds),
    new Set([
      selectedReplacementId,
      `${String(secondReplacementSource.instanceId)}:${String(
        secondReplacementEffect.id,
      )}`,
    ]),
  );

  const accepted = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: replacementDecision.id,
    response: {
      type: "replacement",
      replacementId: selectedReplacementId,
    },
  });
  const trashDecision = must(
    accepted.state.pendingDecision,
    "replacement trash decision",
  );
  assert.equal(accepted.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");

  const paidReplacement = applyAction(accepted.state, {
    type: "respondToDecision",
    decisionId: trashDecision.id,
    response: { type: "cards", cards: [cardRef(costCard, p1)] },
  });
  const quantityDecision = must(
    paidReplacement.state.pendingDecision,
    "deck-to-life quantity decision",
  );
  const paidP1 = must(paidReplacement.state.players[p1], "paid p1");
  const paidP2 = must(paidReplacement.state.players[p2], "paid p2");

  assert.equal(paidReplacement.errors, undefined);
  assert.equal(quantityDecision.type, "chooseQuantity");
  assert.equal(
    paidP1.characters.some((card) => card.instanceId === selfTarget.instanceId),
    true,
  );
  assert.equal(
    paidP1.characters.some(
      (card) => card.instanceId === replacementSource.instanceId,
    ),
    true,
  );
  assert.equal(
    paidP1.characters.some(
      (card) => card.instanceId === secondReplacementSource.instanceId,
    ),
    true,
  );
  for (const target of [attackTarget, opponentTarget]) {
    assert.equal(
      paidP2.trash.some((card) => card.instanceId === target.instanceId),
      true,
    );
  }

  const declinedLifeAdd = applyAction(paidReplacement.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 0 },
  });
  const opponentLifeTrashDecision = must(
    declinedLifeAdd.state.pendingDecision,
    "opponent life trash quantity decision",
  );

  assert.equal(declinedLifeAdd.errors, undefined);
  assert.equal(opponentLifeTrashDecision.type, "chooseQuantity");

  const declinedLifeTrash = applyAction(declinedLifeAdd.state, {
    type: "respondToDecision",
    decisionId: opponentLifeTrashDecision.id,
    response: { type: "chooseQuantity", quantity: 0 },
  });

  assert.equal(declinedLifeTrash.errors, undefined);
  assert.equal(declinedLifeTrash.state.pendingDecision, undefined);
});
