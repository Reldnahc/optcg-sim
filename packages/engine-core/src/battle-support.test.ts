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

test("battle effect metadata ignores supported field-removal protection with continuous base power", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const source = p1State.leader;
  const implemented = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    power: 5000,
    effectText:
      "If you have 7 or more cards in your trash, this card cannot be removed from the field by your opponent's effects. [Your Turn] If you have 10 or more cards in your trash, set base power.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-field-removal-protection-and-base-power",
    },
  });
  state.cardManifest.cards[source.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-field-removal-protection-and-base-power": {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "protection" as EffectDefinition["effects"][number]["id"],
          category: "permanent",
          trigger: { type: "permanent" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "giveProtection",
            target: { type: "self" },
            protection: {
              process: "fieldRemoval",
              fieldRemoval: {
                processFamily: "fieldRemoval",
                classification: "moveFromFieldToOtherZone",
                sourceKind: "cardEffect",
                sourceControllerRelation: "opponentControlled",
                targetScope: "thisCard",
                exclusions: {
                  battleKO: "excluded",
                  ruleProcessTrash: "excluded",
                  controllerCost: "excluded",
                  controllerOwnedEffect: "excluded",
                  ambiguousCustomRemoval: "failClosed",
                },
              },
            },
            duration: {
              type: "whileConditionTrue",
              condition: {
                type: "trashCount",
                player: "self",
                op: "gte",
                value: 7,
              },
            },
          },
        },
        {
          id: "base-power" as EffectDefinition["effects"][number]["id"],
          category: "permanent",
          trigger: { type: "permanent" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "setBasePower",
            target: {
              type: "all",
              player: "self",
              zone: "characterArea",
              filter: {
                categories: ["character"],
                typesAny: ["Five Elders"],
              },
            },
            value: 7000,
            duration: {
              type: "whileConditionTrue",
              condition: {
                type: "trashCount",
                player: "self",
                op: "gte",
                value: 10,
              },
            },
          },
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
