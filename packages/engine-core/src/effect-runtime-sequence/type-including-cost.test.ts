import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
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

const reindexHand = (
  cards: readonly CardInstance[],
  playerId = p1,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-type-including-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "type-including-cost-rules",
      sourceTextHash: "type-including-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-type-including-cost"),
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

const sequenceQueueState = (effect: Effect): GameState => {
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
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-type-including-cost"),
      timingWindowId: toTimingWindowId("window-type-including-cost"),
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
      causedBy: { type: "ruleProcess", name: "type-including-cost-test" },
    },
  ];
  return state;
};

const cpTrashToBottomThenDrawSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "place-cp-trash-bottom-cost",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "moveCards",
          count: 3,
          chooser: "self",
          from: { player: "self", zone: "trash" },
          to: { player: "self", zone: "deck", position: "bottom" },
          order: "chooserChoice",
          optional: true,
          filter: { typesIncludeAny: ["CP"] },
        },
      },
      saveResultAs: "paidOptionalCost",
    },
    {
      id: "draw-if-paid",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

test("optional trash-to-bottom cost counts Character Event and Stage cards whose type includes the filter text", () => {
  const state = sequenceQueueState(cpTrashToBottomThenDrawSequence());
  const p1State = must(state.players[p1], "p1");
  const [characterCard, eventCard, stageCard] = p1State.hand;
  const offTypeCard = must(p1State.deck[0], "off-type trash card");
  assert.ok(characterCard !== undefined);
  assert.ok(eventCard !== undefined);
  assert.ok(stageCard !== undefined);
  const trashCards = [
    { card: characterCard, category: "character" as const, types: ["CP9"] },
    { card: eventCard, category: "event" as const, types: ["CP9"] },
    { card: stageCard, category: "stage" as const, types: ["CP9"] },
    {
      card: offTypeCard,
      category: "event" as const,
      types: ["Straw Hat Crew"],
    },
  ].map(({ card, category, types }, index) => {
    const trashCard: CardInstance = {
      ...card,
      zone: { zone: "trash", playerId: p1, slot: "trash", index },
    };
    state.cardManifest.cards[trashCard.cardId] = {
      ...resolvedCard({
        cardId: trashCard.cardId,
        category,
      }),
      types,
    };
    return trashCard;
  });
  p1State.hand = reindexHand(p1State.hand.slice(3));
  p1State.deck = p1State.deck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p1, slot: "deck", index },
  }));
  p1State.trash = trashCards;

  const result = processEffectRuntime(state);
  const decision = must(result.state.pendingDecision, "move-cards cost");

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "payCost");
  assert.deepEqual(decision.paymentOptions, [
    {
      id: "moveCards",
      type: "moveCards",
      count: 3,
      from: { player: "self", zone: "trash" },
      to: { player: "self", zone: "deck", position: "bottom" },
      filter: { typesIncludeAny: ["CP"] },
    },
  ]);
});
