import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardRef, EffectQueueEntry } from "@optcg/types";

import { p1 } from "../../action-test-fixtures.js";
import { buildSelectedTargetMoveZoneReplacementProcess } from "./builders.js";

const sourceZone = {
  zone: "characterArea",
  playerId: p1,
  slot: "character",
  index: 0,
} as const;

const sourceRef: CardRef = {
  instanceId: "source-instance" as CardRef["instanceId"],
  cardId: "source-card" as CardRef["cardId"],
  playerId: p1,
  zone: sourceZone,
};

const targetRef: CardRef = {
  instanceId: "target-instance" as CardRef["instanceId"],
  cardId: "target-card" as CardRef["cardId"],
  playerId: p1,
  zone: { zone: "characterArea", playerId: p1, slot: "character", index: 1 },
};

const entry: EffectQueueEntry = {
  id: "queue-entry" as EffectQueueEntry["id"],
  state: "resolving",
  timingWindowId: "timing-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: p1,
  source: sourceRef,
  sourceSnapshot: {
    instanceId: sourceRef.instanceId,
    cardId: sourceRef.cardId,
    ownerId: p1,
    controllerId: p1,
    zone: sourceZone,
    category: "character",
    colors: ["blue"],
    power: 5000,
    keywords: [],
  },
  effectBlockId: "effect-block" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "builder-test" },
};

test("deck-bottom field-removal process uses broad deck classification plus destination placement", () => {
  const process = buildSelectedTargetMoveZoneReplacementProcess({
    classification: "moveFromFieldToDeck",
    destination: { zone: "deck", position: "bottom" },
    entry,
    target: targetRef,
    targetIndex: 0,
  });

  assert.deepEqual(process.payload, {
    effectId: entry.effectBlockId,
    queueEntryId: entry.id,
    source: entry.source,
    target: targetRef,
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToDeck",
      sourceKind: "cardEffect",
      sourceControllerId: entry.controllerId,
      sourceCardId: entry.source.cardId,
    },
    fieldRemovalDestination: { zone: "deck", position: "bottom" },
  });
});
