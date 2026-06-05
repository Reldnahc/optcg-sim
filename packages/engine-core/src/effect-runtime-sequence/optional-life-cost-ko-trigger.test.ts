import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, CardRef, Effect, GameState } from "@optcg/types";

import { applyAction } from "../actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnKODefinition,
  toCardId,
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
): void => {
  const effectDefinitionId = "def-life-cost-ko-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "event",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "life-cost-ko-sequence-rules",
      sourceTextHash: "life-cost-ko-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  state.cardManifest.effectDefinitionsVersion =
    base.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: {
      ...base,
      effects: [
        {
          ...must(base.effects[0], "base effect"),
          id: toEffectId("effect-life-cost-ko-sequence"),
          category: "auto",
          effect,
          sourcePresencePolicy: "noSourceRequired",
          trigger: { type: "trigger" },
        },
      ],
    },
  };
  state.cardManifest.cards[source.cardId] = supportCard;
};

test("optional top-or-bottom life cost KO sequence queues On K.O. triggers", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.hand[0], "source");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[0], "target"),
      cardId: toCardId("life-cost-ko-target"),
    },
    zone: "characterArea",
  });
  const topLife = must(p1State.life[0], "top life").card;
  const drawCard = must(p2State.hand[1], "draw card");
  const deckBuffer = must(p2State.hand[2], "deck buffer");
  p2State.deck = [
    {
      ...drawCard,
      zone: { zone: "deck", playerId: p2, slot: "deck", index: 0 },
    },
    {
      ...deckBuffer,
      zone: { zone: "deck", playerId: p2, slot: "deck", index: 1 },
    },
  ];
  p2State.hand = p2State.hand.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const beforeP2Hand = p2State.hand.length;
  const selection = "selected:ko-target";
  setupSequenceDefinition(state, source, {
    type: "sequence",
    effects: [
      {
        id: "cost:life-to-hand",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: {
            type: "moveCards",
            count: 1,
            chooser: "self",
            from: { player: "self", zone: "life", position: "topOrBottom" },
            to: { player: "self", zone: "hand" },
            order: "chooserChoice",
            optional: true,
          },
        },
      },
      {
        id: "body:after-cost",
        connector: "ifYouDo",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "select:ko-target",
              connector: "always",
              saveResultAs: selection,
              effect: {
                type: "selectTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "opponent",
                  zone: "characterArea",
                  min: 0,
                  max: 1,
                  allowFewerIfUnavailable: true,
                  visibility: "public",
                  filter: {
                    categories: ["character"],
                    cost: { max: 5 },
                  },
                },
              },
            },
            {
              id: "ko:selected-target",
              connector: "then",
              effect: {
                type: "ko",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: selection,
                  },
                  zone: "characterArea",
                  player: "opponent",
                  visibility: "publicOnly",
                  onFailure: "failClosed",
                },
              },
            },
          ],
        },
      },
    ],
  });
  setupOnKODefinition(state, target);
  state.cardManifest.cards[target.cardId] = {
    ...must(state.cardManifest.cards[target.cardId], "target support"),
    cost: 5,
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-life-cost-ko"),
      timingWindowId: toTimingWindowId("window-life-cost-ko"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: toEffectId("effect-life-cost-ko-sequence"),
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "life-cost-ko-test" },
    },
  ];

  const costPaused = processEffectRuntime(state);
  const costDecision = must(costPaused.state.pendingDecision, "cost decision");
  assert.equal(costPaused.errors, undefined);
  assert.equal(costDecision.type, "payCost");

  const costPaid = applyAction(costPaused.state, {
    type: "respondToDecision",
    decisionId: costDecision.id,
    response: {
      type: "payment",
      optionId: "moveCards:top",
      selectedCardInstanceIds: [topLife.instanceId],
    },
  });
  const targetDecision = must(
    costPaid.state.pendingDecision,
    "target decision",
  );
  assert.equal(costPaid.errors, undefined);
  assert.equal(targetDecision.type, "selectTargets");

  const selectedTarget = must(targetDecision.candidates[0], "target candidate")
    .card satisfies CardRef;
  const resolved = applyAction(costPaid.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: {
      type: "targets",
      targets: [selectedTarget],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardKOd",
      "cardMoved",
      "effectResolved",
      "effectQueued",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.equal(
    must(resolved.state.players[p2], "resolved p2").hand.length,
    beforeP2Hand + 1,
  );
});
