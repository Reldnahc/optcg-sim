import type {
  CardInstance,
  CardRef,
  CardSnapshot,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  PlayerId,
  ReplacementProcess,
  TimingWindowId,
} from "@optcg/types";

import {
  appendEvent,
  rebaseEvents,
  toDecisionId,
  toStateSeq,
} from "./action-results.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { executeNoChoiceEffectPrimitive } from "./effect-runtime-draw-primitives.js";
import {
  executeMoveCardsPrimitive,
  isSupportedLifeTopToHandEffect,
} from "./effect-runtime-move-cards.js";
import {
  detectSupportedSelectedTargetKoReplacementCandidate,
  type SelectedTargetKoReplacementCandidate,
} from "./effect-runtime-replacement-primitives.js";

export type {
  DetectSelectedTargetKoReplacementCandidateResult,
  SelectedTargetKoReplacementCandidate,
  SelectedTargetKoReplacementDetectionFailureReason,
} from "./effect-runtime-replacement-primitives.js";
export { detectSupportedSelectedTargetKoReplacementCandidate };

interface SelectedTargetKoReplacementPayload {
  effectId: string;
  queueEntryId?: EffectQueueEntry["id"];
  source: CardRef;
  target: CardRef;
  fieldRemovalAttempt: {
    processFamily: "fieldRemoval";
    classification: "moveFromFieldToTrash";
    sourceKind: "battle" | "cardEffect";
    sourceControllerId: PlayerId;
  };
  battleContinuation?: {
    type: "endBattleAfterCharacterKoAttempt";
  };
}

type LocatedReplacementSource = {
  card: CardInstance;
};

type LocatedKoTarget = {
  playerId: PlayerId;
  card: CardInstance;
};

type EngineInternalReplacementAppliedEventPayload = {
  processId: ReplacementProcess["id"];
  replacementId: string;
  previousPayloadHash: string;
  transformedPayloadHash: string;
};

export const buildKoReplacementProcess = (params: {
  battleContinuation?: SelectedTargetKoReplacementPayload["battleContinuation"];
  causedBy: ReplacementProcess["causedBy"];
  effectId: string;
  id: ReplacementProcess["id"];
  source: CardRef;
  sourceControllerId: PlayerId;
  sourceKind: "battle" | "cardEffect";
  queueEntryId?: EffectQueueEntry["id"];
  target: CardRef;
}): ReplacementProcess => {
  const payload: SelectedTargetKoReplacementPayload = {
    effectId: params.effectId,
    ...(params.queueEntryId === undefined
      ? {}
      : { queueEntryId: params.queueEntryId }),
    source: params.source,
    target: params.target,
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: params.sourceKind,
      sourceControllerId: params.sourceControllerId,
    },
    ...(params.battleContinuation === undefined
      ? {}
      : { battleContinuation: params.battleContinuation }),
  };
  return {
    id: params.id,
    type: "ko",
    source: params.source,
    target: params.target,
    payload,
    causedBy: params.causedBy,
    usedReplacementIds: [],
  };
};

export const buildSelectedTargetKoReplacementProcess = (
  entry: EffectQueueEntry,
  target: CardRef,
  targetIndex: number,
): ReplacementProcess =>
  buildKoReplacementProcess({
    effectId: entry.effectBlockId,
    id: `${entry.id}:ko:${target.instanceId}:${String(targetIndex)}`,
    queueEntryId: entry.id,
    source: entry.source,
    target,
    causedBy: entry.causedBy,
    sourceKind: "cardEffect",
    sourceControllerId: entry.controllerId,
  });

const findKoTargetByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): LocatedKoTarget | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    const card = player.characters.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (card !== undefined) {
      return { playerId, card };
    }
    if (player.stage?.instanceId === instanceId) {
      return { playerId, card: player.stage };
    }
  }
  return null;
};

export const normalizeSelectedTargetKoProcess = (
  state: GameState,
  process: ReplacementProcess,
): ReplacementProcess => {
  const target = process.target;
  if (process.type !== "ko" || target === undefined) {
    return process;
  }
  const located = findKoTargetByInstanceId(state, target.instanceId);
  if (located === null) {
    return process;
  }
  const currentTarget: CardRef = {
    instanceId: located.card.instanceId,
    cardId: located.card.cardId,
    playerId: located.playerId,
    zone: located.card.zone,
  };
  const payload =
    typeof process.payload === "object" &&
    process.payload !== null &&
    "target" in process.payload
      ? { ...process.payload, target: currentTarget }
      : process.payload;
  return {
    ...process,
    target: currentTarget,
    payload,
  };
};

export const pauseSelectedTargetKoReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
): { state: GameState; paused: true } => {
  const replacementLabel = replacementOptionLabel(candidate);
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: toDecisionId(`decision:chooseReplacement:${process.id}`),
    type: "chooseReplacement",
    playerId: candidate.controllerId,
    prompt: "Choose replacement effect.",
    causedBy: process.causedBy,
    visibility: { type: "private", playerId: candidate.controllerId },
    processId: process.id,
    replacementIds: [candidate.id],
    replacementOptions: [
      {
        replacementId: candidate.id,
        label: replacementLabel,
      },
    ],
    mandatory: false,
  };
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    pendingDecision.visibility,
  );
  const created = events[events.length - 1];
  if (created !== undefined) {
    created.causedBy = process.causedBy;
  }

  return {
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      replacementState: [
        ...state.replacementState.filter(
          (candidateState) => candidateState.processId !== process.id,
        ),
        {
          processId: process.id,
          type: process.type,
          usedReplacementIds: [...process.usedReplacementIds],
          payload: process.payload,
        },
      ],
      eventJournal: [...state.eventJournal, ...events],
    },
    paused: true,
  };
};

const plural = (
  count: number,
  singular: string,
  pluralLabel: string,
): string => (count === 1 ? singular : pluralLabel);

const replacementOptionLabel = (
  candidate: SelectedTargetKoReplacementCandidate,
): string => {
  const instead = candidate.replacementEffect.instead;
  if (instead.type === "draw") {
    return `Draw ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} instead`;
  }
  if (isSupportedLifeTopToHandEffect(instead)) {
    return `Add ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} from Life to hand instead`;
  }
  return "Use replacement effect";
};

const acceptedReplacementError = (
  effectId: string,
  reason: "missing-card" | "unsupported-effect-shape",
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason },
});

const findReplacementSource = (
  state: GameState,
  source: CardRef,
): LocatedReplacementSource | null => {
  for (const [, player] of Object.entries(state.players) as [
    CardInstance["controller"],
    GameState["players"][CardInstance["controller"]],
  ][]) {
    const card = [
      player.leader,
      ...player.characters,
      ...(player.stage === undefined ? [] : [player.stage]),
      ...player.hand,
      ...player.deck,
      ...player.trash,
      ...player.costArea,
      ...player.donDeck,
      ...player.life.map((lifeCard) => lifeCard.card),
    ].find((candidate) => candidate.instanceId === source.instanceId);
    if (card !== undefined) {
      return { card };
    }
  }
  return null;
};

const toReplacementDrawSourceSnapshot = (
  state: GameState,
  source: CardRef,
): CardSnapshot | null => {
  const located = findReplacementSource(state, source);
  const resolved = state.cardManifest.cards[source.cardId];
  if (located === null || resolved === undefined) {
    return null;
  }
  return {
    instanceId: located.card.instanceId,
    cardId: located.card.cardId,
    ownerId: located.card.owner,
    controllerId: located.card.controller,
    zone: located.card.zone,
    category: resolved.category,
    colors: [...resolved.colors],
    ...(resolved.cost === undefined ? {} : { cost: resolved.cost }),
    ...(resolved.power === undefined ? {} : { power: resolved.power }),
    ...(resolved.counter === undefined ? {} : { counter: resolved.counter }),
    ...(resolved.life === undefined ? {} : { life: resolved.life }),
    keywords: [...resolved.printedKeywords],
  };
};

const replacementInsteadTransformedPayload = (
  candidate: SelectedTargetKoReplacementCandidate,
) => ({
  controllerId: candidate.controllerId,
  effect: candidate.replacementEffect.instead,
  replacementId: candidate.id,
  source: candidate.source,
});

export const executeAcceptedSelectedTargetKoReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
  replacementId: string,
):
  | { state: GameState; process: ReplacementProcess }
  | { error: EngineError } => {
  if (process.usedReplacementIds.includes(replacementId)) {
    return {
      error: acceptedReplacementError(effectId, "unsupported-effect-shape"),
    };
  }
  const detected = detectSupportedSelectedTargetKoReplacementCandidate(
    state,
    process,
  );
  if (!detected.ok) return { error: detected.error };
  const candidate = detected.candidate;
  if (candidate === undefined || candidate.id !== replacementId) {
    return {
      error: acceptedReplacementError(effectId, "unsupported-effect-shape"),
    };
  }

  const usedProcess: ReplacementProcess = {
    ...process,
    usedReplacementIds: [...process.usedReplacementIds, candidate.id],
  };
  const transformedPayload = replacementInsteadTransformedPayload(candidate);
  appendEvent(
    state,
    events,
    "replacementApplied",
    {
      processId: usedProcess.id,
      replacementId: candidate.id,
      previousPayloadHash: hashCanonicalStateValue(process.payload),
      transformedPayloadHash: hashCanonicalStateValue(transformedPayload),
    } satisfies EngineInternalReplacementAppliedEventPayload,
    { type: "public" },
  );
  const applied = events[events.length - 1];
  if (applied !== undefined) {
    applied.causedBy = { type: "replacement", replacementId: candidate.id };
  }

  const sourceSnapshot = toReplacementDrawSourceSnapshot(
    state,
    candidate.source,
  );
  if (sourceSnapshot === null) {
    return { error: acceptedReplacementError(effectId, "missing-card") };
  }

  const replacementEntry: EffectQueueEntry = {
    id: `${process.id}:replacement:${candidate.id}` as EffectQueueEntry["id"],
    state: "resolving",
    timingWindowId: `replacement:${process.id}` as TimingWindowId,
    generation: 0,
    controllerId: candidate.controllerId,
    source: candidate.source,
    sourceSnapshot,
    effectBlockId: candidate.effectBlockId,
    orderingGroup:
      candidate.controllerId === state.turn.turnPlayerId
        ? "turnPlayer"
        : "nonTurnPlayer",
    createdAtEventSeq: state.eventJournal.length + events.length,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    causedBy: { type: "replacement", replacementId: candidate.id },
  };
  const replaced = executeReplacementInsteadEffect(
    { ...state, eventJournal: [...state.eventJournal, ...events] },
    replacementEntry,
    candidate.replacementEffect.instead,
  );
  if (replaced.errors !== undefined) {
    return {
      error:
        replaced.errors[0] ??
        acceptedReplacementError(effectId, "unsupported-effect-shape"),
    };
  }

  events.push(...rebaseEvents(state, replaced.events, events.length + 1));
  return {
    state: {
      ...replaced.state,
      eventJournal: [...state.eventJournal, ...events],
    },
    process: usedProcess,
  };
};

const executeReplacementInsteadEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"],
) => {
  if (effect.type === "moveCards") {
    return executeMoveCardsPrimitive(state, entry, effect, {
      incrementStateSeq: false,
    });
  }
  return executeNoChoiceEffectPrimitive(state, entry, effect, {
    incrementStateSeq: false,
  });
};
