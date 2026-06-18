import type { EntryPointParseResult, ParseInput } from "../types.js";

export function parseReplacementEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  const text = input.text.trimStart();
  if (!isReplacementEntryText(text)) {
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

function isReplacementEntryText(text: string): boolean {
  return [
    /^If .+? would be removed from the field\b[^,]*(?:\s+or\s+(?:would be\s+)?K\.O\.'d)?\s*,\s*/i,
    /^If .+? would be K\.O\.'d\b[^,]*(?:\s+or\s+would be removed from the field\b[^,]*)?\s*,\s*/i,
    /^If .+? would be rested\b[^,]*,\s*/i,
  ].some((pattern) => pattern.test(text));
}
