import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  GameState,
  ResolvedCard,
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
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { computeView } from "../view/compute-view.js";

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const withTypes = (
  card: ResolvedCard,
  types: readonly string[],
): ResolvedCard => ({
  ...card,
  types: [...types],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-targeted-modify-cost-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    cost: 3,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "targeted-modify-cost-sequence-rules",
      sourceTextHash: "targeted-modify-cost-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-targeted-modify-cost-sequence"),
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

const momoCostGainSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "trash-self",
      connector: "always",
      effect: {
        type: "payCost",
        cost: { type: "trashSelf", optional: true },
      },
    },
    {
      id: "wano-draw-and-cost-gain",
      connector: "ifYouDo",
      effect: {
        type: "conditional",
        if: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: {
            categories: ["leader"],
            typesAny: ["Land of Wano"],
          },
        },
        then: {
          type: "sequence",
          effects: [
            {
              id: "draw-card",
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
            {
              id: "choose-momo-cost-gain",
              connector: "then",
              effect: {
                type: "modifyCost",
                player: "self",
                target: {
                  type: "chooseFromZones",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "self",
                    zones: ["leaderArea", "characterArea"],
                    min: 0,
                    max: 1,
                    allowFewerIfUnavailable: true,
                    visibility: "public",
                    filter: { names: ["Kouzuki Momonosuke"] },
                  },
                },
                value: 20,
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    },
  ],
});

const setupState = (): {
  momo: CardInstance;
  sourceRef: CardRef;
  state: GameState;
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
  const momo = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[1], "momo"),
    zone: "characterArea",
    index: 1,
  });
  p1State.hand = reindexHand(p1State.hand.slice(2));
  const leaderCardId = toCardId("leader-red");
  state.cardManifest.cards[leaderCardId] = withTypes(
    resolvedCard({
      cardId: leaderCardId,
      category: "leader",
      power: 5000,
    }),
    ["Land of Wano"],
  );
  state.cardManifest.cards[momo.cardId] = {
    ...resolvedCard({
      cardId: momo.cardId,
      category: "character",
      cost: 4,
      power: 5000,
    }),
    name: "Kouzuki Momonosuke",
  };
  const definition = setupSequenceDefinition(
    state,
    source,
    momoCostGainSequence(),
  );
  const sourceRef: CardRef = {
    instanceId: source.instanceId,
    cardId: source.cardId,
    playerId: p1,
    zone: source.zone,
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-targeted-modify-cost-sequence"),
      timingWindowId: toTimingWindowId("window-targeted-modify-cost-sequence"),
      controllerId: p1,
      source: sourceRef,
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: {
        type: "ruleProcess",
        name: "targeted-modify-cost-sequence-test",
      },
    },
  ];
  return { momo, sourceRef, state };
};

test("optional self-trash conditional sequence applies chosen named +cost modifier", () => {
  const { momo, state } = setupState();

  const opened = processEffectRuntime(state);
  const costDecision = must(opened.state.pendingDecision, "trash self cost");
  assert.equal(costDecision.type, "payCost");

  const paid = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: costDecision.id,
    response: { type: "payment", optionId: "trashSelf" },
  });
  assert.equal(paid.errors, undefined);
  const targetDecision = must(paid.state.pendingDecision, "Momo target choice");
  assert.equal(targetDecision.type, "selectTargets");

  const selected = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: {
      type: "targets",
      targets: [must(targetDecision.candidates[0], "Momo candidate").card],
    },
  });

  assert.equal(selected.errors, undefined);
  assert.equal(selected.state.pendingDecision, undefined);
  const costRecord = must(
    selected.state.continuousEffects.find(
      (record) => record.modifier.layer === "costAdd",
    ),
    "cost modifier record",
  );
  assert.equal(costRecord.modifier.target.type, "exactCard");
  assert.equal(costRecord.modifier.target.card.instanceId, momo.instanceId);
  const view = computeView(selected.state);
  assert.equal(view.cards[momo.instanceId]?.baseCost, 4);
  assert.equal(view.cards[momo.instanceId]?.currentCost, 24);
});
