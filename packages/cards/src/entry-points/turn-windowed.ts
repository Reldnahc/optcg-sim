import type { Condition } from "@optcg/types";

import { supportedEntryPoints } from "../entry-point-definitions.js";
import type {
  EntryPointParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

const turnWindows: readonly {
  readonly condition: Condition;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly text: string;
}[] = [
  {
    text: "[Your Turn]",
    condition: { type: "yourTurn" },
    evidence: ["entry:yourTurn", "condition:yourTurn"],
  },
  {
    text: "[Opponent's Turn]",
    condition: { type: "opponentTurn" },
    evidence: ["entry:opponentTurn", "condition:opponentTurn"],
  },
];

export function parseTurnWindowedEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  const turnWindow = turnWindows.find((candidate) =>
    isEntryPointPrefix(input.text, candidate.text),
  );
  if (turnWindow === undefined) {
    return undefined;
  }

  const restAfterTurnWindow = input.text
    .slice(turnWindow.text.length)
    .trimStart();
  const nestedEntryPoint = supportedEntryPoints.find(
    (candidate) =>
      candidate.category !== "permanent" &&
      isEntryPointPrefix(restAfterTurnWindow, candidate.text),
  );
  if (nestedEntryPoint === undefined) {
    return undefined;
  }

  const condition =
    nestedEntryPoint.condition === undefined
      ? turnWindow.condition
      : {
          type: "and" as const,
          conditions: [turnWindow.condition, nestedEntryPoint.condition],
        };

  return {
    node: {
      type: "entryPoint",
      trigger: nestedEntryPoint.trigger,
      ...(nestedEntryPoint.category === undefined
        ? {}
        : { category: nestedEntryPoint.category }),
      condition,
    },
    evidence: [...turnWindow.evidence, ...nestedEntryPoint.evidence],
    rest: restAfterTurnWindow.slice(nestedEntryPoint.text.length).trimStart(),
  };
}

function isEntryPointPrefix(text: string, entryPointText: string): boolean {
  if (text === entryPointText) {
    return true;
  }
  const next = text.at(entryPointText.length);
  return text.startsWith(entryPointText) && next === " ";
}
