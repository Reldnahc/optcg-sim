import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  PlayerId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
} from "../../action-test-fixtures.js";
import {
  detectBattleKOTriggerCandidates,
  processEffectRuntime,
  queueBattleKOTriggers,
} from "../../effect-runtime.js";
import { applyAction } from "../../index.js";
import { hashCanonicalStateValue } from "../../state/canonical-state.js";

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

const koQueueingState = (): {
  state: ReturnType<typeof createActiveState>;
  source: CardInstance;
  trashedSource: CardInstance;
  definition: EffectDefinition;
  events: EngineEvent[];
} => {
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
  const events = [...appendBattleKOEvents(state, source)];
  return { state, source, trashedSource, definition, events };
};

test("detects one supported On K.O. candidate from a battle K.O. event batch", () => {
  const { state, source, trashedSource, definition, events } =
    koQueueingState();
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.equal(result.ok, true);
  const onKOEffect = must(definition.effects[0], "onKO effect");
  assert.deepEqual(result.candidates, [
    {
      effectBlockId: onKOEffect.id,
      effectBlock: onKOEffect,
      resolvedCard: must(
        state.cardManifest.cards[source.cardId],
        "source card",
      ),
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
      triggerEventId: events[0]?.id,
      sourcePresencePolicy: "resolveFromDestinationZone",
      presentation: {
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p2,
          zone: trashedSource.zone,
        },
        textKind: "effect",
        activeSpanIds: [],
      },
      causedBy: {
        type: "ruleProcess",
        name: "effectRuntime:onKOTriggerCandidateDetection",
      },
    },
  ]);
  assert.deepEqual(state, before);
});

test("detects supported On K.O. candidate from a multi-effect definition with unrelated supported effects", () => {
  const { state, source, definition, events } = koQueueingState();
  const onKOEffect = must(definition.effects[0], "onKO effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        onKOEffect,
        {
          ...onKOEffect,
          id: `${String(onKOEffect.id)}:on-play` as typeof onKOEffect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  const candidate = must(result.candidates[0], "On K.O. candidate");
  assert.equal(candidate.effectBlockId, onKOEffect.id);
  assert.equal(candidate.source.instanceId, source.instanceId);
  assert.deepEqual(state, before);
});

test("On K.O. queueing ignores unsupported dormant On Play sibling", () => {
  const { state, source, definition, events } = koQueueingState();
  const onKOEffect = must(definition.effects[0], "onKO effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        onKOEffect,
        {
          ...onKOEffect,
          id: `${String(onKOEffect.id)}:unsupported-on-play` as typeof onKOEffect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  const candidate = must(result.candidates[0], "On K.O. candidate");
  assert.equal(candidate.effectBlockId, onKOEffect.id);
  assert.equal(candidate.source.instanceId, source.instanceId);
});

test("queues supported On K.O. candidates with deterministic queue metadata and public event", () => {
  const { state, source, trashedSource, definition, events } =
    koQueueingState();
  const before = structuredClone(state);
  const onKOEffect = must(definition.effects[0], "onKO effect");
  const triggerEvent = must(events[0], "cardKOd event");

  const result = queueBattleKOTriggers(state, state, events);

  assert.equal(result.ok, true);
  assert.deepEqual(state, before);
  assert.equal(events.length, 3);
  assert.deepEqual(result.state.effectQueue, [
    {
      id: `queue-entry:${String(triggerEvent.id)}:${String(onKOEffect.id)}`,
      state: "pending",
      timingWindowId: `timing-window:${String(triggerEvent.id)}:onKO`,
      generation: 0,
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
      triggerEventId: triggerEvent.id,
      effectBlockId: onKOEffect.id,
      orderingGroup: "nonTurnPlayer",
      createdAtEventSeq: triggerEvent.seq,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "resolveFromDestinationZone",
      presentation: {
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p2,
          zone: trashedSource.zone,
        },
        textKind: "effect",
        activeSpanIds: [],
      },
      causedBy: {
        type: "ruleProcess",
        name: "effectRuntime:onKOTriggerQueueing",
      },
    },
  ]);
  assert.deepEqual(must(events[2], "effectQueued event"), {
    id: toEngineEventId("event:3:3:effectQueued"),
    seq: 7,
    type: "effectQueued",
    payload: {
      queueEntryId: `queue-entry:${String(triggerEvent.id)}:${String(
        onKOEffect.id,
      )}`,
      timingWindowId: `timing-window:${String(triggerEvent.id)}:onKO`,
      generation: 0,
      effectBlockId: onKOEffect.id,
      triggerEventId: triggerEvent.id,
      sourcePresencePolicy: "resolveFromDestinationZone",
      orderingGroup: "nonTurnPlayer",
      controllerId: p2,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p2,
        zone: trashedSource.zone,
      },
      sourceCardId: source.cardId,
      effectCategory: "auto",
      entryPoint: { type: "onKO" },
      sourceTypes: [],
      sourceCategory: "character",
      presentation: {
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p2,
          zone: trashedSource.zone,
        },
        textKind: "effect",
        activeSpanIds: [],
      },
    },
    visibility: { type: "public" },
    causedBy: {
      type: "ruleProcess",
      name: "effectRuntime:onKOTriggerQueueing",
    },
    createdAtStateSeq: state.seq + 1,
  });
});

test("simultaneous same-player On K.O. triggers share one timing window and choose order", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p2State = must(state.players[p2], "p2");
  const firstSource = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "first K.O. source"),
    zone: "characterArea",
    index: 0,
  });
  const secondSource = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[1], "second K.O. source"),
    zone: "characterArea",
    index: 1,
  });
  p2State.hand = p2State.hand.slice(2).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const firstDefinition = setupOnKODefinition(
    state,
    firstSource,
    "def-first-on-ko",
  );
  const secondDefinition = setupOnKODefinition(
    state,
    secondSource,
    "def-second-on-ko",
  );
  const firstTrashed: CardInstance = {
    ...firstSource,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
  };
  const secondTrashed: CardInstance = {
    ...secondSource,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 1 },
  };
  p2State.characters = [];
  p2State.trash = [firstTrashed, secondTrashed];
  const firstEvents = appendBattleKOEvents(state, firstSource);
  const secondEvents = appendBattleKOEvents(state, secondSource).map(
    (event, index) => ({
      ...event,
      id: toEngineEventId(
        `event:${String(state.seq)}:${String(index + 3)}:${event.type}`,
      ),
      seq: event.seq + 2,
      ...(event.type === "cardMoved"
        ? {
            payload: {
              ...event.payload,
              to: {
                zone: "trash" as const,
                playerId: p2,
                slot: "trash" as const,
                index: 1,
              },
            },
          }
        : {}),
    }),
  );
  const events: EngineEvent[] = [...firstEvents, ...secondEvents];

  const queued = queueBattleKOTriggers(state, state, events);

  assert.equal(queued.ok, true);
  const firstKOEvent = must(firstEvents[0], "first K.O. event");
  const secondKOEvent = must(secondEvents[0], "second K.O. event");
  const expectedTimingWindowId = `timing-window:${String(
    firstKOEvent.id,
  )}:onKO`;
  assert.deepEqual(
    queued.state.effectQueue.map((entry) => ({
      id: entry.id,
      timingWindowId: entry.timingWindowId,
      effectBlockId: entry.effectBlockId,
      orderingGroup: entry.orderingGroup,
    })),
    [
      {
        id: `queue-entry:${String(firstKOEvent.id)}:${String(
          must(firstDefinition.effects[0], "first effect").id,
        )}`,
        timingWindowId: expectedTimingWindowId,
        effectBlockId: must(firstDefinition.effects[0], "first effect").id,
        orderingGroup: "nonTurnPlayer",
      },
      {
        id: `queue-entry:${String(secondKOEvent.id)}:${String(
          must(secondDefinition.effects[0], "second effect").id,
        )}`,
        timingWindowId: expectedTimingWindowId,
        effectBlockId: must(secondDefinition.effects[0], "second effect").id,
        orderingGroup: "nonTurnPlayer",
      },
    ],
  );

  const ordered = processEffectRuntime(queued.state);

  assert.equal(ordered.errors, undefined);
  const decision = must(ordered.state.pendingDecision, "order decision");
  assert.equal(decision.type, "chooseTriggerOrder");
  assert.deepEqual(
    decision.triggerIds,
    queued.state.effectQueue.map((entry) => entry.id),
  );
});

test.each([
  {
    name: "self target",
    effect: {
      type: "modifyPower",
      target: { type: "self" },
      value: 1000,
      duration: { type: "thisTurn" },
    },
  },
  {
    name: "source-dependent duration",
    effect: {
      type: "modifyPower",
      target: { type: "all", zone: "characterArea", player: "opponent" },
      value: 1000,
      duration: { type: "whileSourceOnField" },
    },
  },
] satisfies Array<{
  name: string;
  effect: EffectDefinition["effects"][number]["effect"];
}>)("rejects On K.O. continuous $name before queueing", ({ effect }) => {
  const { state, definition, events } = koQueueingState();
  const onKOEffect = must(definition.effects[0], "onKO effect");
  const continuousEffect: EffectDefinition["effects"][number] = {
    ...onKOEffect,
    id: `${String(onKOEffect.id)}:continuous` as EffectDefinition["effects"][number]["id"],
    effect,
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [continuousEffect],
    },
  };
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.deepEqual(result, {
    ok: false,
    error: {
      type: "effectRuntimeError",
      effectId: "on-ko-trigger-candidate-detection",
      details: {
        reason: "unsupported-on-ko-definition",
      },
    },
  });
  assert.deepEqual(state, before);
});

const onKODrawUpToQueueState = (): {
  queuedState: ReturnType<typeof createActiveState>;
  queuedEvents: EngineEvent[];
  effectBlock: EffectDefinition["effects"][number];
  triggerEvent: EngineEvent;
  queuedEntry: EffectQueueEntry;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p2State = must(state.players[p2], "p2");
  const sourceCard = must(p2State.hand[0], "K.O. drawUpTo source");
  const drawCard = must(p2State.hand[1], "drawUpTo deck card");
  const deckBuffer = must(p2State.hand[2], "drawUpTo deck buffer");
  const source = withCardInZone({
    state,
    playerId: p2,
    card: sourceCard,
    zone: "characterArea",
  });
  p2State.deck = [
    {
      ...drawCard,
      zone: { zone: "deck", playerId: p2, slot: "deck", index: 0 },
    },
    {
      ...deckBuffer,
      zone: { zone: "deck", playerId: p2, slot: "deck", index: 1 },
    },
  ];
  p2State.hand = p2State.hand.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const definition = setupOnKODefinition(state, source);
  const onKOEffect = must(definition.effects[0], "onKO effect");
  const drawUpToEffect: EffectDefinition["effects"][number] = {
    ...onKOEffect,
    id: `${String(onKOEffect.id)}:draw-up-to` as EffectDefinition["effects"][number]["id"],
    effect: { type: "drawUpTo", count: 2, player: "self" },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [drawUpToEffect],
    },
  };
  const trashedSource: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
  };
  p2State.characters = [];
  p2State.trash = [trashedSource];
  const queuedEvents = [...appendBattleKOEvents(state, source)];
  const queued = queueBattleKOTriggers(state, state, queuedEvents);
  assert.equal(queued.ok, true);
  return {
    queuedState: queued.state,
    queuedEvents,
    effectBlock: drawUpToEffect,
    triggerEvent: must(queuedEvents[0], "K.O. event"),
    queuedEntry: must(queued.state.effectQueue[0], "queued entry"),
  };
};

test("On K.O. drawUpTo queues with deterministic metadata, pauses, and resumes stably", () => {
  const runPaused = () => {
    const queued = onKODrawUpToQueueState();
    const paused = processEffectRuntime(queued.queuedState);
    return { queued, paused };
  };
  const first = runPaused();
  const second = runPaused();
  const queuedEvent = must(first.queued.queuedEvents[2], "effectQueued event");
  const decision = must(
    first.paused.state.pendingDecision,
    "quantity decision",
  );

  assert.equal(first.paused.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");
  assert.deepEqual(
    first.paused.events.map((event) => event.type),
    ["decisionCreated"],
  );
  assert.deepEqual(queuedEvent.payload, {
    queueEntryId: first.queued.queuedEntry.id,
    timingWindowId: first.queued.queuedEntry.timingWindowId,
    generation: 0,
    effectBlockId: first.queued.effectBlock.id,
    triggerEventId: first.queued.triggerEvent.id,
    sourcePresencePolicy: "resolveFromDestinationZone",
    orderingGroup: "nonTurnPlayer",
    controllerId: first.queued.queuedEntry.controllerId,
    source: first.queued.queuedEntry.source,
    sourceCardId: first.queued.queuedEntry.source.cardId,
    effectCategory: "auto",
    entryPoint: { type: "onKO" },
    sourceTypes: [],
    sourceCategory: "character",
    presentation: first.queued.queuedEntry.presentation,
  });
  assert.deepEqual(decision.causedBy, {
    type: "effect",
    queueEntryId: first.queued.queuedEntry.id,
    effectId: first.queued.effectBlock.id,
  });
  assert.deepEqual(first.paused.state.effectQueue, [first.queued.queuedEntry]);
  assert.deepEqual(first.queued.queuedEvents, second.queued.queuedEvents);
  assert.deepEqual(first.paused.events, second.paused.events);
  assert.equal(first.paused.stateHash, second.paused.stateHash);

  const resume = (state: typeof first.paused.state) => {
    const pending = must(state.pendingDecision, "quantity decision");
    return applyAction(state, {
      type: "respondToDecision",
      decisionId: pending.id,
      response: { type: "chooseQuantity", quantity: 1 },
    });
  };
  const resumed = resume(first.paused.state);
  const resumedAgain = resume(second.paused.state);

  assert.equal(resumed.errors, undefined);
  assert.equal(resumed.state.pendingDecision, undefined);
  assert.deepEqual(resumed.state.effectQueue, []);
  assert.deepEqual(
    resumed.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(resumed.events, resumedAgain.events);
  assert.equal(resumed.stateHash, resumedAgain.stateHash);
  assert.equal(resumed.stateHash, hashCanonicalStateValue(resumed.state));
});

test("conditioned On K.O. drawUpTo reaches quantity decision path", () => {
  const queued = onKODrawUpToQueueState();
  const definition = must(
    queued.queuedState.cardManifest.effectDefinitions?.["def-on-ko"],
    "onKO definition",
  );
  const effect = must(definition.effects[0], "onKO drawUpTo effect");
  queued.queuedState.cardManifest.effectDefinitions = {
    ...queued.queuedState.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        {
          ...effect,
          condition: { type: "yourTurn" },
        },
      ],
    },
  };
  queued.queuedState.turn.turnPlayerId = p2;

  const result = processEffectRuntime(queued.queuedState);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "chooseQuantity");
});

test("rejects battle K.O. event batches whose move event lacks the K.O.'d card identity", () => {
  const { state, events } = koQueueingState();
  const invalidEvents = events.map((event) => {
    if (event.type !== "cardMoved") {
      return event;
    }
    const payload = event.payload as {
      from?: unknown;
      to?: unknown;
      reason?: string;
    };
    return {
      ...event,
      payload: {
        from: payload.from,
        to: payload.to,
        reason: payload.reason,
      },
    };
  });
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, invalidEvents);

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

test.each([
  {
    name: "cost",
    mutate: (
      effect: EffectDefinition["effects"][number],
    ): EffectDefinition["effects"][number] => ({
      ...effect,
      cost: { type: "restDon", count: 1 },
    }),
  },
  {
    name: "condition timing",
    mutate: (
      effect: EffectDefinition["effects"][number],
    ): EffectDefinition["effects"][number] => ({
      ...effect,
      conditionTiming: "resolution",
    }),
  },
  {
    name: "targeting body",
    mutate: (
      effect: EffectDefinition["effects"][number],
    ): EffectDefinition["effects"][number] => ({
      ...effect,
      effect: {
        type: "ko",
        target: {
          type: "choose",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
          },
        },
      },
    }),
  },
  {
    name: "unsupported source policy",
    mutate: (
      effect: EffectDefinition["effects"][number],
    ): EffectDefinition["effects"][number] => ({
      ...effect,
      sourcePresencePolicy: "mustRemainInSameZone",
    }),
  },
])("rejects unsupported On K.O. $name before queueing", ({ mutate }) => {
  const { state, definition, events } = koQueueingState();
  const unsupported = mutate(must(definition.effects[0], "onKO effect"));
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [unsupported],
    },
  };
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.deepEqual(result, {
    ok: false,
    error: {
      type: "effectRuntimeError",
      effectId: "on-ko-trigger-candidate-detection",
      details: {
        reason: "unsupported-on-ko-definition",
      },
    },
  });
  assert.deepEqual(state, before);
});

test("conditioned On K.O. draw shape is detected as a supported trigger candidate", () => {
  const { state, definition, events } = koQueueingState();
  const conditioned = {
    ...must(definition.effects[0], "onKO effect"),
    condition: { type: "yourTurn" as const },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [conditioned],
    },
  };
  state.turn.turnPlayerId = p2;
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.effectBlockId, conditioned.id);
  assert.deepEqual(state, before);
});

test("conditioned optional On K.O. draw queues and routes through chooseOptionalActivation unchanged", () => {
  const { state, definition, events } = koQueueingState();
  const effect = must(definition.effects[0], "onKO effect");
  state.turn.turnPlayerId = p2;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        {
          ...effect,
          optional: true,
          condition: { type: "yourTurn" },
        },
      ],
    },
  };

  const queued = queueBattleKOTriggers(state, state, events);
  assert.equal(queued.ok, true);

  const paused = processEffectRuntime(queued.state);

  assert.equal(paused.errors, undefined);
  assert.deepEqual(
    paused.events.map((event) => event.type),
    ["decisionCreated"],
  );
  assert.equal(paused.state.pendingDecision?.type, "chooseOptionalActivation");
  assert.equal(paused.state.effectQueue.length, 1);
});

test("detects and queues every supported same-entrypoint On K.O. effect block", () => {
  const { state, definition, events } = koQueueingState();
  const effect = must(definition.effects[0], "onKO effect");
  const secondEffect = {
    ...effect,
    id: `${String(effect.id)}:second` as EffectDefinition["effects"][number]["id"],
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [effect, secondEffect],
    },
  };

  const detected = detectBattleKOTriggerCandidates(state, events);
  const queuedEvents = [...events];
  const queued = queueBattleKOTriggers(state, state, queuedEvents);

  assert.equal(detected.ok, true);
  assert.deepEqual(
    detected.candidates.map((candidate) => candidate.effectBlockId),
    [effect.id, secondEffect.id],
  );
  assert.equal(queued.ok, true);
  assert.deepEqual(
    queued.state.effectQueue.map((entry) => entry.effectBlockId),
    [effect.id, secondEffect.id],
  );
  assert.equal(
    queuedEvents.filter((event) => event.type === "effectQueued").length,
    2,
  );
});

test("On K.O. reusable draw-then-trash sequence queues and reaches sequence decision flow", () => {
  const { state, definition, events } = koQueueingState();
  const effect = must(definition.effects[0], "onKO effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        {
          ...effect,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: { type: "draw", count: 1, player: "self" },
              },
              {
                connector: "then",
                effect: {
                  type: "trashFromHand",
                  player: "self",
                  chooser: "self",
                  count: 1,
                },
              },
            ],
          },
        },
      ],
    },
  };

  const queued = queueBattleKOTriggers(state, state, [...events]);
  assert.equal(queued.ok, true);
  const paused = processEffectRuntime(queued.state);

  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "selectCards");
});

test.each([
  {
    name: "untested support metadata",
    mutate: (
      state: ReturnType<typeof createActiveState>,
      source: CardInstance,
    ) => {
      const card = must(
        state.cardManifest.cards[source.cardId],
        "support card",
      );
      state.cardManifest.cards[source.cardId] = {
        ...card,
        support: { ...card.support, tested: false },
      };
    },
    reason: "untested-support-metadata",
  },
  {
    name: "untested definition metadata",
    mutate: (state: ReturnType<typeof createActiveState>) => {
      const definition = must(
        state.cardManifest.effectDefinitions?.["def-on-ko"],
        "definition",
      );
      state.cardManifest.effectDefinitions = {
        ...state.cardManifest.effectDefinitions,
        "def-on-ko": {
          ...definition,
          metadata: { ...definition.metadata, tested: false },
        },
      };
    },
    reason: "untested-definition-metadata",
  },
  {
    name: "unreviewed definition metadata",
    mutate: (state: ReturnType<typeof createActiveState>) => {
      const definition = must(
        state.cardManifest.effectDefinitions?.["def-on-ko"],
        "definition",
      );
      state.cardManifest.effectDefinitions = {
        ...state.cardManifest.effectDefinitions,
        "def-on-ko": {
          ...definition,
          metadata: {
            sourceTextHash: definition.metadata.sourceTextHash,
            rulesVersion: definition.metadata.rulesVersion,
            effectDefinitionsVersion:
              definition.metadata.effectDefinitionsVersion,
            tested: definition.metadata.tested,
          },
        },
      };
    },
    reason: "unreviewed-definition-metadata",
  },
])("rejects On K.O. with $name", ({ mutate, reason }) => {
  const { state, source, events } = koQueueingState();
  mutate(state, source);
  const before = structuredClone(state);

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.deepEqual(result, {
    ok: false,
    error: {
      type: "effectRuntimeError",
      effectId: "effect-definition-lookup",
      details: {
        reason,
        supportStatus: "implemented-dsl",
      },
    },
  });
  assert.deepEqual(state, before);
});
