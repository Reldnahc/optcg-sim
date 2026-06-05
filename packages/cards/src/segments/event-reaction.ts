import type { PlayerRef, Trigger } from "@optcg/types";

import type { ExpressionParseResult, ParseInput } from "../types.js";

const lifeRemovedTrigger = (players: PlayerRef[]): Trigger => ({
  type: "lifeRemoved",
  players,
});

const handTrashedByEffectTrigger = (): Trigger => ({
  type: "handTrashedByEffect",
  player: "self",
});

const opponentEventOrBlockerActivatedTrigger = (): Trigger => ({
  type: "opponentActivated",
  activations: ["event", "blocker"],
});

const opponentBlockerActivatedTrigger = (): Trigger => ({
  type: "opponentActivated",
  activations: ["blocker"],
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
      /^When your opponent activates (?<activation>an Event or \[Blocker\]|\[Blocker\]),\s*(?<body>.+)$/iu.exec(
        input.text,
      );
    const activation = match?.groups?.["activation"];
    const body = match?.groups?.["body"];
    if (activation === undefined || body === undefined) {
      return undefined;
    }
    const isBlockerOnly = activation.toLowerCase() === "[blocker]";

    for (const expressionParser of options.expressions) {
      const parsed = expressionParser({ ...input, text: body });
      if (parsed === undefined || parsed.rest.length > 0) {
        continue;
      }
      return {
        effect: parsed.effect,
        evidence: [
          "trigger:opponentActivated",
          ...(isBlockerOnly ? [] : (["activation:event"] as const)),
          "activation:blocker",
          ...parsed.evidence,
        ],
        rest: "",
        blockPatch: {
          ...parsed.blockPatch,
          category: "auto",
          trigger: isBlockerOnly
            ? opponentBlockerActivatedTrigger()
            : opponentEventOrBlockerActivatedTrigger(),
        },
      };
    }

    return undefined;
  };
}

export function handTrashedByEffectReactionExpressionParser(options: {
  readonly expressions: readonly ((
    input: ParseInput,
  ) => ExpressionParseResult | undefined)[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input: ParseInput) => {
    const match =
      /^When a card is trashed from your hand by an effect,\s*(?<body>.+)$/iu.exec(
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
          "trigger:handTrashedByEffect",
          "zone:hand",
          "destination:trash",
          "player:self",
          ...parsed.evidence,
        ],
        rest: "",
        blockPatch: {
          ...parsed.blockPatch,
          category: "auto",
          trigger: handTrashedByEffectTrigger(),
        },
      };
    }

    return undefined;
  };
}
