import assert from "node:assert/strict";
import { test } from "vitest";

import { getLegalActions } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { must, p1 } from "../../action-test-fixtures.js";

test("effect invalidation all-target filters exclude cards by type inclusion", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const source = p1State.leader;
  const nonRoger = must(p1State.characters[0], "non-Roger character");
  const roger = {
    ...must(p1State.hand[0], "Roger hand card"),
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 1,
    },
    state: "active" as const,
    attachedDon: [],
  };
  p1State.characters = [nonRoger, roger];
  p1State.hand = p1State.hand.slice(1);
  const leaderEffectId = toEffectId("activate-main-leader-filtered");
  const nonRogerEffectId = toEffectId("activate-main-non-roger");
  const rogerEffectId = toEffectId("activate-main-roger");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(source.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-filtered",
    effectId: leaderEffectId,
  });
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(nonRoger.cardId),
    category: "character",
    definitionId: "def-activate-main-non-roger",
    effectId: nonRogerEffectId,
  });
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(roger.cardId),
    category: "character",
    definitionId: "def-activate-main-roger",
    effectId: rogerEffectId,
  });
  const nonRogerMetadata = must(
    state.cardManifest.cards[nonRoger.cardId],
    "non-Roger metadata",
  );
  const rogerMetadata = must(
    state.cardManifest.cards[roger.cardId],
    "Roger metadata",
  );
  nonRogerMetadata.types = ["Straw Hat Crew"];
  rogerMetadata.types = ["Roger Pirates"];
  state.continuousEffects.push({
    id: "continuous:invalidate-non-roger-effects",
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
      category: "leader",
      colors: [],
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "effectInvalidation",
      target: {
        type: "all",
        player: "self",
        zone: "characterArea",
        filter: {
          categories: ["character"],
          typesNotIncludeAny: ["Roger Pirates"],
        },
      },
      operation: { type: "invalidateEffects" },
    },
    duration: { type: "whileSourceOnField" },
    createdBy: { type: "ruleProcess", name: "test-effect-invalidation" },
    createdAtStateSeq: state.seq,
  });
  state.continuousEffects.push({
    id: "continuous:invalidate-my-leader-effects",
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
      category: "leader",
      colors: [],
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "effectInvalidation",
      target: { type: "myLeader" },
      operation: { type: "invalidateEffects" },
    },
    duration: { type: "whileSourceOnField" },
    createdBy: { type: "ruleProcess", name: "test-effect-invalidation" },
    createdAtStateSeq: state.seq,
  });

  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === source.instanceId,
    ),
    false,
  );
  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === nonRoger.instanceId,
    ),
    false,
  );
  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === roger.instanceId,
    ),
    true,
  );
});
