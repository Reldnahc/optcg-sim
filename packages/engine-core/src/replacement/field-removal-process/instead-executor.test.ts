import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardRef,
  Effect,
  EffectQueueEntry,
  QueueEntryId,
  TimingWindowId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  toCardId,
} from "../../action-test-fixtures.js";
import { executeReplacementInsteadEffect } from "./instead-executor.js";

test("replacement instead executor applies supported sequenced no-decision primitives", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const sourceHandCard = must(player.hand[0], "source card");
  const source = {
    ...sourceHandCard,
    cardId: toCardId("replacement-sequence-source"),
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 0,
    },
    state: "active" as const,
    attachedDon: [],
  };
  player.characters = [source];
  player.hand = player.hand.slice(1);
  const handCount = player.hand.length;
  const deckTop = must(player.deck[0], "deck top");
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 6000,
  });
  state.cardManifest.cards[deckTop.cardId] = resolvedCard({
    cardId: deckTop.cardId,
    category: "character",
    power: 1000,
  });

  const sourceRef: CardRef = {
    instanceId: source.instanceId,
    cardId: source.cardId,
    playerId: p1,
    zone: source.zone,
  };
  const entry: EffectQueueEntry = {
    id: "queue-entry:replacement-sequence" as QueueEntryId,
    state: "resolving",
    timingWindowId: "timing-window:replacement-sequence" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: sourceRef,
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "character",
      colors: ["red"],
      keywords: [],
      power: 6000,
    },
    effectBlockId:
      "effect:replacement-sequence" as EffectQueueEntry["effectBlockId"],
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    causedBy: { type: "ruleProcess", name: "replacement-sequence-test" },
  };
  const effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: { type: "trash", target: { type: "self" } },
      },
      {
        connector: "then",
        effect: { type: "draw", count: 1, player: "self" },
      },
    ],
  } satisfies Extract<Effect, { type: "sequence" }>;

  const result = executeReplacementInsteadEffect(state, entry, effect);
  const nextPlayer = must(result.state.players[p1], "next p1");

  assert.equal(result.errors, undefined);
  assert.equal(
    nextPlayer.characters.some((card) => card.instanceId === source.instanceId),
    false,
  );
  assert.equal(
    nextPlayer.trash.some((card) => card.instanceId === source.instanceId),
    true,
  );
  assert.equal(nextPlayer.hand.length, handCount + 1);
  assert.equal(
    must(nextPlayer.hand.at(-1), "drawn card").instanceId,
    deckTop.instanceId,
  );
});

test("replacement instead executor applies modifyPower to the replacement target", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const sourceHandCard = must(player.hand[0], "source card");
  const targetHandCard = must(player.hand[1], "target card");
  const source = {
    ...sourceHandCard,
    cardId: toCardId("replacement-power-source"),
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 0,
    },
    state: "active" as const,
    attachedDon: [],
  };
  const target = {
    ...targetHandCard,
    cardId: toCardId("replacement-power-target"),
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 1,
    },
    state: "active" as const,
    attachedDon: [],
  };
  player.characters = [source, target];
  player.hand = player.hand.slice(2);
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 6000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 5000,
  });

  const sourceRef: CardRef = {
    instanceId: source.instanceId,
    cardId: source.cardId,
    playerId: p1,
    zone: source.zone,
  };
  const targetRef: CardRef = {
    instanceId: target.instanceId,
    cardId: target.cardId,
    playerId: p1,
    zone: target.zone,
  };
  const entry: EffectQueueEntry = {
    id: "queue-entry:replacement-power" as QueueEntryId,
    state: "resolving",
    timingWindowId: "timing-window:replacement-power" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: sourceRef,
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "character",
      colors: ["red"],
      keywords: [],
      power: 6000,
    },
    effectBlockId:
      "effect:replacement-power" as EffectQueueEntry["effectBlockId"],
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    causedBy: { type: "ruleProcess", name: "replacement-power-test" },
  };
  const effect = {
    type: "modifyPower",
    target: { type: "replacementTarget" },
    value: -1000,
    duration: { type: "thisTurn" },
  } satisfies Extract<Effect, { type: "modifyPower" }>;

  const result = executeReplacementInsteadEffect(state, entry, effect, {
    replacementTargets: [targetRef],
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.continuousEffects.length, 1);
  assert.deepEqual(result.state.continuousEffects[0]?.modifier.target, {
    type: "exactCard",
    card: targetRef,
    binding: {
      family: "selectedTargets",
      saveResultAs: String(entry.effectBlockId),
      objectIndex: 0,
    },
    createdAtStateSeq: state.seq,
  });
  assert.notEqual(targetRef.instanceId, sourceRef.instanceId);
});
