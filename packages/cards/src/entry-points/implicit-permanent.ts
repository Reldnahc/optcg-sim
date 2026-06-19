import type { EntryPointParseResult, ParseInput } from "../types.js";

export function parseImplicitPermanentEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  if (
    !/^(?:Once per turn,?\b|If\b|All of your\b|Your\b|\{[^}]+\}\s+type\s+Characters?\b|Give (?:all of\b|.+\bin your hand\b)|Apply each of\b|The counter of\b|this (?:card|Leader|Character)\b)/i.test(
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
