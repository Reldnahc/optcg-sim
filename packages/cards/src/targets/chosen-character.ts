import type { Target } from "@optcg/types";

export const chosenCharacterSelectionId = "selected:chosenCharacter";

export const chosenCharacterTarget = (): Target => ({
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: chosenCharacterSelectionId,
  },
  zone: "characterArea",
  player: "opponent",
  visibility: "publicOnly",
  onFailure: "failClosed",
});
