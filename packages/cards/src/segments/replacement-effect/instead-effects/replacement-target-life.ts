import type { ReplacementInsteadParseResult } from "../shared.js";

export function parseReplacementTargetLifeInstead(
  text: string,
): ReplacementInsteadParseResult | undefined {
  const match =
    /^you may add it to the (?<position>top|bottom) of your Life cards (?<face>face-up|face-down) instead\.?$/iu.exec(
      text.trim(),
    );
  const position = match?.groups?.["position"];
  const face = match?.groups?.["face"];
  if (
    (position !== "top" && position !== "bottom") ||
    (face !== "face-up" && face !== "face-down")
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "bounce",
      target: { type: "replacementTarget" },
      destination: position === "top" ? "lifeTop" : "lifeBottom",
      destinationFaceUp: face === "face-up",
    },
    evidence: [
      "instruction:bounce",
      "target:replacementTarget",
      "destination:life",
      position === "top" ? "position:top" : "position:bottom",
      face === "face-up" ? "visibility:faceUp" : "visibility:faceDown",
    ],
  };
}
