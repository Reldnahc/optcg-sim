import type { Condition } from "@optcg/types";

import { supportedEntryPoints } from "../entry-point-definitions.js";
import type {
  EntryPointParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { parseReplacementEntryPoint } from "./replacement.js";

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

const nestedEntryMarkerPrefixes: readonly RegExp[] = [
  /^\[Once Per Turn\]\s*/iu,
  /^\[DON!!\s*x\s*[1-9]\d*\]\s*/iu,
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
    const replacementEntryPoint = parseReplacementEntryPoint({
      text: textAfterLeadingMarkers(restAfterTurnWindow),
    });
    if (replacementEntryPoint !== undefined) {
      return {
        node: {
          ...replacementEntryPoint.node,
          condition:
            replacementEntryPoint.node.condition === undefined
              ? turnWindow.condition
              : {
                  type: "and",
                  conditions: [
                    turnWindow.condition,
                    replacementEntryPoint.node.condition,
                  ],
                },
        },
        evidence: [...turnWindow.evidence, ...replacementEntryPoint.evidence],
        rest: restAfterTurnWindow,
      };
    }

    return {
      node: {
        type: "entryPoint",
        trigger: { type: "permanent" },
        category: "permanent",
        condition: turnWindow.condition,
      },
      evidence: turnWindow.evidence,
      rest: restAfterTurnWindow,
    };
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

function textAfterLeadingMarkers(text: string): string {
  let rest = text.trimStart();
  for (;;) {
    const marker = nestedEntryMarkerPrefixes
      .map((pattern) => pattern.exec(rest))
      .find((match) => match !== null);
    const matchedText = marker?.[0];
    if (matchedText === undefined) {
      return rest;
    }
    rest = rest.slice(matchedText.length).trimStart();
  }
}

function isEntryPointPrefix(text: string, entryPointText: string): boolean {
  if (text === entryPointText) {
    return true;
  }
  const next = text.at(entryPointText.length);
  return text.startsWith(entryPointText) && next === " ";
}
