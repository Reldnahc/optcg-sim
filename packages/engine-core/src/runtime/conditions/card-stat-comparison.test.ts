import assert from "node:assert/strict";
import { test } from "vitest";

import type { Condition } from "@optcg/types";

import {
  createActiveState,
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
