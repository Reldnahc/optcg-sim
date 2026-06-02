import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectQueueEntry, SourcePresencePolicy } from "./test-support.js";
import {
  hashCanonicalStateValue,
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  processEffectRuntime,
  toEffectId,
  toInstanceId,
  toQueueEntryId,
  toTimingWindowId,
  queueDrawForP1,
  withCardInZone,
  toSourceSnapshot,
  setupOnPlayDefinition,
  setupOnKODefinition,
} from "./test-support.js";

test("queued On K.O. draw with unsupported source-presence policy fails closed without mutation", () => {
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
  const onKOEffect = must(definition.effects[0], "onKO effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        {
          ...onKOEffect,
          sourcePresencePolicy: "noSourceRequired",
        },
      ],
    },
  };
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-on-ko-unsupported-policy"),
    timingWindowId: toTimingWindowId("timing-window-on-ko-unsupported-policy"),
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
    effectBlockId: onKOEffect.id,
    orderingGroup: "nonTurnPlayer",
    sourcePresencePolicy: "noSourceRequired",
  };
  state.effectQueue = [entry];
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
});

test("queued source-presence policy mismatch with effect definition fails closed without mutation or events", () => {
  const state = createActiveState();
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    sourcePresencePolicy: "noSourceRequired",
    source: {
      ...queueDrawForP1().source,
      instanceId: toInstanceId("not-live-for-policy-mismatch"),
    },
    sourceSnapshot: {
      ...queueDrawForP1().sourceSnapshot,
      instanceId: toInstanceId("not-live-for-policy-mismatch"),
    },
  };
  const supportCard = resolvedCard({
    cardId: entry.source.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    {
      ...must(state.players[p1], "p1").leader,
      cardId: entry.source.cardId,
    },
    reviewedOnPlayDrawDefinition(entry.source.cardId, supportCard.support),
    "def-policy-mismatch",
  );
  state.effectQueue = [entry];
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
  assert.deepEqual(result.state, before);
  assert.equal(hashCanonicalStateValue(result.state), beforeHash);
});

test("queued source-presence failure rejects without mutation or events", () => {
  const state = createActiveState();
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      source: {
        ...queueDrawForP1().source,
        instanceId: toInstanceId("missing-source"),
      },
      sourceSnapshot: {
        ...queueDrawForP1().sourceSnapshot,
        instanceId: toInstanceId("missing-source"),
      },
    },
  ];
  const before = structuredClone(state);

  const result = processEffectRuntime(state);
  const eventTypes = result.events.map((event) => event.type as string);

  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, before);
  assert.equal(eventTypes.includes("effectResolved"), false);
  assert.equal(eventTypes.includes("effectCancelled"), false);
  assert.equal(eventTypes.includes("effectCanceled"), false);
});

test("queued entries with centralized source-presence policies still fail closed for unsupported work", () => {
  const sourcePresencePolicies: SourcePresencePolicy[] = [
    "resolveFromDestinationZone",
    "resolveFromLastKnownInformation",
    "noSourceRequired",
  ];
  const cases: Array<{
    name: string;
    setup: (state: ReturnType<typeof createActiveState>) => EffectQueueEntry;
  }> = [
    {
      name: "missing effect definition",
      setup: (state) => {
        const entry = {
          ...queueDrawForP1(),
          sourcePresencePolicy: "noSourceRequired" as const,
          effectBlockId: toEffectId("missing-no-source-required-effect"),
        };
        state.cardManifest.effectDefinitionsVersion = "0.1.0";
        state.cardManifest.effectDefinitions = {};
        state.cardManifest.cards[entry.source.cardId] = resolvedCard({
          cardId: entry.source.cardId,
          category: "character",
          support: {
            status: "implemented-dsl",
            effectDefinitionId: "missing-no-source-required-definition",
            rulesVersion: "missing-no-source-required-rules",
            sourceTextHash: "missing-no-source-required-source",
          },
        });
        return entry;
      },
    },
    {
      name: "unsupported no-choice primitive",
      setup: (state) => {
        const entry = {
          ...queueDrawForP1(),
          sourcePresencePolicy: "noSourceRequired" as const,
        };
        const supportCard = resolvedCard({
          cardId: entry.source.cardId,
          category: "character",
        });
        const definition = reviewedOnPlayDrawDefinition(
          entry.source.cardId,
          supportCard.support,
        );
        setupOnPlayDefinition(
          state,
          {
            ...must(state.players[p1], "p1").leader,
            cardId: entry.source.cardId,
          },
          {
            ...definition,
            effects: [
              {
                ...must(definition.effects[0], "noSourceRequired effect"),
                effect: {
                  type: "choice",
                  chooser: "self",
                  options: [],
                  min: 0,
                  max: 0,
                },
              },
            ],
          },
          "def-no-source-required-unsupported-primitive",
        );
        return entry;
      },
    },
  ];

  for (const policy of sourcePresencePolicies) {
    for (const testCase of cases) {
      const state = createActiveState();
      state.effectQueue = [
        {
          ...testCase.setup(state),
          sourcePresencePolicy: policy,
        },
      ];
      const before = structuredClone(state);
      const beforeHash = hashCanonicalStateValue(state);
      const assertionLabel = `${policy}: ${testCase.name}`;

      const first = processEffectRuntime(state);
      const second = processEffectRuntime(structuredClone(before));

      assert.deepEqual(first.events, [], assertionLabel);
      assert.deepEqual(first.errors, [
        {
          type: "effectRuntimeError",
          effectId: "unsupported-effect-queue",
          details: {
            reason: "unsupported-pending-runtime-work",
            kind: "effectQueue",
            count: 1,
          },
        },
      ]);
      assert.deepEqual(first.events, second.events, assertionLabel);
      assert.deepEqual(first.errors, second.errors, assertionLabel);
      assert.deepEqual(first.state, before, assertionLabel);
      assert.equal(hashCanonicalStateValue(first.state), beforeHash);
    }
  }
});
