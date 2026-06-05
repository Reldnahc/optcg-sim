import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

const restSelfFilteredTrashFromHandThenDrawSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-rest-self-and-filtered-trash-from-hand",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "sequence",
          optional: true,
          costs: [
            { type: "restSelf" },
            {
              type: "trashFromHand",
              count: 1,
              chooser: "self",
              filter: {
                anyOf: [{ categories: ["event"] }, { categories: ["stage"] }],
              },
            },
          ],
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

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-filtered-cost-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "stage",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "filtered-cost-sequence-rules",
      sourceTextHash: "filtered-cost-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-filtered-cost-sequence"),
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

const sequenceQueueState = (): GameState => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "stage source"),
    zone: "stageArea",
  });
  player.hand = player.hand
    .filter((card) => card.instanceId !== source.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p1, slot: "hand", index },
    }));
  const definition = setupSequenceDefinition(
    state,
    source,
    restSelfFilteredTrashFromHandThenDrawSequence(),
  );
  state.effectQueue = [
    {
      id: toQueueEntryId("queue-filtered-cost-sequence"),
      state: "pending",
      timingWindowId: toTimingWindowId("window-filtered-cost-sequence"),
      generation: 1,
      controllerId: p1,
      orderingGroup: "turnPlayer",
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      createdAtEventSeq: state.eventJournal.length,
      queuedAtStateSeq: state.seq,
      causedBy: { type: "ruleProcess", name: "filtered-cost-sequence-test" },
    },
  ];
  return state;
};

const payRestSelf = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restSelf",
    },
  });
};

const payTrashFromHandWithCard = (
  state: GameState,
  card: CardInstance,
): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [card.instanceId],
    },
  });
};

test("optional cost sequence rests Stage source then trashes filtered hand card before dependent effects", () => {
  const state = sequenceQueueState();
  const beforeSource = must(state.effectQueue[0]?.source, "source ref");
  const beforeP1 = must(state.players[p1], "before p1");
  const eventCard = must(beforeP1.hand[0], "event card");
  const characterCard = must(beforeP1.hand[1], "character card");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
  });
  state.cardManifest.cards[characterCard.cardId] = resolvedCard({
    cardId: characterCard.cardId,
    category: "character",
  });
  const beforeDeckCount = beforeP1.deck.length;

  const restSelfPaused = processEffectRuntime(state);
  const restedSelf = payRestSelf(restSelfPaused.state);
  const trashDecision = must(
    restedSelf.state.pendingDecision,
    "trash-from-hand decision",
  );

  assert.equal(restSelfPaused.errors, undefined);
  assert.equal(restedSelf.errors, undefined);
  assert.equal(trashDecision.type, "payCost");
  assert.equal(trashDecision.cost.type, "trashFromHand");
  assert.deepEqual(trashDecision.cost.filter, {
    anyOf: [{ categories: ["event"] }, { categories: ["stage"] }],
  });
  assert.deepEqual(
    trashDecision.paymentOptions.map((option) => option.id),
    ["trashFromHand"],
  );

  const paidTrash = payTrashFromHandWithCard(restedSelf.state, eventCard);
  const afterP1 = must(paidTrash.state.players[p1], "after p1");
  const stageAfterPayment = must(afterP1.stage, "stage after payment");

  assert.equal(paidTrash.errors, undefined);
  assert.equal(paidTrash.state.pendingDecision, undefined);
  assert.equal(stageAfterPayment.instanceId, beforeSource.instanceId);
  assert.equal(stageAfterPayment.state, "rested");
  assert.equal(
    afterP1.trash.some((card) => card.instanceId === eventCard.instanceId),
    true,
  );
  assert.equal(afterP1.deck.length, beforeDeckCount - 1);
});
