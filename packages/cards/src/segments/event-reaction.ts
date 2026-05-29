import type { PlayerRef, Trigger } from "@optcg/types";

import type { ExpressionParseResult, ParseInput } from "../types.js";

const lifeRemovedTrigger = (players: PlayerRef[]): Trigger => ({
  type: "lifeRemoved",
  players,
});

const opponentEventOrBlockerActivatedTrigger = (): Trigger => ({
  type: "opponentActivated",
  activations: ["event", "blocker"],
});

export function lifeRemovedReactionExpressionParser(options: {
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const match =
      /^when a card is removed from your or your opponent's Life cards,\s*(?<body>.+)$/i.exec(
        input.text,
      );
    const body = match?.groups?.["body"];
    if (body === undefined) {
      return undefined;
    }

    for (const expressionParser of options.expressions) {
      const parsed = expressionParser({ ...input, text: body });
      if (parsed === undefined || parsed.rest.length > 0) {
        continue;
      }
      return {
        effect: parsed.effect,
        evidence: [
          "trigger:lifeRemoved",
          "player:self",
          "player:opponent",
          ...parsed.evidence,
        ],
        rest: "",
        blockPatch: {
          category: "auto",
          trigger: lifeRemovedTrigger(["self", "opponent"]),
        },
      };
    }

    return undefined;
  };
}

export function opponentEventOrBlockerActivatedExpressionParser(options: {
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const match =
      /^When your opponent activates an Event or \[Blocker\],\s*(?<body>.+)$/iu.exec(
        input.text,
      );
    const body = match?.groups?.["body"];
    if (body === undefined) {
      return undefined;
    }

    for (const expressionParser of options.expressions) {
      const parsed = expressionParser({ ...input, text: body });
      if (parsed === undefined || parsed.rest.length > 0) {
        continue;
      }
      return {
        effect: parsed.effect,
        evidence: [
          "trigger:opponentActivated",
          "activation:event",
          "activation:blocker",
          ...parsed.evidence,
        ],
        rest: "",
        blockPatch: {
          category: "auto",
          trigger: opponentEventOrBlockerActivatedTrigger(),
        },
      };
    }

    return undefined;
  };
}
