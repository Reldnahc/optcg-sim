import type { EntryPointParseResult, ParseInput } from "../types.js";

export function parseReplacementEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  const text = input.text.trimStart();
  if (
    !/^If .+? would be removed from the field by your opponent(?:'s effects?)?,\s*you may\b/i.test(
      text,
    ) &&
    !/^If .+? would be K\.O\.'d(?: by your opponent(?:'s effects?))?,\s*you may\b/i.test(
      text,
    )
  ) {
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
    rest: text,
  };
}
