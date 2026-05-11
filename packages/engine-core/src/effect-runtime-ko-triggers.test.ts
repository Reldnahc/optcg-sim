import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectDefinition, PlayerId } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
} from "./action-test-fixtures.js";
import { detectBattleKOTriggerCandidates } from "./effect-runtime.js";

const withCardInZone = (params: {
  state: ReturnType<typeof createActiveState>;
  playerId: PlayerId;
  card: CardInstance;
  zone: "characterArea" | "stageArea";
  index?: number;
}): CardInstance => {
  const { state, playerId, card, zone } = params;
  const index = params.index ?? 0;
  const placed: CardInstance =
    zone === "characterArea"
      ? {
          ...card,
          zone: { zone, playerId, slot: "character", index },
          attachedDon: [],
          state: "active",
          turnPlayed: state.turn.globalTurn,
        }
      : {
          ...card,
          zone: { zone, playerId, slot: "stage", index: 0 },
          attachedDon: [],
          state: "active",
        };
  const player = must(state.players[playerId], "player");
  if (zone === "characterArea") {
    player.characters = [...player.characters, placed];
  } else {
    player.stage = placed;
  }
  return placed;
};

const toSourceSnapshot = (
  card: CardInstance,
  ownerId: PlayerId,
  controllerId: PlayerId,
) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId,
  controllerId,
  zone: card.zone,
  category: card.zone.zone === "stageArea" ? "stage" : "character",
  colors: ["red"],
  keywords: [],
});

const appendBattleKOEvents = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
) => {
  const koEvent = {
    id: toEngineEventId(`event:${String(state.seq)}:1:cardKOd`),
    seq: state.eventJournal.length + 1,
    type: "cardKOd" as const,
    payload: {
      playerId: source.zone.playerId,
      instanceId: source.instanceId,
    },
    visibility: { type: "public" as const },
    causedBy: { type: "ruleProcess" as const, name: "battleResolution" },
    createdAtStateSeq: state.seq,
  };
  const movedEvent = {
    id: toEngineEventId(`event:${String(state.seq)}:2:cardMoved`),
    seq: state.eventJournal.length + 2,
    type: "cardMoved" as const,
    payload: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      from: source.zone,
      to: {
        zone: "trash" as const,
        playerId: source.zone.playerId,
        slot: "trash" as const,
        index: 0,
      },
      reason: "ko",
    },
    visibility: { type: "public" as const },
    causedBy: { type: "ruleProcess" as const, name: "battleResolution" },
    createdAtStateSeq: state.seq,
  };
  return [koEvent, movedEvent] as const;
};

const setupOnKODefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  effectDefinitionId = "def-on-ko",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 3000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "on-ko-rules",
      sourceTextHash: "on-ko-source",
    },
  });
  const onPlay = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...onPlay,
    effects: [
      {
        ...must(onPlay.effects[0], "draw effect"),
        trigger: { type: "onKO" },
        sourcePresencePolicy: "resolveFromDestinationZone",
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

test("detects one supported On K.O. candidate from a battle K.O. event batch", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "K.O. source"),
    zone: "characterArea",
  });
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const definition = setupOnKODefinition(state, source);
  const trashedSource: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
  };
  p2State.characters = [];
  p2State.trash = [trashedSource];
  const events = appendBattleKOEvents(state, source);
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.equal(result.ok, true);
  assert.deepEqual(result.candidates, [
    {
      effectBlockId: must(definition.effects[0], "onKO effect").id,
      controllerId: p2,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p2,
        zone: trashedSource.zone,
      },
      sourceSnapshot: {
        ...toSourceSnapshot(trashedSource, p2, p2),
        power: 3000,
      },
      triggerEventId: events[0].id,
      sourcePresencePolicy: "resolveFromDestinationZone",
      causedBy: {
        type: "ruleProcess",
        name: "effectRuntime:onKOTriggerCandidateDetection",
      },
    },
  ]);
  assert.deepEqual(state, before);
});

test("detects last-known On K.O. candidates with the field source snapshot", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "K.O. source"),
    zone: "characterArea",
  });
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const definition = setupOnKODefinition(state, source);
  const onKOEffect = must(definition.effects[0], "onKO effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        {
          ...onKOEffect,
          sourcePresencePolicy: "resolveFromLastKnownInformation",
        },
      ],
    },
  };
  const trashedSource: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
  };
  p2State.characters = [];
  p2State.trash = [trashedSource];
  const events = appendBattleKOEvents(state, source);
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.equal(result.ok, true);
  assert.deepEqual(result.candidates, [
    {
      effectBlockId: onKOEffect.id,
      controllerId: p2,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p2,
        zone: source.zone,
      },
      sourceSnapshot: {
        ...toSourceSnapshot(source, p2, p2),
        power: 3000,
      },
      triggerEventId: events[0].id,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      causedBy: {
        type: "ruleProcess",
        name: "effectRuntime:onKOTriggerCandidateDetection",
      },
    },
  ]);
  assert.deepEqual(state, before);
});

test("rejects battle K.O. event batches whose move event lacks the K.O.'d card identity", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "K.O. source"),
    zone: "characterArea",
  });
  setupOnKODefinition(state, source);
  const trashedSource: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
  };
  p2State.characters = [];
  p2State.trash = [trashedSource];
  const events = appendBattleKOEvents(state, source).map((event) =>
    event.type === "cardMoved"
      ? {
          ...event,
          payload: {
            from: event.payload.from,
            to: event.payload.to,
            reason: event.payload.reason,
          },
        }
      : event,
  );
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.deepEqual(result, {
    ok: false,
    error: {
      type: "effectRuntimeError",
      effectId: "on-ko-trigger-candidate-detection",
      details: {
        reason: "invalid-ko-event-batch",
      },
    },
  });
  assert.deepEqual(state, before);
});

test("optional On K.O. draw support gate detects an optional trigger candidate", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "K.O. source"),
    zone: "characterArea",
  });
  const definition = setupOnKODefinition(state, source);
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        {
          ...must(definition.effects[0], "onKO effect"),
          optional: true,
        },
      ],
    },
  };
  const trashedSource: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
  };
  p2State.characters = [];
  p2State.trash = [trashedSource];
  const events = appendBattleKOEvents(state, source);
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.candidates.map((candidate) => ({
      controllerId: candidate.controllerId,
      effectBlockId: candidate.effectBlockId,
      sourcePresencePolicy: candidate.sourcePresencePolicy,
      triggerEventId: candidate.triggerEventId,
    })),
    [
      {
        controllerId: p2,
        effectBlockId: must(definition.effects[0], "onKO effect").id,
        sourcePresencePolicy: "resolveFromDestinationZone",
        triggerEventId: must(events[0], "K.O. event").id,
      },
    ],
  );
  assert.deepEqual(state, before);
});
