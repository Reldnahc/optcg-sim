import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardRef,
  CardId,
  CardInstance,
  Effect,
  EffectDefinition,
  PlayerId,
} from "@optcg/types";

import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../../action-test-fixtures.js";
import {
  processDefenderOpponentAttackTiming,
  processEffectRuntime,
} from "../../effect-runtime.js";
import {
  attackQueueingState,
  opponentAttackQueueingState,
  setupOnOpponentAttackDefinition,
  withCardInZone,
} from "./test-support.js";

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

test("already queued current-sequence On Your Opponent's Attack timing window is not queued again", () => {
  const { state } = opponentAttackQueueingState();
  const queued = processDefenderOpponentAttackTiming(state);

  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 0);

  const attackDeclared = must(
    queued.state.eventJournal.find((event) => event.type === "attackDeclared"),
    "attack declared event",
  );
  const afterQueueReturnedToAttackSeq = {
    ...queued.state,
    seq: attackDeclared.createdAtStateSeq,
    effectQueue: [],
  };

  const repeated = processDefenderOpponentAttackTiming(
    afterQueueReturnedToAttackSeq,
  );

  assert.equal(repeated.errors, undefined);
  assert.deepEqual(repeated.events, []);
  assert.equal(repeated.state.effectQueue.length, 0);
});

test("main runtime lets battle cleanup handle an attack target removed during When Attacking resolution", () => {
  const { state } = opponentAttackQueueingState();
  const p2State = must(state.players[p2], "p2");
  const staleTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "stale attack target"),
    zone: "characterArea",
  });
  const staleTargetRef: CardRef = {
    instanceId: staleTarget.instanceId,
    cardId: staleTarget.cardId,
    playerId: p2,
    zone: staleTarget.zone,
  };
  const battle = must(state.battle, "battle");
  state.battle = {
    ...battle,
    originalTarget: staleTargetRef,
    currentTarget: staleTargetRef,
  };
  const attackDeclared = must(state.eventJournal.at(-1), "attackDeclared");
  const payload = attackDeclared.payload as {
    attacker: CardRef;
    target: CardRef;
  };
  attackDeclared.payload = {
    ...payload,
    target: staleTargetRef,
  };
  state.seq = (state.seq + 1) as typeof state.seq;
  p2State.characters = p2State.characters.filter(
    (character) => character.instanceId !== staleTarget.instanceId,
  );
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
});

test("conditioned When Attacking draw shape queues without fail-closed rejection", () => {
  const { state, definition } = attackQueueingState();
  const effect = must(definition.effects[0], "whenAttacking effect");
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        {
          ...effect,
          condition: { type: "yourTurn" },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
  assert.equal(result.state.effectQueue.length, 1);
});

test("queues supported When Attacking effect from a multi-effect definition with unrelated supported effects", () => {
  const { state, definition } = attackQueueingState();
  const whenAttackingEffect = must(
    definition.effects[0],
    "whenAttacking effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        whenAttackingEffect,
        {
          ...whenAttackingEffect,
          id: `${String(whenAttackingEffect.id)}:on-play` as typeof whenAttackingEffect.id,
          trigger: { type: "onPlay" },
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(
    result.state.effectQueue[0]?.effectBlockId,
    whenAttackingEffect.id,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued"],
  );
});

test("When Attacking queueing ignores unsupported dormant On K.O. sibling", () => {
  const { state, definition } = attackQueueingState();
  const whenAttackingEffect = must(
    definition.effects[0],
    "whenAttacking effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        whenAttackingEffect,
        {
          ...whenAttackingEffect,
          id: `${String(whenAttackingEffect.id)}:unsupported-on-ko` as typeof whenAttackingEffect.id,
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(
    result.state.effectQueue[0]?.effectBlockId,
    whenAttackingEffect.id,
  );
});

test("queued When Attacking effects carry active text presentation from parser spans", () => {
  const { state, attacker, definition } = attackQueueingState();
  const whenAttackingEffect = must(
    definition.effects[0],
    "whenAttacking effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        {
          ...whenAttackingEffect,
          presentation: {
            textKind: "effect",
            spanIds: ["span:when-attacking-body"],
          },
        },
      ],
    },
  };
  state.cardManifest.cards[attacker.cardId] = {
    ...must(state.cardManifest.cards[attacker.cardId], "attacker card"),
    effectText: "[When Attacking] Draw 1 card.",
    effectTextSourceMap: {
      textKind: "effect",
      sourceText: "[When Attacking] Draw 1 card.",
      spans: [
        {
          id: "span:when-attacking-body",
          role: "body",
          start: 17,
          end: 29,
          text: "Draw 1 card.",
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.effectQueue[0]?.presentation, {
    source: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
      zone: attacker.zone,
    },
    textKind: "effect",
    activeSpanIds: ["span:when-attacking-body"],
  });
});

test("queues every supported same-entrypoint When Attacking effect block", () => {
  const { state, definition } = attackQueueingState();
  const whenAttackingEffect = must(
    definition.effects[0],
    "whenAttacking effect",
  );
  const secondWhenAttackingEffect = {
    ...whenAttackingEffect,
    id: `${String(whenAttackingEffect.id)}:second` as typeof whenAttackingEffect.id,
    effect: { type: "draw", count: 2, player: "self" },
  } satisfies EffectDefinition["effects"][number];
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [whenAttackingEffect, secondWhenAttackingEffect],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.state.effectQueue.map((entry) => entry.effectBlockId),
    [whenAttackingEffect.id, secondWhenAttackingEffect.id],
  );
  assert.deepEqual(
    result.events
      .filter((event) => event.type === "effectQueued")
      .map(
        (event) => (event.payload as { effectBlockId?: unknown }).effectBlockId,
      ),
    [whenAttackingEffect.id, secondWhenAttackingEffect.id],
  );
});

test("queues supported On Your Opponent's Attack effect from a multi-effect definition with unrelated supported effects", () => {
  const { state, definition } = opponentAttackQueueingState();
  const onOpponentAttackEffect = must(
    definition.effects[0],
    "onOpponentAttack effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-on-opponent-attack": {
      ...definition,
      effects: [
        onOpponentAttackEffect,
        {
          ...onOpponentAttackEffect,
          id: `${String(onOpponentAttackEffect.id)}:on-play` as typeof onOpponentAttackEffect.id,
          trigger: { type: "onPlay" },
        },
      ],
    },
  };

  const result = processDefenderOpponentAttackTiming(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  const queuedEvent = result.events.find(
    (event) => event.type === "effectQueued",
  );
  const payload = queuedEvent?.payload as
    | { effectBlockId?: unknown }
    | undefined;
  assert.equal(payload?.effectBlockId, onOpponentAttackEffect.id);
});

test("On Opponent Attack queueing ignores unsupported dormant On Play sibling", () => {
  const { state, definition } = opponentAttackQueueingState();
  const onOpponentAttackEffect = must(
    definition.effects[0],
    "onOpponentAttack effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-on-opponent-attack": {
      ...definition,
      effects: [
        onOpponentAttackEffect,
        {
          ...onOpponentAttackEffect,
          id: `${String(onOpponentAttackEffect.id)}:unsupported-on-play` as typeof onOpponentAttackEffect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = processDefenderOpponentAttackTiming(state);

  assert.equal(result.errors, undefined);
  const queuedEvent = result.events.find(
    (event) => event.type === "effectQueued",
  );
  const payload = queuedEvent?.payload as
    | { effectBlockId?: unknown }
    | undefined;
  assert.equal(payload?.effectBlockId, onOpponentAttackEffect.id);
});

test("queues every supported same-entrypoint On Your Opponent's Attack effect block", () => {
  const { state, definition } = opponentAttackQueueingState();
  const onOpponentAttackEffect = must(
    definition.effects[0],
    "onOpponentAttack effect",
  );
  const secondOnOpponentAttackEffect = {
    ...onOpponentAttackEffect,
    id: `${String(onOpponentAttackEffect.id)}:second` as typeof onOpponentAttackEffect.id,
    effect: { type: "draw", count: 2, player: "self" },
  } satisfies EffectDefinition["effects"][number];
  state.cardManifest.effectDefinitions = {
    "def-on-opponent-attack": {
      ...definition,
      effects: [onOpponentAttackEffect, secondOnOpponentAttackEffect],
    },
  };

  const result = processDefenderOpponentAttackTiming(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events
      .filter((event) => event.type === "effectQueued")
      .map(
        (event) => (event.payload as { effectBlockId?: unknown }).effectBlockId,
      ),
    [onOpponentAttackEffect.id, secondOnOpponentAttackEffect.id],
  );
});

test("queues On Your Opponent's Attack optional rest-DON target-rest sequence through generic auto support", () => {
  const { state, definition } = opponentAttackQueueingState();
  const onOpponentAttackEffect = must(
    definition.effects[0],
    "onOpponentAttack effect",
  );
  const restSequence: Extract<Effect, { type: "sequence" }> = {
    type: "sequence",
    effects: [
      {
        id: "optional-rest-don",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: { type: "restDon", count: 1, chooser: "self", optional: true },
        },
      },
      {
        id: "rest-opponent-leader-or-character",
        connector: "ifYouDo",
        effect: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { categories: ["leader", "character"] },
            },
          },
        },
      },
    ],
  };
  state.cardManifest.effectDefinitions = {
    "def-on-opponent-attack": {
      ...definition,
      effects: [{ ...onOpponentAttackEffect, effect: restSequence }],
    },
  };

  const result = processDefenderOpponentAttackTiming(state);

  assert.equal(result.errors, undefined);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
});

test("queues supported On Your Opponent's Attack effect from defender Stage source", () => {
  const { state } = opponentAttackQueueingState();
  const p2State = must(state.players[p2], "p2");
  const stage = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[0], "stage source"),
      cardId: toCardId("opponent-attack-stage-source"),
    },
    zone: "stageArea",
  });
  p2State.hand = p2State.hand.filter(
    (card) => card.instanceId !== stage.instanceId,
  );
  const existingDefinitions = state.cardManifest.effectDefinitions;
  const definition = setupOnOpponentAttackDefinition(
    state,
    stage,
    "def-on-opponent-attack-stage",
  );
  const effect = must(definition.effects[0], "stage opponent attack effect");
  state.cardManifest.effectDefinitions = {
    ...existingDefinitions,
    "def-on-opponent-attack-stage": {
      ...definition,
      effects: [
        {
          ...effect,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                saveResultAs: "paidCost",
                effect: {
                  type: "payCost",
                  cost: {
                    type: "sequence",
                    optional: true,
                    costs: [
                      { type: "restSelf" },
                      {
                        type: "trashFromHand",
                        count: 1,
                        chooser: "self",
                        filter: {
                          anyOf: [
                            { categories: ["event"] },
                            { categories: ["stage"] },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
              {
                connector: "ifYouDo",
                effect: {
                  type: "modifyPower",
                  target: {
                    type: "chooseFromZones",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "self",
                      zones: ["leaderArea", "characterArea"],
                      min: 0,
                      max: 1,
                      allowFewerIfUnavailable: true,
                      visibility: "public",
                      filter: { categories: ["leader", "character"] },
                    },
                  },
                  value: 2000,
                  duration: { type: "thisBattle" },
                },
              },
            ],
          },
        },
      ],
    },
  };
  state.cardManifest.cards[stage.cardId] = {
    ...resolvedCard({
      cardId: stage.cardId,
      category: "stage",
      support: must(state.cardManifest.cards[stage.cardId], "stage support")
        .support,
    }),
  };
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
  });

  const result = processDefenderOpponentAttackTiming(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "payCost");
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "effectQueued" &&
        String(
          (event.payload as { queueEntryId?: unknown }).queueEntryId,
        ).includes(String(stage.instanceId)) &&
        (event.payload as { effectBlockId?: unknown }).effectBlockId ===
          effect.id,
    ),
    true,
  );
});

test("unsupported same-entrypoint When Attacking effect fails closed beside a supported When Attacking effect", () => {
  const { state, definition } = attackQueueingState();
  const whenAttackingEffect = must(
    definition.effects[0],
    "whenAttacking effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        whenAttackingEffect,
        {
          ...whenAttackingEffect,
          id: `${String(whenAttackingEffect.id)}:unsupported` as typeof whenAttackingEffect.id,
          cost: { type: "restDon", count: 1 },
        },
        {
          ...whenAttackingEffect,
          id: `${String(whenAttackingEffect.id)}:on-play` as typeof whenAttackingEffect.id,
          trigger: { type: "onPlay" },
        },
      ],
    },
  };
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "when-attacking-trigger-queueing",
      details: { reason: "unsupported-when-attacking-definition" },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("unsupported same-entrypoint On Your Opponent's Attack effect fails closed beside a supported On Your Opponent's Attack effect", () => {
  const { state, definition } = opponentAttackQueueingState();
  const onOpponentAttackEffect = must(
    definition.effects[0],
    "onOpponentAttack effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-on-opponent-attack": {
      ...definition,
      effects: [
        onOpponentAttackEffect,
        {
          ...onOpponentAttackEffect,
          id: `${String(onOpponentAttackEffect.id)}:unsupported` as typeof onOpponentAttackEffect.id,
          cost: { type: "restDon", count: 1 },
        },
        {
          ...onOpponentAttackEffect,
          id: `${String(onOpponentAttackEffect.id)}:on-play` as typeof onOpponentAttackEffect.id,
          trigger: { type: "onPlay" },
        },
      ],
    },
  };
  const before = structuredClone(state);

  const result = processDefenderOpponentAttackTiming(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-opponent-attack-trigger-queueing",
      details: { reason: "unsupported-on-opponent-attack-definition" },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("conditioned When Attacking draw-then-trash sequence reaches decision-pausing path", () => {
  const { state, definition } = attackQueueingState();
  const effect = must(definition.effects[0], "whenAttacking effect");
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        {
          ...effect,
          condition: { type: "yourTurn" },
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
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };

  const first = processEffectRuntime(state);
  const second = processEffectRuntime(first.state);

  assert.equal(first.errors, undefined);
  assert.equal(second.errors, undefined);
  assert.equal(
    first.state.pendingDecision?.type === "selectCards" ||
      second.state.pendingDecision?.type === "selectCards",
    true,
  );
});

test("conditioned optional When Attacking draw queues and routes through chooseOptionalActivation unchanged", () => {
  const { state, definition } = attackQueueingState();
  const effect = must(definition.effects[0], "whenAttacking effect");
  state.turn.turnPlayerId = p1;
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        {
          ...effect,
          optional: true,
          condition: { type: "yourTurn" },
        } satisfies EffectDefinition["effects"][number],
      ],
    },
  };

  const queued = processEffectRuntime(state);
  const paused = processEffectRuntime(queued.state);

  assert.equal(queued.errors, undefined);
  assert.equal(paused.errors, undefined);
  assert.deepEqual(
    queued.events.map((event) => event.type),
    ["effectQueued"],
  );
  assert.deepEqual(
    paused.events.map((event) => event.type),
    ["decisionCreated"],
  );
  assert.equal(paused.state.pendingDecision?.type, "chooseOptionalActivation");
  assert.equal(paused.state.effectQueue.length, 1);
});

test("When Attacking reusable drawUpTo-then-trash sequence is supported through generic sequence path", () => {
  const { state, definition } = attackQueueingState();
  const effect = must(definition.effects[0], "whenAttacking effect");
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        {
          ...effect,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: { type: "drawUpTo", count: 2, player: "self" },
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

  const queued = processEffectRuntime(state);
  const paused = processEffectRuntime(queued.state);

  assert.equal(queued.errors, undefined);
  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "chooseQuantity");
});
