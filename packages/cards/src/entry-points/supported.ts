import type { Condition, EffectCategory, Trigger } from "@optcg/types";

import type {
  EntryPointParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

interface SupportedEntryPoint {
  readonly text: string;
  readonly trigger: Trigger;
  readonly category?: EffectCategory;
  readonly condition?: Condition;
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
    text: "[Main]",
    trigger: { type: "main" },
    evidence: ["entry:eventMain", "sourcePresence:resolveFromDestination"],
  },
  {
    text: "[Counter]",
    trigger: { type: "counter" },
    evidence: ["entry:eventCounter", "sourcePresence:resolveFromDestination"],
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
    condition: { type: "yourTurn" },
    evidence: [
      "entry:yourTurn",
      "condition:yourTurn",
      "sourcePresence:mustRemain",
    ],
  },
  {
    text: "[Opponent's Turn]",
    trigger: { type: "permanent" },
    category: "permanent",
    condition: { type: "opponentTurn" },
    evidence: [
      "entry:opponentTurn",
      "condition:opponentTurn",
      "sourcePresence:mustRemain",
    ],
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
