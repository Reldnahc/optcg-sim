import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  ResolvedCard,
} from "@optcg/types";

import { getLegalActions } from "../actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
  valueContainsScalar,
} from "../action-test-fixtures.js";
import {
  toDecisionId,
  toEffectId,
  toQueueEntryId,
} from "../action-dispatcher-test-support.js";
import { hashCanonicalStateValue } from "../canonical-state.js";
import { processEffectRuntime } from "../effect-runtime.js";
import {
  queueDrawForP1,
  toSourceSnapshot,
} from "../effect-runtime-queue-processing-test-support.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const installDefinition = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  definition: EffectDefinition,
  category: ResolvedCard["category"] = "character",
  effectDefinitionId = `def-${String(card.cardId)}`,
): void => {
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[card.cardId] = {
    ...resolvedCard({
      cardId: card.cardId,
      category,
      ...(category === "event" || category === "character" ? { cost: 0 } : {}),
      ...(category === "leader" || category === "character"
        ? { power: 5000 }
        : {}),
      support: {
        status: "implemented-dsl",
        effectDefinitionId,
        rulesVersion: definition.metadata.rulesVersion,
        sourceTextHash: definition.metadata.sourceTextHash,
      },
    }),
  };
};

test("getLegalActions exposes chooseOptionalActivation responses only to decision player", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  state.pendingDecision = {
    id: toDecisionId("decision:choose-optional-activation"),
    type: "chooseOptionalActivation",
    playerId: p1,
    prompt: "Activate optional effect?",
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-optional-activation"),
      effectId: toEffectId("effect-optional-activation"),
    },
    visibility: { type: "private", playerId: p1 },
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    effectId: toEffectId("effect-optional-activation"),
    options: ["activate", "decline"],
  };

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
    {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:choose-optional-activation"),
      response: { type: "optionalActivation", choice: "activate" },
    },
    {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:choose-optional-activation"),
      response: { type: "optionalActivation", choice: "decline" },
    },
  ]);
  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
  ]);
});

test("filterStateForPlayer keeps chooseOptionalActivation pending decision private and sanitizes effect causality", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const hiddenEffectId = "effect-hidden-optional-internal";
  const hiddenQueueId = "queue-hidden-optional-internal";
  state.pendingDecision = {
    id: toDecisionId("decision:choose-optional-activation"),
    type: "chooseOptionalActivation",
    playerId: p1,
    prompt: "Activate optional effect?",
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId(hiddenQueueId),
      effectId: toEffectId(hiddenEffectId),
    },
    visibility: { type: "private", playerId: p1 },
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    effectId: toEffectId(hiddenEffectId),
    options: ["activate", "decline"],
  };

  const forDecisionPlayer = filterStateForPlayer(state, p1);
  const forOpponent = filterStateForPlayer(state, p2);

  assert.deepEqual(forDecisionPlayer.pendingDecision, {
    id: toDecisionId("decision:choose-optional-activation"),
    type: "chooseOptionalActivation",
    playerId: p1,
    prompt: "Activate optional effect?",
    causedBy: { type: "ruleProcess", name: "privateCausality" },
  });
  assert.deepEqual(
    forDecisionPlayer.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: toDecisionId("decision:choose-optional-activation"),
      },
    ],
  );
  assert.equal(valueContainsScalar(forDecisionPlayer, hiddenEffectId), false);
  assert.equal(valueContainsScalar(forDecisionPlayer, hiddenQueueId), false);
  assert.equal(forOpponent.pendingDecision, undefined);
  assert.deepEqual(
    forOpponent.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.equal(valueContainsScalar(forOpponent, hiddenEffectId), false);
  assert.equal(valueContainsScalar(forOpponent, hiddenQueueId), false);
});

test("optional effect with unsupported cost fails closed without creating optional decision", () => {
  const state = createActiveState();
  const cardId = toCardId("optional-cost-card");
  const source = must(state.players[p1], "p1").leader;
  const supportCard = resolvedCard({ cardId, category: "leader" });
  const base = reviewedOnPlayDrawDefinition(cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "optional cost base effect");
  const effectId = toEffectId("optional-cost-effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: effectId,
        optional: true,
        cost: { type: "restSelf" },
      },
    ],
  };
  installDefinition(
    state,
    { ...source, cardId },
    definition,
    "leader",
    "def-optional-cost-unsupported",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      source: {
        instanceId: source.instanceId,
        cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: { ...toSourceSnapshot(source, p1, p1), cardId },
      effectBlockId: effectId,
      sourcePresencePolicy: must(
        baseEffect.sourcePresencePolicy,
        "optional cost source presence policy",
      ),
    },
  ];
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
});

test("optional effect with unsupported choose-target KO shape fails closed without creating optional decision", () => {
  const state = createActiveState();
  const cardId = toCardId("optional-target-card");
  const source = must(state.players[p1], "p1").leader;
  const supportCard = resolvedCard({ cardId, category: "leader" });
  const base = reviewedOnPlayDrawDefinition(cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "optional target base effect");
  const effectId = toEffectId("optional-target-effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: effectId,
        optional: true,
        effect: {
          type: "ko",
          target: {
            type: "choose",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone: "characterArea",
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              visibility: "public",
            },
          },
        },
      },
    ],
  };
  installDefinition(
    state,
    { ...source, cardId },
    definition,
    "leader",
    "def-optional-target-unsupported",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      source: {
        instanceId: source.instanceId,
        cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: { ...toSourceSnapshot(source, p1, p1), cardId },
      effectBlockId: effectId,
      sourcePresencePolicy: must(
        baseEffect.sourcePresencePolicy,
        "optional target source presence policy",
      ),
    },
  ];
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
});
