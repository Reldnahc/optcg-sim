import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

const moveSourceCharacterThenDrawSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-move-source-character",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "moveCards",
          count: 1,
          chooser: "self",
          from: {
            player: "self",
            zone: "characterArea",
            source: "effectSource",
          },
          to: { player: "self", zone: "deck", position: "bottom" },
          order: "chooserChoice",
          optional: true,
        },
      },
    },
    {
      id: "draw-if-source-moved",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-source-move-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "source-move-cost-rules",
      sourceTextHash: "source-move-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-source-move-cost"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sourceMoveQueueState = (): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = reindexHand(p1State.hand.slice(1));
  const definition = setupSequenceDefinition(
    state,
    source,
    moveSourceCharacterThenDrawSequence(),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-source-move-cost"),
      timingWindowId: toTimingWindowId("window-source-move-cost"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "source-move-cost-test" },
    },
  ];
  return state;
};

test("source-scoped moveCards costs only accept the effect source card", () => {
  const state = sourceMoveQueueState();
  const p1State = must(state.players[p1], "p1");
  const source = must(state.effectQueue[0]?.source, "source ref");
  const otherCharacter = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "other character"),
    zone: "characterArea",
  });

  const opened = processEffectRuntime(state);
  const decision = must(opened.state.pendingDecision, "source move decision");
  assert.equal(decision.type, "payCost");
  assert.deepEqual(decision.paymentOptions, [
    {
      id: "moveCards",
      type: "moveCards",
      count: 1,
      from: {
        player: "self",
        zone: "characterArea",
        source: "effectSource",
      },
      to: { player: "self", zone: "deck", position: "bottom" },
      sourceInstanceId: source.instanceId,
    },
  ]);

  const wrongPayment = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "moveCards",
      selectedCardInstanceIds: [otherCharacter.instanceId],
    },
  });
  assert.deepEqual(wrongPayment.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Payment card selection is invalid.",
    },
  ]);

  const paid = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "moveCards",
      selectedCardInstanceIds: [source.instanceId],
    },
  });
  const afterP1 = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(
    afterP1.characters.some((card) => card.instanceId === source.instanceId),
    false,
  );
  assert.equal(
    afterP1.characters.some(
      (card) => card.instanceId === otherCharacter.instanceId,
    ),
    true,
  );
  assert.equal(afterP1.deck.at(-1)?.instanceId, source.instanceId);
});
