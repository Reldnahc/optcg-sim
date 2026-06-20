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

const optionalSelfSelectTargetThenBounceSavedTargetThenTrashSequence =
  (): Extract<Effect, { type: "sequence" }> => ({
    type: "sequence",
    effects: [
      {
        id: "select-return-cost",
        connector: "always",
        saveResultAs: "savedTarget",
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            zone: "characterArea",
            player: "self",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["character"], cost: { min: 2 } },
          },
        },
      },
      {
        id: "return-selected-cost",
        connector: "ifPreviousSucceeded",
        effect: {
          type: "bounce",
          destination: "hand",
          target: {
            type: "savedFieldObject",
            binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
            zone: "characterArea",
            player: "self",
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
      {
        id: "body-after-return-cost",
        connector: "ifPreviousSucceeded",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "draw-after-return-cost",
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
            {
              id: "trash-after-return-cost",
              connector: "then",
              effect: {
                type: "trashFromHand",
                player: "self",
                chooser: "self",
                count: 1,
              },
            },
          ],
        },
      },
    ],
  });

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-select-target-trash-continuation";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "select-target-trash-continuation-rules",
      sourceTextHash: "select-target-trash-continuation-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-select-target-trash-continuation"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (effect: Effect): { readonly state: GameState } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-select-target-trash-continuation"),
      timingWindowId: toTimingWindowId(
        "window-select-target-trash-continuation",
      ),
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
      causedBy: {
        type: "ruleProcess",
        name: "select-target-trash-continuation-test",
      },
    },
  ];
  return { state };
};

test("selectTargets continuation can pause for later trashFromHand body", () => {
  const { state } = sequenceQueueState(
    optionalSelfSelectTargetThenBounceSavedTargetThenTrashSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const target = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[1], "own return target"),
    zone: "characterArea",
    index: p1State.characters.length,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  const candidate = must(
    decision.candidates.find(
      (entry) => entry.card.instanceId === target.instanceId,
    ),
    "own target candidate",
  );

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [candidate.card] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision?.type, "selectCards");
  const resolvedP1 = must(resolved.state.players[p1], "resolved p1");
  assert.equal(
    resolvedP1.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(
    resolvedP1.hand.some((card) => card.instanceId === target.instanceId),
    true,
  );
});
