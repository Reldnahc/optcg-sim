import type { Effect, Zone } from "@optcg/types";

const zoneLabel = (zone: Zone): string => {
  switch (zone) {
    case "deck":
      return "deck";
    case "life":
      return "Life";
    case "hand":
      return "hand";
    case "trash":
      return "trash";
    case "costArea":
      return "cost area";
    case "characterArea":
      return "Character area";
    case "stageArea":
      return "Stage area";
    case "leaderArea":
      return "Leader area";
    case "donDeck":
      return "DON!! deck";
    case "noZone":
      return "revealed cards";
  }
};

export const chooseQuantityPromptForEffect = (effect: Effect): string => {
  if (effect.type === "drawUpTo") {
    return "Choose how many cards to draw.";
  }
  if (effect.type === "moveCards") {
    return `Choose how many cards to move from ${zoneLabel(
      effect.from.zone,
    )} to ${zoneLabel(effect.to.zone)}.`;
  }
  if (effect.type === "revealTop") {
    return `Choose how many cards to reveal from ${zoneLabel(
      effect.zone ?? "deck",
    )}.`;
  }
  if (effect.type === "chooseNumber") {
    return effect.purpose === "cost" ? "Choose a cost." : "Choose a number.";
  }
  return "Choose quantity.";
};
