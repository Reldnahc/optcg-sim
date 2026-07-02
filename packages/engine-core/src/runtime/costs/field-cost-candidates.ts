import type {
  CardFilter,
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  Zone,
} from "@optcg/types";

import { resolvePublicTargetCandidatesForRequest } from "../../selection/candidates.js";

const fieldCostZones = (includeLeader: boolean): readonly Zone[] =>
  includeLeader
    ? ["leaderArea", "characterArea", "stageArea"]
    : ["characterArea", "stageArea"];

const fieldCardsById = (
  player: PlayerState,
  includeLeader: boolean,
): ReadonlyMap<CardInstance["instanceId"], CardInstance> =>
  new Map(
    [
      ...(includeLeader ? [player.leader] : []),
      ...player.characters,
      ...(player.stage === undefined ? [] : [player.stage]),
    ].map((card) => [card.instanceId, card]),
  );

export const fieldCostSelectableIds = (params: {
  readonly filter: CardFilter | undefined;
  readonly includeLeader: boolean;
  readonly player: PlayerState;
  readonly playerId: PlayerId;
  readonly requireActive: boolean;
  readonly state: GameState;
}): CardInstance["instanceId"][] => {
  const resolved = resolvePublicTargetCandidatesForRequest(
    params.state,
    {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zones: [...fieldCostZones(params.includeLeader)],
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      allowFewerIfUnavailable: true,
      visibility: "public",
      ...(params.filter === undefined ? {} : { filter: params.filter }),
    },
    { sourceControllerId: params.playerId },
  );
  if (!resolved.ok) {
    return [];
  }
  const cardsById = fieldCardsById(params.player, params.includeLeader);
  return resolved.candidates.flatMap((candidate) => {
    const card = cardsById.get(candidate.card.instanceId);
    if (
      card === undefined ||
      card.controller !== params.playerId ||
      (params.requireActive && card.state === "rested")
    ) {
      return [];
    }
    return [card.instanceId];
  });
};
