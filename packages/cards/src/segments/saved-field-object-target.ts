import type {
  Effect,
  SavedFieldObjectZone,
  SelectionId,
  Target,
} from "@optcg/types";

export function savedFieldObjectTarget(
  effect: Extract<Effect, { type: "selectTargets" }>,
  saveResultAs: SelectionId,
): Target | undefined {
  const request = effect.request;
  if ("zone" in request) {
    if (!isSavedFieldObjectZone(request.zone)) {
      return undefined;
    }
    return {
      type: "savedFieldObject",
      binding: {
        family: "selectedTargets",
        saveResultAs,
      },
      zone: request.zone,
      player: request.player,
      visibility: "publicOnly",
      onFailure: "failClosed",
    };
  }

  if (!request.zones.every(isSavedFieldObjectZone)) {
    return undefined;
  }
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs,
    },
    zones: request.zones,
    player: request.player,
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
}

function isSavedFieldObjectZone(zone: string): zone is SavedFieldObjectZone {
  return (
    zone === "leaderArea" ||
    zone === "characterArea" ||
    zone === "stageArea" ||
    zone === "costArea"
  );
}
