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
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { executeNoChoiceEffectPrimitive } from "../runtime/primitives/draw.js";
import { createContinuousRecordsForResolvedEffect } from "../runtime/continuous/continuous.js";
import { executeMoveCardsPrimitive } from "../effect-runtime-move-cards.js";
import {
  detectSupportedFieldRemovalReplacementCandidate,
  detectSupportedSelectedTargetKoReplacementCandidate,
  type SelectedTargetKoReplacementCandidate,
} from "./primitives.js";
import { restFieldObjects } from "../effect-runtime-sequence/saved-field-object.js";
import {
  consumeOncePerTurn,
  toOncePerTurnKey,
} from "../rules/once-per-turn.js";
import {
  fieldRemovalProcessTargets,
  withFieldRemovalProcessTargets,
} from "./field-removal-targets.js";
import { continueUncoveredFieldRemovalTargets } from "./unreplaced-field-removal.js";
import {
  isSupportedModifyLeaderPowerInsteadEffect,
  isSupportedKoSelfInsteadEffect,
  isSupportedRestSelfInsteadEffect,
  isSupportedTrashFromHandInsteadEffect,
  isSupportedTrashSelfInsteadEffect,
  replacementOptionLabel,
} from "./instead-effects.js";
import type {
  EngineInternalReplacementAppliedEventPayload,
  PendingReplacementPayCostInsteadPayload,
} from "./continuation-payloads.js";
import { createReplacementPayCostDecision } from "./pay-cost-decision.js";
import {
  createReplacementRestTargetDecision,
  createReplacementTrashFromHandDecision,
} from "./field-removal-decisions.js";
import { createReplacementOwnerDeckBottomDecision } from "./owner-deck-bottom-decision.js";
import { executeKoSelfInsteadEffect } from "./ko-self-instead.js";
import { replacementCandidatePresentation } from "./presentation-payload.js";
import type {
  LocatedKoTarget,
  LocatedReplacementSource,
  PendingReplacementRestInsteadPayload,
  PendingReplacementTrashFromHandInsteadPayload,
} from "./field-removal-process/types.js";

export type {
  DetectFieldRemovalReplacementCandidateResult,
  DetectSelectedTargetKoReplacementCandidateResult,
  FieldRemovalReplacementCandidate,
  SelectedTargetKoReplacementCandidate,
  SelectedTargetKoReplacementDetectionFailureReason,
} from "./primitives.js";
export {
  detectSupportedFieldRemovalReplacementCandidate,
  detectSupportedSelectedTargetKoReplacementCandidate,
};
export {
  buildFieldRemovalKoReplacementProcess,
  buildKoReplacementProcess,
  buildSelectedTargetFieldRemovalKoReplacementProcess,
  buildSelectedTargetFieldRemovalMoveToHandReplacementProcess,
  buildSelectedTargetFieldRemovalMoveZoneReplacementProcess,
  buildSelectedTargetKoReplacementProcess,
  buildSelectedTargetMoveZoneReplacementProcess,
  buildSelectedTargetsFieldRemovalKoReplacementProcess,
  buildSelectedTargetsFieldRemovalMoveZoneReplacementProcess,
} from "./field-removal-process/builders.js";

const replacementCandidatesFromDetection = (detected: {
  candidate?: SelectedTargetKoReplacementCandidate;
  candidates?: readonly SelectedTargetKoReplacementCandidate[];
}): readonly SelectedTargetKoReplacementCandidate[] =>
  detected.candidates ??
  (detected.candidate === undefined ? [] : [detected.candidate]);

const isReplacementCandidateArray = (
  value:
    | SelectedTargetKoReplacementCandidate
    | readonly SelectedTargetKoReplacementCandidate[],
): value is readonly SelectedTargetKoReplacementCandidate[] =>
  Array.isArray(value);

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
  if (process.type !== "ko" && process.type !== "moveZone") {
    return process;
  }
  const currentTargets: CardRef[] = [];
  for (const target of fieldRemovalProcessTargets(process)) {
    const located = findKoTargetByInstanceId(state, target.instanceId);
    if (located === null) {
      continue;
    }
    currentTargets.push({
      instanceId: located.card.instanceId,
      cardId: located.card.cardId,
      playerId: located.playerId,
      zone: located.card.zone,
    });
  }
  return currentTargets.length === 0
    ? process
    : withFieldRemovalProcessTargets(process, currentTargets);
};

export const normalizeFieldRemovalProcess = normalizeSelectedTargetKoProcess;

export const pauseSelectedTargetKoReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  process: ReplacementProcess,
  candidatesInput:
    | SelectedTargetKoReplacementCandidate
    | readonly SelectedTargetKoReplacementCandidate[],
): { state: GameState; paused: true } => {
  const candidates = isReplacementCandidateArray(candidatesInput)
    ? candidatesInput
    : [candidatesInput];
  const firstCandidate = candidates[0];
  if (firstCandidate === undefined) {
    throw new Error("Replacement process pause requires a candidate.");
  }
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: toDecisionId(`decision:chooseReplacement:${process.id}`),
    type: "chooseReplacement",
    playerId: firstCandidate.controllerId,
    prompt: "Choose replacement effect.",
    causedBy: process.causedBy,
    visibility: { type: "private", playerId: firstCandidate.controllerId },
    processId: process.id,
    replacementIds: candidates.map((candidate) => candidate.id),
    replacementOptions: candidates.map((candidate) => ({
      replacementId: candidate.id,
      label: replacementOptionLabel(candidate),
      source: candidate.source,
    })),
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

export const pauseFieldRemovalReplacementProcess =
  pauseSelectedTargetKoReplacementProcess;

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

const currentPublicFieldRefForInstance = (
  state: GameState,
  source: CardRef,
): CardRef | undefined => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.leader.instanceId === source.instanceId) {
      return {
        instanceId: player.leader.instanceId,
        cardId: player.leader.cardId,
        playerId,
        zone: player.leader.zone,
      };
    }
    const character = player.characters.find(
      (card) => card.instanceId === source.instanceId,
    );
    if (character !== undefined) {
      return {
        instanceId: character.instanceId,
        cardId: character.cardId,
        playerId,
        zone: character.zone,
      };
    }
    if (player.stage?.instanceId === source.instanceId) {
      return {
        instanceId: player.stage.instanceId,
        cardId: player.stage.cardId,
        playerId,
        zone: player.stage.zone,
      };
    }
  }
  return undefined;
};

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
  const candidate = replacementCandidatesFromDetection(detected).find(
    (replacementCandidate) => replacementCandidate.id === replacementId,
  );
  if (candidate === undefined) {
    return {
      error: acceptedReplacementError(effectId, "unsupported-effect-shape"),
    };
  }

  const usedProcess: ReplacementProcess = {
    ...process,
    usedReplacementIds: [...process.usedReplacementIds, candidate.id],
  };
  const coveredTargets =
    candidate.coveredTargets ?? fieldRemovalProcessTargets(usedProcess);
  const presentation = replacementCandidatePresentation(state, candidate);
  const ownerDeckBottomDecision = createReplacementOwnerDeckBottomDecision(
    state,
    process,
    candidate,
  );
  if (ownerDeckBottomDecision !== undefined) {
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: ownerDeckBottomDecision.id,
        decisionType: ownerDeckBottomDecision.type,
        playerId: ownerDeckBottomDecision.playerId,
      },
      ownerDeckBottomDecision.visibility,
    );
    const created = events[events.length - 1];
    if (created !== undefined) {
      created.causedBy = ownerDeckBottomDecision.causedBy;
    }
    return {
      state: {
        ...state,
        seq: toStateSeq(state.seq + 1),
        pendingDecision: ownerDeckBottomDecision,
        replacementState: [
          ...state.replacementState.filter(
            (candidateState) => candidateState.processId !== process.id,
          ),
          {
            processId: process.id,
            type: process.type,
            usedReplacementIds: usedProcess.usedReplacementIds,
            payload: {
              ...(typeof process.payload === "object" &&
              process.payload !== null
                ? process.payload
                : {}),
              pendingReplacementOwnerDeckBottomInstead: {
                decisionId: ownerDeckBottomDecision.id,
                effectBlockId: candidate.effectBlockId,
                replacementId: candidate.id,
                source: candidate.source,
                ...(process.target === undefined
                  ? {}
                  : { target: process.target }),
                coveredTargets: [...coveredTargets],
                causedBy: process.causedBy,
                controllerId: candidate.controllerId,
                ...(presentation === undefined ? {} : { presentation }),
              },
            },
          },
        ],
        eventJournal: [...state.eventJournal, ...events],
      },
      process: usedProcess,
    };
  }
  const restDecision = createReplacementRestTargetDecision(
    state,
    process,
    candidate,
  );
  if (restDecision !== undefined) {
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: restDecision.id,
        decisionType: restDecision.type,
        playerId: restDecision.playerId,
      },
      restDecision.visibility,
    );
    const created = events[events.length - 1];
    if (created !== undefined) {
      created.causedBy = restDecision.causedBy;
    }
    return {
      state: {
        ...state,
        seq: toStateSeq(state.seq + 1),
        pendingDecision: restDecision,
        replacementState: [
          ...state.replacementState.filter(
            (candidateState) => candidateState.processId !== process.id,
          ),
          {
            processId: process.id,
            type: process.type,
            usedReplacementIds: usedProcess.usedReplacementIds,
            payload: {
              ...(typeof process.payload === "object" &&
              process.payload !== null
                ? process.payload
                : {}),
              pendingReplacementRestInstead: {
                decisionId: restDecision.id,
                effectBlockId: candidate.effectBlockId,
                replacementId: candidate.id,
                source: candidate.source,
                ...(process.target === undefined
                  ? {}
                  : { target: process.target }),
                coveredTargets: [...coveredTargets],
                causedBy: process.causedBy,
                controllerId: candidate.controllerId,
                ...(presentation === undefined ? {} : { presentation }),
              } satisfies PendingReplacementRestInsteadPayload,
            },
          },
        ],
        eventJournal: [...state.eventJournal, ...events],
      },
      process: usedProcess,
    };
  }
  const trashFromHandDecision = createReplacementTrashFromHandDecision(
    state,
    process,
    candidate,
  );
  if (trashFromHandDecision !== undefined) {
    const trashInstead = candidate.replacementEffect.instead;
    if (!isSupportedTrashFromHandInsteadEffect(trashInstead)) {
      return {
        error: acceptedReplacementError(effectId, "unsupported-effect-shape"),
      };
    }
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: trashFromHandDecision.id,
        decisionType: trashFromHandDecision.type,
        playerId: trashFromHandDecision.playerId,
      },
      trashFromHandDecision.visibility,
    );
    const created = events[events.length - 1];
    if (created !== undefined) {
      created.causedBy = trashFromHandDecision.causedBy;
    }
    const oncePerTurn =
      candidate.oncePerTurn === true
        ? {
            cardInstanceId: candidate.source.instanceId,
            effectId: candidate.effectBlockId,
            turnNumber: state.turn.globalTurn,
          }
        : undefined;
    return {
      state: {
        ...state,
        seq: toStateSeq(state.seq + 1),
        pendingDecision: trashFromHandDecision,
        replacementState: [
          ...state.replacementState.filter(
            (candidateState) => candidateState.processId !== process.id,
          ),
          {
            processId: process.id,
            type: process.type,
            usedReplacementIds: usedProcess.usedReplacementIds,
            payload: {
              ...(typeof process.payload === "object" &&
              process.payload !== null
                ? process.payload
                : {}),
              pendingReplacementTrashFromHandInstead: {
                decisionId: trashFromHandDecision.id,
                effectBlockId: candidate.effectBlockId,
                replacementId: candidate.id,
                source: candidate.source,
                ...(process.target === undefined
                  ? {}
                  : { target: process.target }),
                coveredTargets: [...coveredTargets],
                causedBy: process.causedBy,
                controllerId: candidate.controllerId,
                count: trashFromHandDecision.request.min,
                ...(presentation === undefined ? {} : { presentation }),
                ...(trashInstead.filter === undefined
                  ? {}
                  : { filter: trashInstead.filter }),
                ...(oncePerTurn === undefined ? {} : { oncePerTurn }),
              } satisfies PendingReplacementTrashFromHandInsteadPayload,
            },
          },
        ],
        eventJournal: [...state.eventJournal, ...events],
      },
      process: usedProcess,
    };
  }
  const payCostDecision = createReplacementPayCostDecision(
    state,
    process,
    candidate,
  );
  if (payCostDecision !== undefined) {
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: payCostDecision.id,
        decisionType: payCostDecision.type,
        playerId: payCostDecision.playerId,
      },
      payCostDecision.visibility,
    );
    const created = events[events.length - 1];
    if (created !== undefined) {
      created.causedBy = payCostDecision.causedBy;
    }
    return {
      state: {
        ...state,
        seq: toStateSeq(state.seq + 1),
        pendingDecision: payCostDecision,
        replacementState: [
          ...state.replacementState.filter(
            (candidateState) => candidateState.processId !== process.id,
          ),
          {
            processId: process.id,
            type: process.type,
            usedReplacementIds: usedProcess.usedReplacementIds,
            payload: {
              ...(typeof process.payload === "object" &&
              process.payload !== null
                ? process.payload
                : {}),
              pendingReplacementPayCostInstead: {
                decisionId: payCostDecision.id,
                effectBlockId: candidate.effectBlockId,
                replacementId: candidate.id,
                source: candidate.source,
                ...(process.target === undefined
                  ? {}
                  : { target: process.target }),
                coveredTargets: [...coveredTargets],
                causedBy: process.causedBy,
                controllerId: candidate.controllerId,
                cost: payCostDecision.cost,
                ...(presentation === undefined ? {} : { presentation }),
              } satisfies PendingReplacementPayCostInsteadPayload,
            },
          },
        ],
        eventJournal: [...state.eventJournal, ...events],
      },
      process: usedProcess,
    };
  }
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
      ...(presentation === undefined ? {} : { presentation }),
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

  const afterReplacement =
    candidate.oncePerTurn === true
      ? consumeOncePerTurn(
          replaced.state,
          toOncePerTurnKey({
            cardInstanceId: candidate.source.instanceId,
            effectId: candidate.effectBlockId,
            turnNumber: state.turn.globalTurn,
          }),
        )
      : replaced.state;
  events.push(...rebaseEvents(state, replaced.events, events.length + 1));
  const continued = continueUncoveredFieldRemovalTargets(
    afterReplacement,
    events,
    effectId,
    usedProcess,
    coveredTargets,
  );
  if ("error" in continued) {
    return { error: continued.error };
  }
  return {
    state: {
      ...continued.state,
      eventJournal: [...state.eventJournal, ...events],
    },
    process: usedProcess,
  };
};

export const executeAcceptedFieldRemovalReplacementProcess =
  executeAcceptedSelectedTargetKoReplacementProcess;

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
  if (isSupportedRestSelfInsteadEffect(effect)) {
    const source = currentPublicFieldRefForInstance(state, entry.source);
    const rested = restFieldObjects(state, [source ?? entry.source]);
    return toEngineResult(rested.state, []);
  }
  if (isSupportedModifyLeaderPowerInsteadEffect(effect)) {
    const records = createContinuousRecordsForResolvedEffect(
      state,
      entry,
      effect,
    );
    if (records === null) {
      return toEngineResult(
        state,
        [],
        [
          acceptedReplacementError(
            entry.effectBlockId,
            "unsupported-effect-shape",
          ),
        ],
      );
    }
    return toEngineResult(
      {
        ...state,
        continuousEffects: [...state.continuousEffects, ...records],
      },
      [],
    );
  }
  if (isSupportedTrashSelfInsteadEffect(effect)) {
    const source = currentPublicFieldRefForInstance(state, entry.source);
    const playerId = source?.playerId ?? entry.controllerId;
    const player = state.players[playerId];
    const sourceZone = source?.zone?.zone;
    const card =
      sourceZone === "characterArea"
        ? player?.characters.find(
            (candidate) => candidate.instanceId === entry.source.instanceId,
          )
        : undefined;
    if (player === undefined || card === undefined) {
      return toEngineResult(
        state,
        [],
        [acceptedReplacementError(entry.effectBlockId, "missing-card")],
      );
    }
    const events: EngineEvent[] = [];
    const moved = moveConcreteCardsToTrash(state, events, [card], {
      cardMovedPayloadShape: "publicZoneNames",
      cardMovedVisibility: { type: "public" },
      cardTrashedVisibility: { type: "public" },
      causedBy: entry.causedBy,
      clearAttachedDon: true,
      emitCardTrashed: true,
      playerId,
      reason: "trashFromField",
      sourceZone: "characterArea",
    });
    return toEngineResult(moved.state, events);
  }
  if (isSupportedKoSelfInsteadEffect(effect)) {
    const source = currentPublicFieldRefForInstance(state, entry.source);
    return executeKoSelfInsteadEffect(state, entry, source);
  }
  return executeNoChoiceEffectPrimitive(state, entry, effect, {
    incrementStateSeq: false,
  });
};
