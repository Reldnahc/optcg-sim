import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectQueueEntry } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
} from "../effect-runtime-queue/test-support.js";
import { applyRuntimePlaySource } from "./core.js";

test("playSource removes the live trigger card from trash before placing it", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  const sourceFromHand = must(player.hand[0], "source card");
  const staleFieldSource: CardInstance = {
    ...sourceFromHand,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
  };
  const trashSource: CardInstance = {
    ...sourceFromHand,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
  };
  player.hand = player.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  player.trash = [trashSource];
  state.cardManifest.cards[trashSource.cardId] = resolvedCard({
    cardId: trashSource.cardId,
    category: "character",
    cost: 0,
  });
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-play-source-from-trash"),
    timingWindowId: toTimingWindowId("timing-window-play-source-from-trash"),
    effectBlockId: toEffectId("effect-play-source-from-trash"),
    controllerId: p1,
    source: {
      instanceId: staleFieldSource.instanceId,
      cardId: staleFieldSource.cardId,
      playerId: p1,
      zone: staleFieldSource.zone,
    },
    sourceSnapshot: toSourceSnapshot(staleFieldSource, p1, p1),
    sourcePresencePolicy: "resolveFromDestinationZone",
  };

  const result = applyRuntimePlaySource({
    state,
    entry,
    enterRested: false,
    ignoreCost: true,
  });
  const nextPlayer = must(result.state.players[p1], "next player");

  assert.equal(result.errors, undefined);
  assert.equal(
    nextPlayer.characters.some(
      (card) => card.instanceId === trashSource.instanceId,
    ),
    true,
  );
  assert.equal(
    nextPlayer.trash.some((card) => card.instanceId === trashSource.instanceId),
    false,
  );
});
