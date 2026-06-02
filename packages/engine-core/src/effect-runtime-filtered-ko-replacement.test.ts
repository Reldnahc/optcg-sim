import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
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

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
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
      id: effectBlock.id,
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
