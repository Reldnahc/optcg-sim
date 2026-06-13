import type { ReplacementInsteadParseResult } from "../shared.js";

export const parseLifeVisibilityInstead = (
  text: string,
): ReplacementInsteadParseResult | undefined => {
  const match =
    /^you may turn (?<count>[1-9]\d*) cards? from the (?<position>top|bottom) of your Life cards (?<face>face-up|face-down) instead\.?$/iu.exec(
      text.trim(),
    );
  const countText = match?.groups?.["count"];
  const position = match?.groups?.["position"];
  const faceText = match?.groups?.["face"];
  if (
    countText === undefined ||
    (position !== "top" && position !== "bottom") ||
    faceText === undefined
  ) {
    return undefined;
  }
  return {
    effect: {
      type: "setLifeCardFaceUp",
      player: "self",
      count: Number.parseInt(countText, 10),
      position,
      faceUp: faceText === "face-up",
    },
    evidence: [
      "instruction:setState",
      "player:self",
      "zone:life",
      position === "top" ? "position:top" : "position:bottom",
      faceText === "face-up" ? "destination:faceUp" : "destination:faceDown",
    ],
  };
};
