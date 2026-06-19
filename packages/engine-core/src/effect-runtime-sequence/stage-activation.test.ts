import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardFilter,
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  hashCanonicalStateValue,
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
import { isSupportedSequenceBlock } from "./support.js";

const stageActivationSequence = (filter: CardFilter): Effect => ({
  type: "sequence",
  effects: [
    {
      id: "select-stage",
      connector: "always",
      saveResultAs: "selected:stage",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "stageArea",
          player: "self",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter,
        },
      },
    },
    {
      id: "activate-stage",
      connector: "then",
      effect: {
        type: "activate",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "selected:stage",
          },
          zone: "stageArea",
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const setupStageActivationState = (
  effect: Effect,
): {
  effectBlock: EffectDefinition["effects"][number];
  source: CardInstance;
  stage: CardInstance;
  state: GameState;
} => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const stage = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[1], "stage"),
    zone: "stageArea",
  });
  p1State.stage = { ...stage, state: "rested" };

  const effectDefinitionId = "def-stage-activation-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "stage-activation-sequence-rules",
      sourceTextHash: "stage-activation-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const effectBlock = {
    ...baseEffect,
    id: toEffectId("effect-stage-activation-sequence"),
    effect,
  };
  const definition: EffectDefinition = {
    ...base,
    effects: [effectBlock],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
  });
  state.effectQueue = [
    {
      id: toQueueEntryId("queue-entry-stage-activation-sequence"),
      state: "pending",
      timingWindowId: toTimingWindowId("window-stage-activation-sequence"),
      generation: 0,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: effectBlock.id,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 0,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "stage-activation-test" },
    },
  ];

  return { effectBlock, source, stage, state };
};

test("sequence support accepts selected Stage field activation segments", () => {
  const { effectBlock, state } = setupStageActivationState(
    stageActivationSequence({
      categories: ["stage"],
      colorsAny: ["purple"],
    }),
  );
  const entry = must(state.effectQueue[0], "effect queue entry");

  assert.equal(isSupportedSequenceBlock(entry, effectBlock), true);
});

test("selectTargets saved reference can feed activate for rested Stage", () => {
  const { stage, state } = setupStageActivationState(
    stageActivationSequence({ categories: ["stage"] }),
  );

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.candidates.length, 1);

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
  assert.equal(
    must(resolved.state.players[p1], "after p1").stage?.instanceId,
    stage.instanceId,
  );
  assert.equal(
    must(resolved.state.players[p1], "after p1").stage?.state,
    "active",
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});
