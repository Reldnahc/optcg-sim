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
  EngineEvent,
  GameState,
  QueueEntryId,
  ReplacementProcess,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import { applyAction } from "./actions.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import { executeAcceptedSelectedTargetKoReplacementProcess } from "./effect-runtime.js";
import {
  buildSelectedTargetKoReplacementProcess,
  executeSelectedTargetEffectPrimitive,
} from "./effect-runtime-primitives.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
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

const setupKoReplacementState = () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.hand[0], "source");
  const targetHand = must(p2State.hand[0], "target");

  const sourceOnField: CardInstance = {
    ...source,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  const target: CardInstance = {
    ...targetHand,
    cardId: toCardId("ko-replacement-target"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "rested",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };

  p1State.characters = [sourceOnField];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p2State.characters = [target];
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));

  state.cardManifest.cards[sourceOnField.cardId] = resolvedCard({
    cardId: sourceOnField.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });

  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-ko-replacement"),
    state: "pending",
    timingWindowId: "window-ko-replacement" as TimingWindowId,
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
    effectBlockId: toEffectId("ko-replacement-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "ko-replacement-test" },
  };
  const targetRef: CardRef = {
    instanceId: target.instanceId,
    cardId: target.cardId,
    playerId: p2,
    zone: target.zone,
  };
  return { state, entry, target, targetRef };
};

const attachReviewedReplacement = (
  state: GameState,
  target: CardInstance,
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: target.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "replacement-rules",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-source-hash",
    behaviorHash: "replacement-behavior-hash",
    effectDefinitionId: `definition:${String(target.cardId)}`,
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
  const setup = setupKoReplacementState();
  const effectBlock = attachReviewedReplacement(setup.state, setup.target);
  const result = executeSelectedTargetEffectPrimitive(
    setup.state,
    setup.entry,
    koChooseEffect(),
    [setup.targetRef],
  );
  if (result.state.pendingDecision?.type !== "chooseReplacement") {
    throw new Error("missing chooseReplacement decision");
  }
  return {
    ...setup,
    effectBlock,
    result,
    decision: result.state.pendingDecision,
  };
};

const acceptReplacement = () => {
  const paused = pauseForReplacementDecision();
  const accepted = applyAction(paused.result.state, {
    type: "respondToDecision",
    decisionId: paused.decision.id,
    playerId: p2,
    response: {
      type: "replacement",
      replacementId: String(paused.effectBlock.id),
    },
  });
  return { ...paused, accepted };
};

const acceptedProcessFromResult = (
  result: ReturnType<typeof executeAcceptedSelectedTargetKoReplacementProcess>,
): ReplacementProcess => {
  return acceptedResult(result).process;
};

const acceptedResult = (
  result: ReturnType<typeof executeAcceptedSelectedTargetKoReplacementProcess>,
) => {
  if ("error" in result) {
    throw new Error(`unexpected replacement error: ${result.error.type}`);
  }
  return result;
};

const executeAcceptedReplacementDirectly = (
  state: GameState,
  entry: EffectQueueEntry,
  process: ReplacementProcess,
  replacementId: string,
) => {
  const events: EngineEvent[] = [];
  const result = executeAcceptedSelectedTargetKoReplacementProcess(
    state,
    events,
    entry.effectBlockId,
    process,
    replacementId,
  );
  return { events, result };
};

test("accepting optional chooseReplacement applies deterministic draw replacement without KO mutation", () => {
  const first = acceptReplacement();
  const second = acceptReplacement();
  const replacementApplied = must(
    first.accepted.events[1],
    "replacementApplied event",
  );
  const pausedP2 = must(first.result.state.players[p2], "paused p2");
  const nextP2 = must(first.accepted.state.players[p2], "next p2");
  const storedProcess = must(
    first.result.state.replacementState[0],
    "stored replacement process",
  );

  assert.equal(first.accepted.errors, undefined);
  assert.equal(first.accepted.state.pendingDecision, undefined);
  assert.deepEqual(first.accepted.state.replacementState, []);
  assert.deepEqual(
    first.accepted.events.map((event) => event.type),
    [
      "decisionResolved",
      "replacementApplied",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
    ],
  );
  assert.deepEqual(replacementApplied.payload, {
    processId: first.decision.processId,
    replacementId: String(first.effectBlock.id),
    previousPayloadHash: hashCanonicalStateValue(storedProcess.payload),
    transformedPayloadHash: hashCanonicalStateValue({
      controllerId: p2,
      effect: { type: "draw", count: 1, player: "self" },
      replacementId: String(first.effectBlock.id),
      source: first.targetRef,
    }),
  });
  assert.deepEqual(replacementApplied.visibility, { type: "public" });
  assert.deepEqual(replacementApplied.causedBy, {
    type: "replacement",
    replacementId: String(first.effectBlock.id),
  });
  assert.equal(
    nextP2.characters.some(
      (card) => card.instanceId === first.target.instanceId,
    ),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === first.target.instanceId),
    false,
  );
  assert.equal(nextP2.deck.length, pausedP2.deck.length - 1);
  assert.equal(nextP2.hand.length, pausedP2.hand.length + 1);
  assert.deepEqual(
    first.accepted.state.eventJournal.slice(-first.accepted.events.length),
    first.accepted.events,
  );
  assert.equal(
    first.accepted.stateHash,
    hashCanonicalStateValue(first.accepted.state),
  );
  assert.equal(first.accepted.stateHash, second.accepted.stateHash);
  assert.deepEqual(
    first.accepted.events.map(({ type, payload, visibility, causedBy }) => ({
      type,
      payload,
      visibility,
      causedBy,
    })),
    second.accepted.events.map(({ type, payload, visibility, causedBy }) => ({
      type,
      payload,
      visibility,
      causedBy,
    })),
  );
});

test("accepted KO replacement marks the process used and rejects duplicate use without mutation", () => {
  const paused = pauseForReplacementDecision();
  const replacementId = String(paused.effectBlock.id);
  const process = buildSelectedTargetKoReplacementProcess(
    paused.entry,
    paused.targetRef,
    0,
  );

  const first = executeAcceptedReplacementDirectly(
    paused.result.state,
    paused.entry,
    process,
    replacementId,
  );
  const usedProcess = acceptedProcessFromResult(first.result);
  const firstAccepted = acceptedResult(first.result);

  assert.deepEqual(usedProcess.usedReplacementIds, [replacementId]);

  const beforeDuplicate = structuredClone(firstAccepted.state);
  const beforeDuplicateHash = hashCanonicalStateValue(firstAccepted.state);
  const duplicate = executeAcceptedReplacementDirectly(
    firstAccepted.state,
    paused.entry,
    usedProcess,
    replacementId,
  );

  assert.deepEqual(duplicate.events, []);
  assert.equal("error" in duplicate.result, true);
  assert.deepEqual(duplicate.result, {
    error: {
      type: "effectRuntimeError",
      effectId: paused.entry.effectBlockId,
      details: { reason: "unsupported-effect-shape" },
    },
  });
  assert.deepEqual(firstAccepted.state, beforeDuplicate);
  assert.equal(
    hashCanonicalStateValue(firstAccepted.state),
    beforeDuplicateHash,
  );
});

test("accepted KO replacement allows the same replacement id on a separate process", () => {
  const paused = pauseForReplacementDecision();
  const replacementId = String(paused.effectBlock.id);
  const firstProcess = buildSelectedTargetKoReplacementProcess(
    paused.entry,
    paused.targetRef,
    0,
  );
  const first = executeAcceptedReplacementDirectly(
    paused.result.state,
    paused.entry,
    firstProcess,
    replacementId,
  );
  if ("error" in first.result) {
    throw new Error("first replacement should apply");
  }
  const separateProcess = buildSelectedTargetKoReplacementProcess(
    paused.entry,
    paused.targetRef,
    1,
  );

  const second = executeAcceptedReplacementDirectly(
    first.result.state,
    paused.entry,
    separateProcess,
    replacementId,
  );

  assert.equal("error" in second.result, false);
  assert.equal(
    second.events.filter((event) => event.type === "replacementApplied").length,
    1,
  );
  assert.deepEqual(
    acceptedProcessFromResult(second.result).usedReplacementIds,
    [replacementId],
  );
});
