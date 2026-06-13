import type { EntryPointParseResult, ParseInput } from "../types.js";

const startOfYourTurnActivationText =
  "This effect can be activated at the start of your turn.";

export function parseStartOfTurnEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  if (!input.text.startsWith(startOfYourTurnActivationText)) {
    return undefined;
  }

  return {
    node: {
      type: "entryPoint",
      trigger: { type: "startOfYourTurn" },
      category: "activate",
    },
    evidence: ["entry:startOfYourTurn", "sourcePresence:mustRemain"],
    rest: input.text.slice(startOfYourTurnActivationText.length).trimStart(),
  };
}
