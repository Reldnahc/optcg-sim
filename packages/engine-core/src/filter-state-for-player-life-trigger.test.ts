import assert from "node:assert/strict";
import { test } from "vitest";

import type { DecisionId } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;

test("confirmLifeTrigger projection shows the damaged card only to decision player", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2 state");
  const lifeCard = must(p2State.life[0], "top life").card;
  const hiddenLifeCardId = toCardId("hidden-life-trigger-card");
  state.cardManifest.cards[hiddenLifeCardId] = resolvedCard({
    cardId: hiddenLifeCardId,
    category: "character",
  });
  state.pendingDecision = {
    id: toDecisionId("decision:life-trigger"),
    type: "confirmLifeTrigger",
    playerId: p2,
    prompt: "Activate life trigger?",
    causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
    visibility: { type: "public" },
    card: {
      instanceId: lifeCard.instanceId,
      cardId: hiddenLifeCardId,
      playerId: p2,
      zone: lifeCard.zone,
    },
    options: ["activateTrigger", "addToHand"],
  };

  const forDecisionPlayer = filterStateForPlayer(state, p2);
  const forOpponent = filterStateForPlayer(state, p1);

  assert.deepEqual(forDecisionPlayer.pendingDecision, {
    id: toDecisionId("decision:life-trigger"),
    type: "confirmLifeTrigger",
    playerId: p2,
    prompt: "Activate life trigger?",
    causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
    card: {
      instanceId: lifeCard.instanceId,
      cardId: hiddenLifeCardId,
      playerId: p2,
      zone: lifeCard.zone,
    },
  });
  assert.deepEqual(
    forDecisionPlayer.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: toDecisionId("decision:life-trigger"),
      },
    ],
  );
  assert.equal(forOpponent.pendingDecision, undefined);
  assert.deepEqual(
    forOpponent.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.equal(
    JSON.stringify(forOpponent).includes("hidden-life-trigger-card"),
    false,
  );
});
