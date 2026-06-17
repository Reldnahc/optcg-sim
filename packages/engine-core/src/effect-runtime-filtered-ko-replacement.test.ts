import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  Effect,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  PlayerId,
  QueueEntryId,
  TimingWindowId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import {
  buildKoReplacementProcess,
  buildSelectedTargetKoReplacementProcess,
  buildSelectedTargetMoveZoneReplacementProcess,
  detectSupportedSelectedTargetKoReplacementCandidate,
} from "./runtime/primitives/execute.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const setupFilteredKoReplacementState = () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.hand[0], "effect source");
  const targetHandCard = must(p2State.hand[0], "replacement target");
  const replacementSourceHandCard = must(p2State.hand[1], "replacement source");

  const sourceOnField: CardInstance = {
    ...source,
    cardId: toCardId("ko-effect-source"),
    instanceId: toInstanceId("ko-effect-source-instance"),
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  const target: CardInstance = {
    ...targetHandCard,
    cardId: toCardId("slash-target"),
    instanceId: toInstanceId("slash-target-instance"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  const replacementSource: CardInstance = {
    ...replacementSourceHandCard,
    cardId: toCardId("slash-replacement-source"),
    instanceId: toInstanceId("slash-replacement-source-instance"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };

  p1State.characters = [sourceOnField];
  p1State.hand = [];
  p2State.characters = [target, replacementSource];
  p2State.hand = [];

  state.cardManifest.cards[sourceOnField.cardId] = resolvedCard({
    cardId: sourceOnField.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[target.cardId] = {
    ...resolvedCard({
      cardId: target.cardId,
      category: "character",
      cost: 5,
      power: 3000,
    }),
    attributes: ["slash"],
  };
  const effectBlock = setupReviewedFilteredKoRestSelfReplacementDefinition(
    state,
    replacementSource,
  );

  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-filtered-ko"),
    state: "pending",
    timingWindowId: "window-filtered-ko" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(sourceOnField, p1),
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
    effectBlockId: toEffectId("filtered-ko-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "filtered-ko-test" },
  };

  return {
    effectBlock,
    entry,
    replacementSource,
    state,
    target,
  };
};

const setupReviewedFilteredKoRestSelfReplacementDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: source.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "filtered-ko-replacement-source-hash",
    behaviorHash: "filtered-ko-replacement-behavior-hash",
    effectDefinitionId: `definition:${String(source.cardId)}`,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 2000,
    support,
  });
  const when: Extract<Effect, { type: "replacement" }>["when"] = {
    type: "wouldBeKOd",
    sourceKind: "cardEffect",
    target: {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        attributesAny: ["slash"],
        categories: ["character"],
        cost: { max: 5 },
        excludeSelf: true,
      },
    },
  };
  const effectBlock: EffectDefinition["effects"][number] = {
    id: toEffectId("replacement:filtered-ko-rest-self"),
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: { type: "rest", target: { type: "self" } },
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: source.cardId,
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

const setupReviewedTypedKoTrashFromHandReplacementDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition["effects"][number] => {
  const support = must(
    state.cardManifest.cards[source.cardId]?.support,
    "replacement source support",
  );
  const when: Extract<Effect, { type: "replacement" }>["when"] = {
    type: "wouldBeKOd",
    sourceControllerRelation: "any",
    target: {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        typesAny: ["Red-Haired Pirates"],
      },
    },
  };
  const effectBlock: EffectDefinition["effects"][number] = {
    id: toEffectId("replacement:typed-ko-trash-from-hand"),
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    oncePerTurn: true,
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
        filter: {
          categories: ["character"],
          power: { min: 6000 },
        },
      },
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [must(support.effectDefinitionId, "definition id")]: {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: must(support.sourceTextHash, "source text hash"),
        rulesVersion: must(support.rulesVersion, "rules version"),
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-06-16T00:00:00.000Z",
      },
    },
  };
  return effectBlock;
};

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

test("detects temporary battle K.O. replacement records through the shared replacement path", () => {
  const { state, entry, target } = setupFilteredKoReplacementState();
  state.cardManifest.cards[must(state.players[p1], "p1").leader.cardId] =
    resolvedCard({
      cardId: must(state.players[p1], "p1").leader.cardId,
      category: "leader",
      power: 5000,
    });
  state.cardManifest.cards[must(state.players[p2], "p2").leader.cardId] =
    resolvedCard({
      cardId: must(state.players[p2], "p2").leader.cardId,
      category: "leader",
      power: 5000,
    });
  const p2State = must(state.players[p2], "p2");
  p2State.characters = [target];
  p2State.hand = [
    {
      ...must(p2State.deck[0], "temporary replacement cost card"),
      instanceId: toInstanceId("temporary-replacement-cost-instance"),
      cardId: toCardId("temporary-replacement-cost-card"),
      zone: { zone: "hand", playerId: p2, slot: "hand", index: 0 },
    },
  ];
  state.cardManifest.cards[toCardId("temporary-replacement-cost-card")] =
    resolvedCard({
      cardId: toCardId("temporary-replacement-cost-card"),
      category: "character",
    });
  const eventSource: CardInstance = {
    ...must(p2State.deck[0], "temporary replacement source"),
    cardId: toCardId("temporary-replacement-event"),
    instanceId: toInstanceId("temporary-replacement-event-instance"),
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
    controller: p2,
  };
  p2State.trash = [eventSource];
  state.cardManifest.cards[eventSource.cardId] = resolvedCard({
    cardId: eventSource.cardId,
    category: "event",
  });
  const replacement: Extract<Effect, { type: "replacement" }> = {
    type: "replacement",
    when: {
      type: "wouldBeKOd",
      sourceKind: "battle",
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: { categories: ["character"] },
      },
    },
    instead: {
      type: "trashFromHand",
      player: "self",
      chooser: "self",
      count: 1,
    },
  };
  const record: ContinuousEffectRecord = {
    id: "temporary-replacement-record",
    source: cardRef(eventSource, p2),
    sourceSnapshot: {
      instanceId: eventSource.instanceId,
      cardId: eventSource.cardId,
      ownerId: p2,
      controllerId: p2,
      zone: eventSource.zone,
      category: "event",
      colors: ["blue"],
      keywords: [],
    },
    controller: p2,
    modifier: {
      layer: "replacement",
      target: { type: "player", player: "self" },
      operation: { type: "replacement", replacement },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "temporary-replacement-test" },
    createdAtStateSeq: state.seq,
  };
  state.continuousEffects = [record];
  const process = buildKoReplacementProcess({
    effectId: entry.effectBlockId,
    id: "temporary-battle-ko-process",
    queueEntryId: entry.id,
    source: entry.source,
    target: cardRef(target, p2),
    causedBy: entry.causedBy,
    sourceKind: "battle",
    sourceControllerId: p1,
  });

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, {
    ok: true,
    candidate: {
      id: "temporary:temporary-replacement-record",
      effectBlockId: "temporary-replacement-record",
      controllerId: p2,
      source: cardRef(eventSource, p2),
      replacementEffect: replacement,
    },
  });
});

test("detects opponent-effect K.O.-only rest-self replacement through reusable target filters", () => {
  const { state, entry, target, replacementSource, effectBlock } =
    setupFilteredKoReplacementState();
  const process = buildSelectedTargetKoReplacementProcess(
    entry,
    cardRef(target, p2),
    0,
  );

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, {
    ok: true,
    candidate: {
      id: `${String(replacementSource.instanceId)}:${String(effectBlock.id)}`,
      effectBlockId: effectBlock.id,
      controllerId: p2,
      source: cardRef(replacementSource, p2),
      replacementEffect: effectBlock.effect,
    },
  });
});

test("does not apply opponent-effect K.O.-only rest-self replacement to battle K.O. or the source itself", () => {
  const { state, entry, target, replacementSource } =
    setupFilteredKoReplacementState();
  state.cardManifest.cards[replacementSource.cardId] = {
    ...must(
      state.cardManifest.cards[replacementSource.cardId],
      "replacement source metadata",
    ),
    attributes: ["slash"],
    cost: 5,
  };
  const battleProcess = buildKoReplacementProcess({
    effectId: entry.effectBlockId,
    id: "battle-ko:filtered-replacement",
    source: entry.source,
    target: cardRef(target, p2),
    causedBy: entry.causedBy,
    sourceKind: "battle",
    sourceControllerId: entry.controllerId,
  });
  const selfProcess = buildSelectedTargetKoReplacementProcess(
    entry,
    cardRef(replacementSource, p2),
    0,
  );

  assert.deepEqual(
    detectSupportedSelectedTargetKoReplacementCandidate(state, battleProcess),
    { ok: true },
  );
  assert.deepEqual(
    detectSupportedSelectedTargetKoReplacementCandidate(state, selfProcess),
    { ok: true },
  );
});

test("detects typed K.O. trash-from-hand replacement for K.O. processes", () => {
  const { state, entry, target, replacementSource } =
    setupFilteredKoReplacementState();
  const p2State = must(state.players[p2], "p2");
  const costCard: CardInstance = {
    ...target,
    cardId: toCardId("red-haired-trash-cost"),
    instanceId: toInstanceId("red-haired-trash-cost-instance"),
    zone: { zone: "hand", playerId: p2, slot: "hand", index: 0 },
  };
  p2State.hand = [costCard];
  state.cardManifest.cards[target.cardId] = {
    ...must(state.cardManifest.cards[target.cardId], "target metadata"),
    types: ["Red-Haired Pirates"],
  };
  state.cardManifest.cards[costCard.cardId] = resolvedCard({
    cardId: costCard.cardId,
    category: "character",
    power: 6000,
  });
  const effectBlock = setupReviewedTypedKoTrashFromHandReplacementDefinition(
    state,
    replacementSource,
  );
  const process = buildSelectedTargetKoReplacementProcess(
    entry,
    cardRef(target, p2),
    0,
  );

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, {
    ok: true,
    candidate: {
      id: `${String(replacementSource.instanceId)}:${String(effectBlock.id)}`,
      effectBlockId: effectBlock.id,
      controllerId: p2,
      oncePerTurn: true,
      source: cardRef(replacementSource, p2),
      replacementEffect: effectBlock.effect,
    },
  });
});

test("does not detect typed K.O. trash-from-hand replacement for move-zone processes", () => {
  const { state, entry, target, replacementSource } =
    setupFilteredKoReplacementState();
  const p2State = must(state.players[p2], "p2");
  const costCard: CardInstance = {
    ...target,
    cardId: toCardId("red-haired-trash-cost"),
    instanceId: toInstanceId("red-haired-trash-cost-instance"),
    zone: { zone: "hand", playerId: p2, slot: "hand", index: 0 },
  };
  p2State.hand = [costCard];
  state.cardManifest.cards[target.cardId] = {
    ...must(state.cardManifest.cards[target.cardId], "target metadata"),
    types: ["Red-Haired Pirates"],
  };
  state.cardManifest.cards[costCard.cardId] = resolvedCard({
    cardId: costCard.cardId,
    category: "character",
    power: 6000,
  });
  setupReviewedTypedKoTrashFromHandReplacementDefinition(
    state,
    replacementSource,
  );
  const process = buildSelectedTargetMoveZoneReplacementProcess({
    classification: "moveFromFieldToHand",
    entry,
    target: cardRef(target, p2),
    targetIndex: 0,
  });

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );

  assert.deepEqual(detected, { ok: true });
});

test("detects any-of K.O. or opponent-effect removal replacement through composed trigger branches", () => {
  const { state, entry, target, replacementSource } =
    setupFilteredKoReplacementState();
  const p2State = must(state.players[p2], "p2");
  const costCard: CardInstance = {
    ...target,
    cardId: toCardId("whitebeard-cost"),
    instanceId: toInstanceId("whitebeard-cost-instance"),
    zone: { zone: "hand", playerId: p2, slot: "hand", index: 0 },
  };
  p2State.hand = [costCard];
  state.cardManifest.cards[costCard.cardId] = {
    ...resolvedCard({ cardId: costCard.cardId, category: "character" }),
    types: ["Whitebeard Pirates"],
  };

  const koWhen = {
    type: "wouldBeKOd",
    sourceControllerRelation: "any",
    target: { type: "self" },
  } as const;
  const fieldRemovalWhen = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    target: { type: "self" },
  } as const;
  const when: Extract<Effect, { type: "replacement" }>["when"] = {
    type: "anyOf",
    replacements: [koWhen, fieldRemovalWhen],
  };
  const support = must(
    state.cardManifest.cards[replacementSource.cardId]?.support,
    "replacement support",
  );
  const effectBlock: EffectDefinition["effects"][number] = {
    id: toEffectId("replacement:any-of-trash-from-hand"),
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    oncePerTurn: true,
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
        filter: { typesIncludeAny: ["Whitebeard Pirates"] },
      },
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [must(support.effectDefinitionId, "definition id")]: {
      cardId: replacementSource.cardId,
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

  const koProcess = buildSelectedTargetKoReplacementProcess(
    entry,
    cardRef(replacementSource, p2),
    0,
  );
  const removalProcess = buildSelectedTargetMoveZoneReplacementProcess({
    classification: "moveFromFieldToHand",
    entry,
    target: cardRef(replacementSource, p2),
    targetIndex: 0,
  });

  for (const process of [koProcess, removalProcess]) {
    const detected = detectSupportedSelectedTargetKoReplacementCandidate(
      state,
      process,
    );
    assert.deepEqual(detected, {
      ok: true,
      candidate: {
        id: `${String(replacementSource.instanceId)}:${String(effectBlock.id)}`,
        effectBlockId: effectBlock.id,
        controllerId: p2,
        oncePerTurn: true,
        source: cardRef(replacementSource, p2),
        replacementEffect: effectBlock.effect,
      },
    });
  }
});
