import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EngineEvent,
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
} from "./effect-runtime-queue/test-support.js";

const eventTypes = (events: readonly EngineEvent[]): string[] =>
  events.map((event) => event.type);

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-attached-don-move-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "attached-don-move-cost-rules",
      sourceTextHash: "attached-don-move-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-attached-don-move-cost"),
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
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-attached-don-move-cost"),
      timingWindowId: toTimingWindowId("window-attached-don-move-cost"),
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
      causedBy: { type: "ruleProcess", name: "attached-don-cost-test" },
    },
  ];
  return state;
};

const placeActiveDon = (state: GameState): void => {
  const player = must(state.players[p1], "player");
  const don = must(player.donDeck[0], "don");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  player.costArea = [
    ...player.costArea,
    {
      ...don,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
};

const attachFirstCostDonToLeader = (
  state: GameState,
): CardInstance["instanceId"] => {
  const player = must(state.players[p1], "player");
  const don = must(player.costArea[0], "cost DON");
  player.leader = {
    ...player.leader,
    attachedDon: [...player.leader.attachedDon, don.instanceId],
  };
  const attachedDon = { ...don };
  delete attachedDon.state;
  player.costArea = [{ ...attachedDon }, ...player.costArea.slice(1)];
  return don.instanceId;
};

test("optional moveCards cost may return attached DON to cost area rested", () => {
  const state = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "payCost",
          cost: {
            type: "moveCards",
            count: 1,
            chooser: "self",
            from: { player: "self", zone: "costArea" },
            to: { player: "self", zone: "costArea" },
            order: "chooserChoice",
            filter: { categories: ["don"], state: "attached" },
            destinationState: "rested",
            optional: true,
          },
        },
      },
      {
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  });
  placeActiveDon(state);
  const attachedId = attachFirstCostDonToLeader(state);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(decision.type, "payCost");
  assert.deepEqual(decision.paymentOptions, [
    {
      id: "moveCards",
      type: "moveCards",
      count: 1,
      from: { player: "self", zone: "costArea" },
      to: { player: "self", zone: "costArea" },
      filter: { categories: ["don"], state: "attached" },
      destinationState: "rested",
    },
  ]);

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "moveCards",
      selectedCardInstanceIds: [attachedId],
    },
  });
  const after = must(paid.state.players[p1], "after p1");
  const returnedDon = must(
    after.costArea.find((card) => card.instanceId === attachedId),
    "returned DON",
  );

  assert.equal(paid.errors, undefined);
  assert.equal(after.leader.attachedDon.includes(attachedId), false);
  assert.equal(returnedDon.state, "rested");
  assert.deepEqual(
    eventTypes(paid.events).filter(
      (type) => type === "costPaid" || type === "donReturned",
    ),
    ["donReturned", "costPaid"],
  );
});
