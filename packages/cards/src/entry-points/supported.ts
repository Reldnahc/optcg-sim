import type { EntryPointParseResult, ParseInput } from "../types.js";
import { supportedEntryPoints } from "../entry-point-definitions.js";
import { consumeSourcePrefix, sourceSpan } from "../source-slices.js";

export function parseSupportedEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  for (const entryPoint of supportedEntryPoints) {
    if (isEntryPointPrefix(input.text, entryPoint.text)) {
      const consumed = input.source
        ? consumeSourcePrefix(input.source, entryPoint.text)
        : undefined;
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
        ...(consumed === undefined
          ? {}
          : {
              presentationSpans: [
                sourceSpan("span:entry", "entry", consumed.consumed, [
                  ...entryPoint.evidence,
                ]),
              ],
            }),
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
