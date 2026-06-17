import type {
  CardRef,
  GameState,
  ReplacementProcess,
  SelectCardsDecision,
  SelectTargetsDecision,
  TargetCandidate,
} from "@optcg/types";

import { toDecisionId } from "../action-results.js";
import { cardMatchesHandSelectionFilter, toCardRef } from "../actions/state.js";
import { resolvePublicTargetCandidatesForRequest } from "../selection/candidates.js";
import {
  isSupportedRestOwnCardsInsteadEffect,
  isSupportedTrashFromHandInsteadEffect,
  plural,
} from "./instead-effects.js";
import type { SelectedTargetKoReplacementCandidate } from "./primitives.js";

const replacementRestCandidateIsActive = (
  state: GameState,
  target: CardRef,
): boolean => {
  const player = state.players[target.playerId];
  if (player === undefined) {
    return false;
  }
  if (
    target.zone?.zone === "characterArea" &&
    player.characters.some(
      (card) =>
        card.instanceId === target.instanceId && card.state !== "rested",
    )
  ) {
    return true;
  }
  if (
    target.zone?.zone === "stageArea" &&
    player.stage?.instanceId === target.instanceId
  ) {
    return player.stage.state !== "rested";
  }
  if (
    target.zone?.zone === "leaderArea" &&
    player.leader.instanceId === target.instanceId
  ) {
    return player.leader.state !== "rested";
  }
  if (target.zone?.zone === "costArea") {
    return player.costArea.some(
      (card) =>
        card.instanceId === target.instanceId && card.state !== "rested",
    );
  }
  return false;
};

const replacementRestCandidates = (
  state: GameState,
  candidate: SelectedTargetKoReplacementCandidate,
): TargetCandidate[] => {
  const instead = candidate.replacementEffect.instead;
  if (!isSupportedRestOwnCardsInsteadEffect(instead)) {
    return [];
  }
  const resolved = resolvePublicTargetCandidatesForRequest(
    state,
    instead.target.request,
    { sourceControllerId: candidate.controllerId },
  );
  if (!resolved.ok) {
    return [];
  }
  return resolved.candidates.filter((target) =>
    replacementRestCandidateIsActive(state, target.card),
  );
};

export const createReplacementRestTargetDecision = (
  state: GameState,
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
): SelectTargetsDecision | undefined => {
  const instead = candidate.replacementEffect.instead;
  if (!isSupportedRestOwnCardsInsteadEffect(instead)) {
    return undefined;
  }
  const candidates = replacementRestCandidates(state, candidate);
  if (candidates.length < instead.target.request.min) {
    return undefined;
  }
  if (state.players[candidate.controllerId] === undefined) {
    return undefined;
  }
  return {
    id: toDecisionId(
      `decision:replacementRestTargets:${process.id}:${candidate.id}`,
    ),
    type: "selectTargets",
    playerId: candidate.controllerId,
    prompt: `Rest ${String(instead.target.request.min)} ${plural(
      instead.target.request.min,
      "card",
      "cards",
    )} instead.`,
    causedBy: { type: "replacement", replacementId: candidate.id },
    visibility: { type: "public" },
    request: instead.target.request,
    candidates,
  };
};

export const createReplacementTrashFromHandDecision = (
  state: GameState,
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
): SelectCardsDecision | undefined => {
  const instead = candidate.replacementEffect.instead;
  if (!isSupportedTrashFromHandInsteadEffect(instead)) {
    return undefined;
  }
  const player = state.players[candidate.controllerId];
  if (player === undefined) {
    return undefined;
  }
  if (typeof instead.count !== "number") {
    return undefined;
  }
  const visibility = {
    type: "private",
    playerId: candidate.controllerId,
  } as const;
  const candidates = player.hand
    .filter((card) =>
      cardMatchesHandSelectionFilter(
        state,
        candidate.controllerId,
        card,
        instead.filter,
      ),
    )
    .map((card) => ({
      card: toCardRef(card, candidate.controllerId),
      visibility,
    }));
  if (candidates.length < instead.count) {
    return undefined;
  }
  return {
    id: toDecisionId(
      `decision:replacementTrashFromHand:${process.id}:${candidate.id}`,
    ),
    type: "selectCards",
    playerId: candidate.controllerId,
    prompt: `Trash ${String(instead.count)} ${plural(
      instead.count,
      "card",
      "cards",
    )} from hand instead.`,
    causedBy: { type: "replacement", replacementId: candidate.id },
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "hand",
      min: instead.count,
      max: instead.count,
      allowFewerIfUnavailable: false,
      visibility: "privateToChooser",
      ...(instead.filter === undefined ? {} : { filter: instead.filter }),
    },
    candidates,
  };
};
