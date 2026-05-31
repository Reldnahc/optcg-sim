import type { EntryPointParseResult, ParseInput } from "../types.js";

export function parseReplacementEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  const match =
    /^If .+? would be removed from the field by your opponent(?:'s effects?)?,\s*you may\b/i.exec(
      input.text.trimStart(),
    );
  if (match === null) {
    return undefined;
  }

  return {
    node: {
      type: "entryPoint",
      trigger: {
        type: "replacement",
        replacement: { type: "custom", event: "replacement:pendingParse" },
      },
      category: "replacement",
    },
    evidence: [
      "entry:replacement",
      "sourcePresence:resolveFromLastKnownInformation",
    ],
    rest: input.text.trimStart(),
  };
}
