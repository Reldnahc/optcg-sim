import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, Effect, EffectDefinition } from "@optcg/types";

import {
  applyAction,
  createActiveState,
  hashCanonicalStateValue,
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

const selectStageThenKoSavedSelectedTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "prelude-draw",
      connector: "always",
      effect: { type: "draw", player: "self", count: 0 },
    },
    {
      id: "select-stage",
      connector: "always",
      saveResultAs: "savedStage",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "stageArea",
          player: "opponent",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: { categories: ["stage"], cost: { op: "eq", value: 7 } },
        },
      },
    },
    {
      id: "ko-selected-stage",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "ko",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedStage" },
          zone: "stageArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const setupSequenceDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  effect: Effect,
): void => {
  const effectDefinitionId = "def-stage-ko-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "stage-ko-sequence-rules",
      sourceTextHash: "stage-ko-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-stage-ko-sequence"),
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
};

const setupQueuedStageKoSequence = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  setupSequenceDefinition(
    state,
    source,
    selectStageThenKoSavedSelectedTargetSequence(),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-stage-ko-sequence"),
      timingWindowId: toTimingWindowId("window-stage-ko-sequence"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: toEffectId("effect-stage-ko-sequence"),
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "stage-ko-sequence-test" },
    },
  ];
  return state;
};

test("selectTargets saved stage reference is consumed by later KO segment deterministically", () => {
  const state = setupQueuedStageKoSequence();
  const p2State = must(state.players[p2], "p2");
  const stage = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "stage source"),
    zone: "stageArea",
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 7,
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "stage selection");
  assert.equal(decision.type, "selectTargets");
  assert.deepEqual(must(decision.candidates[0], "candidate").card.zone, {
    zone: "stageArea",
    playerId: p2,
    slot: "stage",
    index: 0,
  });

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(must(resolved.state.players[p2], "p2").stage, undefined);
  assert.equal(
    must(resolved.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === stage.instanceId,
    ),
    true,
  );
  const eventTypes = resolved.events.map((event) => event.type);
  assert.equal(eventTypes[0], "decisionResolved");
  assert.equal(eventTypes.includes("cardKOd"), true);
  assert.equal(eventTypes.at(-1), "effectResolved");
  assert.equal(resolved.state.seq > paused.state.seq, true);
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
