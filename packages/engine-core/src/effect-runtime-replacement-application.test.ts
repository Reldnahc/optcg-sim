import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  DecisionId,
  Effect,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  LegalAction,
  QueueEntryId,
  ReplacementProcess,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import { applyAction, getLegalActions } from "./actions.js";
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
const toDecisionId = (value: string): DecisionId => value as DecisionId;
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

const attachQueuedKoEffect = (
  state: GameState,
  entry: EffectQueueEntry,
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: entry.source.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "queued-ko-rules",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "queued-ko-source-hash",
    behaviorHash: "queued-ko-behavior-hash",
    effectDefinitionId: `definition:${String(entry.source.cardId)}:queued-ko`,
  };
  state.cardManifest.cards[entry.source.cardId] = resolvedCard({
    cardId: entry.source.cardId,
    category: "character",
    power: 5000,
    support,
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: entry.effectBlockId,
    category: "auto",
    trigger: { type: "onPlay" },
    sourcePresencePolicy: entry.sourcePresencePolicy,
    effect: koChooseEffect(),
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: entry.source.cardId,
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

const pauseQueuedTargetKoForReplacementDecision = () => {
  const setup = setupKoReplacementState();
  const replacementBlock = attachReviewedReplacement(setup.state, setup.target);
  attachQueuedKoEffect(setup.state, setup.entry);
  setup.state.effectQueue = [setup.entry];
  setup.state.pendingDecision = {
    id: toDecisionId("decision:selectTargets:queue-entry-ko-replacement"),
    type: "selectTargets",
    playerId: p1,
    prompt: "Select targets.",
    causedBy: {
      type: "effect",
      queueEntryId: setup.entry.id,
      effectId: setup.entry.effectBlockId,
    },
    visibility: { type: "public" },
    request: publicCharacterRequest(),
    candidates: [
      {
        card: setup.targetRef,
        visibility: { type: "public" },
      },
    ],
  };

  const paused = applyAction(setup.state, {
    type: "respondToDecision",
    decisionId: setup.state.pendingDecision.id,
    response: { type: "targets", targets: [setup.targetRef] },
  });
  if (paused.state.pendingDecision?.type !== "chooseReplacement") {
    throw new Error("missing queued chooseReplacement decision");
  }

  return {
    ...setup,
    replacementBlock,
    paused,
    decision: paused.state.pendingDecision,
  };
};

const acceptReplacement = () => {
  const paused = pauseForReplacementDecision();
  const accepted = applyAction(paused.result.state, {
    type: "respondToDecision",
    decisionId: paused.decision.id,
    response: {
      type: "replacement",
      replacementId: String(paused.effectBlock.id),
    },
  });
  return { ...paused, accepted };
};

const declineReplacement = () => {
  const paused = pauseForReplacementDecision();
  const declined = applyAction(paused.result.state, {
    type: "respondToDecision",
    decisionId: paused.decision.id,
    response: { type: "replacement" },
  });
  return { ...paused, declined };
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

test.each([
  {
    name: "accept",
    response: (replacementId: string) => ({
      type: "replacement" as const,
      replacementId,
    }),
    expectedEvents: [
      "decisionResolved",
      "replacementApplied",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
      "gameEnded",
    ],
  },
  {
    name: "decline",
    response: () => ({ type: "replacement" as const }),
    expectedEvents: [
      "decisionResolved",
      "cardKOd",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  },
] satisfies {
  name: string;
  response: (replacementId: string) => {
    type: "replacement";
    replacementId?: string;
  };
  expectedEvents: string[];
}[])(
  "queued chooseReplacement $name response resumes and resolves the source effect",
  ({ response, expectedEvents }) => {
    const paused = pauseQueuedTargetKoForReplacementDecision();

    const result = applyAction(paused.paused.state, {
      type: "respondToDecision",
      decisionId: paused.decision.id,
      response: response(String(paused.replacementBlock.id)),
    });

    assert.equal(result.errors, undefined);
    assert.deepEqual(
      result.events.map((event) => event.type),
      expectedEvents,
    );
    assert.deepEqual(result.state.effectQueue, []);
    assert.equal(result.state.pendingDecision, undefined);
    assert.equal(
      result.state.eventJournal.some(
        (event) => event.type === "effectResolved",
      ),
      true,
    );
    assert.deepEqual(
      result.events.find((event) => event.type === "effectResolved")?.payload,
      {
        queueEntryId: paused.entry.id,
        timingWindowId: paused.entry.timingWindowId,
        generation: paused.entry.generation,
        effectBlockId: paused.entry.effectBlockId,
        sourcePresencePolicy: paused.entry.sourcePresencePolicy,
        orderingGroup: paused.entry.orderingGroup,
        status: "resolved",
      },
    );
    assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  },
);

test("declining optional chooseReplacement resolves with deterministic hash and KO passthrough ordering", () => {
  const first = declineReplacement();
  const second = declineReplacement();

  assert.equal(first.declined.errors, undefined);
  assert.equal(first.declined.state.pendingDecision, undefined);
  assert.deepEqual(first.declined.state.replacementState, []);
  assert.deepEqual(
    first.declined.events.map((event) => event.type),
    ["decisionResolved", "cardKOd", "cardMoved"],
  );
  assert.equal(
    first.declined.stateHash,
    hashCanonicalStateValue(first.declined.state),
  );
  assert.equal(first.declined.stateHash, second.declined.stateHash);
  assert.deepEqual(
    first.declined.events.map(({ type, payload, visibility, causedBy }) => ({
      type,
      payload,
      visibility,
      causedBy,
    })),
    second.declined.events.map(({ type, payload, visibility, causedBy }) => ({
      type,
      payload,
      visibility,
      causedBy,
    })),
  );
});

test("chooseReplacement accepts canonical respondToDecision payload without playerId", () => {
  const paused = pauseForReplacementDecision();
  const accepted = applyAction(paused.result.state, {
    type: "respondToDecision",
    decisionId: paused.decision.id,
    response: {
      type: "replacement",
      replacementId: String(paused.effectBlock.id),
    },
  });
  assert.equal(accepted.errors, undefined);
});

test("chooseReplacement response validation accepts mandatory selected replacement", () => {
  const paused = pauseForReplacementDecision();
  const mandatoryState = {
    ...paused.result.state,
    pendingDecision: { ...paused.decision, mandatory: true },
  };

  const accepted = applyAction(mandatoryState, {
    type: "respondToDecision",
    decisionId: paused.decision.id,
    response: {
      type: "replacement",
      replacementId: String(paused.effectBlock.id),
    },
  });
  const nextP2 = must(accepted.state.players[p2], "next p2");

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.deepEqual(accepted.state.replacementState, []);
  assert.deepEqual(
    accepted.events.map((event) => event.type),
    [
      "decisionResolved",
      "replacementApplied",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
    ],
  );
  assert.equal(
    nextP2.characters.some(
      (card) => card.instanceId === paused.target.instanceId,
    ),
    true,
  );
});

test("mandatory chooseReplacement legal actions omit decline response", () => {
  const paused = pauseForReplacementDecision();
  const mandatoryState: GameState = {
    ...paused.result.state,
    pendingDecision: { ...paused.decision, mandatory: true },
  };

  const replacementActions = getLegalActions(
    mandatoryState,
    paused.decision.playerId,
  ).filter(
    (action): action is Extract<LegalAction, { type: "respondToDecision" }> =>
      action.type === "respondToDecision" &&
      action.decisionId === paused.decision.id,
  );

  assert.deepEqual(
    replacementActions,
    paused.decision.replacementIds.map(
      (replacementId): Extract<LegalAction, { type: "respondToDecision" }> => ({
        type: "respondToDecision",
        decisionId: paused.decision.id,
        response: { type: "replacement", replacementId },
      }),
    ),
  );
});

test.each([
  {
    name: "non-object payload",
    replacementState: {
      processId: "queue-entry-ko-replacement:ko:process",
      type: "ko" as const,
      usedReplacementIds: [],
      payload: "malformed",
    },
  },
  {
    name: "invalid source card ref shape",
    replacementState: {
      processId: "queue-entry-ko-replacement:ko:process",
      type: "ko" as const,
      usedReplacementIds: [],
      payload: {
        effectId: "ko-replacement-effect",
        source: { instanceId: "missing-fields" },
      },
    },
  },
  {
    name: "invalid target card ref shape",
    replacementState: {
      processId: "queue-entry-ko-replacement:ko:process",
      type: "ko" as const,
      usedReplacementIds: [],
      payload: {
        effectId: "ko-replacement-effect",
        target: { cardId: "missing-instance-id" },
      },
    },
  },
] satisfies {
  name: string;
  replacementState: {
    processId: string;
    type: "ko";
    usedReplacementIds: string[];
    payload: unknown;
  };
}[])(
  "chooseReplacement fails closed without mutation for malformed stored process: $name",
  ({ replacementState }) => {
    const paused = pauseForReplacementDecision();
    const malformedState = {
      ...paused.result.state,
      replacementState: [
        {
          ...replacementState,
          processId: paused.decision.processId,
        },
      ],
    };
    const before = structuredClone(malformedState);
    const beforeHash = hashCanonicalStateValue(malformedState);

    const rejected = applyAction(malformedState, {
      type: "respondToDecision",
      decisionId: paused.decision.id,
      response: { type: "replacement" },
    });

    assert.deepEqual(rejected.errors, [
      {
        type: "invalidDecisionResponse",
        reason:
          "chooseReplacement decision is stale for current replacement process.",
      },
    ]);
    assert.deepEqual(rejected.events, []);
    assert.deepEqual(rejected.state, before);
    assert.equal(rejected.stateHash, beforeHash);
  },
);
