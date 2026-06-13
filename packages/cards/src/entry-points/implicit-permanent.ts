import type { EntryPointParseResult, ParseInput } from "../types.js";

export function parseImplicitPermanentEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  if (
    !/^(?:If\b|All of your\b|Your\b|Give all of\b|Apply each of\b|The counter of\b|this (?:card|Leader|Character)\b)/i.test(
      input.text.trimStart(),
    )
  ) {
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
