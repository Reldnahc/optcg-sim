import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "conditional-continuous-support-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "conditional-continuous-support-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId:
      "p1:leader:conditional-continuous" as EffectQueueEntry["source"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["source"]["cardId"],
    playerId: "p1" as EffectQueueEntry["source"]["playerId"],
    zone: {
      zone: "leaderArea",
      playerId: "p1" as EffectQueueEntry["source"]["playerId"],
      slot: "leader",
    },
  },
  sourceSnapshot: {
    instanceId:
      "p1:leader:conditional-continuous" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId: "p1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    category: "leader",
    colors: ["red"],
    keywords: [],
    zone: {
      zone: "leaderArea",
      playerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
      slot: "leader",
    },
  },
  effectBlockId:
    "conditional-continuous-support-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "conditional-continuous-support" },
});

test("sequence support accepts direct conditional continuous keyword bodies", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "conditional-continuous-support-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "onPlay" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "conditional",
            if: {
              type: "hasCardInZone",
              player: "self",
              zone: "leaderArea",
              filter: {
                categories: ["leader"],
                typesAny: ["Land of Wano"],
              },
            },
            then: {
              type: "giveKeyword",
              keyword: "blocker",
              target: { type: "self" },
              duration: { type: "thisTurn" },
            },
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts conditional continuous protection for a saved selected target", () => {
  const savedTarget =
    "selected:conditional-continuous-protection-target" as const;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "conditional-continuous-support-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "counter" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "resolveFromDestinationZone",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          saveResultAs: savedTarget,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { categories: ["leader", "character"] },
            },
          },
        },
        {
          connector: "then",
          effect: {
            type: "conditional",
            if: {
              type: "cardMatches",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: savedTarget,
                },
                zones: ["leaderArea", "characterArea"],
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
              filter: { categories: ["character"] },
            },
            then: {
              type: "protectFromKO",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: savedTarget,
                },
                zones: ["leaderArea", "characterArea"],
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
              duration: { type: "thisTurn" },
            },
          },
        },
      ],
    },
  };

  assert.equal(
    isSupportedSequenceBlock(
      {
        ...syntheticEntry(),
        sourcePresencePolicy: "resolveFromDestinationZone",
      },
      effectBlock,
    ),
    true,
  );
});
