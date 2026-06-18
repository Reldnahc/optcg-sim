import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  TargetRequest,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  reviewedMainEventDrawDefinition,
  toEngineEventId,
} from "../../action-test-fixtures.js";
import { processEffectRuntime } from "../../effect-runtime.js";

const reviewedMainEventTargetKoRequest = (
  overrides: Partial<TargetRequest> = {},
): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 0,
  max: 1,
  allowFewerIfUnavailable: true,
  visibility: "public",
  ...overrides,
});

const reviewedMainEventTargetKoDefinition = (
  cardId: EffectDefinition["cardId"],
  support: ReturnType<typeof resolvedCard>["support"],
  request: TargetRequest = reviewedMainEventTargetKoRequest(),
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "OP01-040:event-main-ko-1" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger: { type: "main" },
      sourcePresencePolicy: "resolveFromDestinationZone",
      effect: { type: "ko", target: { type: "choose", request } },
    },
  ],
  metadata: {
    sourceTextHash: support.sourceTextHash,
    rulesVersion: support.rulesVersion,
    effectDefinitionsVersion: "0.1.0",
    tested: true,
    reviewer: "qa-reviewer",
  },
});

const reviewedMainEventDrawUpToDefinition = (
  cardId: EffectDefinition["cardId"],
  support: ReturnType<typeof resolvedCard>["support"],
  count = 2,
): EffectDefinition => {
  const base = reviewedMainEventDrawDefinition(cardId, support);
  return {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        effect: { type: "drawUpTo", count, player: "self" },
      },
    ],
  };
};

const setupMainEventQueueingState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "event source");
  const eventInTrash: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
  };
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p1State.trash = [eventInTrash];

  const implemented = resolvedCard({
    cardId: eventInTrash.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-draw",
    },
  });
  state.cardManifest.cards[eventInTrash.cardId] = implemented;
  state.cardManifest.effectDefinitions = {
    "def-main-event-draw": reviewedMainEventDrawDefinition(
      implemented.cardId,
      implemented.support,
    ),
  };
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventInTrash.instanceId,
      cardId: eventInTrash.cardId,
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "turnFlow" },
    createdAtStateSeq: state.seq,
  });
  return { state, eventInTrash };
};

test("queues one supported no-choice Main Event draw effect from an Event cardPlayed event in trash", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queue entry");
  assert.equal(entry.controllerId, p1);
  assert.equal(entry.source.instanceId, eventInTrash.instanceId);
  assert.deepEqual(entry.source.zone, eventInTrash.zone);
  assert.equal(entry.sourcePresencePolicy, "resolveFromDestinationZone");
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued"],
  );
});

test("queues supported Main Event effect from a multi-effect definition with unrelated supported effects", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-main-event-draw"],
    "main event definition",
  );
  const mainEffect = must(definition.effects[0], "main effect");
  state.cardManifest.effectDefinitions = {
    "def-main-event-draw": {
      ...definition,
      effects: [
        mainEffect,
        {
          ...mainEffect,
          id: `${String(mainEffect.id)}:on-play` as typeof mainEffect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queue entry");
  assert.equal(entry.source.instanceId, eventInTrash.instanceId);
  assert.equal(entry.effectBlockId, mainEffect.id);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued"],
  );
});

test("queues every supported same-entrypoint Main Event effect block", () => {
  const { state } = setupMainEventQueueingState();
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-main-event-draw"],
    "main event definition",
  );
  const mainEffect = must(definition.effects[0], "main effect");
  state.cardManifest.effectDefinitions = {
    "def-main-event-draw": {
      ...definition,
      effects: [
        mainEffect,
        {
          ...mainEffect,
          id: `${String(mainEffect.id)}:second` as typeof mainEffect.id,
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.state.effectQueue.map((entry) => entry.effectBlockId),
    [mainEffect.id, `${String(mainEffect.id)}:second`],
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued", "effectQueued"],
  );
});

test("unsupported same-entrypoint Main Event effect fails closed beside a supported Main Event effect", () => {
  const { state } = setupMainEventQueueingState();
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-main-event-draw"],
    "main event definition",
  );
  const mainEffect = must(definition.effects[0], "main effect");
  state.cardManifest.effectDefinitions = {
    "def-main-event-draw": {
      ...definition,
      effects: [
        mainEffect,
        {
          ...mainEffect,
          id: `${String(mainEffect.id)}:unsupported` as typeof mainEffect.id,
          cost: { type: "restDon", count: 1 },
        },
        {
          ...mainEffect,
          id: `${String(mainEffect.id)}:on-play` as typeof mainEffect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
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
      effectId: "main-event-trigger-queueing",
      details: { reason: "unsupported-main-event-definition" },
    },
  ]);
  assert.deepEqual(result.state, before);
});

test("queues one supported reviewed target KO Main Event from an Event cardPlayed event in trash", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();
  const implemented = resolvedCard({
    cardId: eventInTrash.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] K.O. up to 1 of your opponent's Characters.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-ko",
    },
  });
  state.cardManifest.cards[eventInTrash.cardId] = implemented;
  state.cardManifest.effectDefinitions = {
    "def-main-event-ko": reviewedMainEventTargetKoDefinition(
      implemented.cardId,
      implemented.support,
    ),
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queue entry");
  assert.equal(entry.controllerId, p1);
  assert.equal(entry.source.instanceId, eventInTrash.instanceId);
  assert.deepEqual(entry.source.zone, eventInTrash.zone);
  assert.equal(entry.sourcePresencePolicy, "resolveFromDestinationZone");
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued"],
  );
});

test("Main Event queueing fails closed for unsupported target KO request shapes", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();
  const implemented = resolvedCard({
    cardId: eventInTrash.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] K.O. up to 1 of your opponent's Characters.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-private-ko",
    },
  });
  state.cardManifest.cards[eventInTrash.cardId] = implemented;
  state.cardManifest.effectDefinitions = {
    "def-main-event-private-ko": reviewedMainEventTargetKoDefinition(
      implemented.cardId,
      implemented.support,
      reviewedMainEventTargetKoRequest({ visibility: "privateToChooser" }),
    ),
  };

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "main-event-trigger-queueing",
      details: { reason: "unsupported-main-event-definition" },
    },
  ]);
  assert.equal(result.state.effectQueue.length, 0);
});

test("Main Event queueing accepts optional drawUpTo through the reusable body gate", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();
  const implemented = resolvedCard({
    cardId: eventInTrash.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] You may draw up to 2 cards.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-optional-main-event-draw-upto",
    },
  });
  state.cardManifest.cards[eventInTrash.cardId] = implemented;
  const base = reviewedMainEventDrawUpToDefinition(
    implemented.cardId,
    implemented.support,
  );
  const effect = must(base.effects[0], "effect");
  state.cardManifest.effectDefinitions = {
    "def-optional-main-event-draw-upto": {
      ...base,
      effects: [{ ...effect, optional: true }],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued"],
  );
  const entry = must(result.state.effectQueue[0], "queue entry");
  assert.equal(entry.effectBlockId, effect.id);
  assert.equal(entry.sourcePresencePolicy, "resolveFromDestinationZone");
});

test("Main Event queueing fails closed for cost-bearing and malformed drawUpTo shapes", () => {
  const cases: Array<{
    name: string;
    mutate: (base: EffectDefinition) => EffectDefinition;
  }> = [
    {
      name: "cost-bearing-draw-upto",
      mutate: (base) => ({
        ...base,
        effects: [
          {
            ...must(base.effects[0], "effect"),
            cost: { type: "restDon", count: 1 },
          },
        ],
      }),
    },
    {
      name: "malformed-negative-count-draw-upto",
      mutate: (base) => ({
        ...base,
        effects: [
          {
            ...must(base.effects[0], "effect"),
            effect: { type: "drawUpTo", count: -1, player: "self" },
          },
        ],
      }),
    },
  ];

  for (const testCase of cases) {
    const { state, eventInTrash } = setupMainEventQueueingState();
    const implemented = resolvedCard({
      cardId: eventInTrash.cardId,
      category: "event",
      cost: 1,
      effectText: "[Main] Draw up to 2 cards.",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: `def-${testCase.name}`,
      },
    });
    state.cardManifest.cards[eventInTrash.cardId] = implemented;
    const base = reviewedMainEventDrawUpToDefinition(
      implemented.cardId,
      implemented.support,
    );
    state.cardManifest.effectDefinitions = {
      [`def-${testCase.name}`]: testCase.mutate(base),
    };

    const result = processEffectRuntime(state);

    assert.deepEqual(result.events, [], testCase.name);
    assert.deepEqual(
      result.errors,
      [
        {
          type: "effectRuntimeError",
          effectId: "main-event-trigger-queueing",
          details: { reason: "unsupported-main-event-definition" },
        },
      ],
      testCase.name,
    );
    assert.equal(result.state.effectQueue.length, 0, testCase.name);
  }
});

test("Main Event queueing fails closed when the played Event source is no longer in trash", () => {
  const { state } = setupMainEventQueueingState();
  const p1State = must(state.players[p1], "p1");
  p1State.trash = [];

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "main-event-trigger-queueing",
      details: { reason: "source-presence-failed" },
    },
  ]);
  assert.equal(result.state.effectQueue.length, 0);
});

test("Main Event queueing fails closed when the trash source no longer matches the cardPlayed payload", () => {
  const { state, eventInTrash } = setupMainEventQueueingState();
  const p1State = must(state.players[p1], "p1");
  p1State.trash = [
    {
      ...eventInTrash,
      cardId: must(p1State.hand[0], "replacement card").cardId,
    },
  ];

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "main-event-trigger-queueing",
      details: { reason: "source-presence-failed" },
    },
  ]);
  assert.equal(result.state.effectQueue.length, 0);
});

test("Main Event reusable draw-then-trash sequence queues and reaches sequence decision flow", () => {
  const { state } = setupMainEventQueueingState();
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-main-event-draw"],
    "main event definition",
  );
  const mainEffect = must(definition.effects[0], "main effect");
  state.cardManifest.effectDefinitions = {
    "def-main-event-draw": {
      ...definition,
      effects: [
        {
          ...mainEffect,
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

  const queued = processEffectRuntime(state);
  const paused = processEffectRuntime(queued.state);

  assert.equal(queued.errors, undefined);
  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.pendingDecision?.type, "selectCards");
});
