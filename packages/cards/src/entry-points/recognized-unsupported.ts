import type { EntryPointParseResult, ParseInput } from "../types.js";
import { recognizedUnsupportedEntryPoints } from "../entry-point-definitions.js";

export function parseRecognizedUnsupportedEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  for (const entryPoint of recognizedUnsupportedEntryPoints) {
    if (
      input.text === entryPoint.text ||
      input.text.startsWith(`${entryPoint.text} `)
    ) {
      return {
        node: {
          type: "entryPoint",
          trigger: entryPoint.trigger,
        },
        evidence: entryPoint.evidence,
        rest: input.text.slice(entryPoint.text.length).trimStart(),
      };
    }
  }

  return undefined;
}
