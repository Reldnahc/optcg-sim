import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  ResolvedCard,
} from "@optcg/types";

import {
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import {
  isCardEffectInvalidated,
  isEffectBlockInvalidated,
} from "../../effect-invalidation.js";
import {
  isAutoRuntimeTriggerCandidate,
  isSupportedAutoRuntimeEffectBlock,
  triggerContainsType,
} from "../../effect-runtime-block-support.js";
import {
  fieldTriggerSources,
  findCardInstance,
  toSnapshot,
  zoneRefFromUnknown,
} from "../../effect-runtime-trigger-source-lookup.js";
import { effectQueueEntryPresentationForEffectBlock } from "../effect-presentation.js";
import {
  isEventTriggerQueueAnchor,
  matchEventTrigger,
  type EventReactionTriggerType,
} from "../event-hooks/matcher.js";
import { activatedReactionQueueingName } from "../optional-activation/event-reaction-support.js";
import { isSupportedActivatedReactionEffect } from "../optional-activation/event-reaction-runtime-support.js";
import {
  isAutoEventReactionRuntimeEventType,
  isAutoEventReactionTimingWindowId,
  isSupportedAutoEventReactionTriggerType,
} from "./event-reaction-events.js";
import {
  appendAdmittedTriggerEntries,
  canAdmitTriggerQueueEntry,
  hasPendingTriggerRuntimeWork,
} from "./admission.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  EventReactionTriggerQueueingFailureReason,
} from "./core.js";

const queuedEventReactionTriggerEventIds = (state: GameState): Set<string> =>
  new Set(
    state.eventJournal.flatMap((event) => {
      if (event.type !== "effectQueued") {
        return [];
      }
      const payload = event.payload as {
        timingWindowId?: unknown;
        triggerEventId?: unknown;
      };
      return typeof payload.triggerEventId === "string" &&
        typeof payload.timingWindowId === "string" &&
        isAutoEventReactionTimingWindowId(payload.timingWindowId)
        ? [payload.triggerEventId]
        : [];
    }),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const autoEventReactionAdapter = (triggerType: EventReactionTriggerType) => ({
  category: "auto" as const,
  sourcePresencePolicies: [
    "mustRemainInSameZone",
    "resolveFromLastKnownInformation",
  ] as const,
  triggerType,
});

const isRecentRuntimeEvent = (state: GameState, event: EngineEvent): boolean =>
  Number(event.createdAtStateSeq) >= Math.max(0, Number(state.seq) - 2);

const isRuntimeEffectEvent = (event: EngineEvent): boolean =>
  event.causedBy?.type === "effect" || event.causedBy?.type === "decision";

interface EventReactionSourceCandidate {
  readonly source: CardInstance;
  readonly lastKnownZone?: CardInstance["zone"];
}

interface EventReactionEffectCandidate {
  readonly effect: EffectDefinition["effects"][number];
  readonly triggerTypesForEvent: readonly EventReactionTriggerType[];
  readonly causedByName: string;
  readonly entryOverride?: Pick<
    EffectQueueEntry,
    "effectBlockOverride" | "queueOrigin"
  >;
}

const isFieldZone = (zone: string): boolean =>
  zone === "leaderArea" || zone === "characterArea" || zone === "stageArea";

const removedFieldSourceCandidate = (
  state: GameState,
  event: EngineEvent,
): EventReactionSourceCandidate | undefined => {
  if (event.type !== "cardMoved" || !isRecord(event.payload)) {
    return undefined;
  }
  const payload = event.payload;
  const from = zoneRefFromUnknown(payload["from"]);
  if (
    from?.playerId === undefined ||
    !isFieldZone(from.zone) ||
    typeof payload["instanceId"] !== "string"
  ) {
    return undefined;
  }
  const source = findCardInstance(state, from.playerId, payload["instanceId"]);
  if (
    source === undefined ||
    source.cardId !== payload["cardId"] ||
    isFieldZone(source.zone.zone)
  ) {
    return undefined;
  }
  return { source, lastKnownZone: from };
};

const eventReactionSourceCandidates = (
  state: GameState,
  event: EngineEvent,
): readonly EventReactionSourceCandidate[] => {
  const liveSources = fieldTriggerSources(state).map((source) => ({ source }));
  const removed = removedFieldSourceCandidate(state, event);
  if (removed === undefined) {
    return liveSources;
  }
  return [
    ...liveSources.filter(
      ({ source }) => source.instanceId !== removed.source.instanceId,
    ),
    removed,
  ];
};

const sourceForInvalidation = (
  candidate: EventReactionSourceCandidate,
): CardInstance =>
  candidate.lastKnownZone === undefined
    ? candidate.source
    : { ...candidate.source, zone: candidate.lastKnownZone };

const sourceFieldEntryEventSeq = (
  state: GameState,
  source: CardInstance,
): number | undefined => {
  for (let index = state.eventJournal.length - 1; index >= 0; index -= 1) {
    const event = state.eventJournal[index];
    if (event?.type !== "cardPlayed" || !isRecord(event.payload)) {
      continue;
    }
    if (
      event.payload["instanceId"] === source.instanceId &&
      event.payload["cardId"] === source.cardId &&
      event.payload["playerId"] === source.controller
    ) {
      return event.seq;
    }
  }
  return undefined;
};

const didEventHappenAfterSourceEntered = (
  state: GameState,
  event: EngineEvent,
  source: CardInstance,
): boolean => {
  const fieldEntrySeq = sourceFieldEntryEventSeq(state, source);
  return fieldEntrySeq === undefined || event.seq > fieldEntrySeq;
};

export const createEventReactionTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  eventReactionTriggerQueueingError: (
    reason: EventReactionTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueEventReactionTriggers: (
    state: GameState,
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
} => {
  const queueEventReactionTriggers = (
    state: GameState,
    options: EngineResultOptions = {},
  ): EngineResult | undefined => {
    if (hasPendingTriggerRuntimeWork(state)) {
      return undefined;
    }
    const alreadyQueued = queuedEventReactionTriggerEventIds(state);
    const reactionEvents = state.eventJournal.filter(
      (event) =>
        (isRecentRuntimeEvent(state, event) || isRuntimeEffectEvent(event)) &&
        !alreadyQueued.has(String(event.id)) &&
        isAutoEventReactionRuntimeEventType(event.type),
    );
    if (reactionEvents.length === 0) {
      return undefined;
    }

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
    for (const event of reactionEvents) {
      for (const candidate of eventReactionSourceCandidates(state, event)) {
        const { source } = candidate;
        const invalidationSource = sourceForInvalidation(candidate);
        if (
          isCardEffectInvalidated(state, invalidationSource) ||
          !didEventHappenAfterSourceEntered(state, event, source)
        ) {
          continue;
        }
        const resolved = state.cardManifest.cards[source.cardId];
        if (
          resolved === undefined ||
          resolved.support.status !== "implemented-dsl" ||
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
        const reactionEffects = lookup.definition.effects.flatMap((effect) => {
          if (isEffectBlockInvalidated(state, invalidationSource, effect)) {
            return [];
          }
          const match = matchEventTrigger(
            state,
            source,
            effect.trigger,
            event,
            reactionEvents,
          );
          if (
            !isEventTriggerQueueAnchor(
              state,
              source,
              effect.trigger,
              event,
              reactionEvents,
            )
          ) {
            return [];
          }
          const triggerTypesForEvent = match.triggerTypes.filter(
            (triggerType) =>
              isSupportedAutoEventReactionTriggerType(triggerType) &&
              (isAutoRuntimeTriggerCandidate(
                effect,
                autoEventReactionAdapter(triggerType),
              ) ||
                effect.category === "activate"),
          );
          return triggerTypesForEvent.length === 0
            ? []
            : [
                {
                  effect,
                  triggerTypesForEvent,
                  causedByName:
                    effect.category === "activate"
                      ? activatedReactionQueueingName
                      : "effectRuntime:eventReactionTriggerQueueing",
                  ...(effect.category === "activate"
                    ? {
                        entryOverride: {
                          queueOrigin: { type: "activatedReaction" },
                          effectBlockOverride: { ...effect, optional: true },
                        },
                      }
                    : {}),
                } satisfies EventReactionEffectCandidate,
              ];
        });
        if (reactionEffects.length === 0) {
          continue;
        }
        const matching = reactionEffects.filter((candidate) =>
          candidate.triggerTypesForEvent.every((triggerType) => {
            if (!triggerContainsType(candidate.effect.trigger, triggerType)) {
              return false;
            }
            if (candidate.effect.category === "activate") {
              return true;
            }
            return isSupportedAutoRuntimeEffectBlock(
              candidate.effect,
              autoEventReactionAdapter(triggerType),
            );
          }),
        );
        if (matching.length === 0) {
          continue;
        }
        for (const {
          causedByName,
          effect,
          entryOverride,
          triggerTypesForEvent,
        } of matching) {
          if (
            candidate.lastKnownZone !== undefined &&
            effect.sourcePresencePolicy !== "resolveFromLastKnownInformation"
          ) {
            continue;
          }
          if (effect.sourcePresencePolicy === undefined) {
            return toEngineResult(
              state,
              [],
              [eventReactionTriggerQueueingError("invalid-event-reaction")],
              options,
            );
          }
          const triggerType = triggerTypesForEvent[0];
          if (triggerType === undefined) {
            return toEngineResult(
              state,
              [],
              [eventReactionTriggerQueueingError("invalid-event-reaction")],
              options,
            );
          }
          const queueSource =
            candidate.lastKnownZone === undefined
              ? source
              : { ...source, zone: candidate.lastKnownZone };
          const entrySource = {
            instanceId: queueSource.instanceId,
            cardId: queueSource.cardId,
            playerId: queueSource.controller,
            zone: queueSource.zone,
          };
          const entry: EffectQueueEntry = {
            id: `queue-entry:${String(event.id)}:${triggerType}:${String(queueSource.instanceId)}:${String(effect.id)}` as EffectQueueEntry["id"],
            state: "pending",
            timingWindowId:
              `timing-window:${String(event.id)}:${triggerType}` as EffectQueueEntry["timingWindowId"],
            generation: 0,
            controllerId: queueSource.controller,
            source: entrySource,
            sourceSnapshot: toSnapshot(queueSource, resolved),
            triggerEventId: event.id,
            effectBlockId: effect.id,
            orderingGroup:
              queueSource.controller === state.turn.turnPlayerId
                ? "turnPlayer"
                : "nonTurnPlayer",
            createdAtEventSeq: event.seq,
            queuedAtStateSeq: toStateSeq(state.seq + 1),
            sourcePresencePolicy: effect.sourcePresencePolicy,
            causedBy: {
              type: "ruleProcess",
              name: causedByName,
            },
            ...entryOverride,
            ...effectQueueEntryPresentationForEffectBlock({
              effectBlock: effect,
              resolvedCard: resolved,
              source: entrySource,
            }),
          };
          if (
            entryOverride !== undefined &&
            !isSupportedActivatedReactionEffect(effect, entry)
          ) {
            continue;
          }
          if (!canAdmitTriggerQueueEntry(state, entry, effect).ok) {
            continue;
          }
          appended.push({ entry, effectBlock: effect, resolved });
        }
      }
    }

    if (appended.length === 0) {
      return undefined;
    }

    const queued = appendAdmittedTriggerEntries(state, appended);
    return toEngineResult(queued.state, queued.events, undefined, options);
  };

  return { queueEventReactionTriggers };
};
