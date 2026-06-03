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
  QueueEntryId,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";
import {
  buildSelectedTargetKoReplacementProcess,
  detectSupportedSelectedTargetKoReplacementCandidate,
} from "./field-removal-process.js";
import { executeSelectedTargetEffectPrimitive } from "../runtime/primitives/execute.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const publicCharacterRequest = (): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 1,
  max: 1,
  allowFewerIfUnavailable: false,
  visibility: "public",
});

const koChooseEffect = (): Extract<Effect, { type: "ko" }> => ({
  type: "ko",
  target: { type: "choose", request: publicCharacterRequest() },
});

const cardRef = (card: CardInstance): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId: card.controller,
  zone: card.zone,
});

const setupDuplicateReplacementSources = () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const sourceSeed = must(p1State.hand[0], "source seed");
  const targetSeed = must(p2State.hand[0], "target seed");
  const firstReplacementSeed = must(p2State.hand[1], "first replacement seed");
  const secondReplacementSeed = must(
    p2State.hand[2],
    "second replacement seed",
  );
  const source: CardInstance = {
    ...sourceSeed,
    cardId: toCardId("ko-source"),
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  };
  const target: CardInstance = {
    ...targetSeed,
    cardId: toCardId("ko-target"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  };
  const replacementCardId = toCardId("shared-replacement-source");
  const firstReplacementSource: CardInstance = {
    ...firstReplacementSeed,
    cardId: replacementCardId,
    instanceId: toInstanceId("shared-replacement-source:1"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  };
  const secondReplacementSource: CardInstance = {
    ...secondReplacementSeed,
    cardId: replacementCardId,
    instanceId: toInstanceId("shared-replacement-source:2"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 2 },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p2State.characters = [
    target,
    firstReplacementSource,
    secondReplacementSource,
  ];
  p2State.hand = p2State.hand.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });
  const effectBlock = setupReviewedAnySelfKoRestSelfReplacementDefinition(
    state,
    firstReplacementSource,
  );
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-ko-targets"),
    state: "pending",
    timingWindowId: "window-ko-targets" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(source),
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
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
  return {
    state,
    entry,
    target,
    effectBlock,
    firstReplacementSource,
    secondReplacementSource,
  };
};

const setupReviewedAnySelfKoRestSelfReplacementDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: source.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "multi-replacement-source-hash",
    behaviorHash: "multi-replacement-behavior-hash",
    effectDefinitionId: `definition:${String(source.cardId)}:multi-replacement`,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 3000,
    support,
  });
  const when: Extract<Effect, { type: "replacement" }>["when"] = {
    type: "wouldBeKOd",
    sourceKind: "cardEffect",
    target: {
      type: "all",
      zone: "characterArea",
      player: "self",
    },
  };
  const effectBlock: EffectDefinition["effects"][number] = {
    id: toEffectId("replacement:any-self-ko-rest-self"),
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

test("duplicate replacement source instances create distinct chooseReplacement options", () => {
  const {
    state,
    entry,
    target,
    effectBlock,
    firstReplacementSource,
    secondReplacementSource,
  } = setupDuplicateReplacementSources();
  const process = buildSelectedTargetKoReplacementProcess(
    entry,
    cardRef(target),
    0,
  );

  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );
  if (!detected.ok) {
    assert.fail("expected replacement candidates");
  }
  const candidates =
    detected.candidates ??
    (detected.candidate === undefined ? [] : [detected.candidate]);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    [
      `${String(firstReplacementSource.instanceId)}:${String(effectBlock.id)}`,
      `${String(secondReplacementSource.instanceId)}:${String(effectBlock.id)}`,
    ],
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.effectBlockId),
    [effectBlock.id, effectBlock.id],
  );

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [cardRef(target)],
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "chooseReplacement");
  assert.deepEqual(result.state.pendingDecision.replacementIds, [
    `${String(firstReplacementSource.instanceId)}:${String(effectBlock.id)}`,
    `${String(secondReplacementSource.instanceId)}:${String(effectBlock.id)}`,
  ]);
});
