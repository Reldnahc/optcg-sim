import assert from "node:assert/strict";
import { test } from "vitest";

import type { DecisionId, InstanceId } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;

test("confirmLifeTrigger projection includes modal presentation and trigger card", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2 state");
  const lifeCard = must(p2State.life[0], "top life").card;
  const cardId = toCardId("life-trigger-card");
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "event",
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
      cardId,
      playerId: p2,
      zone: lifeCard.zone,
    },
    options: ["activateTrigger", "addToHand"],
  };

  const view = filterStateForPlayer(state, p2);

  assert.equal(view.pendingDecision?.type, "confirmLifeTrigger");
  const pending = view.pendingDecision;
  assert.equal(pending.presentation.title, "Life trigger");
  assert.equal(
    pending.presentation.instruction,
    "Choose whether to activate this trigger or add it to your hand.",
  );
  assert.deepEqual(pending.presentation.choices, [
    {
      responseKey: "activateTrigger",
      label: "Activate trigger",
      cards: [pending.card],
    },
    {
      responseKey: "addToHand",
      label: "Add to hand",
      cards: [pending.card],
    },
  ]);
});

test("chooseReplacement projection includes replacement option labels", () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: toDecisionId("decision:replacement"),
    type: "chooseReplacement",
    playerId: p1,
    prompt: "Choose a replacement effect.",
    causedBy: { type: "ruleProcess", name: "fieldRemovalReplacement" },
    visibility: { type: "private", playerId: p1 },
    processId: "process-1",
    replacementIds: ["replacement-a", "replacement-b"],
    replacementOptions: [
      { replacementId: "replacement-a", label: "Use first replacement" },
      { replacementId: "replacement-b", label: "Use second replacement" },
    ],
    mandatory: false,
  };

  const view = filterStateForPlayer(state, p1);

  assert.equal(view.pendingDecision?.type, "chooseReplacement");
  const pending = view.pendingDecision;
  assert.equal(pending.presentation.title, "Choose replacement");
  assert.deepEqual(pending.presentation.choices, [
    { responseKey: "replacement-a", label: "Use first replacement" },
    { responseKey: "replacement-b", label: "Use second replacement" },
    { responseKey: "decline", label: "Do not replace" },
  ]);
  assert.equal(filterStateForPlayer(state, p2).pendingDecision, undefined);
});

test("chooseReplacement projection includes visible replacement source cards", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const replacementSource = must(p1State.hand.shift(), "replacement source");
  replacementSource.instanceId = "replacement-source-instance" as InstanceId;
  replacementSource.zone = {
    zone: "characterArea",
    playerId: p1,
    slot: "character",
    index: 0,
  };
  p1State.characters.push(replacementSource);
  state.cardManifest.cards[replacementSource.cardId] = resolvedCard({
    cardId: replacementSource.cardId,
    category: "character",
  });
  const replacementSourceRef = {
    instanceId: replacementSource.instanceId,
    cardId: replacementSource.cardId,
    playerId: p1,
    zone: replacementSource.zone,
  };
  state.pendingDecision = {
    id: toDecisionId("decision:replacement"),
    type: "chooseReplacement",
    playerId: p1,
    prompt: "Choose a replacement effect.",
    causedBy: { type: "ruleProcess", name: "fieldRemovalReplacement" },
    visibility: { type: "private", playerId: p1 },
    processId: "process-1",
    replacementIds: ["replacement-a"],
    replacementOptions: [
      {
        replacementId: "replacement-a",
        label: "Use replacement",
        source: replacementSourceRef,
      },
    ],
    mandatory: false,
  };

  const view = filterStateForPlayer(state, p1);

  assert.equal(view.pendingDecision?.type, "chooseReplacement");
  assert.deepEqual(view.pendingDecision.presentation.choices, [
    {
      responseKey: "replacement-a",
      label: "Use replacement",
      cards: [replacementSourceRef],
    },
    { responseKey: "decline", label: "Do not replace" },
  ]);
});
