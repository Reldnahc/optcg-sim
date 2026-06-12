import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect, EffectDefinition, GameState } from "@optcg/types";

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

const setupSequenceState = (
  effect: Effect,
): { state: GameState; definition: EffectDefinition } => {
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

  const effectDefinitionId = "def-base-power-target-choice";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "base-power-target-choice-rules",
      sourceTextHash: "base-power-target-choice-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-base-power-target-choice"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-base-power-target-choice"),
      timingWindowId: toTimingWindowId("window-base-power-target-choice"),
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
      causedBy: { type: "ruleProcess", name: "base-power-target-choice-test" },
    },
  ];
  return { state, definition };
};

test("direct continuous target choice can feed setBasePower sequence child", () => {
  const { state } = setupSequenceState({
    type: "sequence",
    effects: [
      {
        id: "choose-base-power-target",
        connector: "always",
        effect: {
          type: "setBasePower",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zones: ["characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { categories: ["character"] },
            },
          },
          value: 7000,
          duration: { type: "thisTurn" },
        },
      },
    ],
  });
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
    power: 5000,
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");

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
  const record = resolved.state.continuousEffects.find(
    (effectRecord) =>
      effectRecord.modifier.layer === "basePowerSet" &&
      effectRecord.modifier.operation.type === "setBasePower",
  );
  const basePowerRecord = must(record, "chosen target base power record");
  assert.equal(basePowerRecord.modifier.operation.type, "setBasePower");
  assert.equal(basePowerRecord.modifier.operation.value, 7000);
  assert.equal(basePowerRecord.modifier.target.type, "exactCard");
});

test("selectTargets saved reference can feed setBasePower snapshot value", () => {
  const { state } = setupSequenceState({
    type: "sequence",
    effects: [
      {
        id: "select-target",
        connector: "always",
        saveResultAs: "selected:base-power-source",
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
            filter: { categories: ["character"] },
          },
        },
      },
      {
        id: "set-base-power-from-selected",
        connector: "then",
        effect: {
          type: "setBasePower",
          target: { type: "self" },
          value: {
            type: "snapshotCardStat",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: "selected:base-power-source",
              },
              zone: "characterArea",
              player: "opponent",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
            stat: "currentPower",
          },
          duration: { type: "thisTurn" },
        },
      },
    ],
  });
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
    power: 5000,
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");

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
  const record = resolved.state.continuousEffects.find(
    (effectRecord) =>
      effectRecord.modifier.layer === "basePowerSet" &&
      effectRecord.modifier.operation.type === "setBasePower",
  );
  const basePowerRecord = must(record, "saved snapshot base power record");
  assert.equal(basePowerRecord.modifier.operation.type, "setBasePower");
  assert.equal(basePowerRecord.modifier.operation.value, 5000);
});
