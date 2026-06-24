import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectQueueEntry,
  SpotlightEntryCreatedPayload,
} from "@optcg/types";

import {
  applyAction,
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

const hasPlayedCardSpotlight = (
  events: readonly ReturnType<
    typeof applyRuntimePlaySource
  >["events"][number][],
): boolean =>
  events.some(
    (event) =>
      event.type === "spotlightEntryCreated" &&
      (event.payload as SpotlightEntryCreatedPayload).entry.kind ===
        "playedCard",
  );

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
  assert.equal(hasPlayedCardSpotlight(result.events), false);
});

test("playSource overflow response does not create a played-card spotlight", () => {
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
  player.characters = Array.from({ length: 5 }, (_, index) => {
    const source = player.leader;
    const cardId =
      `${String(source.cardId)}:play-source-overflow:${String(index)}` as CardInstance["cardId"];
    const character: CardInstance = {
      ...source,
      cardId,
      instanceId:
        `${String(source.instanceId)}:play-source-overflow:${String(index)}` as CardInstance["instanceId"],
      zone: { zone: "characterArea", playerId: p1, slot: "character", index },
      state: "active",
      attachedDon: [],
      turnPlayed: state.turn.globalTurn,
    };
    state.cardManifest.cards[character.cardId] = resolvedCard({
      cardId: character.cardId,
      category: "character",
      cost: 0,
      power: 1000,
    });
    return character;
  });
  state.cardManifest.cards[trashSource.cardId] = resolvedCard({
    cardId: trashSource.cardId,
    category: "character",
    cost: 0,
  });
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-play-source-overflow"),
    timingWindowId: toTimingWindowId("timing-window-play-source-overflow"),
    effectBlockId: toEffectId("effect-play-source-overflow"),
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
  state.effectQueue = [entry];

  const opened = applyRuntimePlaySource({
    state,
    entry,
    enterRested: true,
    ignoreCost: true,
  });
  const overflow = must(opened.state.pendingDecision, "overflow");
  assert.equal(opened.errors, undefined);
  assert.equal(overflow.type, "selectCards");
  const target = must(overflow.candidates[0], "overflow target").card;

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: overflow.id,
    response: { type: "cards", cards: [target] },
  });
  const nextPlayer = must(resolved.state.players[p1], "next player");

  assert.equal(resolved.errors, undefined);
  assert.equal(
    nextPlayer.characters.some(
      (card) => card.instanceId === trashSource.instanceId,
    ),
    true,
  );
  assert.equal(
    nextPlayer.trash.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(
    nextPlayer.trash.some((card) => card.instanceId === trashSource.instanceId),
    false,
  );
  assert.equal(hasPlayedCardSpotlight(resolved.events), false);
});
