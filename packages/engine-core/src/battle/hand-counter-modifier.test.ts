import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "../actions.js";
import {
  cardRef,
  continuousEffectRecord,
  setupOpenedCounterStepPassDecision,
} from "./test-fixtures.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";

type EngineInternalBattleState = NonNullable<
  ReturnType<
    typeof setupOpenedCounterStepPassDecision
  >["opened"]["state"]["battle"]
> & { counterPower?: number };

const battleCounterPower = (
  battle: ReturnType<
    typeof setupOpenedCounterStepPassDecision
  >["opened"]["state"]["battle"],
): number | undefined =>
  (battle as EngineInternalBattleState | undefined)?.counterPower;

test("continuous hand counter modifier makes matching defender Character cards usable as Counter", () => {
  const { opened, counterCard, decision } =
    setupOpenedCounterStepPassDecision();
  const p2State = must(opened.state.players[p2], "p2");
  opened.state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 8000,
  });
  opened.state.continuousEffects = [
    {
      ...continuousEffectRecord(opened.state, "hand-counter-8000-character", {
        type: "permanent",
      }),
      source: cardRef(p2State.leader, p2),
      controller: p2,
      modifier: {
        layer: "counterSet",
        target: {
          type: "allMatching",
          zone: "hand",
          player: "self",
          filter: {
            categories: ["character"],
            power: { op: "eq", value: 8000 },
          },
        },
        operation: { type: "setCounter", value: 2000 },
      },
    },
  ];

  assert.deepEqual(getLegalActions(opened.state, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    {
      type: "useCounter",
      cardInstanceId: counterCard.instanceId,
      target: must(opened.state.battle, "battle").currentTarget,
    },
  ]);
  assert.deepEqual(getLegalActions(opened.state, p1), [
    { type: "concede", playerId: p1 },
  ]);

  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });

  assert.equal(countered.errors, undefined);
  assert.equal(battleCounterPower(countered.state.battle), 2000);
});
