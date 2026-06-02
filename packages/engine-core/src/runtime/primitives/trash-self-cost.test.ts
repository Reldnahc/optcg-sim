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
} from "../../effect-runtime-queue-processing-test-support.js";

const trashSelfThenDrawSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-trash-self",
      connector: "always",
      effect: {
        type: "payCost",
        cost: { type: "trashSelf", optional: true },
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

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const setupDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-trash-self-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "trash-self-cost-rules",
      sourceTextHash: "trash-self-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-trash-self-cost"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const trashSelfQueueState = (): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const remainingHand = p1State.hand.slice(1);
  const drawCard = must(remainingHand.at(-1), "deck refill");
  p1State.hand = reindexHand(remainingHand.slice(0, -1));
  p1State.deck = [
    ...p1State.deck,
    {
      ...drawCard,
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
  const definition = setupDefinition(
    state,
    source,
    trashSelfThenDrawSequence(),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-trash-self"),
      timingWindowId: toTimingWindowId("window-trash-self"),
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
      causedBy: { type: "ruleProcess", name: "trash-self-cost-test" },
    },
  ];
  return state;
};

test("optional trashSelf cost trashes the source through field movement and resumes dependent effects", () => {
  const state = trashSelfQueueState();
  const beforeSource = must(state.effectQueue[0]?.source, "source ref");
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeHandCount = beforeP1.hand.length;
  const beforeDeckCount = beforeP1.deck.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "trash self decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "trashSelf");
  assert.deepEqual(
    decision.paymentOptions.map((option) => option.type),
    ["trashSelf"],
  );

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "trashSelf",
    },
  });
  const afterP1 = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision, undefined);
  assert.equal(
    afterP1.characters.some(
      (card) => card.instanceId === beforeSource.instanceId,
    ),
    false,
  );
  assert.equal(afterP1.trash[0]?.instanceId, beforeSource.instanceId);
  assert.equal(afterP1.hand.length, beforeHandCount + 1);
  assert.equal(afterP1.deck.length, beforeDeckCount - 1);
});
