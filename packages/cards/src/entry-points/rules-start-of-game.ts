import type { EntryPointParseResult, ParseInput } from "../types.js";

export function parseRulesStartOfGameEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  const match =
    /^Under the rules of this game, you cannot include Events with a cost of (?<cost>[1-9]\d*) or more in your deck and at the start of the game,\s+(?<rest>.+)$/i.exec(
      input.text,
    );
  const cost = match?.groups?.["cost"];
  const rest = match?.groups?.["rest"];
  if (cost === undefined || rest === undefined) {
    return undefined;
  }

  return {
    node: {
      type: "entryPoint",
      trigger: { type: "startOfGame" },
      category: "auto",
    },
    evidence: [
      "entry:startOfGame",
      "sourcePresence:noSourceRequired",
      "deckRestriction:ignored",
      "deckRestriction:eventCostGte",
      "count:positiveInteger",
    ],
    rest: rest.trim(),
  };
}
