import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import { cardMatchesHandSelectionFilter } from "../../actions/state.js";
import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { getSequenceOptionalPayCostOptions } from "../../effect-runtime-sequence/frame-decisions.js";

const koFromFieldThenDrawSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-ko-field",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "koFromField",
          count: 1,
          chooser: "self",
          filter: {
            categories: ["character"],
            typesAny: ["Baroque Works"],
          },
          optional: true,
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
  const effectDefinitionId = "def-ko-from-field-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "ko-from-field-cost-rules",
      sourceTextHash: "ko-from-field-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-ko-from-field-cost"),
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

const koFromFieldQueueState = (): {
  readonly costTarget: CardInstance;
  readonly state: GameState;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const costTarget = {
    ...must(p1State.hand[1], "cost target"),
    cardId: toCardId("ko-cost-target"),
  };
  const fieldTarget = withCardInZone({
    state,
    playerId: p1,
    card: costTarget,
    zone: "characterArea",
  });
  state.cardManifest.cards[fieldTarget.cardId] = resolvedCard({
    cardId: fieldTarget.cardId,
    category: "character",
    cost: 3,
    power: 4000,
  });
  const fieldTargetMetadata = must(
    state.cardManifest.cards[fieldTarget.cardId],
    "field target metadata",
  );
  fieldTargetMetadata.types = ["Baroque Works"];
  const remainingHand = p1State.hand.slice(2);
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
    koFromFieldThenDrawSequence(),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-ko-from-field"),
      timingWindowId: toTimingWindowId("window-ko-from-field"),
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
      causedBy: { type: "ruleProcess", name: "ko-from-field-cost-test" },
    },
  ];
  return { costTarget: fieldTarget, state };
};

test("optional koFromField cost K.O.s the selected Character and resumes dependent effects", () => {
  const { costTarget, state } = koFromFieldQueueState();
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeHandCount = beforeP1.hand.length;
  const beforeDeckCount = beforeP1.deck.length;
  assert.equal(
    beforeP1.characters.some(
      (card) => card.instanceId === costTarget.instanceId,
    ),
    true,
  );
  const entry = must(state.effectQueue[0], "queue entry");
  const cost = must(
    koFromFieldThenDrawSequence().effects[0],
    "cost segment",
  ).effect;
  assert.equal(cost.type, "payCost");
  assert.equal(cost.cost.type, "koFromField");
  const fieldCostTarget = must(
    beforeP1.characters.find(
      (card) => card.instanceId === costTarget.instanceId,
    ),
    "field cost target",
  );
  assert.equal(
    cardMatchesHandSelectionFilter(
      state,
      p1,
      fieldCostTarget,
      cost.cost.filter,
    ),
    true,
  );
  assert.deepEqual(
    getSequenceOptionalPayCostOptions(state, entry, cost.cost).map(
      (option) => option.type,
    ),
    ["koFromField"],
  );

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "K.O. cost decision");
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "koFromField");
  assert.deepEqual(
    decision.paymentOptions.map((option) => option.type),
    ["koFromField"],
  );

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "koFromField",
      selectedCardInstanceIds: [costTarget.instanceId],
    },
  });
  const afterP1 = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision, undefined);
  assert.equal(
    afterP1.characters.some(
      (card) => card.instanceId === costTarget.instanceId,
    ),
    false,
  );
  assert.equal(afterP1.trash[0]?.instanceId, costTarget.instanceId);
  assert.equal(afterP1.hand.length, beforeHandCount + 1);
  assert.equal(afterP1.deck.length, beforeDeckCount - 1);
  assert.equal(
    paid.events.some((event) => {
      if (event.type !== "cardKOd") {
        return false;
      }
      const payload = event.payload as { readonly instanceId?: unknown };
      return payload.instanceId === costTarget.instanceId;
    }),
    true,
  );
});
