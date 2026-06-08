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
  p2,
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

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-return-don-body";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "event",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "return-don-body-rules",
      sourceTextHash: "return-don-body-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-return-don-body"),
        category: "auto",
        effect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
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

const placeActiveDon = (state: GameState, playerId = p1): void => {
  const player = must(state.players[playerId], "player");
  const don = must(player.donDeck[0], "don");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));
  player.costArea = [
    ...player.costArea,
    {
      ...don,
      zone: {
        zone: "costArea",
        playerId,
        slot: "cost",
        index: player.costArea.length,
      },
      state: "active",
    },
  ];
};

test("returnDon body primitive lets the affected opponent choose returned DON", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const definition = setupSequenceDefinition(state, source, {
    type: "sequence",
    effects: [
      {
        id: "opponent-return-don",
        connector: "always",
        effect: { type: "returnDon", count: 1, player: "opponent" },
      },
    ],
  });
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-return-don-body"),
      timingWindowId: toTimingWindowId("window-return-don-body"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "return DON effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "return-don-body-test" },
    },
  ];
  placeActiveDon(state, p2);
  placeActiveDon(state, p2);
  const beforeP2 = must(state.players[p2], "before p2");
  const untouchedDon = must(beforeP2.costArea[0], "untouched DON");
  const returnedDon = must(beforeP2.costArea[1], "returned DON");
  const beforeDonDeckCount = beforeP2.donDeck.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "return DON decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "payCost");
  assert.equal(decision.playerId, p2);
  assert.equal(decision.cost.type, "returnDon");

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: [returnedDon.instanceId],
    },
  });
  const afterP2 = must(result.state.players[p2], "after p2");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    afterP2.costArea.some(
      (card) => card.instanceId === untouchedDon.instanceId,
    ),
    true,
  );
  assert.equal(
    afterP2.costArea.some((card) => card.instanceId === returnedDon.instanceId),
    false,
  );
  assert.equal(afterP2.donDeck.length, beforeDonDeckCount + 1);
  assert.equal(
    must(
      afterP2.donDeck.find(
        (card) => card.instanceId === returnedDon.instanceId,
      ),
      "returned DON in DON deck",
    ).zone.zone,
    "donDeck",
  );
  assert.deepEqual(
    result.events
      .map((event) => event.type)
      .filter((type) => type === "donReturned"),
    ["donReturned"],
  );
});
