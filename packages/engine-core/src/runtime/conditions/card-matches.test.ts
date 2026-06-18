import assert from "node:assert/strict";
import { test } from "vitest";

import type { Condition } from "@optcg/types";

import { resolvedCard } from "../../action-test-fixtures.js";
import {
  createActiveState,
  p1,
  queueDrawForP1,
  toCardId,
  toInstanceId,
  toStateSeq,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "./evaluator.js";

const selectedCardId = "selected:card-matches-target";
const selectedTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: selectedCardId,
  },
  zones: ["leaderArea", "characterArea"],
  player: "self",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const;

test("cardMatches condition checks a saved selected target against a reusable filter", () => {
  const state = createActiveState();
  const selected = withCardInZone({
    state,
    playerId: p1,
    card: {
      cardId: toCardId("selected-character"),
      instanceId: toInstanceId("selected-character-instance"),
      owner: p1,
      controller: p1,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "rested",
      attachedDon: [],
    },
    zone: "characterArea",
  });
  state.cardManifest.cards[selected.cardId] = resolvedCard({
    cardId: selected.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });

  const condition: Extract<Condition, { type: "cardMatches" }> = {
    type: "cardMatches",
    target: selectedTarget,
    filter: { categories: ["character"] },
  };
  const savedReferences = {
    [selectedCardId]: {
      kind: "selectedTargets" as const,
      targets: [
        {
          binding: selectedTarget.binding,
          object: {
            instanceId: selected.instanceId,
            cardId: selected.cardId,
            playerId: p1,
            zone: selected.zone,
          },
          capturedAtStateSeq: toStateSeq(state.seq),
          visibility: "public" as const,
        },
      ],
    },
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), condition, {
      savedReferences,
    }),
    { supported: true, passed: true },
  );

  state.cardManifest.cards[selected.cardId] = resolvedCard({
    cardId: selected.cardId,
    category: "leader",
    power: 5000,
  });
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), condition, {
      savedReferences,
    }),
    { supported: true, passed: false },
  );
});
