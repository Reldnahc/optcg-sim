import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";
type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  damageProcess?: {
    type?: string;
    remainingDamagePoints: number;
  };
};

import {
  appendEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { zonesEqual } from "../../actions/state.js";
import { isSupportedAutoRuntimeEffectBlock } from "../../effect-runtime-block-support.js";
import { isSupportedEffectResolvedCustomDrawEffect } from "../primitives/execute.js";
import type {
  BattleKOTriggerCandidate,
  DetectBattleKOTriggerCandidatesResult,
  EffectRuntimeTriggerQueueingDependencies,
  OnKOTriggerCandidateDetectionFailureReason,
  QueueBattleKOTriggersResult,
} from "./core.js";
import {
  fieldTriggerSources,
  findCardInstanceInTrash,
  findMatchingKOMoveEvent,
  toSnapshot,
  zoneRefFromUnknown,
} from "../../effect-runtime-trigger-source-lookup.js";
import {
  activeEffectTextPresentationForEffectBlock,
  effectQueueEntryPresentationForEffectBlock,
} from "../effect-presentation.js";

export const isSupportedOnKOCompatibleQueuedEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Effect;
} =>
  isSupportedAutoRuntimeEffectBlock(effect, {
    category: "auto",
    sourcePresencePolicies: [
      "resolveFromDestinationZone",
      "resolveFromLastKnownInformation",
    ],
    triggerType: "onKO",
  });

export const createKOTriggerQueueing = (
  dependencies: EffectRuntimeTriggerQueueingDependencies,
  onKOTriggerCandidateDetectionError: (
    reason: OnKOTriggerCandidateDetectionFailureReason,
  ) => EngineError,
): {
  detectBattleKOTriggerCandidates: (
    state: GameState,
    events: readonly EngineEvent[],
  ) => DetectBattleKOTriggerCandidatesResult;
  queueBattleKOTriggers: (
    state: GameState,
    eventBaseState: GameState,
    events: EngineEvent[],
  ) => QueueBattleKOTriggersResult;
  queueEffectResolvedCustomTriggers: (
    state: GameState,
    resolvedEntry: EffectQueueEntry,
    resolutionEvents: readonly EngineEvent[],
  ) => EngineResult | undefined;
} => {
  const detectBattleKOTriggerCandidates = (
    state: GameState,
    events: readonly EngineEvent[],
  ): DetectBattleKOTriggerCandidatesResult => {
    const candidates: BattleKOTriggerCandidate[] = [];
    const koEvents = events.filter((event) => event.type === "cardKOd");

    for (const event of koEvents) {
      const payload = event.payload as {
        playerId?: PlayerId;
        instanceId?: string;
      };
      if (payload.playerId === undefined || payload.instanceId === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("invalid-ko-event-batch"),
        };
      }
      const movedEvent = findMatchingKOMoveEvent(event, events);
      if (movedEvent === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("invalid-ko-event-batch"),
        };
      }

      const source = findCardInstanceInTrash(
        state,
        payload.playerId,
        payload.instanceId,
      );
      const movedPayload = movedEvent.payload as {
        from?: unknown;
        to?: unknown;
      };
      const origin = zoneRefFromUnknown(movedPayload.from);
      const destination = zoneRefFromUnknown(movedPayload.to);
      if (
        source === undefined ||
        origin === undefined ||
        destination === undefined ||
        source.zone.zone !== "trash" ||
        !zonesEqual(source.zone, destination)
      ) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("source-presence-failed"),
        };
      }

      const resolved = state.cardManifest.cards[source.cardId];
      if (resolved === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("missing-card-definition"),
        };
      }
      if (resolved.support.effectDefinitionId === undefined) {
        continue;
      }

      const lookup = dependencies.resolveImplementedDslEffectDefinition(
        resolved,
        state.cardManifest,
      );
      if (!lookup.ok) {
        return { ok: false, error: lookup.error };
      }
      const onKOEffects = lookup.definition.effects.filter(
        (effect) => effect.trigger.type === "onKO",
      );
      if (onKOEffects.length === 0) {
        continue;
      }
      const matching = onKOEffects.filter((effect) =>
        isSupportedOnKOCompatibleQueuedEffect(effect),
      );
      if (matching.length !== onKOEffects.length) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError(
            "unsupported-on-ko-definition",
          ),
        };
      }
      if (matching.length !== 1) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("multiple-on-ko-effects"),
        };
      }

      const effectBlock = matching[0];
      if (effectBlock === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError(
            "unsupported-on-ko-definition",
          ),
        };
      }
      const candidateSource =
        effectBlock.sourcePresencePolicy === "resolveFromLastKnownInformation"
          ? { ...source, zone: origin }
          : source;
      const candidatePresentation = activeEffectTextPresentationForEffectBlock({
        effectBlock,
        resolvedCard: resolved,
        source: {
          instanceId: candidateSource.instanceId,
          cardId: candidateSource.cardId,
          playerId: payload.playerId,
          zone: candidateSource.zone,
        },
      });
      candidates.push({
        effectBlockId: effectBlock.id,
        controllerId: candidateSource.controller,
        source: {
          instanceId: candidateSource.instanceId,
          cardId: candidateSource.cardId,
          playerId: payload.playerId,
          zone: candidateSource.zone,
        },
        sourceSnapshot: toSnapshot(candidateSource, resolved),
        triggerEventId: event.id,
        sourcePresencePolicy: effectBlock.sourcePresencePolicy,
        ...(candidatePresentation === undefined
          ? {}
          : { presentation: candidatePresentation }),
        causedBy: {
          type: "ruleProcess",
          name: "effectRuntime:onKOTriggerCandidateDetection",
        },
      });
    }

    return { ok: true, candidates };
  };

  const queueBattleKOTriggers = (
    state: GameState,
    eventBaseState: GameState,
    events: EngineEvent[],
  ): QueueBattleKOTriggersResult => {
    const detected = detectBattleKOTriggerCandidates(state, events);
    if (!detected.ok) {
      return detected;
    }
    if (detected.candidates.length === 0) {
      return { ok: true, state };
    }

    const appended: EffectQueueEntry[] = [];
    const firstCandidate = detected.candidates[0];
    if (firstCandidate === undefined) {
      return { ok: true, state };
    }
    const timingWindowId =
      `timing-window:${String(firstCandidate.triggerEventId)}:onKO` as EffectQueueEntry["timingWindowId"];
    for (const candidate of detected.candidates) {
      const triggerEvent = events.find(
        (event) => event.id === candidate.triggerEventId,
      );
      if (triggerEvent === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("invalid-ko-event-batch"),
        };
      }

      const orderingGroup =
        candidate.controllerId === state.turn.turnPlayerId
          ? "turnPlayer"
          : "nonTurnPlayer";
      const entry: EffectQueueEntry = {
        id: `queue-entry:${String(candidate.triggerEventId)}:${String(
          candidate.effectBlockId,
        )}` as EffectQueueEntry["id"],
        state: "pending",
        timingWindowId,
        generation: 0,
        controllerId: candidate.controllerId,
        source: candidate.source,
        sourceSnapshot: candidate.sourceSnapshot,
        triggerEventId: candidate.triggerEventId,
        effectBlockId: candidate.effectBlockId,
        orderingGroup,
        createdAtEventSeq: triggerEvent.seq,
        queuedAtStateSeq: state.seq,
        sourcePresencePolicy: candidate.sourcePresencePolicy,
        causedBy: {
          type: "ruleProcess",
          name: "effectRuntime:onKOTriggerQueueing",
        },
        ...(candidate.presentation === undefined
          ? {}
          : { presentation: candidate.presentation }),
      };
      appended.push(entry);
    }

    for (const entry of appended) {
      const beforeEventCount = events.length;
      appendEvent(
        eventBaseState,
        events,
        "effectQueued",
        {
          queueEntryId: entry.id,
          timingWindowId: entry.timingWindowId,
          generation: entry.generation,
          effectBlockId: entry.effectBlockId,
          triggerEventId: entry.triggerEventId,
          sourcePresencePolicy: entry.sourcePresencePolicy,
          orderingGroup: entry.orderingGroup,
        },
        { type: "public" },
      );
      const queuedEvent = events[beforeEventCount];
      if (queuedEvent !== undefined) {
        queuedEvent.causedBy = entry.causedBy;
      }
    }

    return {
      ok: true,
      state: {
        ...state,
        effectQueue: [...state.effectQueue, ...appended],
      },
    };
  };

  const queueEffectResolvedCustomTriggers = (
    state: GameState,
    resolvedEntry: EffectQueueEntry,
    resolutionEvents: readonly EngineEvent[],
  ): EngineResult | undefined => {
    const effectResolved = resolutionEvents.find(
      (event) => event.type === "effectResolved",
    );
    if (effectResolved === undefined) {
      return undefined;
    }
    const eventName = `effectResolved:${String(resolvedEntry.effectBlockId)}`;
    const appended: EffectQueueEntry[] = [];
    const events: EngineEvent[] = [];

    for (const source of fieldTriggerSources(state)) {
      const resolved = state.cardManifest.cards[source.cardId];
      if (
        resolved === undefined ||
        resolved.support.effectDefinitionId === undefined
      ) {
        continue;
      }
      const lookup = dependencies.resolveImplementedDslEffectDefinition(
        resolved,
        state.cardManifest,
      );
      if (!lookup.ok) {
        return toEngineResult(state, [], [lookup.error]);
      }
      const matching = lookup.definition.effects.filter((effect) =>
        isSupportedEffectResolvedCustomDrawEffect(effect, eventName),
      );
      if (matching.length === 0) {
        continue;
      }
      if (matching.length !== 1) {
        return toEngineResult(
          state,
          [],
          [
            dependencies.createUnsupportedPendingRuntimeWorkError({
              kind: "effectQueue",
              count: state.effectQueue.length,
            }),
          ],
        );
      }

      for (const effectBlock of matching) {
        const orderingGroup =
          source.controller === state.turn.turnPlayerId
            ? "turnPlayer"
            : "nonTurnPlayer";
        const queueId =
          `queue-entry:${String(effectResolved.id)}:${String(effectBlock.id)}` as EffectQueueEntry["id"];
        const entrySource = {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: source.controller,
          zone: source.zone,
        };
        const entry: EffectQueueEntry = {
          id: queueId,
          state: "pending",
          timingWindowId: resolvedEntry.timingWindowId,
          generation: resolvedEntry.generation + 1,
          controllerId: source.controller,
          source: entrySource,
          sourceSnapshot: toSnapshot(source, resolved),
          triggerEventId: effectResolved.id,
          effectBlockId: effectBlock.id,
          orderingGroup,
          createdAtEventSeq: effectResolved.seq,
          queuedAtStateSeq: toStateSeq(state.seq + 1),
          sourcePresencePolicy: effectBlock.sourcePresencePolicy,
          causedBy: {
            type: "effect",
            queueEntryId: resolvedEntry.id,
            effectId: resolvedEntry.effectBlockId,
          },
          ...effectQueueEntryPresentationForEffectBlock({
            effectBlock,
            resolvedCard: resolved,
            source: entrySource,
          }),
        };
        appended.push(entry);
      }
    }

    if (appended.length === 0) {
      return undefined;
    }
    const battle = state.battle as EngineInternalBattleState | undefined;
    const shouldDeferForDamageProcess =
      battle?.damageProcess?.type === "multipleDamage" &&
      battle.damageProcess.remainingDamagePoints > 0 &&
      String(resolvedEntry.id).startsWith("queue-entry:life-trigger:") &&
      String(resolvedEntry.timingWindowId).startsWith(
        "timing-window:life-trigger:",
      ) &&
      resolvedEntry.causedBy.type === "decision" &&
      (resolvedEntry.source.zone?.zone === "noZone" ||
        resolvedEntry.sourceSnapshot.zone.zone === "noZone");
    if (
      shouldDeferForDamageProcess &&
      (appended.length !== 1 || state.deferredTriggers.length > 0)
    ) {
      return toEngineResult(
        state,
        [],
        [
          dependencies.createUnsupportedPendingRuntimeWorkError({
            kind: "effectQueue",
            count: state.effectQueue.length + appended.length,
          }),
        ],
      );
    }
    let deferredTriggers = state.deferredTriggers;
    if (shouldDeferForDamageProcess) {
      const deferredEntry = appended[0];
      if (deferredEntry === undefined) {
        return toEngineResult(
          state,
          [],
          [
            dependencies.createUnsupportedPendingRuntimeWorkError({
              kind: "effectQueue",
              count: state.effectQueue.length,
            }),
          ],
        );
      }
      deferredTriggers = [
        ...state.deferredTriggers,
        {
          timingWindowId: deferredEntry.timingWindowId,
          generation: deferredEntry.generation,
          triggerIds: [String(deferredEntry.id)],
          releasePolicy: "afterCurrentProcess",
        },
      ];
    }

    const nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      effectQueue: [...state.effectQueue, ...appended],
      deferredTriggers,
    };
    for (const entry of appended) {
      const beforeEventCount = events.length;
      appendEvent(
        state,
        events,
        "effectQueued",
        {
          queueEntryId: entry.id,
          timingWindowId: entry.timingWindowId,
          generation: entry.generation,
          effectBlockId: entry.effectBlockId,
          triggerEventId: entry.triggerEventId,
          sourcePresencePolicy: entry.sourcePresencePolicy,
          orderingGroup: entry.orderingGroup,
        },
        { type: "public" },
      );
      const queuedEvent = events[beforeEventCount];
      if (queuedEvent !== undefined) {
        queuedEvent.causedBy = entry.causedBy;
      }
    }
    nextState.eventJournal = [...state.eventJournal, ...events];
    return toEngineResult(nextState, events);
  };

  return {
    detectBattleKOTriggerCandidates,
    queueBattleKOTriggers,
    queueEffectResolvedCustomTriggers,
  };
};
