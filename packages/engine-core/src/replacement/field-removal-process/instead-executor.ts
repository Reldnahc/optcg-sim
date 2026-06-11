import type {
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { toEngineResult } from "../../action-results.js";
import { moveConcreteCardsToTrash } from "../../concrete-card-movement.js";
import { restFieldObjects } from "../../effect-runtime-sequence/saved-field-object.js";
import { executeMoveCardsPrimitive } from "../../effect-runtime-move-cards.js";
import { createContinuousRecordsForResolvedEffect } from "../../runtime/continuous/continuous.js";
import { executeNoChoiceEffectPrimitive } from "../../runtime/primitives/draw.js";
import {
  isSupportedKoSelfInsteadEffect,
  isSupportedModifyPowerInsteadEffect,
  isSupportedRestSelfInsteadEffect,
  isSupportedTrashSelfInsteadEffect,
} from "../instead-effects.js";
import { executeKoSelfInsteadEffect } from "../ko-self-instead.js";
import type { SelectedTargetKoReplacementCandidate } from "../primitives.js";
import { currentPublicFieldRefForInstance } from "./source-snapshot.js";

export const acceptedReplacementError = (
  effectId: string,
  reason: "missing-card" | "unsupported-effect-shape",
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason },
});

export const executeReplacementInsteadEffect = (
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
  if (isSupportedModifyPowerInsteadEffect(effect)) {
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
