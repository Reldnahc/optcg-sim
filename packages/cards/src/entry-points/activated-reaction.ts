import type { EntryPointParseResult, ParseInput } from "../types.js";

export function parseActivatedReactionEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  if (!/^This effect can be activated when\b/u.test(input.text)) {
    return undefined;
  }

  return {
    node: {
      type: "entryPoint",
      trigger: { type: "custom", event: "activated-reaction-placeholder" },
      category: "activate",
    },
    evidence: ["entry:activatedReaction", "sourcePresence:mustRemain"],
    rest: input.text,
  };
}
