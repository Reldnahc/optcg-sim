import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardSnapshot,
  EffectDefinition,
  EffectId,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
} from "./action-test-fixtures.js";
import {
  isSupportedNoChoiceOnPlayDrawEffect,
  type OnPlayTriggerQueueingFailureReason,
  processDefenderOpponentAttackTiming,
  processEffectRuntime,
} from "./effect-runtime.js";

const toCardId = (value: string): CardId => value as CardId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;

const toSourceSnapshot = (
  card: CardInstance,
  ownerId: PlayerId,
  controllerId: PlayerId,
): CardSnapshot => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId,
  controllerId,
  zone: card.zone,
  category: card.zone.zone === "stageArea" ? "stage" : "character",
  colors: ["red"],
  keywords: [],
});

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

const appendCardPlayedEvent = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  category: "character" | "stage",
) => {
  const event = {
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed" as const,
    payload: {
      playerId: card.zone.playerId,
      instanceId: card.instanceId,
      cardId: card.cardId,
      category,
    },
    visibility: { type: "public" as const },
    causedBy: { type: "ruleProcess" as const, name: "turnFlow" },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(event);
};

const appendAttackDeclaredEvent = (
  state: ReturnType<typeof createActiveState>,
  attacker: CardInstance,
) => {
  const target = must(must(state.players[p2], "p2").leader, "p2 leader");
  const event = {
    id: toEngineEventId(`event:${String(state.seq)}:1:attackDeclared`),
    seq: state.eventJournal.length + 1,
    type: "attackDeclared" as const,
    payload: {
      attacker: {
        instanceId: attacker.instanceId,
        cardId: attacker.cardId,
        playerId: attacker.zone.playerId,
        zone: attacker.zone,
      },
      target: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
        zone: target.zone,
      },
    },
    visibility: { type: "public" as const },
    causedBy: { type: "ruleProcess" as const, name: "turnFlow" },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(event);
};

const setupOnPlayDefinition = (
  state: ReturnType<typeof createActiveState>,
  played: CardInstance,
  definition: EffectDefinition,
  effectDefinitionId = "def-on-play",
): void => {
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[played.cardId] = resolvedCard({
    cardId: played.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const queueingState = (): {
  state: ReturnType<typeof createActiveState>;
  played: CardInstance;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "p1 hand source");
  const played = withCardInZone({
    state,
    playerId: p1,
    card: source,
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  appendCardPlayedEvent(state, played, "character");
  return { state, played };
};

const setupOnOpponentAttackDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  effectDefinitionId = "def-on-opponent-attack",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "on-opponent-attack-rules",
      sourceTextHash: "on-opponent-attack-source",
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
        trigger: { type: "onOpponentAttack" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const setupWhenAttackingDefinition = (
  state: ReturnType<typeof createActiveState>,
  attacker: CardInstance,
  effectDefinitionId = "def-when-attacking",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "when-attacking-rules",
      sourceTextHash: "when-attacking-source",
    },
  });
  const onPlay = reviewedOnPlayDrawDefinition(
    attacker.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...onPlay,
    effects: [
      {
        ...must(onPlay.effects[0], "draw effect"),
        trigger: { type: "whenAttacking" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[attacker.cardId] = supportCard;
  return definition;
};

const attackQueueingState = (): {
  state: ReturnType<typeof createActiveState>;
  attacker: CardInstance;
  definition: EffectDefinition;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "hand source");
  const attacker = withCardInZone({
    state,
    playerId: p1,
    card: source,
    zone: "characterArea",
  });
  const definition = setupWhenAttackingDefinition(state, attacker);
  appendAttackDeclaredEvent(state, attacker);
  return { state, attacker, definition };
};

const opponentAttackQueueingState = (): {
  state: ReturnType<typeof createActiveState>;
  attacker: CardInstance;
  target: CardInstance;
  definition: EffectDefinition;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  const definition = setupOnOpponentAttackDefinition(state, target);
  state.battle = {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
      zone: attacker.zone,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
      zone: target.zone,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
      zone: target.zone,
    },
    step: "counter",
    damageCount: 1,
  };
  appendAttackDeclaredEvent(state, attacker);
  return { state, attacker, target, definition };
};

const expectOnPlayQueueingFailure = (
  result: ReturnType<typeof processEffectRuntime>,
  reason: OnPlayTriggerQueueingFailureReason,
): void => {
  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-play-trigger-queueing",
      details: { reason },
    },
  ]);
};

test("queues one supported no-choice On Play draw effect from an accepted cardPlayed event", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-on-play-draw",
  );

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.type, "effectQueued");
  assert.equal(result.state.eventJournal.at(-1)?.type, "effectQueued");
});

test("effectQueued payload and queue metadata are deterministic across repeated runs", () => {
  const run = () => {
    const { state, played } = queueingState();
    const supportCard = resolvedCard({
      cardId: played.cardId,
      category: "character",
    });
    setupOnPlayDefinition(
      state,
      played,
      reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
      "def-deterministic",
    );
    return processEffectRuntime(state);
  };
  const first = run();
  const second = run();

  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.effectQueue, second.state.effectQueue);
  const firstEvent = must(first.events[0], "effectQueued event");
  assert.equal(firstEvent.createdAtStateSeq, first.state.seq);
  assert.deepEqual(firstEvent.causedBy, {
    type: "ruleProcess",
    name: "effectRuntime:onPlayTriggerQueueing",
  });
  assert.deepEqual(first.state.effectQueue[0], {
    id: "queue-entry:event:3:1:cardPlayed:OP01-015:auto-on-play-1",
    state: "pending",
    timingWindowId: "timing-window:event:3:1:cardPlayed",
    generation: 0,
    controllerId: p1,
    source: {
      instanceId: first.state.effectQueue[0]?.source.instanceId,
      cardId: first.state.effectQueue[0]?.source.cardId,
      playerId: p1,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
    },
    sourceSnapshot: toSourceSnapshot(
      must(first.state.players[p1]?.characters[0], "queued source"),
      p1,
      p1,
    ),
    triggerEventId: "event:3:1:cardPlayed",
    effectBlockId: "OP01-015:auto-on-play-1",
    orderingGroup: "turnPlayer",
    createdAtEventSeq:
      first.state.eventJournal[first.state.eventJournal.length - 2]?.seq,
    queuedAtStateSeq: toStateSeq(4),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: {
      type: "ruleProcess",
      name: "effectRuntime:onPlayTriggerQueueing",
    },
  });
});

test("no matching On Play effect leaves queue and events unchanged", () => {
  const { state, played } = queueingState();
  const baseCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    baseCard.support,
  );
  setupOnPlayDefinition(
    state,
    played,
    {
      ...definition,
      effects: [
        {
          ...must(definition.effects[0], "onPlay effect"),
          trigger: { type: "whenAttacking" },
        },
      ],
    },
    "def-non-onplay",
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state.effectQueue, before.effectQueue);
  assert.deepEqual(result.state.eventJournal, before.eventJournal);
});

test("attackDeclared source presence failure rejects When Attacking queueing without mutation or events", () => {
  const { state, attacker } = attackQueueingState();
  const player = must(state.players[p1], "p1");
  player.characters = player.characters.filter(
    (character) => character.instanceId !== attacker.instanceId,
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: {
        reason: "source-presence-failed",
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("attackDeclared stale attacker zone rejects When Attacking queueing without mutation or events", () => {
  const { state, attacker } = attackQueueingState();
  const event = must(state.eventJournal.at(-1), "attackDeclared");
  const payload = event.payload as {
    attacker: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
    target: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
  };
  event.payload = {
    ...payload,
    attacker: {
      ...payload.attacker,
      zone: { ...attacker.zone, index: (attacker.zone.index ?? 0) + 1 },
    },
  };
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: {
        reason: "source-presence-failed",
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("attackDeclared stale target zone rejects On Your Opponent's Attack queueing without mutation or events", () => {
  const { state, target } = opponentAttackQueueingState();
  const event = must(state.eventJournal.at(-1), "attackDeclared");
  const payload = event.payload as {
    attacker: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
    target: {
      instanceId: string;
      cardId: CardId;
      playerId: PlayerId;
      zone: CardInstance["zone"];
    };
  };
  event.payload = {
    ...payload,
    target: {
      ...payload.target,
      zone: { ...target.zone, index: (target.zone.index ?? 0) + 1 },
    },
  };
  const before = structuredClone(state);

  const result = processDefenderOpponentAttackTiming(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-opponent-attack-trigger-queueing",
      details: {
        reason: "source-presence-failed",
      },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("missing, stale, or mismatched source presence fails closed without queue mutation or events", () => {
  const scenarios = ["missing", "stale", "mismatch"] as const;
  for (const scenario of scenarios) {
    const { state, played } = queueingState();
    const baseCard = resolvedCard({
      cardId: played.cardId,
      category: "character",
    });
    setupOnPlayDefinition(
      state,
      played,
      reviewedOnPlayDrawDefinition(played.cardId, baseCard.support),
      `def-${scenario}`,
    );
    if (scenario === "missing") {
      const player = must(state.players[p1], "p1");
      player.characters = [];
    } else if (scenario === "stale") {
      const player = must(state.players[p1], "p1");
      const c0 = must(player.characters[0], "c0");
      player.characters = [
        {
          ...c0,
          instanceId: "different-instance" as CardInstance["instanceId"],
        },
      ];
    } else {
      const event = must(
        state.eventJournal[state.eventJournal.length - 1],
        "cardPlayed",
      );
      event.payload = {
        ...(event.payload as object),
        cardId: toCardId("OP99-999"),
      };
    }
    const before = structuredClone(state);

    const result = processEffectRuntime(state);

    expectOnPlayQueueingFailure(result, "source-presence-failed");
    assert.deepEqual(result.state.effectQueue, before.effectQueue);
    assert.deepEqual(result.state.eventJournal, before.eventJournal);
  }
});

test("unsupported effect metadata and shapes fail closed without partial mutation or events", () => {
  const cases: Array<{
    name: string;
    expectedReason: OnPlayTriggerQueueingFailureReason;
    definition: (d: EffectDefinition) => EffectDefinition;
  }> = [
    {
      name: "optional",
      expectedReason: "unsupported-on-play-definition",
      definition: (d) => ({
        ...d,
        effects: [{ ...must(d.effects[0], "onPlay effect"), optional: true }],
      }),
    },
    {
      name: "cost",
      expectedReason: "unsupported-on-play-definition",
      definition: (d) => ({
        ...d,
        effects: [
          {
            ...must(d.effects[0], "onPlay effect"),
            cost: { type: "restSelf" },
          },
        ],
      }),
    },
    {
      name: "condition",
      expectedReason: "unsupported-on-play-definition",
      definition: (d) => ({
        ...d,
        effects: [
          {
            ...must(d.effects[0], "onPlay effect"),
            condition: { type: "yourTurn" },
          },
        ],
      }),
    },
    {
      name: "unsupported-shape",
      expectedReason: "unsupported-on-play-definition",
      definition: (d) => ({
        ...d,
        effects: [
          {
            ...must(d.effects[0], "onPlay effect"),
            effect: {
              type: "choice",
              chooser: "self",
              options: [],
              min: 0,
              max: 0,
            },
          },
        ],
      }),
    },
    {
      name: "multiple-on-play",
      expectedReason: "multiple-on-play-effects",
      definition: (d) => {
        const first = must(d.effects[0], "onPlay effect");
        return {
          ...d,
          effects: [
            first,
            { ...first, id: "OP01-015:auto-on-play-2" as EffectId },
          ],
        };
      },
    },
  ];

  for (const testCase of cases) {
    const { state, played } = queueingState();
    const baseCard = resolvedCard({
      cardId: played.cardId,
      category: "character",
    });
    const baseDefinition = reviewedOnPlayDrawDefinition(
      played.cardId,
      baseCard.support,
    );
    setupOnPlayDefinition(
      state,
      played,
      testCase.definition(baseDefinition),
      `def-${testCase.name}`,
    );
    const before = structuredClone(state);

    const result = processEffectRuntime(state);

    expectOnPlayQueueingFailure(result, testCase.expectedReason);
    assert.deepEqual(
      result.state.effectQueue,
      before.effectQueue,
      testCase.name,
    );
    assert.deepEqual(
      result.state.eventJournal,
      before.eventJournal,
      testCase.name,
    );
  }
});

test("unreviewed On Play definition metadata fails closed without queue mutation or events", () => {
  const { state, played } = queueingState();
  const baseCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    baseCard.support,
  );
  setupOnPlayDefinition(
    state,
    played,
    {
      ...definition,
      metadata: {
        sourceTextHash: definition.metadata.sourceTextHash,
        rulesVersion: definition.metadata.rulesVersion,
        effectDefinitionsVersion: definition.metadata.effectDefinitionsVersion,
        tested: true,
      },
    },
    "def-unreviewed-on-play",
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "effect-definition-lookup",
      details: {
        reason: "unreviewed-definition-metadata",
        supportStatus: "implemented-dsl",
      },
    },
  ]);
  assert.deepEqual(result.state.effectQueue, before.effectQueue);
  assert.deepEqual(result.state.eventJournal, before.eventJournal);
});

test("public no-choice draw trigger support remains limited to same-zone source presence", () => {
  const baseCard = resolvedCard({
    cardId: toCardId("OP01-015"),
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    toCardId("OP01-015"),
    baseCard.support,
  );
  const sameZoneEffect = must(definition.effects[0], "same-zone effect");
  const lkiEffect: EffectDefinition["effects"][number] = {
    ...sameZoneEffect,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
  };

  assert.equal(isSupportedNoChoiceOnPlayDrawEffect(sameZoneEffect), true);
  assert.equal(isSupportedNoChoiceOnPlayDrawEffect(lkiEffect), false);
});

test("event cardPlayed entries are ignored by On Play trigger queueing", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const eventInHand = must(p1State.hand[0], "event source");
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventInHand.instanceId,
      cardId: eventInHand.cardId,
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "turnFlow" },
    createdAtStateSeq: state.seq,
  });
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state.effectQueue, before.effectQueue);
  assert.deepEqual(result.state.eventJournal, before.eventJournal);
});

test("queued source snapshot preserves CardInstance owner/controller", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  const p2State = must(state.players[p2], "p2");
  const source = must(p2State.hand[0], "p2 hand source");
  const placed = withCardInZone({
    state,
    playerId: p2,
    card: source,
    zone: "characterArea",
  });
  const controlledByP2OwnedByP1: CardInstance = {
    ...placed,
    owner: p1,
    controller: p2,
  };
  p2State.characters = [controlledByP2OwnedByP1];
  appendCardPlayedEvent(state, controlledByP2OwnedByP1, "character");

  const supportCard = resolvedCard({
    cardId: controlledByP2OwnedByP1.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    controlledByP2OwnedByP1,
    reviewedOnPlayDrawDefinition(
      controlledByP2OwnedByP1.cardId,
      supportCard.support,
    ),
    "def-snapshot-owner-controller",
  );

  const result = processEffectRuntime(state);
  const queued = must(result.state.effectQueue[0], "queued entry");

  assert.equal(result.errors, undefined);
  assert.equal(queued.sourceSnapshot.ownerId, p1);
  assert.equal(queued.sourceSnapshot.controllerId, p2);
});
