import assert from "node:assert/strict";
import { test } from "vitest";

import type { Condition, EffectQueueEntry } from "@optcg/types";

import {
  createActiveState,
  p1,
  p2,
  queueDrawForP1,
  toCardId,
  toInstanceId,
  toStateSeq,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { resolvedCard } from "../../action-test-fixtures.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "./evaluator.js";

const selectedCharacterId = "selected:chosenCharacter";

const selectedCharacterTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: selectedCharacterId,
  },
  zone: "characterArea",
  player: "opponent",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const;

test("cardStatComparison condition compares selected target cost to attached DON count", () => {
  const state = createActiveState();
  state.cardManifest.cards[toCardId("leader-red")] = resolvedCard({
    cardId: toCardId("leader-red"),
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[toCardId("leader-blue")] = resolvedCard({
    cardId: toCardId("leader-blue"),
    category: "leader",
    power: 5000,
  });
  const selected = withCardInZone({
    state,
    playerId: p2,
    card: {
      cardId: toCardId("selected-character"),
      instanceId: toInstanceId("selected-instance"),
      owner: p2,
      controller: p2,
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 0,
      },
      state: "rested",
      attachedDon: [
        toInstanceId("attached-don-1"),
        toInstanceId("attached-don-2"),
      ],
      turnPlayed: state.turn.globalTurn,
    },
    zone: "characterArea",
  });
  selected.attachedDon = [
    toInstanceId("attached-don-1"),
    toInstanceId("attached-don-2"),
  ];
  state.cardManifest.cards[selected.cardId] = resolvedCard({
    cardId: selected.cardId,
    category: "character",
    cost: 2,
    power: 3000,
    counter: 0,
  });
  const condition: Extract<Condition, { type: "cardStatComparison" }> = {
    type: "cardStatComparison",
    target: selectedCharacterTarget,
    stat: "cost",
    op: "eq",
    value: {
      type: "countAttachedDon",
      target: selectedCharacterTarget,
      per: 1,
      multiplier: 1,
    },
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), condition, {
      savedReferences: {
        [selectedCharacterId]: {
          kind: "selectedTargets",
          targets: [
            {
              binding: selectedCharacterTarget.binding,
              object: {
                instanceId: selected.instanceId,
                cardId: selected.cardId,
                playerId: p2,
                zone: selected.zone,
              },
              capturedAtStateSeq: toStateSeq(state.seq),
              visibility: "public",
            },
          ],
        },
      },
    }),
    { supported: true, passed: true },
  );

  selected.attachedDon.pop();
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), condition, {
      savedReferences: {
        [selectedCharacterId]: {
          kind: "selectedTargets",
          targets: [
            {
              binding: selectedCharacterTarget.binding,
              object: {
                instanceId: selected.instanceId,
                cardId: selected.cardId,
                playerId: p2,
                zone: selected.zone,
              },
              capturedAtStateSeq: toStateSeq(state.seq),
              visibility: "public",
            },
          ],
        },
      },
    }),
    { supported: true, passed: false },
  );
});

test("cardStatComparison condition fails closed when the selected target is missing", () => {
  const state = createActiveState();
  const condition: Extract<Condition, { type: "cardStatComparison" }> = {
    type: "cardStatComparison",
    target: selectedCharacterTarget,
    stat: "cost",
    op: "eq",
    value: {
      type: "countAttachedDon",
      target: selectedCharacterTarget,
      per: 1,
      multiplier: 1,
    },
  };

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), condition, {
      savedReferences: {
        [selectedCharacterId]: {
          kind: "selectedTargets",
          targets: [],
        },
      },
    }),
    { supported: false },
  );
});

test("cardStatComparison condition compares the queued source current power", () => {
  const state = createActiveState();
  state.cardManifest.cards[toCardId("leader-red")] = resolvedCard({
    cardId: toCardId("leader-red"),
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[toCardId("leader-blue")] = resolvedCard({
    cardId: toCardId("leader-blue"),
    category: "leader",
    power: 5000,
  });
  const source = withCardInZone({
    state,
    playerId: p1,
    card: {
      cardId: toCardId("source-character"),
      instanceId: toInstanceId("source-instance"),
      owner: p1,
      controller: p1,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [toInstanceId("attached-don-1")],
      turnPlayed: state.turn.globalTurn,
    },
    zone: "characterArea",
  });
  source.attachedDon = [toInstanceId("attached-don-1")];
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    cost: 3,
    power: 4000,
    counter: 0,
  });
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "character",
      colors: ["red"],
      cost: 3,
      keywords: [],
      power: 4000,
    },
  };
  const condition: Extract<Condition, { type: "cardStatComparison" }> = {
    type: "cardStatComparison",
    target: { type: "self" },
    stat: "currentPower",
    op: "gte",
    value: 5000,
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(evaluateQueuedEffectCondition(state, entry, condition), {
    supported: true,
    passed: true,
  });

  source.attachedDon = [];
  assert.deepEqual(evaluateQueuedEffectCondition(state, entry, condition), {
    supported: true,
    passed: false,
  });
});
