import type { EntryPointParseResult, ParseInput } from "../types.js";
import { supportedEntryPoints } from "../entry-point-definitions.js";

export function parseSupportedEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  for (const entryPoint of supportedEntryPoints) {
    if (isEntryPointPrefix(input.text, entryPoint.text)) {
      return {
        node: {
          type: "entryPoint",
          trigger: entryPoint.trigger,
          ...(entryPoint.category === undefined
            ? {}
            : { category: entryPoint.category }),
          ...(entryPoint.condition === undefined
            ? {}
            : { condition: entryPoint.condition }),
        },
        evidence: entryPoint.evidence,
        rest: input.text.slice(entryPoint.text.length).trimStart(),
      };
    }
  }

  return undefined;
}

function isEntryPointPrefix(text: string, entryPointText: string): boolean {
  if (text === entryPointText) {
    return true;
  }
  const next = text.at(entryPointText.length);
  return text.startsWith(entryPointText) && (next === " " || next === "/");
}
