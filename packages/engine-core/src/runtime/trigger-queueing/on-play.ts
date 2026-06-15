import type {
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineResult,
  GameState,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { toEngineResult, toStateSeq } from "../../action-results.js";
import {
  isCardEffectInvalidated,
  isEffectBlockInvalidated,
} from "../../effect-invalidation.js";
import {
  isAutoRuntimeTriggerCandidate,
  isSupportedAutoRuntimeEffectBlock,
} from "../../effect-runtime-block-support.js";
import type {
  EffectRuntimeTriggerQueueingDependencies,
  OnPlayTriggerQueueingFailureReason,
} from "./core.js";
import {
  findCardInstance,
  toSnapshot,
} from "../../effect-runtime-trigger-source-lookup.js";
import { activeEffectTextPresentationForEffectBlock } from "../effect-presentation.js";
import {
  appendAdmittedTriggerEntries,
  canAdmitTriggerQueueEntry,
  hasPendingTriggerRuntimeWork,
} from "./admission.js";

const onPlayAutoAdapter = {
  category: "auto" as const,
  sourcePresencePolicies: [
    "mustRemainInSameZone",
    "resolveFromLastKnownInformation",
  ] as const,
  triggerType: "onPlay" as const,
};

export const createOnPlayTriggerQueueing = (
  dependencies: Pick<
    EffectRuntimeTriggerQueueingDependencies,
    "resolveImplementedDslEffectDefinition"
  >,
  onPlayTriggerQueueingError: (
    reason: OnPlayTriggerQueueingFailureReason,
  ) => EngineError,
): {
  queueOnPlayTriggers: (state: GameState) => EngineResult | undefined;
} => {
  const queueOnPlayTriggers = (state: GameState): EngineResult | undefined => {
    if (hasPendingTriggerRuntimeWork(state)) {
      return undefined;
    }
    const queuedTriggerEventIds = new Set(
      state.eventJournal.flatMap((event) => {
        if (event.type !== "effectQueued") {
          return [];
        }
        const payload = event.payload as { triggerEventId?: unknown };
        return typeof payload.triggerEventId === "string"
          ? [payload.triggerEventId]
          : [];
      }),
    );
    const acceptedCardPlayed = state.eventJournal.filter(
      (event) =>
        event.type === "cardPlayed" &&
        !queuedTriggerEventIds.has(String(event.id)),
    );
    if (acceptedCardPlayed.length === 0) {
      return undefined;
    }
    const sharedTimingWindowId =
      acceptedCardPlayed.length > 1
        ? (`timing-window:${String(acceptedCardPlayed[0]?.id)}:onPlay` as EffectQueueEntry["timingWindowId"])
        : undefined;

    const appended: Array<{
      readonly entry: EffectQueueEntry;
      readonly effectBlock: EffectDefinition["effects"][number];
      readonly resolved: ResolvedCard;
    }> = [];
    for (const event of acceptedCardPlayed) {
      const payload = event.payload as {
        playerId?: PlayerId;
        instanceId?: string;
        cardId?: string;
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
          [onPlayTriggerQueueingError("invalid-card-played-event")],
        );
      }
      if (payload.category !== "character" && payload.category !== "stage") {
        continue;
      }

      const source = findCardInstance(
        state,
        payload.playerId,
        payload.instanceId,
      );
      if (
        source === undefined ||
        source.cardId !== payload.cardId ||
        source.zone.playerId !== payload.playerId
      ) {
        if (event.createdAtStateSeq === state.seq) {
          return toEngineResult(
            state,
            [],
            [onPlayTriggerQueueingError("source-presence-failed")],
          );
        }
        continue;
      }
      const expectedZone =
        payload.category === "character" ? "characterArea" : "stageArea";
      if (source.zone.zone !== expectedZone) {
        if (event.createdAtStateSeq === state.seq) {
          return toEngineResult(
            state,
            [],
            [onPlayTriggerQueueingError("source-presence-failed")],
          );
        }
        continue;
      }
      if (isCardEffectInvalidated(state, source)) {
        continue;
      }
      const resolved = state.cardManifest.cards[source.cardId];
      if (resolved === undefined) {
        return toEngineResult(
          state,
          [],
          [onPlayTriggerQueueingError("missing-card-definition")],
        );
      }
      if (resolved.support.status !== "implemented-dsl") {
        continue;
      }

      const lookup = dependencies.resolveImplementedDslEffectDefinition(
        resolved,
        state.cardManifest,
      );
      if (!lookup.ok) {
        return toEngineResult(state, [], [lookup.error]);
      }
      const onPlayEffects = lookup.definition.effects.filter(
        (effect) =>
          isAutoRuntimeTriggerCandidate(effect, onPlayAutoAdapter) &&
          !isEffectBlockInvalidated(state, source, effect),
      );
      if (onPlayEffects.length === 0) {
        continue;
      }
      const matching = onPlayEffects.filter((effect) =>
        isSupportedAutoRuntimeEffectBlock(effect, onPlayAutoAdapter),
      );
      if (matching.length !== onPlayEffects.length) {
        return toEngineResult(
          state,
          [],
          [onPlayTriggerQueueingError("unsupported-on-play-definition")],
        );
      }
      if (matching.length !== 1) {
        return toEngineResult(
          state,
          [],
          [onPlayTriggerQueueingError("multiple-on-play-effects")],
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
          sharedTimingWindowId ??
          (`timing-window:${String(event.id)}` as EffectQueueEntry["timingWindowId"]);
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
            name: "effectRuntime:onPlayTriggerQueueing",
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
    return toEngineResult(queued.state, queued.events);
  };

  return { queueOnPlayTriggers };
};
