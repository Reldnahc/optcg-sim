import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EffectId,
  InstanceId,
  QueueEntryId,
  StateSeq,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import { executeSelectedTargetEffectPrimitive } from "./effect-runtime-primitives.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const publicCharacterRequest = (
  overrides: Partial<TargetRequest> = {},
): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 1,
  max: 2,
  allowFewerIfUnavailable: false,
  visibility: "public",
  ...overrides,
});

const koChooseEffect = (
  overrides: Partial<Extract<Effect, { type: "ko" }>> = {},
): Extract<Effect, { type: "ko" }> => ({
  type: "ko",
  target: { type: "choose", request: publicCharacterRequest() },
  ...overrides,
});

const setupKoPrimitiveState = () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.hand[0], "source");
  const targetAHand = must(p2State.hand[0], "target A hand");
  const targetBHand = must(p2State.hand[1], "target B hand");
  const survivorHand = must(p2State.hand[2], "survivor hand");
  const don = must(p2State.donDeck[0], "p2 don");

  const sourceOnField: CardInstance = {
    ...source,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  p1State.characters = [sourceOnField];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

  const targetA: CardInstance = {
    ...targetAHand,
    cardId: toCardId("ko-target-a"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "rested",
    attachedDon: [don.instanceId],
    turnPlayed: state.turn.globalTurn,
  };
  const targetB: CardInstance = {
    ...targetBHand,
    cardId: toCardId("ko-target-b"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  const survivor: CardInstance = {
    ...survivorHand,
    cardId: toCardId("ko-survivor"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 2 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };

  p2State.characters = [targetA, targetB, survivor];
  p2State.hand = p2State.hand.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  p2State.donDeck = p2State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  p2State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
      state: "active",
    },
  ];

  state.cardManifest.cards[sourceOnField.cardId] = resolvedCard({
    cardId: sourceOnField.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[targetA.cardId] = resolvedCard({
    cardId: targetA.cardId,
    category: "character",
    power: 3000,
  });
  state.cardManifest.cards[targetB.cardId] = resolvedCard({
    cardId: targetB.cardId,
    category: "character",
    power: 4000,
  });
  state.cardManifest.cards[survivor.cardId] = resolvedCard({
    cardId: survivor.cardId,
    category: "character",
    power: 2000,
  });

  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-ko-targets"),
    state: "pending",
    timingWindowId: toTimingWindowId("window-ko-targets"),
    generation: 0,
    controllerId: p1,
    source: {
      instanceId: sourceOnField.instanceId,
      cardId: sourceOnField.cardId,
      playerId: p1,
      zone: sourceOnField.zone,
    },
    sourceSnapshot: {
      instanceId: sourceOnField.instanceId,
      cardId: sourceOnField.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: sourceOnField.zone,
      category: "character",
      colors: ["red"],
      keywords: [],
      power: 5000,
    },
    effectBlockId: toEffectId("ko-targets-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(state.seq),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "ko-target-test" },
  };

  const refs = [targetA, targetB, survivor].map(
    (card): CardRef => ({
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: p2,
      zone: card.zone,
    }),
  );

  return { state, entry, refs, targetA, targetB, survivor, don };
};

type KoPrimitiveFailureCase = {
  name: string;
  effect: Effect;
  reason: string;
  targets?: (refs: readonly CardRef[]) => readonly CardRef[];
  prepare?: (state: ReturnType<typeof createActiveState>) => readonly CardRef[];
  mutate?: (setup: ReturnType<typeof setupKoPrimitiveState>) => void;
};

test("targeted KO primitive moves selected public Characters to trash with deterministic events and reindexing", () => {
  const { state, entry, refs, targetA, targetB, survivor, don } =
    setupKoPrimitiveState();

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [must(refs[0], "target A ref"), must(refs[1], "target B ref")],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardKOd", "cardMoved", "donReturned", "cardKOd", "cardMoved"],
  );
  assert.equal(nextP2.characters.length, 1);
  assert.equal(
    must(nextP2.characters[0], "survivor").instanceId,
    survivor.instanceId,
  );
  assert.deepEqual(must(nextP2.characters[0], "survivor").zone, {
    zone: "characterArea",
    playerId: p2,
    slot: "character",
    index: 0,
  });
  assert.deepEqual(
    nextP2.trash.map((card) => card.instanceId),
    [targetB.instanceId, targetA.instanceId],
  );
  assert.equal(
    nextP2.costArea.find((card) => card.instanceId === don.instanceId)?.state,
    "rested",
  );
  assert.deepEqual(result.events[0]?.payload, {
    playerId: p2,
    instanceId: targetA.instanceId,
  });
  assert.deepEqual(result.events[1]?.payload, {
    instanceId: targetA.instanceId,
    cardId: targetA.cardId,
    from: targetA.zone,
    to: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
    reason: "ko",
  });
  assert.deepEqual(result.events[2]?.payload, {
    playerId: p2,
    donInstanceId: don.instanceId,
    state: "rested",
  });
  assert.deepEqual(result.events[3]?.payload, {
    playerId: p2,
    instanceId: targetB.instanceId,
  });
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test.each<KoPrimitiveFailureCase>([
  {
    name: "unsupported effect shape",
    effect: { type: "draw", count: 1, player: "self" },
    targets: (refs: readonly CardRef[]) => [must(refs[0], "target")],
    reason: "unsupported-effect-shape",
  },
  {
    name: "unsupported target shape",
    effect: { type: "ko", target: { type: "self" } },
    targets: (refs: readonly CardRef[]) => [must(refs[0], "target")],
    reason: "unsupported-target-shape",
  },
  {
    name: "duplicate targets",
    effect: koChooseEffect(),
    targets: (refs: readonly CardRef[]) => [
      must(refs[0], "target"),
      must(refs[0], "duplicate target"),
    ],
    reason: "duplicate-targets",
  },
  {
    name: "empty selection below minimum",
    effect: koChooseEffect({
      target: { type: "choose", request: publicCharacterRequest({ min: 1 }) },
    }),
    targets: () => [],
    reason: "selected-target-count-below-minimum",
  },
  {
    name: "stale target",
    effect: koChooseEffect(),
    targets: (refs: readonly CardRef[]) => [
      {
        ...must(refs[1], "stale ref"),
        zone: {
          zone: "characterArea",
          playerId: p2,
          slot: "character",
          index: 99,
        },
      },
    ],
    reason: "stale-target",
  },
  {
    name: "private target",
    effect: koChooseEffect(),
    prepare: (state: ReturnType<typeof createActiveState>) => {
      const card = must(state.players[p2], "p2").hand[0];
      return [
        {
          instanceId: must(card, "private card").instanceId,
          cardId: must(card, "private card").cardId,
          playerId: p2,
          zone: must(card, "private card").zone,
        },
      ];
    },
    reason: "private-target",
  },
  {
    name: "missing card metadata",
    effect: koChooseEffect(),
    mutate: ({
      state,
      refs,
    }: {
      state: ReturnType<typeof createActiveState>;
      refs: readonly CardRef[];
    }) => {
      Reflect.deleteProperty(
        state.cardManifest.cards,
        must(refs[0], "target").cardId,
      );
    },
    targets: (refs: readonly CardRef[]) => [must(refs[0], "target")],
    reason: "missing-card",
  },
  {
    name: "missing card instance",
    effect: koChooseEffect(),
    targets: (refs: readonly CardRef[]) => [
      {
        ...must(refs[0], "target"),
        instanceId: toInstanceId("missing-instance"),
      },
    ],
    reason: "missing-card",
  },
  {
    name: "non-Character target",
    effect: koChooseEffect(),
    prepare: (state: ReturnType<typeof createActiveState>) => {
      const leader = must(state.players[p2], "p2").leader;
      state.cardManifest.cards[leader.cardId] = resolvedCard({
        cardId: leader.cardId,
        category: "leader",
        power: 5000,
      });
      return [
        {
          instanceId: leader.instanceId,
          cardId: leader.cardId,
          playerId: p2,
          zone: leader.zone,
        },
      ];
    },
    reason: "non-character-target",
  },
  {
    name: "non-Character manifest metadata",
    effect: koChooseEffect(),
    mutate: ({
      state,
      refs,
    }: {
      state: ReturnType<typeof createActiveState>;
      refs: readonly CardRef[];
    }) => {
      state.cardManifest.cards[must(refs[0], "target").cardId] = resolvedCard({
        cardId: must(refs[0], "target").cardId,
        category: "stage",
      });
    },
    targets: (refs: readonly CardRef[]) => [must(refs[0], "target")],
    reason: "non-character-target",
  },
])(
  "targeted KO primitive fails closed for $name without mutating state",
  ({ effect, targets, reason, mutate, prepare }) => {
    const setup = setupKoPrimitiveState();
    const { state, entry, refs } = setup;
    const selectedTargets =
      prepare !== undefined ? prepare(state) : must(targets, "targets")(refs);
    mutate?.(setup);
    const before = structuredClone(state);
    const beforeHash = hashCanonicalStateValue(state);

    const result = executeSelectedTargetEffectPrimitive(
      state,
      entry,
      effect,
      selectedTargets,
    );

    assert.deepEqual(result.events, []);
    assert.deepEqual(result.state, before);
    assert.equal(hashCanonicalStateValue(result.state), beforeHash);
    assert.deepEqual(result.errors, [
      {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason },
      },
    ]);
  },
);
