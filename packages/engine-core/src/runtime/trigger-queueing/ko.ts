import type {
  CardId,
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
  appendEffectQueuedEvent,
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { zonesEqual } from "../../actions/state.js";
import {
  isAutoRuntimeTriggerCandidate,
  isSupportedAutoRuntimeEffectBlock,
} from "../../effect-runtime-block-support.js";
import { isSupportedEffectResolvedCustomEffect } from "../../effect-runtime-custom-trigger-support.js";
import type {
  BattleKOTriggerCandidate,
  DetectBattleKOTriggerCandidatesResult,
  EffectRuntimeTriggerQueueingDependencies,
  OnKOTriggerCandidateDetectionFailureReason,
  QueueBattleKOTriggersResult,
} from "./core.js";
import {
  fieldTriggerSources,
  findCardInstance,
  findCardInstanceInTrash,
  findMatchingKOMoveEvent,
  toSnapshot,
  zoneRefFromUnknown,
} from "../../effect-runtime-trigger-source-lookup.js";
import {
  activeEffectTextPresentationForEffectBlock,
  effectQueueEntryPresentationForEffectBlock,
} from "../effect-presentation.js";
import {
  isLifeTriggerQueueEntry,
  lifeTriggerQueueOrigin,
} from "../../life-trigger/queue-origin.js";
import { canAdmitTriggerQueueEntry } from "./admission.js";
import { createUnsupportedEffectQueueWork } from "../../effect-runtime-queue/diagnostics.js";

const onKOAutoAdapter = {
  category: "auto" as const,
  sourcePresencePolicies: [
    "resolveFromDestinationZone",
    "resolveFromLastKnownInformation",
  ] as const,
  triggerType: "onKO" as const,
};

const queuedOnKOTriggerEventIds = (
  state: GameState,
  events: readonly EngineEvent[],
): Set<string> =>
  new Set(
    [...state.eventJournal, ...events].flatMap((event) => {
      if (event.type !== "effectQueued") {
        return [];
      }
      const payload = event.payload as {
        entryPoint?: { type?: unknown };
        triggerEventId?: unknown;
      };
      return typeof payload.triggerEventId === "string" &&
        payload.entryPoint?.type === "onKO"
        ? [payload.triggerEventId]
        : [];
    }),
  );

export const isSupportedOnKOCompatibleQueuedEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Effect;
} => isSupportedAutoRuntimeEffectBlock(effect, onKOAutoAdapter);

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
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
} => {
  const detectBattleKOTriggerCandidates = (
    state: GameState,
    events: readonly EngineEvent[],
    sourceState: GameState = state,
  ): DetectBattleKOTriggerCandidatesResult => {
    const candidates: BattleKOTriggerCandidate[] = [];
    const queuedTriggerEventIds = queuedOnKOTriggerEventIds(state, events);
    const koEvents = events.filter(
      (event) =>
        event.type === "cardKOd" && !queuedTriggerEventIds.has(event.id),
    );

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

      const movedPayload = movedEvent.payload as {
        cardId?: CardId;
        from?: unknown;
        to?: unknown;
      };
      const origin = zoneRefFromUnknown(movedPayload.from);
      const destination = zoneRefFromUnknown(movedPayload.to);
      if (origin === undefined || destination === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("invalid-ko-event-batch"),
        };
      }
      if (movedPayload.cardId === undefined) {
        return {
          ok: false,
          error: onKOTriggerCandidateDetectionError("invalid-ko-event-batch"),
        };
      }
      const resolved = state.cardManifest.cards[movedPayload.cardId];
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
      const onKOEffects = lookup.definition.effects.filter((effect) =>
        isAutoRuntimeTriggerCandidate(effect, onKOAutoAdapter),
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

      const liveSource = findCardInstance(
        state,
        payload.playerId,
        payload.instanceId,
      );
      const lastKnownSource = findCardInstance(
        sourceState,
        payload.playerId,
        payload.instanceId,
      );
      for (const effectBlock of matching) {
        const source =
          effectBlock.sourcePresencePolicy === "resolveFromLastKnownInformation"
            ? liveSource
            : findCardInstanceInTrash(
                state,
                payload.playerId,
                payload.instanceId,
              );
        if (
          source === undefined ||
          source.cardId !== movedPayload.cardId ||
          (effectBlock.sourcePresencePolicy === "resolveFromDestinationZone" &&
            !zonesEqual(source.zone, destination))
        ) {
          return {
            ok: false,
            error: onKOTriggerCandidateDetectionError("source-presence-failed"),
          };
        }
        const candidateSource =
          effectBlock.sourcePresencePolicy === "resolveFromLastKnownInformation"
            ? { ...source, zone: origin }
            : source;
        const candidatePresentation =
          activeEffectTextPresentationForEffectBlock({
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
          effectBlock,
          resolvedCard: resolved,
          controllerId: candidateSource.controller,
          source: {
            instanceId: candidateSource.instanceId,
            cardId: candidateSource.cardId,
            playerId: payload.playerId,
            zone: candidateSource.zone,
          },
          sourceSnapshot: {
            ...toSnapshot(candidateSource, resolved),
            ...(lastKnownSource === undefined ||
            lastKnownSource.attachedDon.length === 0
              ? {}
              : { attachedDonCount: lastKnownSource.attachedDon.length }),
          },
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
    }

    return { ok: true, candidates };
  };

  const queueBattleKOTriggers = (
    state: GameState,
    eventBaseState: GameState,
    events: EngineEvent[],
  ): QueueBattleKOTriggersResult => {
    const detected = detectBattleKOTriggerCandidates(
      state,
      events,
      eventBaseState,
    );
    if (!detected.ok) {
      return detected;
    }
    if (detected.candidates.length === 0) {
      return { ok: true, state };
    }

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: BattleKOTriggerCandidate["resolvedCard"];
    }> = [];
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
      if (
        !canAdmitTriggerQueueEntry(state, entry, candidate.effectBlock, {
          allowPendingRuntimeWork: true,
        }).ok
      ) {
        continue;
      }
      appended.push({
        entry,
        effectBlock: candidate.effectBlock,
        resolved: candidate.resolvedCard,
      });
    }

    for (const { entry, effectBlock, resolved } of appended) {
      appendEffectQueuedEvent(
        eventBaseState,
        events,
        entry,
        effectBlock,
        resolved,
      );
    }

    return {
      ok: true,
      state: {
        ...state,
        effectQueue: [
          ...state.effectQueue,
          ...appended.map(({ entry }) => entry),
        ],
      },
    };
  };

  const queueEffectResolvedCustomTriggers = (
    state: GameState,
    resolvedEntry: EffectQueueEntry,
    resolutionEvents: readonly EngineEvent[],
    options: EngineResultOptions = {},
  ): EngineResult | undefined => {
    const effectResolved = resolutionEvents.find(
      (event) => event.type === "effectResolved",
    );
    if (effectResolved === undefined) {
      return undefined;
    }
    const eventName = `effectResolved:${String(resolvedEntry.effectBlockId)}`;
    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: BattleKOTriggerCandidate["resolvedCard"];
    }> = [];
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
        return toEngineResult(state, [], [lookup.error], options);
      }
      const matching = lookup.definition.effects.filter((effect) =>
        isSupportedEffectResolvedCustomEffect(effect, eventName),
      );
      if (matching.length === 0) {
        continue;
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
          ...(isLifeTriggerQueueEntry(resolvedEntry)
            ? { queueOrigin: lifeTriggerQueueOrigin }
            : {}),
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
        if (
          !canAdmitTriggerQueueEntry(state, entry, effectBlock, {
            allowPendingRuntimeWork: true,
          }).ok
        ) {
          continue;
        }
        appended.push({ entry, effectBlock, resolved });
      }
    }

    if (appended.length === 0) {
      return undefined;
    }
    const battle = state.battle as EngineInternalBattleState | undefined;
    const shouldDeferForDamageProcess =
      battle?.damageProcess?.type === "multipleDamage" &&
      battle.damageProcess.remainingDamagePoints > 0 &&
      isLifeTriggerQueueEntry(resolvedEntry) &&
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
            ...createUnsupportedEffectQueueWork(
              state.effectQueue.length + appended.length,
              {
                gate: "deferred-trigger-release",
                ...(appended[0]?.entry === undefined
                  ? {}
                  : { entry: appended[0].entry, exposeEntryIdentity: true }),
                queueReason: "invalid-damage-deferred-queue",
              },
            ),
          }),
        ],
        options,
      );
    }
    let deferredTriggers = state.deferredTriggers;
    if (shouldDeferForDamageProcess) {
      const deferredEntry = appended[0]?.entry;
      if (deferredEntry === undefined) {
        return toEngineResult(
          state,
          [],
          [
            dependencies.createUnsupportedPendingRuntimeWorkError({
              ...createUnsupportedEffectQueueWork(state.effectQueue.length, {
                gate: "deferred-trigger-release",
                queueReason: "invalid-damage-deferred-queue",
              }),
            }),
          ],
          options,
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
      effectQueue: [
        ...state.effectQueue,
        ...appended.map(({ entry }) => entry),
      ],
      deferredTriggers,
    };
    for (const { entry, effectBlock, resolved } of appended) {
      appendEffectQueuedEvent(state, events, entry, effectBlock, resolved);
    }
    nextState.eventJournal = [...state.eventJournal, ...events];
    return toEngineResult(nextState, events, undefined, options);
  };

  return {
    detectBattleKOTriggerCandidates,
    queueBattleKOTriggers,
    queueEffectResolvedCustomTriggers,
  };
};
