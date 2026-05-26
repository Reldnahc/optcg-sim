import type { Trigger } from "@optcg/types";

import type {
  EntryPointParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

interface RecognizedUnsupportedEntryPoint {
  readonly text: string;
  readonly trigger: Trigger;
  readonly evidence: readonly PrimitiveEvidence[];
}

const recognizedUnsupportedEntryPoints: readonly RecognizedUnsupportedEntryPoint[] =
  [
    {
      text: "[On Block]",
      trigger: { type: "onBlock" },
      evidence: ["entry:onBlock", "entrySupport:unsupported"],
    },
    {
      text: "[End of Your Turn]",
      trigger: { type: "endOfYourTurn" },
      evidence: ["entry:endOfYourTurn", "entrySupport:unsupported"],
    },
  ];

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
