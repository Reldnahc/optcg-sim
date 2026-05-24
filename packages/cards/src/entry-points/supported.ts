import type { EffectCategory, Trigger } from "@optcg/types";

import type {
  EntryPointParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

interface SupportedEntryPoint {
  readonly text: string;
  readonly trigger: Trigger;
  readonly category?: EffectCategory;
  readonly evidence: readonly PrimitiveEvidence[];
}

const supportedEntryPoints: readonly SupportedEntryPoint[] = [
  {
    text: "[On Play]",
    trigger: { type: "onPlay" },
    evidence: ["entry:onPlay", "sourcePresence:mustRemain"],
  },
  {
    text: "[When Attacking]",
    trigger: { type: "whenAttacking" },
    evidence: ["entry:whenAttacking", "sourcePresence:mustRemain"],
  },
  {
    text: "[On K.O.]",
    trigger: { type: "onKO" },
    evidence: ["entry:onKO", "sourcePresence:resolveFromDestination"],
  },
  {
    text: "[Trigger]",
    trigger: { type: "trigger" },
    evidence: ["entry:lifeTrigger", "sourcePresence:noSourceRequired"],
  },
  {
    text: "[Activate: Main]",
    trigger: { type: "activateMain" },
    category: "activate",
    evidence: ["entry:activateMain", "sourcePresence:mustRemain"],
  },
  {
    text: "[Your Turn]",
    trigger: { type: "permanent" },
    category: "permanent",
    evidence: ["entry:yourTurn", "sourcePresence:mustRemain"],
  },
];

export function parseSupportedEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  for (const entryPoint of supportedEntryPoints) {
    if (
      input.text === entryPoint.text ||
      input.text.startsWith(`${entryPoint.text} `)
    ) {
      return {
        node: {
          type: "entryPoint",
          trigger: entryPoint.trigger,
          ...(entryPoint.category === undefined
            ? {}
            : { category: entryPoint.category }),
        },
        evidence: entryPoint.evidence,
        rest: input.text.slice(entryPoint.text.length).trimStart(),
      };
    }
  }

  return undefined;
}
