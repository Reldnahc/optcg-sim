import { parseYourFieldReplacementTarget } from "../targets/replacement-targets.js";
import type { InstructionParser } from "../types.js";
import { parseInsteadEffect } from "../segments/replacement-effect/instead-effects/index.js";

export const parseGrantReplacementInstruction: InstructionParser = (input) => {
  const permanentLifeRuleReplacement =
    /^Your face-up Life cards are placed at the bottom of your deck instead of being added to your hand, according to the rules\.?$/iu.exec(
      input.text.trim(),
    );
  if (permanentLifeRuleReplacement !== null) {
    return {
      effect: {
        type: "grantReplacement",
        duration: { type: "permanent" },
        replacement: {
          type: "replacement",
          when: {
            type: "wouldMoveZone",
            from: "life",
            to: "hand",
            lifeMatcher: { faceUp: true },
            target: { type: "all", zone: "life", player: "self" },
          },
          instead: {
            type: "bounce",
            target: { type: "replacementTarget" },
            destination: "deckBottom",
          },
        },
      },
      evidence: [
        "instruction:grantReplacement",
        "replacement:wouldMoveZone",
        "zone:life",
        "visibility:faceUp",
        "destination:hand",
        "destination:deck",
        "position:bottom",
        "target:replacementTarget",
        "duration:permanent",
      ],
      rest: "",
    };
  }

  const match =
    /^If (?<target>.+?) would be K\.O\.'d in battle during this turn,\s*(?<body>.+)$/iu.exec(
      input.text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const bodyText = match?.groups?.["body"];
  if (targetText === undefined || bodyText === undefined) {
    return undefined;
  }

  const target = parseYourFieldReplacementTarget({
    text: normalizeTemporaryReplacementTarget(targetText),
  });
  if (
    target === undefined ||
    target.rest.length > 0 ||
    (target.target.type !== "all" && target.target.type !== "self")
  ) {
    return undefined;
  }
  const instead = parseInsteadEffect(bodyText);
  if (instead === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "grantReplacement",
      duration: { type: "thisTurn" },
      replacement: {
        type: "replacement",
        when: {
          type: "wouldBeKOd",
          sourceKind: "battle",
          target: target.target,
        },
        instead: instead.effect,
      },
    },
    evidence: [
      "instruction:grantReplacement",
      "replacement:wouldBeKOd",
      "protectionSource:battle",
      "duration:thisTurn",
      ...target.evidence,
      ...instead.evidence,
    ],
    rest: "",
  };
};

function normalizeTemporaryReplacementTarget(text: string): string {
  return text.trim().replace(/^any of your\s+/iu, "your ");
}
