import type {
  CardId,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineResult,
  GameState,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import {
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { evaluateEffectBlockRuntimeSupport } from "../../effect-runtime-admission.js";
import { isAutoRuntimeTriggerCandidate } from "../../effect-runtime-block-support.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  MainEventTriggerQueueingFailureReason,
} from "./core.js";
import {
  findCardInstanceInTrash,
  toSnapshot,
} from "../../effect-runtime-trigger-source-lookup.js";
import { activeEffectTextPresentationForEffectBlock } from "../effect-presentation.js";
import {
  appendAdmittedTriggerEntries,
  canAdmitTriggerQueueEntry,
  hasPendingTriggerRuntimeWork,
} from "./admission.js";

const mainEventAutoAdapter = {
  category: "auto" as const,
  sourcePresencePolicies: [
    "noSourceRequired",
    "resolveFromDestinationZone",
  ] as const,
  triggerType: "main" as const,
};

const isSupportedMainEventEffect = (
  effect: EffectDefinition["effects"][number],
  siblingBlocks: readonly EffectDefinition["effects"][number][],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  isAutoRuntimeTriggerCandidate(effect, mainEventAutoAdapter) &&
  effect.sourcePresencePolicy === "resolveFromDestinationZone" &&
  evaluateEffectBlockRuntimeSupport(effect, { siblingBlocks }).supported;

const queuedMainEventTriggerEventIds = (state: GameState): Set<string> =>
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
        payload.timingWindowId === `timing-window:${payload.triggerEventId}`
        ? [payload.triggerEventId]
        : [];
    }),
  );

const queuedOpponentActivationTriggerEventIds = (
  state: GameState,
): Set<string> =>
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
        payload.timingWindowId.endsWith(":opponentActivated")
        ? [payload.triggerEventId]
        : [];
    }),
  );

export const createMainEventTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  mainEventTriggerQueueingError: (
    reason: MainEventTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueMainEventTriggers: (
    state: GameState,
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
} => {
  const queueMainEventTriggers = (
    state: GameState,
    options: EngineResultOptions = {},
  ): EngineResult | undefined => {
    if (hasPendingTriggerRuntimeWork(state)) {
      return undefined;
    }
    const queuedMainEvents = queuedMainEventTriggerEventIds(state);
    const queuedOpponentActivations =
      queuedOpponentActivationTriggerEventIds(state);
    const acceptedCardPlayed = state.eventJournal.filter((event) => {
      if (
        event.type !== "cardPlayed" ||
        queuedMainEvents.has(String(event.id))
      ) {
        return false;
      }
      return (
        event.createdAtStateSeq === state.seq ||
        queuedOpponentActivations.has(String(event.id))
      );
    });
    if (acceptedCardPlayed.length === 0) {
      return undefined;
    }

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
    for (const event of acceptedCardPlayed) {
      const payload = event.payload as {
        playerId?: PlayerId;
        instanceId?: string;
        cardId?: CardId;
        category?: string;
      };
      if (
        payload.playerId === undefined ||
        payload.instanceId === undefined ||
        payload.cardId === undefined ||
        payload.category === undefined
      ) {
        return toEngineResult(
          state,
          [],
          [mainEventTriggerQueueingError("invalid-card-played-event")],
          options,
        );
      }
      if (payload.category !== "event") {
        continue;
      }

      const resolved = state.cardManifest.cards[payload.cardId];
      if (resolved === undefined) {
        continue;
      }
      if (resolved.support.status !== "implemented-dsl") {
        continue;
      }

      const source = findCardInstanceInTrash(
        state,
        payload.playerId,
        payload.instanceId,
      );
      if (
        source === undefined ||
        source.cardId !== payload.cardId ||
        source.zone.playerId !== payload.playerId
      ) {
        return toEngineResult(
          state,
          [],
          [mainEventTriggerQueueingError("source-presence-failed")],
          options,
        );
      }

      const lookup = dependencies.resolveImplementedDslEffectDefinition(
        resolved,
        state.cardManifest,
      );
      if (!lookup.ok) {
        return toEngineResult(state, [], [lookup.error], options);
      }
      const mainEffects = lookup.definition.effects.filter((effect) =>
        isAutoRuntimeTriggerCandidate(effect, mainEventAutoAdapter),
      );
      if (mainEffects.length === 0) {
        continue;
      }
      const matching = mainEffects.filter((effect) =>
        isSupportedMainEventEffect(effect, lookup.definition.effects),
      );
      if (matching.length !== mainEffects.length) {
        return toEngineResult(
          state,
          [],
          [mainEventTriggerQueueingError("unsupported-main-event-definition")],
          options,
        );
      }
      for (const effectBlock of matching) {
        const orderingGroup =
          source.zone.playerId === state.turn.turnPlayerId
            ? "turnPlayer"
            : "nonTurnPlayer";
        const queueId =
          `queue-entry:${String(event.id)}:${String(effectBlock.id)}` as EffectQueueEntry["id"];
        const timingWindowId =
          `timing-window:${String(event.id)}` as EffectQueueEntry["timingWindowId"];
        const entrySource = {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: source.zone.playerId,
          zone: source.zone,
        };
        const presentation = activeEffectTextPresentationForEffectBlock({
          effectBlock,
          resolvedCard: resolved,
          source: entrySource,
        });
        const entry: EffectQueueEntry = {
          id: queueId,
          state: "pending",
          timingWindowId,
          generation: 0,
          controllerId: source.zone.playerId,
          source: entrySource,
          sourceSnapshot: toSnapshot(source, resolved),
          triggerEventId: event.id,
          effectBlockId: effectBlock.id,
          orderingGroup,
          createdAtEventSeq: event.seq,
          queuedAtStateSeq: toStateSeq(state.seq + 1),
          sourcePresencePolicy: effectBlock.sourcePresencePolicy,
          causedBy: {
            type: "ruleProcess",
            name: "effectRuntime:mainEventTriggerQueueing",
          },
          ...(presentation === undefined ? {} : { presentation }),
        };
        if (!canAdmitTriggerQueueEntry(state, entry, effectBlock).ok) {
          continue;
        }
        appended.push({ entry, effectBlock, resolved });
      }
    }

    if (appended.length === 0) {
      return undefined;
    }

    const queued = appendAdmittedTriggerEntries(state, appended);
    return toEngineResult(queued.state, queued.events, undefined, options);
  };

  return { queueMainEventTriggers };
};
