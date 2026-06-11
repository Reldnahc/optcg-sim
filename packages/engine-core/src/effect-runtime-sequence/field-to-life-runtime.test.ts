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
  const effectDefinitionId = "def-field-to-life-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "field-to-life-sequence-rules",
      sourceTextHash: "field-to-life-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-field-to-life-sequence"),
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
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-field-to-life-sequence"),
      timingWindowId: toTimingWindowId("window-field-to-life-sequence"),
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
      causedBy: { type: "ruleProcess", name: "field-to-life-sequence-test" },
    },
  ];
  return state;
};

const selectTargetsThenMoveSavedTargetToLifeChoiceSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-target",
      connector: "always",
      saveResultAs: "savedTarget",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: { categories: ["character"] },
        },
      },
    },
    {
      id: "choose-life-placement",
      connector: "then",
      effect: {
        type: "choice",
        chooser: "self",
        min: 1,
        max: 1,
        options: [
          {
            id: "life-placement:top",
            effect: {
              type: "bounce",
              destination: "lifeTop",
              destinationFaceUp: true,
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "savedTarget",
                },
                zone: "characterArea",
                player: "opponent",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
          {
            id: "life-placement:bottom",
            effect: {
              type: "bounce",
              destination: "lifeBottom",
              destinationFaceUp: true,
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "savedTarget",
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

test("selectTargets saved reference can move a field Character to face-up Life", () => {
  const state = sequenceQueueState(
    selectTargetsThenMoveSavedTargetToLifeChoiceSequence(),
  );
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 2000,
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");

  const selected = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "candidate").card],
    },
  });
  assert.equal(selected.errors, undefined);
  const placement = must(selected.state.pendingDecision, "placement choice");
  assert.equal(placement.type, "chooseEffectOption");

  const moved = applyAction(selected.state, {
    type: "respondToDecision",
    decisionId: placement.id,
    response: { type: "effectOption", optionId: "life-placement:top" },
  });

  assert.equal(moved.errors, undefined);
  assert.equal(moved.state.pendingDecision, undefined);
  const movedP2 = must(moved.state.players[p2], "p2 after move");
  assert.equal(
    movedP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  const topLife = must(movedP2.life[0], "top Life");
  assert.equal(topLife.card.instanceId, target.instanceId);
  assert.equal(topLife.faceUp, true);
  assert.equal(topLife.card.attachedDon.length, 0);
  assert.equal(topLife.card.zone.zone, "life");
});
