import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EffectId,
  InstanceId,
  QueueEntryId,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../../state/canonical-state.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../../action-test-fixtures.js";
import {
  buildSelectedTargetKoReplacementProcess,
  detectSupportedSelectedTargetKoReplacementCandidate,
  executeSelectedTargetEffectPrimitive,
} from "./execute.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const cardRefFor = (card: CardInstance, playerId: CardRef["playerId"]) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const continuousSourceSnapshot = (
  card: CardInstance,
  playerId: CardRef["playerId"],
): ContinuousEffectRecord["sourceSnapshot"] => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.owner,
  controllerId: playerId,
  zone: card.zone,
  category: card.zone.zone === "leaderArea" ? "leader" : "character",
  colors: ["red"],
  keywords: [],
  power: card.zone.zone === "leaderArea" ? 5000 : 3000,
});

const invalidateCardEffectsRecord = (
  state: ReturnType<typeof createActiveState>,
  target: CardInstance,
): ContinuousEffectRecord => {
  const source = must(state.players[p1], "p1").leader;
  return {
    id: `continuous:invalidate-card:${String(target.instanceId)}`,
    source: cardRefFor(source, p1),
    sourceSnapshot: continuousSourceSnapshot(source, p1),
    controller: p1,
    modifier: {
      layer: "effectInvalidation",
      target: {
        type: "exactCard",
        card: cardRefFor(target, target.controller),
        binding: {
          family: "selectedTargets",
          saveResultAs: "selected:negated-card",
        },
        createdAtStateSeq: state.seq,
      },
      operation: { type: "invalidateEffects" },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "test-negate-card" },
    createdAtStateSeq: state.seq,
  };
};

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
    timingWindowId: "window-ko-targets" as TimingWindowId,
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
    queuedAtStateSeq: state.seq,
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

test("targeted KO primitive builds deterministic replacement process for each selected public Character", () => {
  const { entry, refs } = setupKoPrimitiveState();
  const targetA = must(refs[0], "target A ref");
  const targetB = must(refs[1], "target B ref");

  const processes = [targetA, targetB].map((target, index) =>
    buildSelectedTargetKoReplacementProcess(entry, target, index),
  );

  for (const [index, process] of processes.entries()) {
    const target = must([targetA, targetB][index], "target");
    assert.equal(
      process.id,
      `${entry.id}:ko:${target.instanceId}:${String(index)}`,
    );
    assert.equal(process.type, "ko");
    assert.deepEqual(process.source, entry.source);
    assert.deepEqual(process.target, target);
    assert.deepEqual(process.causedBy, entry.causedBy);
    assert.deepEqual(process.usedReplacementIds, []);
    assert.deepEqual(process.payload, {
      effectId: entry.effectBlockId,
      queueEntryId: entry.id,
      source: entry.source,
      target,
      fieldRemovalAttempt: {
        processFamily: "fieldRemoval",
        classification: "moveFromFieldToTrash",
        sourceKind: "cardEffect",
        sourceCardId: entry.source.cardId,
        sourceControllerId: entry.controllerId,
      },
    });
  }
});

test("targeted KO primitive preserves no-replacement state hash through the replacement wrapper", () => {
  const { state, entry, refs } = setupKoPrimitiveState();

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [must(refs[0], "target A ref"), must(refs[1], "target B ref")],
  );

  assert.equal(
    result.stateHash,
    "1ad103ffab9997acb144cc2eabc6e6f851c4dd9d1cb1857dbea80acce5ee87db",
  );
});

const setupReviewedKoReplacementDefinition = (
  state: ReturnType<typeof createActiveState>,
  target: CardInstance,
  overrides: Partial<EffectDefinition["effects"][number]> = {},
  supportOverrides: Partial<ReturnType<typeof resolvedCard>["support"]> = {},
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: target.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-source-hash",
    behaviorHash: "replacement-behavior-hash",
    effectDefinitionId: `definition:${String(target.cardId)}`,
    ...supportOverrides,
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    support,
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: toEffectId("replacement:would-be-ko-draw-1"),
    category: "replacement",
    trigger: {
      type: "replacement",
      replacement: { type: "wouldBeKOd", target: { type: "self" } },
    },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when: { type: "wouldBeKOd", target: { type: "self" } },
      instead: { type: "draw", count: 1, player: "self" },
    },
    ...overrides,
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: target.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: support.sourceTextHash,
        rulesVersion: support.rulesVersion,
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-11T00:00:00.000Z",
      },
    },
  };
  return effectBlock;
};

const pauseForReplacementDecision = () => {
  const setup = setupKoPrimitiveState();
  const { state, entry, refs, targetA } = setup;
  const effectBlock = setupReviewedKoReplacementDefinition(state, targetA);
  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [must(refs[0], "target A ref")],
  );
  return { ...setup, effectBlock, result };
};

test("detects one reviewed optional would-be-KOd self replacement candidate for selected public Character", () => {
  const { state, entry, refs, targetA } = setupKoPrimitiveState();
  const effectBlock = setupReviewedKoReplacementDefinition(state, targetA);
  const process = buildSelectedTargetKoReplacementProcess(
    entry,
    must(refs[0], "target A ref"),
    0,
  );
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, {
    ok: true,
    candidate: {
      id: `${String(targetA.instanceId)}:${String(effectBlock.id)}`,
      effectBlockId: effectBlock.id,
      controllerId: p2,
      source: process.target,
      replacementEffect: effectBlock.effect,
    },
  });
  assert.deepEqual(state, before);
  assert.equal(hashCanonicalStateValue(state), beforeHash);
});

test("does not detect KO replacement candidates from negated source effects", () => {
  const { state, entry, refs, targetA } = setupKoPrimitiveState();
  setupReviewedKoReplacementDefinition(state, targetA);
  state.continuousEffects.push(invalidateCardEffectsRecord(state, targetA));
  const process = buildSelectedTargetKoReplacementProcess(
    entry,
    must(refs[0], "target A ref"),
    0,
  );

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, { ok: true });
});

test("detects mandatory would-be-KOd self replacement candidate as non-declinable", () => {
  const { state, entry, refs, targetA } = setupKoPrimitiveState();
  const effectBlock = setupReviewedKoReplacementDefinition(state, targetA, {
    optional: false,
  });
  const process = buildSelectedTargetKoReplacementProcess(
    entry,
    must(refs[0], "target A ref"),
    0,
  );

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, {
    ok: true,
    candidate: {
      id: `${String(targetA.instanceId)}:${String(effectBlock.id)}`,
      effectBlockId: effectBlock.id,
      controllerId: p2,
      mandatory: true,
      source: process.target,
      replacementEffect: effectBlock.effect,
    },
  });
});

test("targeted KO primitive pauses on a private chooseReplacement decision for supported optional KO replacement", () => {
  const { result, entry, effectBlock, refs, targetA } =
    pauseForReplacementDecision();
  const p2State = must(result.state.players[p2], "next p2");
  const replacementId = `${String(targetA.instanceId)}:${String(effectBlock.id)}`;
  const replacementSource = must(refs[0], "replacement source");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => [event.type, event.visibility]),
    [["decisionCreated", { type: "private", playerId: p2 }]],
  );
  assert.deepEqual(result.state.pendingDecision, {
    id: `decision:chooseReplacement:${String(entry.id)}:ko:${String(
      targetA.instanceId,
    )}:0`,
    type: "chooseReplacement",
    playerId: p2,
    prompt: "Choose replacement effect.",
    causedBy: entry.causedBy,
    visibility: { type: "private", playerId: p2 },
    decisionAnchorEventId: result.events[0]?.id,
    processId: `${String(entry.id)}:ko:${String(targetA.instanceId)}:0`,
    replacementIds: [replacementId],
    replacementOptions: [
      {
        replacementId,
        label: "Draw 1 card instead",
        source: replacementSource,
      },
    ],
    mandatory: false,
  });
  assert.deepEqual(result.decisions, [result.state.pendingDecision]);
  assert.equal(
    p2State.characters.some((card) => card.instanceId === targetA.instanceId),
    true,
  );
  assert.deepEqual(result.state.replacementState, [
    {
      processId: `${String(entry.id)}:ko:${String(targetA.instanceId)}:0`,
      type: "ko",
      usedReplacementIds: [],
      payload: {
        effectId: entry.effectBlockId,
        queueEntryId: entry.id,
        source: entry.source,
        target: {
          instanceId: targetA.instanceId,
          cardId: targetA.cardId,
          playerId: p2,
          zone: targetA.zone,
        },
        fieldRemovalAttempt: {
          processFamily: "fieldRemoval",
          classification: "moveFromFieldToTrash",
          sourceKind: "cardEffect",
          sourceCardId: entry.source.cardId,
          sourceControllerId: entry.controllerId,
        },
      },
    },
  ]);
});

test("does not return KO replacement candidate already used by the process", () => {
  const { state, entry, refs, targetA } = setupKoPrimitiveState();
  const effectBlock = setupReviewedKoReplacementDefinition(state, targetA);
  const process = {
    ...buildSelectedTargetKoReplacementProcess(
      entry,
      must(refs[0], "target A ref"),
      0,
    ),
    usedReplacementIds: [
      `${String(targetA.instanceId)}:${String(effectBlock.id)}`,
    ],
  };

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, { ok: true });
});

test("returns multiple applicable KO replacement candidates as distinct choices", () => {
  const { state, entry, refs, targetA } = setupKoPrimitiveState();
  const effectBlock = setupReviewedKoReplacementDefinition(state, targetA);
  const secondEffectBlock = {
    ...effectBlock,
    id: toEffectId("replacement:would-be-ko-draw-2"),
  };
  const definitionId = must(
    state.cardManifest.cards[targetA.cardId]?.support.effectDefinitionId,
    "definition id",
  );
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "definition",
  );
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      ...definition,
      effects: [effectBlock, secondEffectBlock],
    },
  };
  const process = buildSelectedTargetKoReplacementProcess(
    entry,
    must(refs[0], "target A ref"),
    0,
  );
  const before = structuredClone(state);

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, {
    ok: true,
    candidates: [
      {
        id: `${String(targetA.instanceId)}:${String(effectBlock.id)}`,
        effectBlockId: effectBlock.id,
        controllerId: p2,
        source: process.target,
        replacementEffect: effectBlock.effect,
      },
      {
        id: `${String(targetA.instanceId)}:${String(secondEffectBlock.id)}`,
        effectBlockId: secondEffectBlock.id,
        controllerId: p2,
        source: process.target,
        replacementEffect: secondEffectBlock.effect,
      },
    ],
  });
  assert.deepEqual(state, before);
});

test("fails closed without mutation for private selected KO replacement target", () => {
  const { state, entry } = setupKoPrimitiveState();
  const p2State = must(state.players[p2], "p2");
  const privateCard = must(p2State.hand[0], "private card");
  setupReviewedKoReplacementDefinition(state, privateCard);
  const process = buildSelectedTargetKoReplacementProcess(
    entry,
    {
      instanceId: privateCard.instanceId,
      cardId: privateCard.cardId,
      playerId: p2,
      zone: privateCard.zone,
    },
    0,
  );
  const before = structuredClone(state);

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, {
    ok: false,
    error: {
      type: "effectRuntimeError",
      effectId: entry.effectBlockId,
      details: { reason: "private-target" },
    },
  });
  assert.deepEqual(state, before);
});

test.each([
  {
    name: "custom handler",
    support: {
      status: "implemented-custom" as const,
      customHandlerIds: ["custom-ko-replacement"],
    },
    reason: "implemented-custom-status",
  },
  {
    name: "unsupported status",
    support: {
      status: "unsupported" as const,
    },
    reason: "unsupported-support-status",
  },
  {
    name: "vanilla custom handler",
    support: {
      status: "vanilla-confirmed" as const,
      customHandlerIds: ["custom-ko-replacement"],
    },
    reason: "unsupported-ko-replacement-shape",
  },
] satisfies {
  name: string;
  support: Partial<ReturnType<typeof resolvedCard>["support"]>;
  reason: string;
}[])(
  "fails closed without mutation for KO replacement support metadata with no definition id and $name",
  ({ support, reason }) => {
    const { state, entry, refs, targetA } = setupKoPrimitiveState();
    state.cardManifest.cards[targetA.cardId] = resolvedCard({
      cardId: targetA.cardId,
      category: "character",
      power: 3000,
      support,
    });
    const process = buildSelectedTargetKoReplacementProcess(
      entry,
      must(refs[0], "target A ref"),
      0,
    );
    const before = structuredClone(state);

    const detected = detectSupportedSelectedTargetKoReplacementCandidate(
      state,
      process,
    );

    assert.deepEqual(detected, {
      ok: false,
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason },
      },
    });
    assert.deepEqual(state, before);
  },
);

test("fails closed without mutation for KO replacement support metadata with custom handlers", () => {
  const { state, entry, refs, targetA } = setupKoPrimitiveState();
  setupReviewedKoReplacementDefinition(
    state,
    targetA,
    {},
    {
      customHandlerIds: ["custom-ko-replacement"],
    },
  );
  const process = buildSelectedTargetKoReplacementProcess(
    entry,
    must(refs[0], "target A ref"),
    0,
  );
  const before = structuredClone(state);

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, {
    ok: false,
    error: {
      type: "effectRuntimeError",
      effectId: entry.effectBlockId,
      details: { reason: "unsupported-ko-replacement-shape" },
    },
  });
  assert.deepEqual(state, before);
});

test.each([
  {
    name: "wrong replacement trigger",
    overrides: {
      trigger: {
        type: "replacement",
        replacement: { type: "wouldTakeDamage", target: { type: "self" } },
      },
    },
  },
  {
    name: "non-self target",
    overrides: {
      trigger: {
        type: "replacement",
        replacement: { type: "wouldBeKOd", target: { type: "myLeader" } },
      },
    },
  },
  {
    name: "unsupported condition",
    overrides: { condition: { type: "custom", check: "unsupported" } },
  },
  {
    name: "cost",
    overrides: { cost: { type: "restSelf" } },
  },
] satisfies {
  name: string;
  overrides: Partial<EffectDefinition["effects"][number]>;
}[])(
  "fails closed without mutation for unsupported KO replacement $name shape",
  ({ overrides }) => {
    const { state, entry, refs, targetA } = setupKoPrimitiveState();
    setupReviewedKoReplacementDefinition(state, targetA, overrides);
    const process = buildSelectedTargetKoReplacementProcess(
      entry,
      must(refs[0], "target A ref"),
      0,
    );
    const before = structuredClone(state);

    const detected = detectSupportedSelectedTargetKoReplacementCandidate(
      state,
      process,
    );

    assert.deepEqual(detected, {
      ok: false,
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "unsupported-ko-replacement-shape" },
      },
    });
    assert.deepEqual(state, before);
  },
);

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
