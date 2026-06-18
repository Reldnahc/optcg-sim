import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  SourcePresencePolicy,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toEngineEventId,
  toQueueEntryId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";

const appendFieldRemovedEvent = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  from: CardInstance["zone"],
): void => {
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:fieldRemoved`),
    seq: state.eventJournal.length + 1,
    type: "cardMoved",
    payload: {
      playerId: source.controller,
      instanceId: source.instanceId,
      cardId: source.cardId,
      from,
      to: source.zone,
      reason: "moveCards",
      sourceKind: "effect",
      sourceControllerId: p2,
    },
    visibility: { type: "public" },
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-entry:field-removed:test"),
      effectId: toEffectId("effect:field-removed:test"),
    },
    createdAtStateSeq: state.seq,
  });
};

const setupSelfFieldRemovedReactionDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  sourcePresencePolicy: SourcePresencePolicy,
): EffectDefinition => {
  const effectDefinitionId = "def-self-field-removed-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "self-field-removed-reaction-rules",
      sourceTextHash: "self-field-removed-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: "self-field-removed-draw" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        trigger: {
          type: "fieldRemoved",
          target: "self",
          player: "self",
          filter: { categories: ["character"] },
          sourceKind: "effect",
        },
        sourcePresencePolicy,
        effect: { type: "draw", count: 1, player: "self" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const selfFieldRemovedReactionState = (
  sourcePresencePolicy: SourcePresencePolicy,
) => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  setupSelfFieldRemovedReactionDefinition(state, source, sourcePresencePolicy);
  const from = source.zone;
  const trashedSource: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
    state: "active",
    attachedDon: [],
  };
  player.characters = player.characters.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  player.trash = [trashedSource, ...player.trash];
  appendFieldRemovedEvent(state, trashedSource, from);
  return { source, state };
};

test("event reactions queue self fieldRemoved effects from last-known field source", () => {
  const { source, state } = selfFieldRemovedReactionState(
    "resolveFromLastKnownInformation",
  );

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queued entry");
  assert.equal(entry.source.instanceId, source.instanceId);
  assert.equal(
    must(entry.source.zone, "entry source zone").zone,
    "characterArea",
  );
  assert.equal(entry.triggerEventId, state.eventJournal.at(-1)?.id);
  assert.equal(String(entry.timingWindowId).endsWith(":fieldRemoved"), true);
  assert.equal(entry.effectBlockId, "self-field-removed-draw");
  assert.equal(entry.sourcePresencePolicy, "resolveFromLastKnownInformation");
});

test("event reactions do not queue removed field sources without last-known policy", () => {
  const { state } = selfFieldRemovedReactionState("mustRemainInSameZone");

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    false,
  );
});
