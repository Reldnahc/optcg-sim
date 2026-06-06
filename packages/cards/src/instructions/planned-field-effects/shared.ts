export const thatCharacterSelectionId = "selected:thatCharacter";
export const selectedBlockerRestrictedAttackerId =
  "selected:blocker-restricted-attacker";

export const thatCharacterSavedTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: thatCharacterSelectionId,
  },
  zone: "characterArea",
  player: "opponent",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const;

export const selectedBlockerRestrictedTarget = {
  type: "savedFieldObject",
  binding: {
    family: "selectedTargets",
    saveResultAs: selectedBlockerRestrictedAttackerId,
  },
  zones: ["leaderArea", "characterArea"],
  player: "self",
  visibility: "publicOnly",
  onFailure: "failClosed",
} as const;
