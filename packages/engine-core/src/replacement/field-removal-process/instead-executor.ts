import type {
  CardInstance,
  CardRef,
  EffectQueueEntry,
  EngineResult,
  EngineError,
  EngineEvent,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { moveConcreteCardsToTrash } from "../../concrete-card-movement.js";
import { flattenSequenceEffect } from "../../effect-runtime-sequence/support-normalization.js";
import { restFieldObjects } from "../../effect-runtime-sequence/saved-field-object.js";
import { executeMoveCardsPrimitive } from "../../effect-runtime-move-cards.js";
import { createContinuousRecordsForResolvedEffect } from "../../runtime/continuous/continuous.js";
import { executeNoChoiceEffectPrimitive } from "../../runtime/primitives/draw.js";
import { moveFieldCardToOwnerLife } from "../../movement/field-to-life.js";
import { moveFieldCardToOwnerHand } from "../../movement/field-to-hand.js";
import {
  isSupportedKoSelfInsteadEffect,
  isSupportedLifeVisibilityInsteadEffect,
  isSupportedModifyPowerInsteadEffect,
  isSupportedReplacementTargetLifeInsteadEffect,
  isSupportedReplacementInsteadSequenceEffect,
  isSupportedRestSelfInsteadEffect,
  isSupportedReturnSelfToHandInsteadEffect,
  isSupportedTrashSelfInsteadEffect,
} from "../instead-effects.js";
import { executeKoSelfInsteadEffect } from "../ko-self-instead.js";
import type { SelectedTargetKoReplacementCandidate } from "../primitives.js";
import { findCardByInstanceId } from "../primitives/source-lookup.js";
import { currentPublicFieldRefForInstance } from "./source-snapshot.js";

type ReplacementInsteadEffect =
  SelectedTargetKoReplacementCandidate["replacementEffect"]["instead"];

interface ReplacementInsteadContext {
  readonly replacementTargets?: readonly CardRef[];
}

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
  effect: ReplacementInsteadEffect,
  context: ReplacementInsteadContext = {},
): EngineResult => {
  if (isSupportedReplacementInsteadSequenceEffect(effect)) {
    const flattened = flattenSequenceEffect(effect);
    if (flattened === null) {
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
    let nextState = state;
    const events: EngineEvent[] = [];
    for (const segment of flattened.effects) {
      if (segment.effect.type === "payCost") {
        return toEngineResult(nextState, events, [
          acceptedReplacementError(
            entry.effectBlockId,
            "unsupported-effect-shape",
          ),
        ]);
      }
      const executed = executeReplacementInsteadEffect(
        nextState,
        entry,
        segment.effect,
        context,
      );
      if (executed.errors !== undefined) {
        const [firstError, ...remainingErrors] = executed.errors;
        return toEngineResult(
          nextState,
          events,
          firstError === undefined
            ? [
                acceptedReplacementError(
                  entry.effectBlockId,
                  "unsupported-effect-shape",
                ),
              ]
            : [firstError, ...remainingErrors],
        );
      }
      if (executed.state.pendingDecision !== undefined) {
        return toEngineResult(nextState, events, [
          acceptedReplacementError(
            entry.effectBlockId,
            "unsupported-effect-shape",
          ),
        ]);
      }
      nextState = executed.state;
      events.push(...executed.events);
    }
    return toEngineResult(nextState, events);
  }
  if (effect.type === "moveCards") {
    return executeMoveCardsPrimitive(state, entry, effect, {
      incrementStateSeq: false,
    });
  }
  if (isSupportedLifeVisibilityInsteadEffect(effect)) {
    return executeLifeVisibilityInsteadEffect(state, entry, effect);
  }
  if (isSupportedReplacementTargetLifeInsteadEffect(effect)) {
    return executeReplacementTargetLifeInsteadEffect(
      state,
      entry,
      effect,
      context.replacementTargets ?? [],
    );
  }
  if (isSupportedReturnSelfToHandInsteadEffect(effect)) {
    return executeReturnSelfToHandInsteadEffect(state, entry);
  }
  if (isSupportedRestSelfInsteadEffect(effect)) {
    const source = currentPublicFieldRefForInstance(state, entry.source);
    const events: EngineEvent[] = [];
    const rested = restFieldObjects(
      state,
      [source ?? entry.source],
      undefined,
      {
        events,
        sourceKind: "effect",
        sourceControllerId: entry.controllerId,
      },
    );
    return toEngineResult(rested.state, events);
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

const executeReturnSelfToHandInsteadEffect = (
  state: GameState,
  entry: EffectQueueEntry,
): EngineResult => {
  const source = currentPublicFieldRefForInstance(state, entry.source);
  const playerId = source?.playerId ?? entry.controllerId;
  const player = state.players[playerId];
  const sourceZone = source?.zone?.zone;
  if (
    player === undefined ||
    (sourceZone !== "characterArea" && sourceZone !== "stageArea")
  ) {
    return toEngineResult(
      state,
      [],
      [acceptedReplacementError(entry.effectBlockId, "missing-card")],
    );
  }
  const card =
    sourceZone === "characterArea"
      ? player.characters.find(
          (candidate) => candidate.instanceId === entry.source.instanceId,
        )
      : player.stage?.instanceId === entry.source.instanceId
        ? player.stage
        : undefined;
  if (card === undefined) {
    return toEngineResult(
      state,
      [],
      [acceptedReplacementError(entry.effectBlockId, "missing-card")],
    );
  }

  const events: EngineEvent[] = [];
  const moved = moveFieldCardToOwnerHand({
    card,
    causedBy: entry.causedBy,
    events,
    playerId,
    sourceZone,
    state,
  });
  return toEngineResult(moved.state, events);
};

const executeReplacementTargetLifeInsteadEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Extract<ReplacementInsteadEffect, { type: "bounce" }> & {
    target: Extract<
      Extract<ReplacementInsteadEffect, { type: "bounce" }>["target"],
      { type: "replacementTarget" }
    >;
    destination: "lifeTop" | "lifeBottom";
  },
  replacementTargets: readonly CardRef[],
): EngineResult => {
  if (replacementTargets.length === 0) {
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

  let nextState = state;
  const events: EngineEvent[] = [];
  for (const target of replacementTargets) {
    const located = findCardByInstanceId(nextState, target.instanceId);
    if (
      located === null ||
      (located.zone !== "characterArea" && located.zone !== "stageArea")
    ) {
      return toEngineResult(nextState, events, [
        acceptedReplacementError(entry.effectBlockId, "missing-card"),
      ]);
    }
    const moved = moveFieldCardToOwnerLife({
      card: located.card,
      causedBy: entry.causedBy,
      events,
      playerId: located.playerId,
      position: effect.destination === "lifeTop" ? "top" : "bottom",
      sourceZone: located.zone,
      state: nextState,
      ...(effect.destinationFaceUp === undefined
        ? {}
        : { faceUp: effect.destinationFaceUp }),
    });
    nextState = moved.state;
  }

  return toEngineResult(nextState, events);
};

const executeLifeVisibilityInsteadEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Extract<ReplacementInsteadEffect, { type: "setLifeCardFaceUp" }>,
): EngineResult => {
  const playerId = entry.controllerId;
  const player = state.players[playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      [acceptedReplacementError(entry.effectBlockId, "missing-card")],
    );
  }
  const startIndex =
    effect.position === "top" ? 0 : player.life.length - effect.count;
  const selected = player.life.slice(startIndex, startIndex + effect.count);
  if (
    startIndex < 0 ||
    selected.length !== effect.count ||
    selected.some((lifeCard) => lifeCard.faceUp === effect.faceUp)
  ) {
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
  const selectedIndexes = new Set(
    selected.map((_, index) => startIndex + index),
  );
  const nextLife = player.life.map((lifeCard, index) =>
    selectedIndexes.has(index)
      ? { ...lifeCard, faceUp: effect.faceUp }
      : lifeCard,
  );
  const nextState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    players: {
      ...state.players,
      [playerId]: { ...player, life: nextLife },
    },
  };
  const events: EngineEvent[] = [];
  if (effect.faceUp) {
    appendEvent(
      nextState,
      events,
      "cardRevealed",
      {
        revealId: `reveal:life-face-up:${String(entry.id)}`,
        cards: selected.map((lifeCard, offset) =>
          toLifeCardRef(lifeCard.card, playerId, startIndex + offset),
        ),
        origin: "life",
        reason: "replacementEffect",
      },
      { type: "public" },
    );
    const revealed = events[events.length - 1];
    if (revealed !== undefined) {
      revealed.causedBy = entry.causedBy;
    }
  }
  return toEngineResult(
    {
      ...nextState,
      eventJournal: [...nextState.eventJournal, ...events],
    },
    events,
  );
};

const toLifeCardRef = (
  card: CardInstance,
  playerId: PlayerId,
  index: number,
) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: {
    zone: "life" as const,
    playerId,
    slot: "life" as const,
    index,
  },
});
