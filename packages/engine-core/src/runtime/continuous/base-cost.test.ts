import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  ContinuousEffectRecord,
  EffectDefinition,
  PlayerId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../../action-test-fixtures.js";
import { computeView } from "../../view/compute-view.js";
import { deriveImplementedDslPermanentContinuousEffects } from "./continuous.js";

const withCharacter = (
  playerId: PlayerId,
  cardId: ReturnType<typeof toCardId>,
  index: number,
): CardInstance => ({
  instanceId:
    `${String(playerId)}:char:${String(index)}:${String(cardId)}` as CardInstance["instanceId"],
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index },
  state: "active",
  attachedDon: [],
});

const reviewedSetBaseCostDefinition = (
  cardId: ReturnType<typeof toCardId>,
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:set-base-cost" as EffectDefinition["effects"][number]["id"],
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "setBaseCost",
        target: {
          type: "all",
          player: "opponent",
          zone: "characterArea",
          filter: { categories: ["character"] },
        },
        value: 0,
        duration: { type: "whileSourceOnField" },
      },
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ],
  metadata: {
    sourceTextHash: "source-hash",
    rulesVersion: "r1",
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "reviewer",
  },
});

test("implemented DSL setBaseCost materializes and affects computed cost", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = withCharacter(p1, toCardId("source-set-cost"), 0);
  const target = withCharacter(p2, toCardId("target-cost-5"), 0);
  p1State.characters = [source];
  p2State.characters = [target];
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    cost: 4,
    power: 4000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def:set-base-cost",
      rulesVersion: "r1",
      sourceTextHash: "source-hash",
    },
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    cost: 5,
    power: 5000,
  });
  state.cardManifest.effectDefinitionsVersion = "fixture";
  state.cardManifest.effectDefinitions = {
    "def:set-base-cost": reviewedSetBaseCostDefinition(source.cardId),
  };

  const records = deriveImplementedDslPermanentContinuousEffects(state);
  state.continuousEffects = records;
  const view = computeView(state);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0]?.modifier, {
    layer: "baseCostSet",
    target: {
      type: "all",
      player: "opponent",
      zone: "characterArea",
      filter: { categories: ["character"] },
    },
    operation: { type: "setBaseCost", value: 0 },
  } satisfies ContinuousEffectRecord["modifier"]);
  assert.equal(view.cards[target.instanceId]?.baseCost, 0);
  assert.equal(view.cards[target.instanceId]?.currentCost, 0);
});
