import type { EntryPointParseResult, ParseInput } from "../types.js";

export function parseImplicitReactionEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  if (!/^(?:When|At)\b/u.test(input.text)) {
    return undefined;
  }

  return {
    node: {
      type: "entryPoint",
      trigger: { type: "custom", event: "implicit-reaction-placeholder" },
      category: "auto",
    },
    evidence: ["entry:implicitReaction", "sourcePresence:mustRemain"],
    rest: input.text,
  };
}
