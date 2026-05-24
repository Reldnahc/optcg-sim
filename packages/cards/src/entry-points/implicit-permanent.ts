import type { EntryPointParseResult, ParseInput } from "../types.js";

export function parseImplicitPermanentEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  if (!/^If\b/i.test(input.text.trimStart())) {
    return undefined;
  }

  return {
    node: {
      type: "entryPoint",
      trigger: { type: "permanent" },
      category: "permanent",
    },
    evidence: ["entry:implicitPermanent", "sourcePresence:mustRemain"],
    rest: input.text.trimStart(),
  };
}
