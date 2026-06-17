import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./test-support.js";
import {
  createChooseOptionalActivationDecision,
  createChooseQuantityDecision,
} from "./choice-decisions.js";

const installQueueDefinition = (
  state: ReturnType<typeof createActiveState>,
  definition: EffectDefinition,
  effectDefinitionId: string,
): void => {
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[definition.cardId] = resolvedCard({
    cardId: definition.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const queueLeaderEffect = (
  state: ReturnType<typeof createActiveState>,
  effectBlockId: EffectDefinition["effects"][number]["id"],
) => {
  const source = must(state.players[p1], "p1").leader;
  return {
    ...queueDrawForP1(),
    controllerId: p1,
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
      category: "leader" as const,
      colors: ["red" as const],
      keywords: [],
    },
    effectBlockId,
    sourcePresencePolicy: "mustRemainInSameZone" as const,
  };
};

test("live optional activation decision preserves omitted state hash", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const support = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-live-optional-choice",
    },
  }).support;
  const base = reviewedOnPlayDrawDefinition(source.cardId, support);
  const effect = must(base.effects[0], "draw effect");
  const entry = queueLeaderEffect(state, effect.id);
  state.effectQueue = [entry];
  installQueueDefinition(
    state,
    {
      ...base,
      effects: [{ ...effect, optional: true }],
    },
    "def-live-optional-choice",
  );

  const result = createChooseOptionalActivationDecision(state, entry, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "chooseOptionalActivation");
  assert.equal(result.stateHash, "");
});

test("live quantity decision preserves omitted state hash", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  const support = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-live-quantity-choice",
    },
  }).support;
  const base = reviewedOnPlayDrawDefinition(source.cardId, support);
  const effect = must(base.effects[0], "draw effect");
  const entry = queueLeaderEffect(state, effect.id);
  state.effectQueue = [entry];
  installQueueDefinition(
    state,
    {
      ...base,
      effects: [
        {
          ...effect,
          effect: { type: "drawUpTo", count: 1, player: "self" },
        },
      ],
    },
    "def-live-quantity-choice",
  );

  const result = createChooseQuantityDecision(
    state,
    entry,
    { type: "drawUpTo", count: 1, player: "self" },
    { min: 0, max: 1 },
    {
      includeStateHash: false,
      validateInvariants: false,
    },
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "chooseQuantity");
  assert.equal(result.stateHash, "");
});
