import type {
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  ReplacementProcess,
  TimingWindowId,
} from "@optcg/types";

import {
  appendEvent,
  appendPendingSpotlightEntryCreatedEvents,
  appendReplacementSpotlightEntryCreatedEvents,
  rebaseEvents,
  toStateSeq,
} from "../../action-results.js";
import { consumeOncePerTurnForQueueEntry } from "../../rules/once-per-turn.js";
import { hashCanonicalStateValue } from "../../state/canonical-state.js";
import type {
  EngineInternalReplacementAppliedEventPayload,
  PendingReplacementPayCostInsteadPayload,
} from "../continuation-payloads.js";
import {
  createReplacementRestTargetDecision,
  createReplacementTrashFromHandDecision,
} from "../field-removal-decisions.js";
import { fieldRemovalProcessTargets } from "../field-removal-targets.js";
import {
  isSupportedTrashFromHandInsteadEffect,
  supportedReplacementSequenceWithTrashFromHandInstead,
} from "../instead-effects.js";
import { createReplacementOwnerDeckBottomDecision } from "../owner-deck-bottom-decision.js";
import { createReplacementPayCostDecision } from "../pay-cost-decision.js";
import { replacementCandidatePresentation } from "../presentation-payload.js";
import {
  markReplacementUsed,
  replacementAlreadyUsed,
  replacementStateWithProcess,
} from "../process-gate.js";
import { detectSupportedSelectedTargetKoReplacementCandidate } from "../primitives.js";
import { continueUncoveredFieldRemovalTargets } from "../unreplaced-field-removal.js";
import {
  acceptedReplacementError,
  executeReplacementInsteadEffect,
} from "./instead-executor.js";
import { replacementCandidatesFromDetection } from "./pause.js";
import {
  replacementInsteadTransformedPayload,
  toReplacementDrawSourceSnapshot,
} from "./source-snapshot.js";
import type {
  PendingReplacementRestInsteadPayload,
  PendingReplacementTrashFromHandInsteadPayload,
} from "./types.js";

const appendReplacementDecisionCreated = <
  TDecision extends NonNullable<GameState["pendingDecision"]>,
>({
  decision,
  events,
  presentation,
  state,
}: {
  readonly state: GameState;
  readonly events: EngineEvent[];
  readonly decision: TDecision;
  readonly presentation: Parameters<
    typeof appendPendingSpotlightEntryCreatedEvents
  >[0]["activeEffectText"];
}): TDecision => {
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
    },
    decision.visibility,
  );
  const created = events[events.length - 1];
  if (created !== undefined) {
    created.causedBy = decision.causedBy;
  }
  return appendPendingSpotlightEntryCreatedEvents({
    state,
    events,
    pendingDecision: decision,
    decisionCreatedEvent: created,
    recipientPlayerId: decision.playerId,
    activeEffectText: presentation,
    visibility: decision.visibility,
  }).pendingDecision;
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
  if (replacementAlreadyUsed(process, replacementId)) {
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

  const usedProcess = markReplacementUsed(process, candidate.id);
  const coveredTargets =
    candidate.coveredTargets ?? fieldRemovalProcessTargets(usedProcess);
  const presentation = replacementCandidatePresentation(
    state,
    candidate,
    coveredTargets,
  );
  const sequenceWithTrash =
    supportedReplacementSequenceWithTrashFromHandInstead(
      candidate.replacementEffect.instead,
    );
  if (sequenceWithTrash !== undefined) {
    const sourceSnapshot = toReplacementDrawSourceSnapshot(
      state,
      candidate.source,
    );
    if (sourceSnapshot === null) {
      return { error: acceptedReplacementError(effectId, "missing-card") };
    }
    const replacementEntry: EffectQueueEntry = {
      id: `${process.id}:replacement:${candidate.id}:prefix` as EffectQueueEntry["id"],
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
    let prefixState: GameState = {
      ...state,
      eventJournal: [...state.eventJournal, ...events],
    };
    for (const [index, segment] of sequenceWithTrash.prefix.entries()) {
      const replaced = executeReplacementInsteadEffect(
        prefixState,
        {
          ...replacementEntry,
          id: `${String(replacementEntry.id)}:${String(index)}` as EffectQueueEntry["id"],
        },
        segment.effect,
        { replacementTargets: coveredTargets },
      );
      if (replaced.errors !== undefined) {
        return {
          error:
            replaced.errors[0] ??
            acceptedReplacementError(effectId, "unsupported-effect-shape"),
        };
      }
      if (replaced.state.pendingDecision !== undefined) {
        return {
          error: acceptedReplacementError(effectId, "unsupported-effect-shape"),
        };
      }
      prefixState = replaced.state;
      events.push(...rebaseEvents(state, replaced.events, events.length + 1));
    }
    const trashCandidate = {
      ...candidate,
      replacementEffect: {
        ...candidate.replacementEffect,
        instead: sequenceWithTrash.trashFromHand,
      },
    };
    const trashFromHandDecision = createReplacementTrashFromHandDecision(
      prefixState,
      process,
      trashCandidate,
    );
    if (trashFromHandDecision === undefined) {
      return {
        error: acceptedReplacementError(effectId, "unsupported-effect-shape"),
      };
    }
    const anchoredTrashFromHandDecision = appendReplacementDecisionCreated({
      state: prefixState,
      events,
      decision: trashFromHandDecision,
      presentation,
    });
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
        ...prefixState,
        seq: toStateSeq(prefixState.seq + 1),
        pendingDecision: anchoredTrashFromHandDecision,
        replacementState: replacementStateWithProcess(
          prefixState,
          usedProcess,
          {
            ...(typeof process.payload === "object" && process.payload !== null
              ? process.payload
              : {}),
            pendingReplacementTrashFromHandInstead: {
              decisionId: anchoredTrashFromHandDecision.id,
              effectBlockId: candidate.effectBlockId,
              replacementId: candidate.id,
              source: candidate.source,
              ...(process.target === undefined
                ? {}
                : { target: process.target }),
              coveredTargets: [...coveredTargets],
              causedBy: process.causedBy,
              controllerId: candidate.controllerId,
              count: anchoredTrashFromHandDecision.request.min,
              ...(presentation === undefined ? {} : { presentation }),
              ...(sequenceWithTrash.trashFromHand.filter === undefined
                ? {}
                : { filter: sequenceWithTrash.trashFromHand.filter }),
              ...(oncePerTurn === undefined ? {} : { oncePerTurn }),
            } satisfies PendingReplacementTrashFromHandInsteadPayload,
          },
        ),
        eventJournal: [...state.eventJournal, ...events],
      },
      process: usedProcess,
    };
  }
  const ownerDeckBottomDecision = createReplacementOwnerDeckBottomDecision(
    state,
    process,
    candidate,
  );
  if (ownerDeckBottomDecision !== undefined) {
    const anchoredOwnerDeckBottomDecision = appendReplacementDecisionCreated({
      state,
      events,
      decision: ownerDeckBottomDecision,
      presentation,
    });
    return {
      state: {
        ...state,
        seq: toStateSeq(state.seq + 1),
        pendingDecision: anchoredOwnerDeckBottomDecision,
        replacementState: replacementStateWithProcess(state, usedProcess, {
          ...(typeof process.payload === "object" && process.payload !== null
            ? process.payload
            : {}),
          pendingReplacementOwnerDeckBottomInstead: {
            decisionId: anchoredOwnerDeckBottomDecision.id,
            effectBlockId: candidate.effectBlockId,
            replacementId: candidate.id,
            source: candidate.source,
            ...(process.target === undefined ? {} : { target: process.target }),
            coveredTargets: [...coveredTargets],
            causedBy: process.causedBy,
            controllerId: candidate.controllerId,
            ...(presentation === undefined ? {} : { presentation }),
          },
        }),
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
    const anchoredRestDecision = appendReplacementDecisionCreated({
      state,
      events,
      decision: restDecision,
      presentation,
    });
    return {
      state: {
        ...state,
        seq: toStateSeq(state.seq + 1),
        pendingDecision: anchoredRestDecision,
        replacementState: replacementStateWithProcess(state, usedProcess, {
          ...(typeof process.payload === "object" && process.payload !== null
            ? process.payload
            : {}),
          pendingReplacementRestInstead: {
            decisionId: anchoredRestDecision.id,
            effectBlockId: candidate.effectBlockId,
            replacementId: candidate.id,
            source: candidate.source,
            ...(process.target === undefined ? {} : { target: process.target }),
            coveredTargets: [...coveredTargets],
            causedBy: process.causedBy,
            controllerId: candidate.controllerId,
            ...(presentation === undefined ? {} : { presentation }),
          } satisfies PendingReplacementRestInsteadPayload,
        }),
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
    const anchoredTrashFromHandDecision = appendReplacementDecisionCreated({
      state,
      events,
      decision: trashFromHandDecision,
      presentation,
    });
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
        pendingDecision: anchoredTrashFromHandDecision,
        replacementState: replacementStateWithProcess(state, usedProcess, {
          ...(typeof process.payload === "object" && process.payload !== null
            ? process.payload
            : {}),
          pendingReplacementTrashFromHandInstead: {
            decisionId: anchoredTrashFromHandDecision.id,
            effectBlockId: candidate.effectBlockId,
            replacementId: candidate.id,
            source: candidate.source,
            ...(process.target === undefined ? {} : { target: process.target }),
            coveredTargets: [...coveredTargets],
            causedBy: process.causedBy,
            controllerId: candidate.controllerId,
            count: anchoredTrashFromHandDecision.request.min,
            ...(presentation === undefined ? {} : { presentation }),
            ...(trashInstead.filter === undefined
              ? {}
              : { filter: trashInstead.filter }),
            ...(oncePerTurn === undefined ? {} : { oncePerTurn }),
          } satisfies PendingReplacementTrashFromHandInsteadPayload,
        }),
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
    const anchoredPayCostDecision = appendReplacementDecisionCreated({
      state,
      events,
      decision: payCostDecision,
      presentation,
    });
    return {
      state: {
        ...state,
        seq: toStateSeq(state.seq + 1),
        pendingDecision: anchoredPayCostDecision,
        replacementState: replacementStateWithProcess(state, usedProcess, {
          ...(typeof process.payload === "object" && process.payload !== null
            ? process.payload
            : {}),
          pendingReplacementPayCostInstead: {
            decisionId: anchoredPayCostDecision.id,
            effectBlockId: candidate.effectBlockId,
            replacementId: candidate.id,
            source: candidate.source,
            ...(process.target === undefined ? {} : { target: process.target }),
            coveredTargets: [...coveredTargets],
            causedBy: process.causedBy,
            controllerId: candidate.controllerId,
            cost: anchoredPayCostDecision.cost,
            ...(presentation === undefined ? {} : { presentation }),
          } satisfies PendingReplacementPayCostInsteadPayload,
        }),
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
    appendReplacementSpotlightEntryCreatedEvents({
      state,
      events,
      replacementAppliedEvent: applied,
      replacementId: candidate.id,
      presentation,
    });
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
    { replacementTargets: coveredTargets },
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
      ? consumeOncePerTurnForQueueEntry(replaced.state, replacementEntry, {
          oncePerTurn: candidate.oncePerTurn,
        })
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
