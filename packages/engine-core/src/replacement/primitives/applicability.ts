import type {
  CardRef,
  EffectQueueEntry,
  GameState,
  PlayerId,
  QueueEntryId,
  ReplacementProcess,
  TimingWindowId,
} from "@optcg/types";

import { cardMatchesHandSelectionFilter } from "../../actions/state.js";
import { evaluateQueuedEffectCondition } from "../../effect-runtime-conditions.js";
import { isSupportedLifeTopToHandEffect } from "../../effect-runtime-move-cards.js";
import { createOncePerTurnGate } from "../../rules/once-per-turn.js";
import { getReturnDonEligibleCount } from "../../runtime/primitives/return-don.js";
import {
  resolvePublicTargetCandidates,
  resolvePublicTargetCandidatesForRequest,
} from "../../selection/candidates.js";
import { cardRefsEqual } from "../field-removal-targets.js";
import {
  isSupportedKoSelfInsteadEffect,
  isSupportedModifyPowerInsteadEffect,
  isSupportedReplacementTargetLifeInsteadEffect,
  isSupportedRestOwnCardsInsteadEffect,
  isSupportedRestSelfInsteadEffect,
  isSupportedReturnDonInsteadEffect,
  isSupportedTrashFromHandInsteadEffect,
  isSupportedTrashSelfInsteadEffect,
  supportedReplacementSequenceWithTrashFromHandInstead,
  supportedOwnerDeckBottomInstead,
} from "../instead-effects.js";
import { findCardByInstanceId } from "./source-lookup.js";
import type {
  LocatedReplacementSource,
  SupportedReplacementEffectBlock,
  ValidatedReplacementTarget,
} from "./types.js";

const replacementTriggerForProcess = (
  process: ReplacementProcess,
  effect: SupportedReplacementEffectBlock,
): SupportedReplacementEffectBlock["trigger"]["replacement"] | undefined => {
  const trigger = effect.trigger.replacement;
  if (trigger.type !== "anyOf") {
    return trigger;
  }
  return trigger.replacements.find((replacement) => {
    if (process.type === "ko") {
      return replacement.type === "wouldBeKOd";
    }
    if (process.type === "moveZone") {
      return replacement.type === "wouldMoveZone";
    }
    return false;
  });
};

export const opponentFieldRemovalReplacementCoveredTargets = (
  state: GameState,
  process: ReplacementProcess,
  source: LocatedReplacementSource,
  targetLookups: readonly ValidatedReplacementTarget[],
  effect: SupportedReplacementEffectBlock,
): readonly CardRef[] => {
  const target = replacementTriggerForProcess(process, effect);
  if (target === undefined) {
    return [];
  }
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
    (target.target.type !== "all" && target.target.type !== "self")
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
    !createOncePerTurnGate({
      sourceInstanceId: source.card.instanceId,
      effectId: effect.id,
      turnNumber: state.turn.globalTurn,
      oncePerTurn: effect.oncePerTurn === true,
    }).canUse(state)
  ) {
    return [];
  }
  const condition = evaluateQueuedEffectCondition(
    state,
    replacementConditionEntry(state, source, effect),
    effect.condition,
  );
  if (!condition.supported || !condition.passed) {
    return [];
  }
  if (target.target.type === "self") {
    return eligibleTargetLookups
      .filter(({ ref }) => cardRefsEqual(ref, source.ref))
      .map(({ ref }) => ref);
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

const replacementConditionEntry = (
  state: GameState,
  source: LocatedReplacementSource,
  effect: SupportedReplacementEffectBlock,
): EffectQueueEntry => ({
  id: "replacement-condition" as QueueEntryId,
  state: "pending",
  timingWindowId: "replacement-condition" as TimingWindowId,
  generation: 0,
  controllerId: source.card.controller,
  source: source.ref,
  sourceSnapshot: {
    instanceId: source.card.instanceId,
    cardId: source.card.cardId,
    ownerId: source.card.owner,
    controllerId: source.card.controller,
    zone: source.card.zone,
    category: source.resolved.category,
    colors: source.resolved.colors,
    ...(source.resolved.cost === undefined
      ? {}
      : { cost: source.resolved.cost }),
    ...(source.resolved.power === undefined
      ? {}
      : { power: source.resolved.power }),
    ...(source.resolved.counter === undefined
      ? {}
      : { counter: source.resolved.counter }),
    ...(source.resolved.life === undefined
      ? {}
      : { life: source.resolved.life }),
    keywords: source.resolved.printedKeywords,
  },
  effectBlockId: effect.id,
  orderingGroup:
    state.turn.turnPlayerId === source.card.controller
      ? "turnPlayer"
      : "nonTurnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: state.seq,
  sourcePresencePolicy: "resolveFromLastKnownInformation",
  causedBy: { type: "ruleProcess", name: "replacement-condition" },
});

const canPayOpponentFieldRemovalReplacementCost = (
  state: GameState,
  source: LocatedReplacementSource,
  effect: SupportedReplacementEffectBlock,
): boolean => {
  const instead = effect.effect.instead;
  const sequenceWithTrash =
    supportedReplacementSequenceWithTrashFromHandInstead(instead);
  if (sequenceWithTrash !== undefined) {
    return (
      sequenceWithTrash.prefix.every((segment) =>
        canPayReplacementInsteadSegment(state, source, segment.effect),
      ) &&
      canPayReplacementInsteadSegment(
        state,
        source,
        sequenceWithTrash.trashFromHand,
      )
    );
  }
  return canPayReplacementInsteadSegment(state, source, instead);
};

const canPayReplacementInsteadSegment = (
  state: GameState,
  source: LocatedReplacementSource,
  instead: SupportedReplacementEffectBlock["effect"]["instead"],
): boolean => {
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
  if (isSupportedModifyPowerInsteadEffect(instead)) {
    if (instead.target.type === "myLeader") {
      return state.players[source.card.controller] !== undefined;
    }
    return (
      source.resolved.category === "character" &&
      source.ref.zone?.zone === "characterArea"
    );
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
  if (isSupportedReplacementTargetLifeInsteadEffect(instead)) {
    return true;
  }
  const ownerDeckBottom = supportedOwnerDeckBottomInstead(instead);
  if (ownerDeckBottom !== undefined) {
    const candidates = resolvePublicTargetCandidatesForRequest(
      state,
      ownerDeckBottom.request,
      { sourceControllerId: source.card.controller },
    );
    return (
      candidates.ok &&
      candidates.candidates.length >= ownerDeckBottom.request.min
    );
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
