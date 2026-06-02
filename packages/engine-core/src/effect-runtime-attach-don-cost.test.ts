import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, Effect, EffectDefinition } from "@optcg/types";

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
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

const attachActiveDonTrashSelfThenPowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> =>
  ({
    type: "sequence",
    effects: [
      {
        id: "optional-attach-don-and-trash-self",
        connector: "always",
        effect: {
          type: "payCost",
          cost: {
            type: "sequence",
            optional: true,
            costs: [
              {
                type: "attachDon",
                count: 1,
                sourceState: "active",
                target: {
                  type: "chooseFromZones",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "self",
                    zones: ["leaderArea", "characterArea"],
                    min: 1,
                    max: 1,
                    allowFewerIfUnavailable: false,
                    visibility: "public",
                    filter: { categories: ["leader", "character"] },
                  },
                },
              },
              { type: "trashSelf" },
            ],
          },
        },
        saveResultAs: "paidOptionalCost",
      },
      {
        id: "power-if-paid",
        connector: "ifYouDo",
        effect: {
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
          value: -3000,
          duration: { type: "thisTurn" },
        },
      },
    ],
  }) as unknown as Extract<Effect, { type: "sequence" }>;

const placeCostDon = (
  state: ReturnType<typeof createActiveState>,
  donState: "active" | "rested",
): CardInstance => {
  const player = must(state.players[p1], "p1");
  const don = must(player.donDeck[0], "DON");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  const costDon: CardInstance = {
    ...don,
    zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
    state: donState,
  };
  player.costArea = [costDon];
  return costDon;
};

const setupQueue = (donState: "active" | "rested") => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const activeDon = placeCostDon(state, donState);
  const effectDefinitionId = "def-attach-don-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "attach-don-cost-rules",
      sourceTextHash: "attach-don-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-attach-don-cost"),
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: attachActiveDonTrashSelfThenPowerSequence(),
      },
    ],
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[activeDon.cardId] = resolvedCard({
    cardId: activeDon.cardId,
    category: "don",
  });
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-attach-don-cost"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "attach-don-cost-test" },
    },
  ];
  return { activeDon, state };
};

const payAttachActiveDonToLeader = (
  state: ReturnType<typeof createActiveState>,
) => {
  const decision = must(state.pendingDecision, "pending decision");
  const player = must(state.players[decision.playerId], "decision player");
  const don = must(
    player.costArea.find((card) => card.state === "active"),
    "active DON",
  );
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "attachDon",
      selectedDonInstanceIds: [don.instanceId],
      selectedCardInstanceIds: [player.leader.instanceId],
    },
  });
};

const payTrashSelf = (state: ReturnType<typeof createActiveState>) => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "payment", optionId: "trashSelf" },
  });
};

test("optional attach-active-DON plus trash-self cost sequence attaches before dependent effects", () => {
  const { activeDon, state } = setupQueue("active");

  const attachDonPaused = processEffectRuntime(state);
  const attachDonDecision = must(
    attachDonPaused.state.pendingDecision,
    "attach DON decision",
  );
  const paidAttachDon = payAttachActiveDonToLeader(attachDonPaused.state);
  const trashSelfDecision = must(
    paidAttachDon.state.pendingDecision,
    "trash self decision",
  );
  const paidTrashSelf = payTrashSelf(paidAttachDon.state);
  const targetDecision = must(
    paidTrashSelf.state.pendingDecision,
    "power target decision",
  );
  const afterAttach = must(paidAttachDon.state.players[p1], "after attach");

  assert.equal(attachDonPaused.errors, undefined);
  assert.equal(attachDonDecision.type, "payCost");
  assert.equal(attachDonDecision.cost.type, "attachDon");
  assert.equal(paidAttachDon.errors, undefined);
  assert.deepEqual(afterAttach.leader.attachedDon, [activeDon.instanceId]);
  assert.deepEqual(
    must(
      afterAttach.costArea.find(
        (card) => card.instanceId === activeDon.instanceId,
      ),
      "attached DON in cost area",
    ).state,
    undefined,
  );
  assert.equal(trashSelfDecision.type, "payCost");
  assert.equal(trashSelfDecision.cost.type, "trashSelf");
  assert.equal(paidTrashSelf.errors, undefined);
  assert.equal(targetDecision.type, "selectTargets");
});

test("attach-active-DON cost does not accept rested DON", () => {
  const { state } = setupQueue("rested");
  const p1Before = must(state.players[p1], "before");

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(
    must(result.state.players[p1], "after").leader.attachedDon,
    [],
  );
  assert.equal(
    must(result.state.players[p1], "after").characters.length,
    p1Before.characters.length,
  );
});
