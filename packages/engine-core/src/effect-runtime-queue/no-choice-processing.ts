import type { EngineResult, GameState, QueueEntryId } from "@optcg/types";

import { toEngineResult } from "../action-results.js";
import {
  hasExactDamageDeferredQueue,
  isActiveDoubleAttackDamageProcess,
} from "../effect-runtime-damage-deferred-queue.js";
import { createChooseTriggerOrderDecision } from "../effect-runtime-trigger-order-decision.js";
import { createQueuedEffectResolvers } from "./effect-resolution.js";
import type { QueueEntryResolver } from "./entry-resolution.js";
import { findFirstNoChoiceEffectQueueEntryBeforeChoiceGroup } from "./group-ordering.js";
import { hasUniqueQueueEntryIdsWithin } from "./id-matching.js";
import {
  evaluateQueueOrdering,
  orderNoChoiceQueueEntries,
} from "./ordering.js";
import type { EffectRuntimeQueueResultsDependencies } from "./results-types.js";
import { createUnsupportedEffectQueueResult } from "./unsupported.js";

export interface NoChoiceEffectQueueProcessor {
  readonly processNoChoiceEffectQueue: (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
    acceptedOptionalQueueEntryIds?: readonly QueueEntryId[],
  ) => EngineResult;
  readonly processEffectRuntimeAfterTriggerOrderChoice: (
    state: GameState,
    orderedIds: readonly QueueEntryId[],
  ) => EngineResult;
}

export const createNoChoiceEffectQueueProcessor = (
  dependencies: EffectRuntimeQueueResultsDependencies,
  queueEntryResolver: QueueEntryResolver,
): NoChoiceEffectQueueProcessor => {
  const unsupportedEffectQueueResult = (state: GameState): EngineResult =>
    createUnsupportedEffectQueueResult(
      state,
      dependencies.createUnsupportedPendingRuntimeWorkError,
    );

  const queuedEffectResolvers = createQueuedEffectResolvers(dependencies);

  const processNoChoiceEffectQueue = (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
    acceptedOptionalQueueEntryIds: readonly QueueEntryId[] = [],
  ): EngineResult => {
    if (state.pendingDecision !== undefined) {
      return toEngineResult(state, []);
    }
    if (
      state.deferredTriggers.length > 0 &&
      isActiveDoubleAttackDamageProcess(state)
    ) {
      return hasExactDamageDeferredQueue(
        state,
        queuedEffectResolvers.resolveQueuedEffectDefinition,
      )
        ? toEngineResult(state, [])
        : unsupportedEffectQueueResult(state);
    }
    const ordering = evaluateQueueOrdering(state.effectQueue);
    if (!ordering.ok) {
      return unsupportedEffectQueueResult(state);
    }

    const earliestChoiceGroup = ordering.earliestChoiceGroup;
    if (
      acceptedOptionalQueueEntryIds.length > 0 &&
      orderedCurrentChoiceGroupIds === undefined
    ) {
      const acceptedOptionalIds = new Set(acceptedOptionalQueueEntryIds);
      const acceptedEntry = state.effectQueue.find((entry) =>
        acceptedOptionalIds.has(entry.id),
      );
      if (acceptedEntry === undefined) {
        return unsupportedEffectQueueResult(state);
      }
      const resolved = queueEntryResolver.resolveQueueEntriesInOrder(
        state,
        [acceptedEntry],
        acceptedOptionalIds,
      );
      if (
        resolved.errors !== undefined ||
        resolved.state.status.type !== "active"
      ) {
        return resolved;
      }
      const continued = processNoChoiceEffectQueue(resolved.state);
      return {
        ...continued,
        events: [...resolved.events, ...continued.events],
      };
    }
    if (earliestChoiceGroup !== undefined) {
      if (orderedCurrentChoiceGroupIds !== undefined) {
        const expectedIds = earliestChoiceGroup.entries.map(
          (entry) => entry.id,
        );
        if (
          !hasUniqueQueueEntryIdsWithin(
            expectedIds,
            orderedCurrentChoiceGroupIds,
          )
        ) {
          return unsupportedEffectQueueResult(state);
        }
        const selectedById = new Map(
          earliestChoiceGroup.entries.map((entry) => [entry.id, entry]),
        );
        const selectedEntries = orderedCurrentChoiceGroupIds.map((id) => {
          const entry = selectedById.get(id);
          if (entry === undefined) {
            throw new Error("Ordered choice id missing from validated group.");
          }
          return entry;
        });
        const acceptedOptionalIds = new Set(acceptedOptionalQueueEntryIds);
        const resolved = queueEntryResolver.resolveQueueEntriesInOrder(
          state,
          selectedEntries,
          acceptedOptionalIds,
        );
        if (
          resolved.errors !== undefined ||
          resolved.state.status.type !== "active"
        ) {
          return resolved;
        }
        const continued = processNoChoiceEffectQueue(resolved.state);
        return {
          ...continued,
          events: [...resolved.events, ...continued.events],
        };
      }
      const noChoiceBeforeChoice =
        findFirstNoChoiceEffectQueueEntryBeforeChoiceGroup(
          ordering.groups,
          earliestChoiceGroup,
        );
      if (noChoiceBeforeChoice !== undefined) {
        const resolved = queueEntryResolver.resolveQueueEntriesInOrder(
          state,
          [noChoiceBeforeChoice],
          new Set(acceptedOptionalQueueEntryIds),
        );
        if (
          resolved.errors !== undefined ||
          resolved.state.status.type !== "active"
        ) {
          return resolved;
        }
        const continued = processNoChoiceEffectQueue(resolved.state);
        return {
          ...continued,
          events: [...resolved.events, ...continued.events],
        };
      }
      return createChooseTriggerOrderDecision(state, earliestChoiceGroup);
    }

    const ordered = orderNoChoiceQueueEntries(ordering.groups);
    if (!ordered.ok) {
      return unsupportedEffectQueueResult(state);
    }

    const firstEntry = ordered.entries[0];
    if (firstEntry === undefined) {
      return toEngineResult(state, []);
    }
    const resolved = queueEntryResolver.resolveQueueEntriesInOrder(
      state,
      [firstEntry],
      new Set(acceptedOptionalQueueEntryIds),
    );
    if (
      resolved.errors !== undefined ||
      resolved.state.status.type !== "active"
    ) {
      return resolved;
    }
    const continued = processNoChoiceEffectQueue(resolved.state);
    return {
      ...continued,
      events: [...resolved.events, ...continued.events],
    };
  };

  const processEffectRuntimeAfterTriggerOrderChoice = (
    state: GameState,
    orderedIds: readonly QueueEntryId[],
  ): EngineResult => processNoChoiceEffectQueue(state, orderedIds);

  return {
    processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice,
  };
};
