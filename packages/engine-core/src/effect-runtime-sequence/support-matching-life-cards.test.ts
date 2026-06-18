import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "matching-life-support-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "matching-life-support-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId: "p1:leader:source" as EffectQueueEntry["source"]["instanceId"],
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
      "p1:leader:source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId: "p1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    zone: {
      zone: "leaderArea",
      playerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
      slot: "leader",
    },
    category: "leader",
    colors: ["yellow"],
    keywords: [],
  },
  effectBlockId:
    "matching-life-support-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "matching-life-support-test" },
});

const effectBlock = (
  effect: EffectDefinition["effects"][number]["effect"],
): EffectDefinition["effects"][number] => ({
  id: "matching-life-support-effect" as EffectDefinition["effects"][number]["id"],
  category: "auto",
  trigger: { type: "endOfYourTurn" },
  optional: false,
  oncePerTurn: false,
  sourcePresencePolicy: "mustRemainInSameZone",
  effect,
});

test("sequence support accepts deterministic face-up Life trash primitive", () => {
  assert.equal(
    isSupportedSequenceBlock(
      syntheticEntry(),
      effectBlock({
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "moveMatchingLifeCards",
              player: "self",
              matcher: { faceUp: true },
              to: { player: "self", zone: "trash" },
              order: "original",
            },
          },
        ],
      }),
    ),
    true,
  );
});

test("sequence support rejects hidden Life matching until hidden movement semantics exist", () => {
  assert.equal(
    isSupportedSequenceBlock(
      syntheticEntry(),
      effectBlock({
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "moveMatchingLifeCards",
              player: "self",
              matcher: { faceUp: false },
              to: { player: "self", zone: "trash" },
              order: "original",
            },
          },
        ],
      }),
    ),
    false,
  );
});
