import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  EffectId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../../action-test-fixtures.js";
import {
  isSupportedNoChoiceOnPlayDrawEffect,
  processEffectRuntime,
} from "../../effect-runtime.js";
import {
  appendCardPlayedEvent,
  expectOnPlayQueueingFailure,
  queueingState,
  setupOnPlayDefinition,
  withCardInZone,
} from "./test-support.js";

const toCardId = (value: string): CardId => value as CardId;

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
    expectedReason:
      | "unsupported-on-play-definition"
      | "multiple-on-play-effects";
    definition: (d: EffectDefinition) => EffectDefinition;
  }> = [
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

test("conditioned On Play draw shape queues without fail-closed rejection", () => {
  const { state, played } = queueingState();
  state.turn.turnPlayerId = p1;
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
    {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "onPlay effect"),
          condition: { type: "yourTurn" },
        },
      ],
    },
    "def-conditioned-on-play-supported",
  );

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
  assert.equal(result.state.effectQueue.length, 1);
});

test("conditioned On Play drawUpTo shape queues and reaches quantity decision processing", () => {
  const { state, played } = queueingState();
  state.turn.turnPlayerId = p1;
  const baseCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    played.cardId,
    baseCard.support,
  );
  const baseEffect = must(baseDefinition.effects[0], "onPlay effect");
  setupOnPlayDefinition(
    state,
    played,
    {
      ...baseDefinition,
      effects: [
        {
          ...baseEffect,
          effect: { type: "drawUpTo", count: 1, player: "self" },
          condition: { type: "yourTurn" },
        },
      ],
    },
    "def-conditioned-on-play-draw-up-to",
  );

  const queued = processEffectRuntime(state);
  const resolved = processEffectRuntime(queued.state);

  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision?.type, "chooseQuantity");
});

test("optional On Play draw support gate queues for optional activation", () => {
  const { state, played } = queueingState();
  const baseCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    played.cardId,
    baseCard.support,
  );
  const optionalEffect = {
    ...must(baseDefinition.effects[0], "onPlay effect"),
    optional: true,
  };
  setupOnPlayDefinition(
    state,
    played,
    {
      ...baseDefinition,
      effects: [optionalEffect],
    },
    "def-optional-on-play-supported",
  );

  const result = processEffectRuntime(state);

  assert.equal(isSupportedNoChoiceOnPlayDrawEffect(optionalEffect), false);
  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued"],
  );
  assert.equal(result.state.effectQueue.length, 1);
});

test("conditioned optional On Play draw support queues and routes through chooseOptionalActivation unchanged", () => {
  const { state, played } = queueingState();
  state.turn.turnPlayerId = p1;
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
    {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "onPlay effect"),
          optional: true,
          condition: { type: "yourTurn" },
        },
      ],
    },
    "def-conditioned-optional-on-play",
  );

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
