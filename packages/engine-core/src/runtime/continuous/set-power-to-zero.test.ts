import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ContinuousEffectRecord,
  EffectId,
  QueueEntryId,
  TimingWindowId,
} from "@optcg/types";

import { computeView } from "../../view/compute-view.js";
import {
  continuousPowerEffectRecord,
  createState,
  must,
  p1,
  p2,
  toCardId,
  withCharacter,
} from "./continuous-test-helpers.js";
import {
  createContinuousRecordsForResolvedEffect,
  isSupportedContinuousQueueEffect,
} from "./continuous.js";

test("setPowerToZero materializes as a reusable selected-target continuous modifier", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  const source = p1State.leader;
  const target = withCharacter(p2, toCardId("char-vanilla"), 0);
  target.attachedDon = [
    "p2:don:attached" as (typeof target.attachedDon)[number],
  ];
  p2State.characters = [target];

  const entry = {
    id: "queue:set-power-zero" as QueueEntryId,
    state: "resolving",
    timingWindowId: "window:set-power-zero" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: continuousPowerEffectRecord(state).sourceSnapshot,
    effectBlockId: "effect:set-power-zero" as EffectId,
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "set-power-zero-test" },
  } satisfies Parameters<typeof createContinuousRecordsForResolvedEffect>[1];
  const effect = {
    type: "setPowerToZero",
    target: {
      type: "choose",
      request: {
        timing: "onResolution",
        chooser: "self",
        zone: "characterArea",
        player: "opponent",
        filter: { categories: ["character"] },
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
      },
    },
    duration: { type: "thisTurn" },
  } satisfies Parameters<typeof createContinuousRecordsForResolvedEffect>[2];

  assert.equal(isSupportedContinuousQueueEffect(effect), true);
  const records = createContinuousRecordsForResolvedEffect(
    state,
    entry,
    effect,
    [
      {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
        zone: target.zone,
      },
    ],
  );

  assert.ok(records !== null);
  assert.equal(records.length, 1);
  const record = must(records[0], "set power record");
  assert.equal(record.modifier.layer, "powerSet");
  assert.equal(record.modifier.operation.type, "setPower");
  assert.equal(record.modifier.operation.value, 0);
});

test("powerSet overrides base, DON, and additive power in computed views", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const target = withCharacter(p1, toCardId("char-vanilla"), 0);
  target.attachedDon = [
    "p1:don:attached" as (typeof target.attachedDon)[number],
  ];
  p1State.characters = [target];
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state),
      id: "set-target-power-zero",
      modifier: {
        layer: "powerSet",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: { categories: ["character"] },
        },
        operation: { type: "setPower", value: 0 },
      },
      duration: { type: "thisTurn" },
    } satisfies ContinuousEffectRecord,
    {
      ...continuousPowerEffectRecord(state, { source: target }),
      id: "target-power-plus",
      modifier: {
        layer: "powerAdd",
        target: { type: "self" },
        operation: { type: "addPower", value: 2000 },
      },
      duration: { type: "thisTurn" },
    },
  ];

  const view = computeView(state);

  assert.equal(view.cards[target.instanceId]?.basePower, 3000);
  assert.equal(view.cards[target.instanceId]?.currentPower, 0);
});
