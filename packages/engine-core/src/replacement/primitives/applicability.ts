import type {
  CardRef,
  GameState,
  PlayerId,
  ReplacementProcess,
} from "@optcg/types";

import { cardMatchesHandSelectionFilter } from "../../actions/state.js";
import { isSupportedLifeTopToHandEffect } from "../../effect-runtime-move-cards.js";
import {
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "../../rules/once-per-turn.js";
import { getReturnDonEligibleCount } from "../../runtime/primitives/return-don.js";
import {
  resolvePublicTargetCandidates,
  resolvePublicTargetCandidatesForRequest,
} from "../../selection/candidates.js";
import { cardRefsEqual } from "../field-removal-targets.js";
import { isSupportedOwnerDeckBottomInsteadEffect } from "../instead-effects.js";
import { findCardByInstanceId } from "./source-lookup.js";
import {
  isSupportedKoSelfInsteadEffect,
  isSupportedModifyLeaderPowerInsteadEffect,
  isSupportedRestOwnCardsInsteadEffect,
  isSupportedRestSelfInsteadEffect,
  isSupportedReturnDonInsteadEffect,
  isSupportedTrashFromHandInsteadEffect,
  isSupportedTrashSelfInsteadEffect,
} from "./support-shapes.js";
import type {
  LocatedReplacementSource,
  SupportedReplacementEffectBlock,
  ValidatedReplacementTarget,
} from "./types.js";

export const opponentFieldRemovalReplacementCoveredTargets = (
  state: GameState,
  process: ReplacementProcess,
  source: LocatedReplacementSource,
  targetLookups: readonly ValidatedReplacementTarget[],
  effect: SupportedReplacementEffectBlock,
): readonly CardRef[] => {
  const target = effect.trigger.replacement;
  const sourceControllerRelation =
    target.type === "wouldBeKOd" || target.type === "wouldMoveZone"
      ? target.sourceControllerRelation
      : undefined;
  const eligibleTargetLookups =
    sourceControllerRelation === "any"
      ? targetLookups
      : targetLookups.filter(({ located }) =>
          isOpponentControlledFieldRemovalProcess(
            process,
            located.card.controller,
          ),
        );
  if (eligibleTargetLookups.length === 0) {
    return [];
  }
  if (
    (target.type !== "wouldMoveZone" && target.type !== "wouldBeKOd") ||
    target.target.type !== "all"
  ) {
    return [];
  }
  if (!fieldRemovalSourceKindMatches(process, target.sourceKind)) {
    return [];
  }
  if (!canPayOpponentFieldRemovalReplacementCost(state, source, effect)) {
    return [];
  }
  if (
    effect.oncePerTurn === true &&
    isOncePerTurnUsed(
      state,
      toOncePerTurnKey({
        cardInstanceId: source.card.instanceId,
        effectId: effect.id,
        turnNumber: state.turn.globalTurn,
      }),
    )
  ) {
    return [];
  }
  const request = {
    timing: "onResolution",
    chooser: "self",
    player: target.target.player,
    zone: target.target.zone,
    min: 0,
    max: 99,
    allowFewerIfUnavailable: true,
    visibility: "public",
    ...(target.target.filter === undefined
      ? {}
      : { filter: target.target.filter }),
  } as const;
  const candidates = resolvePublicTargetCandidates(state, request, {
    sourceControllerId: source.card.controller,
    source: source.ref,
  });
  if (!candidates.ok) {
    return [];
  }
  return eligibleTargetLookups
    .filter(({ ref }) =>
      candidates.candidates.some((candidate) =>
        cardRefsEqual(candidate.card, ref),
      ),
    )
    .map(({ ref }) => ref);
};

const canPayOpponentFieldRemovalReplacementCost = (
  state: GameState,
  source: LocatedReplacementSource,
  effect: SupportedReplacementEffectBlock,
): boolean => {
  const instead = effect.effect.instead;
  if (isSupportedLifeTopToHandEffect(instead)) {
    const player = state.players[source.card.controller];
    return player !== undefined && player.life.length >= instead.count;
  }
  if (isSupportedRestOwnCardsInsteadEffect(instead)) {
    const candidates = resolvePublicTargetCandidatesForRequest(
      state,
      instead.target.request,
      { sourceControllerId: source.card.controller },
    );
    return (
      candidates.ok &&
      candidates.candidates.filter((candidate) =>
        replacementRestCandidateIsActive(state, candidate.card),
      ).length >= instead.target.request.min
    );
  }
  if (isSupportedRestSelfInsteadEffect(instead)) {
    return (
      source.resolved.category === "character" &&
      source.ref.zone?.zone === "characterArea" &&
      source.card.state !== "rested"
    );
  }
  if (isSupportedTrashFromHandInsteadEffect(instead)) {
    const player = state.players[source.card.controller];
    if (player === undefined) {
      return false;
    }
    const matchingCards = player.hand.filter((card) =>
      cardMatchesHandSelectionFilter(
        state,
        source.card.controller,
        card,
        instead.filter,
      ),
    );
    return matchingCards.length >= instead.count;
  }
  if (isSupportedReturnDonInsteadEffect(instead)) {
    const player = state.players[source.card.controller];
    return (
      player !== undefined && getReturnDonEligibleCount(player) >= instead.count
    );
  }
  if (isSupportedModifyLeaderPowerInsteadEffect(instead)) {
    return state.players[source.card.controller] !== undefined;
  }
  if (isSupportedTrashSelfInsteadEffect(instead)) {
    return (
      source.resolved.category === "character" &&
      source.ref.zone?.zone === "characterArea"
    );
  }
  if (isSupportedKoSelfInsteadEffect(instead)) {
    return (
      source.resolved.category === "character" &&
      source.ref.zone?.zone === "characterArea"
    );
  }
  if (isSupportedOwnerDeckBottomInsteadEffect(instead)) {
    const request = instead.effects[0]?.effect;
    if (request?.type !== "selectTargets") {
      return false;
    }
    const candidates = resolvePublicTargetCandidatesForRequest(
      state,
      request.request,
      { sourceControllerId: source.card.controller },
    );
    return candidates.ok && candidates.candidates.length >= request.request.min;
  }
  return false;
};

const replacementRestCandidateIsActive = (
  state: GameState,
  target: CardRef,
): boolean => {
  const located = findCardByInstanceId(state, target.instanceId);
  return located !== null && located.card.state !== "rested";
};

const fieldRemovalSourceKindMatches = (
  process: ReplacementProcess,
  sourceKind: "battle" | "cardEffect" | undefined,
): boolean => {
  if (sourceKind === undefined) {
    return true;
  }
  const payload = process.payload;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("fieldRemovalAttempt" in payload)
  ) {
    return false;
  }
  const attempt = payload.fieldRemovalAttempt;
  return (
    typeof attempt === "object" &&
    attempt !== null &&
    "sourceKind" in attempt &&
    attempt.sourceKind === sourceKind
  );
};

const isOpponentControlledFieldRemovalProcess = (
  process: ReplacementProcess,
  targetControllerId: PlayerId,
): boolean => {
  const payload = process.payload;
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  if (!("fieldRemovalAttempt" in payload)) {
    return false;
  }
  const attempt = payload.fieldRemovalAttempt;
  if (typeof attempt !== "object" || attempt === null) {
    return false;
  }
  if (
    !("processFamily" in attempt) ||
    attempt.processFamily !== "fieldRemoval" ||
    !("sourceControllerId" in attempt) ||
    typeof attempt.sourceControllerId !== "string"
  ) {
    return false;
  }
  return attempt.sourceControllerId !== targetControllerId;
};
