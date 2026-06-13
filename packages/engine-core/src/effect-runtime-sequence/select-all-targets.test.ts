import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  toEffectId,
  toQueueEntryId,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { isSupportedSequenceBlock } from "./support.js";

test("selectAllTargets saves public targets across leader and character zones", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const character = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "target"),
    zone: "characterArea",
  });
  const remainingHand = p1State.hand.slice(1);
  const extraDrawCard = must(remainingHand[remainingHand.length - 1], "deck");
  p1State.hand = remainingHand.slice(0, -1);
  p1State.deck = [
    ...p1State.deck,
    {
      ...extraDrawCard,
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
  });
  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: toEffectId("effect-select-all-field"),
    category: "auto",
    trigger: { type: "onPlay" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "sequence",
      effects: [
        {
          id: "save-all-field",
          connector: "always",
          saveResultAs: "savedField",
          effect: {
            type: "selectAllTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea"],
              filter: { categories: ["leader", "character"] },
              visibility: "public",
            },
          },
        },
        {
          id: "draw-for-each-saved-field",
          connector: "then",
          effect: {
            type: "forEachSavedTarget",
            selection: "savedField",
            saveCurrentAs: "currentSavedField",
            effect: { type: "draw", player: "self", count: 1 },
          },
        },
      ],
    },
  };
  const entry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-select-all-field"),
    timingWindowId: toTimingWindowId("window-select-all-field"),
    source: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
      zone: p1State.leader.zone,
    },
    sourceSnapshot: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: p1State.leader.zone,
      category: "leader" as const,
      colors: ["red" as const],
      cost: 1,
      keywords: [],
    },
    effectBlockId: effectBlock.id,
    effectBlockOverride: effectBlock,
    sourcePresencePolicy: "mustRemainInSameZone" as const,
  };
  state.effectQueue = [entry];
  const beforeHandCount = p1State.hand.length;
  const beforeDeckCount = p1State.deck.length;
  assert.equal(isSupportedSequenceBlock(entry, effectBlock), true);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  const afterP1 = must(result.state.players[p1], "after p1");
  assert.equal(afterP1.hand.length, beforeHandCount + 2);
  assert.equal(afterP1.deck.length, beforeDeckCount - 2);
  assert.equal(
    result.events.filter((event) => event.type === "cardDrawn").length,
    2,
  );
  assert.equal(
    afterP1.characters.some((card) => card.instanceId === character.instanceId),
    true,
  );
});
