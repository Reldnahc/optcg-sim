import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EffectTextSpanId,
  GameState,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import { processEffectRuntime } from "../effect-runtime.js";
import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";

const optionalTrashCostThenDraw = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "trash-hand-cost",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "trashFromHand",
          chooser: "self",
          count: 1,
          optional: true,
        },
      },
      saveResultAs: "paidCost",
    },
    {
      id: "draw-after-cost",
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
  const effectDefinitionId = "def-cost-presentation";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "cost-presentation-rules",
      sourceTextHash: "cost-presentation-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-cost-presentation"),
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

const createQueuedCostPresentationState = (): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  player.hand = reindexHand(player.hand.slice(1));
  const definition = setupDefinition(
    state,
    source,
    optionalTrashCostThenDraw(),
  );
  const definitionEffect = must(definition.effects[0], "definition effect");
  const entry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-cost-presentation"),
    timingWindowId: toTimingWindowId("window-cost-presentation"),
    controllerId: p1,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId: definitionEffect.id,
    sourcePresencePolicy: "mustRemainInSameZone" as const,
    causedBy: { type: "ruleProcess" as const, name: "cost-presentation-test" },
  };
  state.effectQueue = [
    {
      ...entry,
      presentation: {
        source: entry.source,
        textKind: "effect",
        activeSpanIds: [
          "span:cost:optional:line:1",
          "span:body:line:1",
        ] as EffectTextSpanId[],
      },
    },
  ];
  return state;
};

const payTrashFromHandWithFirstHandCard = (state: GameState) => {
  const decision = must(state.pendingDecision, "payment decision");
  assert.equal(decision.type, "payCost");
  const player = must(state.players[decision.playerId], "decision player");
  const card = must(player.hand[0], "hand card");
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

test("optional cost presentation highlights the cost while paying and the body after payment", () => {
  const state = createQueuedCostPresentationState();
  const entry = must(state.effectQueue[0], "queued effect");

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "payment decision");
  assert.equal(decision.type, "payCost");
  assert.deepEqual(filterStateForPlayer(paused.state, p1).activeEffectText, {
    source: entry.source,
    textKind: "effect",
    activeSpanIds: ["span:cost:optional:line:1"],
  });
  assert.deepEqual(
    filterStateForPlayer(paused.state, p1).pendingDecision?.presentation
      .activeEffectText,
    {
      source: entry.source,
      textKind: "effect",
      activeSpanIds: ["span:cost:optional:line:1"],
    },
  );

  const paid = payTrashFromHandWithFirstHandCard(paused.state);
  const effectResolved = must(
    paid.events.find((event) => event.type === "effectResolved"),
    "effectResolved event",
  );

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision, undefined);
  assert.deepEqual(
    (effectResolved.payload as { presentation?: unknown }).presentation,
    {
      source: entry.source,
      textKind: "effect",
      activeSpanIds: ["span:body:line:1"],
    },
  );
});
