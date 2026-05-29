import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  ReplacementTrigger,
  SelectionSetId,
  Target,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
} from "./action-test-fixtures.js";
import {
  getUnsupportedBattleEffectMetadataReason,
  hasUnsupportedBattleEffectMetadata,
} from "./battle-support.js";

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

test("battle effect metadata ignores supported main-only unblockable grants", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const leader = p1State.leader;
  const implemented = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    power: 5000,
    effectText:
      "[Main] Your [Monkey.D.Luffy] Leader gains [Unblockable] during this turn.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-unblockable-leader",
    },
  });
  state.cardManifest.cards[leader.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-main-unblockable-leader": {
      cardId: leader.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "main-unblockable" as EffectDefinition["effects"][number]["id"],
          category: "activate",
          trigger: { type: "main" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "giveKeyword",
            target: { type: "myLeader" },
            keyword: "unblockable",
            duration: { type: "untilEndOfTurn" },
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

  assert.equal(getUnsupportedBattleEffectMetadataReason(state), undefined);
  assert.equal(hasUnsupportedBattleEffectMetadata(state), false);
});

test("battle effect metadata ignores supported field-removal replacement primitives", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const leader = p1State.leader;
  const implemented = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    power: 5000,
    effectText:
      "If your {Sky Island} type Character with 6000 base power or more would be removed from the field by your opponent, you may add 1 card from the top of your Life cards to your hand instead.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-field-removal-replacement",
    },
  });
  const target: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      typesAny: ["Sky Island"],
      power: { min: 6000 },
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    target,
  };

  state.cardManifest.cards[leader.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-field-removal-replacement": {
      cardId: leader.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "field-removal-replacement" as EffectDefinition["effects"][number]["id"],
          category: "replacement",
          trigger: { type: "replacement", replacement: when },
          optional: true,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
          effect: {
            type: "replacement",
            when,
            instead: {
              type: "moveCards",
              count: 1,
              from: { player: "self", zone: "life", position: "top" },
              to: { player: "self", zone: "hand" },
              order: "original",
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

  assert.equal(getUnsupportedBattleEffectMetadataReason(state), undefined);
  assert.equal(hasUnsupportedBattleEffectMetadata(state), false);
});

test("battle effect metadata ignores supported opponent activation reaction primitives", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const source = p1State.leader;
  const revealedTopLifeSet = "set:revealed-top-life" as SelectionSetId;
  const implemented = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    power: 5000,
    effectText:
      "When your opponent activates an Event or [Blocker], reveal up to 1 card from the top of your Life cards. This Character gains +1000 power during this turn per 1 cost on the revealed card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-opponent-activation-reaction",
    },
  });

  state.cardManifest.cards[source.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-opponent-activation-reaction": {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "opponent-activation-reaction" as EffectDefinition["effects"][number]["id"],
          category: "auto",
          trigger: {
            type: "opponentActivated",
            activations: ["event", "blocker"],
          },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "revealTop",
                  player: "self",
                  zone: "life",
                  count: 1,
                  min: 0,
                  saveAs: revealedTopLifeSet,
                  visibility: "bothPlayers",
                },
              },
              {
                connector: "then",
                effect: {
                  type: "modifyPower",
                  target: { type: "self" },
                  value: {
                    type: "sumSelectedCardCosts",
                    selection: revealedTopLifeSet,
                    multiplier: 1000,
                  },
                  duration: { type: "thisTurn" },
                },
              },
            ],
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

  assert.equal(getUnsupportedBattleEffectMetadataReason(state), undefined);
  assert.equal(hasUnsupportedBattleEffectMetadata(state), false);
});

test("battle effect metadata ignores supported Life-removed reaction primitives", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const source = p1State.leader;
  const implemented = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    power: 5000,
    effectText:
      "[Your Turn] When a card is removed from your or your opponent's Life cards, draw 1 card. Then, you cannot draw cards using your own effects during this turn.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-life-removed-reaction",
    },
  });

  state.cardManifest.cards[source.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-life-removed-reaction": {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "life-removed-reaction" as EffectDefinition["effects"][number]["id"],
          category: "auto",
          trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
          condition: { type: "yourTurn" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: { type: "draw", player: "self", count: 1 },
              },
              {
                connector: "then",
                effect: {
                  type: "preventDraw",
                  player: "self",
                  source: "ownEffects",
                  duration: { type: "thisTurn" },
                },
              },
            ],
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

  assert.equal(getUnsupportedBattleEffectMetadataReason(state), undefined);
  assert.equal(hasUnsupportedBattleEffectMetadata(state), false);
});

test("battle effect metadata diagnostics identify unsupported battle effect source", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const leader = p1State.leader;
  const implemented = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    power: 5000,
    effectText: "",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-end-of-battle-unblockable-leader",
    },
  });
  state.cardManifest.cards[leader.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-end-of-battle-unblockable-leader": {
      cardId: leader.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "end-of-battle-unblockable" as EffectDefinition["effects"][number]["id"],
          category: "auto",
          trigger: { type: "endOfBattle" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "giveKeyword",
            target: { type: "self" },
            keyword: "unblockable",
            duration: { type: "untilEndOfTurn" },
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

  assert.equal(
    getUnsupportedBattleEffectMetadataReason(state),
    [
      "Battle requires unsupported effect metadata",
      `card=${String(leader.cardId)}`,
      "effect=end-of-battle-unblockable",
      "trigger=endOfBattle",
      "category=auto",
      "reason=unsupported battle timing effect",
    ].join("; "),
  );
  assert.equal(hasUnsupportedBattleEffectMetadata(state), true);
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
