import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
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
import { computeView } from "../view/compute-view.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-multizone-saved-target-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "multizone-saved-target-rules",
      sourceTextHash: "multizone-saved-target-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-multizone-saved-target-sequence"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (
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
  p1State.hand = p1State.hand
    .filter((card) => card.instanceId !== source.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p1, slot: "hand", index },
    }));
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-multizone-saved-target"),
      timingWindowId: toTimingWindowId("window-multizone-saved-target"),
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
      causedBy: { type: "ruleProcess", name: "multizone-saved-target-test" },
    },
  ];
  return { state, definition };
};

const selectLeaderOrCharacterThenPowerAndPreventBlockerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-attacker",
      connector: "always",
      saveResultAs: "savedTarget",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zones: ["leaderArea", "characterArea"],
          player: "self",
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: { categories: ["leader", "character"] },
        },
      },
    },
    {
      id: "power-selected-attacker",
      connector: "then",
      effect: {
        type: "modifyPower",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
          zones: ["leaderArea", "characterArea"],
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
        value: 2000,
        duration: { type: "thisTurn" },
      },
    },
    {
      id: "prevent-blocker-selected-attacker",
      connector: "then",
      effect: {
        type: "preventBlockerActivation",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
          zones: ["leaderArea", "characterArea"],
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
        duration: { type: "thisTurn" },
      },
    },
  ],
});

const addBoardCombatMetadata = (state: GameState): void => {
  for (const player of Object.values(state.players)) {
    state.cardManifest.cards[player.leader.cardId] = resolvedCard({
      cardId: player.leader.cardId,
      category: "leader",
      power: 5000,
    });
    for (const character of player.characters) {
      const existing = state.cardManifest.cards[character.cardId];
      state.cardManifest.cards[character.cardId] = resolvedCard({
        ...existing,
        cardId: character.cardId,
        category: "character",
        power: 5000,
      });
    }
  }
};

test("multi-zone saved target applies power and blocker restriction to selected leader", () => {
  const { state } = sequenceQueueState(
    selectLeaderOrCharacterThenPowerAndPreventBlockerSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  addBoardCombatMetadata(state);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  const leaderCandidate = must(
    decision.candidates.find(
      (candidate) => candidate.card.instanceId === p1State.leader.instanceId,
    ),
    "leader candidate",
  );

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [leaderCandidate.card] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const view = computeView(resolved.state);
  assert.equal(view.cards[p1State.leader.instanceId]?.currentPower, 7000);
  assert.deepEqual(view.cards[p1State.leader.instanceId]?.restrictions, [
    "no-blocker",
  ]);
});
