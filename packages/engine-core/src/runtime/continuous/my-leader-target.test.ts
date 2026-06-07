import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import {
  createActiveState,
  p1,
  p2,
  queueDrawForP1,
  resolvedCard,
} from "../../effect-runtime-queue/test-support.js";
import {
  createContinuousRecordsForResolvedEffect,
  isSupportedContinuousQueueEffect,
} from "./continuous.js";

const leaderPowerEffect = (): Extract<Effect, { type: "modifyPower" }> => ({
  type: "modifyPower",
  target: { type: "myLeader" },
  value: 2000,
  duration: {
    type: "untilEndOfTurn",
    whoseTurn: "sourceController",
  },
});

const selfKeywordEffect = (): Extract<Effect, { type: "giveKeyword" }> => ({
  type: "giveKeyword",
  target: { type: "self" },
  keyword: "blocker",
  duration: { type: "untilEndOfNextTurn", player: "opponent" },
});

const leaderKeywordEffect = (): Extract<Effect, { type: "giveKeyword" }> => ({
  type: "giveKeyword",
  target: { type: "myLeader" },
  keyword: "doubleAttack",
  duration: { type: "whileSourceOnField" },
});

const leaderBasePowerEffect = (): Extract<
  Effect,
  { type: "setBasePower" }
> => ({
  type: "setBasePower",
  target: { type: "myLeader" },
  value: 7000,
  duration: { type: "thisTurn" },
});

test("continuous modifyPower supports myLeader as an exact leader target", () => {
  const state = createActiveState();
  const entry = { ...queueDrawForP1(), controllerId: p1 };
  const effect = leaderPowerEffect();

  assert.equal(isSupportedContinuousQueueEffect(effect), true);
  const records = createContinuousRecordsForResolvedEffect(
    state,
    entry,
    effect,
  );

  assert.ok(records !== null);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record !== undefined);
  assert.equal(record.modifier.target.type, "exactCard");
  assert.equal(record.modifier.target.card.instanceId, "p1:leader");
});

test("continuous giveKeyword supports self as a queued exact source target", () => {
  const state = createActiveState();
  const entry = { ...queueDrawForP1(), controllerId: p1 };
  const effect = selfKeywordEffect();

  assert.equal(isSupportedContinuousQueueEffect(effect), true);
  const records = createContinuousRecordsForResolvedEffect(
    state,
    entry,
    effect,
  );

  assert.ok(records !== null);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record !== undefined);
  assert.equal(record.modifier.layer, "keywordAdd");
  assert.equal(record.modifier.target.type, "self");
  assert.equal(record.modifier.operation.type, "addKeyword");
  assert.equal(record.modifier.operation.keyword, "blocker");
  assert.equal(record.duration.type, "untilEndOfNextTurn");
});

test("continuous giveKeyword supports myLeader as an exact leader target", () => {
  const state = createActiveState();
  const entry = { ...queueDrawForP1(), controllerId: p1 };
  const effect = leaderKeywordEffect();

  assert.equal(isSupportedContinuousQueueEffect(effect), true);
  const records = createContinuousRecordsForResolvedEffect(
    state,
    entry,
    effect,
  );

  assert.ok(records !== null);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record !== undefined);
  assert.equal(record.modifier.layer, "keywordAdd");
  assert.equal(record.modifier.target.type, "exactCard");
  assert.equal(record.modifier.target.card.instanceId, "p1:leader");
  assert.equal(record.modifier.operation.type, "addKeyword");
  assert.equal(record.modifier.operation.keyword, "doubleAttack");
});

test("continuous setBasePower supports myLeader as an exact leader target", () => {
  const state = createActiveState();
  const entry = { ...queueDrawForP1(), controllerId: p1 };
  const effect = leaderBasePowerEffect();

  assert.equal(isSupportedContinuousQueueEffect(effect), true);
  const records = createContinuousRecordsForResolvedEffect(
    state,
    entry,
    effect,
  );

  assert.ok(records !== null);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record !== undefined);
  assert.equal(record.modifier.layer, "basePowerSet");
  assert.equal(record.modifier.target.type, "exactCard");
  assert.equal(record.modifier.target.card.instanceId, "p1:leader");
  assert.equal(record.modifier.operation.type, "setBasePower");
  assert.equal(record.modifier.operation.value, 7000);
});

test("continuous setBasePower resolves opponent leader current power as a queued snapshot", () => {
  const state = createActiveState();
  const entry = { ...queueDrawForP1(), controllerId: p1 };
  const p2Leader = state.players[p2]?.leader;
  assert.ok(p2Leader !== undefined);
  state.cardManifest.cards[p2Leader.cardId] = resolvedCard({
    cardId: p2Leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.continuousEffects.push({
    id: "continuous:test:opponent-leader-power",
    source: {
      instanceId: p2Leader.instanceId,
      cardId: p2Leader.cardId,
      playerId: p2,
      zone: p2Leader.zone,
    },
    sourceSnapshot: entry.sourceSnapshot,
    controller: p2,
    modifier: {
      layer: "powerAdd",
      target: {
        type: "exactCard",
        card: {
          instanceId: p2Leader.instanceId,
          cardId: p2Leader.cardId,
          playerId: p2,
          zone: p2Leader.zone,
        },
        binding: {
          family: "selectedTargets",
          saveResultAs: "snapshot-test",
        },
        createdAtStateSeq: state.seq,
      },
      operation: { type: "addPower", value: 2000 },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "test" },
    createdAtStateSeq: state.seq,
  });

  const effect: Extract<Effect, { type: "setBasePower" }> = {
    type: "setBasePower",
    target: { type: "self" },
    value: {
      type: "snapshotCardStat",
      target: { type: "opponentLeader" },
      stat: "currentPower",
    },
    duration: { type: "thisTurn" },
  };

  assert.equal(isSupportedContinuousQueueEffect(effect), true);
  const records = createContinuousRecordsForResolvedEffect(
    state,
    entry,
    effect,
  );

  assert.ok(records !== null);
  const record = records[0];
  assert.ok(record !== undefined);
  assert.equal(record.modifier.layer, "basePowerSet");
  assert.equal(record.modifier.operation.type, "setBasePower");
  assert.equal(record.modifier.operation.value, 7000);
});
