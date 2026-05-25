import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
} from "./action-test-fixtures.js";
import { hasUnsupportedBattleEffectMetadata } from "./battle-support.js";

test("battle effect metadata ignores implemented-dsl combat cards with only battle-neutral effects", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const leader = p1State.leader;
  const implemented = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    power: 5000,
    effectText:
      "Under the rules of this game, set up a Stage. [Activate: Main] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-neutral-leader-effects",
    },
  });
  state.cardManifest.cards[leader.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-neutral-leader-effects": {
      cardId: leader.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "neutral-leader:start-of-game" as EffectDefinition["effects"][number]["id"],
          category: "auto",
          trigger: { type: "startOfGame" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "play",
            source: "deck",
            player: "self",
            filter: { categories: ["stage"] },
            costModifier: 0,
          },
        },
        {
          id: "neutral-leader:activate-main" as EffectDefinition["effects"][number]["id"],
          category: "activate",
          trigger: { type: "activateMain" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: { type: "draw", count: 1, player: "self" },
        },
      ],
      metadata: {
        sourceTextHash: implemented.support.sourceTextHash,
        rulesVersion: implemented.support.rulesVersion,
        effectDefinitionsVersion: "0.1.0",
        tested: true,
        reviewer: "qa-reviewer",
      },
    },
  };

  assert.equal(hasUnsupportedBattleEffectMetadata(state), false);
});
