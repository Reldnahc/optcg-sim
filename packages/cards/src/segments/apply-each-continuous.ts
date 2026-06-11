import type { Condition, Effect, SequencedEffect } from "@optcg/types";

import { parseExpression } from "../expression-parser.js";
import type { ContinuousInstructionParser } from "../instructions/continuous-field-effects.js";
import type {
  ConnectorParser,
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
  SegmentParser,
} from "../types.js";
import { parseBulletListPayload } from "./bullet-list.js";

export function applyEachContinuousExpressionParser(options: {
  readonly connectors: readonly ConnectorParser[];
  readonly instructions: readonly ContinuousInstructionParser[];
}): (input: ParseInput) => ExpressionParseResult | undefined {
  return (input) => {
    if (
      input.entryPoint?.category !== undefined &&
      input.entryPoint.category !== "permanent"
    ) {
      return undefined;
    }

    const match =
      /^Apply each of the following effects based on the number of cards in your trash:\s*(?<bullets>[\s\S]+)$/iu.exec(
        input.text.trim(),
      );
    const bulletText = match?.groups?.["bullets"];
    if (bulletText === undefined) {
      return undefined;
    }

    const payload = parseBulletListPayload(bulletText);
    if (
      payload === undefined ||
      payload.trailingThen !== undefined ||
      payload.items.length === 0
    ) {
      return undefined;
    }

    const effects: SequencedEffect[] = [];
    const evidence: PrimitiveEvidence[] = ["composition:applyEach"];
    for (const item of payload.items) {
      const parsed = parseApplyEachBullet(item, options, input);
      if (parsed === undefined) {
        return undefined;
      }
      effects.push(...effectParts(parsed.effect));
      evidence.push("expression:conditionalContinuous", ...parsed.evidence);
    }

    return {
      effect: { type: "sequence", effects },
      evidence,
      rest: "",
      blockPatch: { category: "permanent" },
    };
  };
}

function parseApplyEachBullet(
  text: string,
  options: {
    readonly connectors: readonly ConnectorParser[];
    readonly instructions: readonly ContinuousInstructionParser[];
  },
  input: ParseInput,
): ExpressionParseResult | undefined {
  const match = /^if\s+(?<condition>[^,]+),\s*(?<body>[\s\S]+)$/iu.exec(
    text.trim(),
  );
  const conditionText = match?.groups?.["condition"];
  const bodyText = match?.groups?.["body"];
  if (conditionText === undefined || bodyText === undefined) {
    return undefined;
  }

  const threshold = parseTrashThresholdCondition(conditionText);
  if (threshold === undefined) {
    return undefined;
  }

  const bodyCondition = parseLeadingBodyCondition(bodyText);
  const condition = combineConditions(
    input.entryPoint?.condition,
    threshold.condition,
    bodyCondition?.condition,
  );
  const body = resolveLocalContinuationPronoun(bodyCondition?.rest ?? bodyText);
  const parsed = parseExpression(body, {
    connectors: options.connectors,
    segments: [
      continuousInstructionSegmentParser({
        condition,
        instructions: options.instructions,
      }),
    ],
  });
  if (parsed === undefined || parsed.rest.length > 0) {
    return undefined;
  }

  return {
    effect: normalizeContinuousEffect(parsed.effect),
    evidence: [
      ...threshold.evidence,
      ...(bodyCondition?.evidence ?? []),
      ...(input.entryPoint?.condition === undefined &&
      bodyCondition === undefined
        ? []
        : (["composition:conditionAnd"] as const)),
      ...parsed.evidence,
    ],
    rest: "",
  };
}

function parseTrashThresholdCondition(text: string):
  | {
      readonly condition: Condition;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const match =
    /^(?:there are|you have)\s+(?<count>[1-9]\d*)\s+or more cards$/iu.exec(
      text.trim(),
    );
  const count = match?.groups?.["count"];
  if (count === undefined) {
    return undefined;
  }
  return {
    condition: {
      type: "trashCount",
      player: "self",
      op: "gte",
      value: Number.parseInt(count, 10),
    },
    evidence: [
      "condition:trashCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:self",
    ],
  };
}

function parseLeadingBodyCondition(text: string):
  | {
      readonly condition: Condition;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const opponentTurn =
    /^during your opponent's turn,\s*(?<rest>[\s\S]+)$/iu.exec(text.trim());
  const opponentTurnRest = opponentTurn?.groups?.["rest"];
  if (opponentTurnRest !== undefined) {
    return {
      condition: { type: "opponentTurn" },
      evidence: ["condition:opponentTurn"],
      rest: opponentTurnRest,
    };
  }

  const yourTurn = /^during your turn,\s*(?<rest>[\s\S]+)$/iu.exec(text.trim());
  const yourTurnRest = yourTurn?.groups?.["rest"];
  if (yourTurnRest !== undefined) {
    return {
      condition: { type: "yourTurn" },
      evidence: ["condition:yourTurn"],
      rest: yourTurnRest,
    };
  }

  return undefined;
}

function resolveLocalContinuationPronoun(text: string): string {
  const trimmed = text.trim();
  if (/^this Character(?:'s base power)? becomes?\b/iu.test(trimmed)) {
    return trimmed.replace(/\band it gains\b/iu, "and this Character gains");
  }
  if (/^your Leader(?:'s base power)? becomes?\b/iu.test(trimmed)) {
    return trimmed.replace(/\band it gains\b/iu, "and your Leader gains");
  }
  return trimmed;
}

function combineConditions(
  ...conditions: readonly (Condition | undefined)[]
): Condition | undefined {
  const present = conditions.filter(
    (condition): condition is Condition => condition !== undefined,
  );
  if (present.length === 0) {
    return undefined;
  }
  if (present.length === 1) {
    return present[0];
  }
  return { type: "and", conditions: present };
}

function normalizeContinuousEffect(effect: Effect): Effect {
  if (effect.type !== "sequence") {
    return effect;
  }
  return {
    ...effect,
    effects: effect.effects.map((part) => ({ ...part, connector: "always" })),
  };
}

function effectParts(effect: Effect): readonly SequencedEffect[] {
  if (effect.type !== "sequence") {
    return [{ connector: "always", effect }];
  }
  return effect.effects.map((part) => ({
    ...part,
    connector: "always",
  }));
}

function continuousInstructionSegmentParser(options: {
  readonly condition: Condition | undefined;
  readonly instructions: readonly ContinuousInstructionParser[];
}): SegmentParser {
  return (input) => {
    for (const instruction of options.instructions) {
      const result = instruction(input, { condition: options.condition });
      if (result !== undefined && result.rest.length === 0) {
        return {
          effect: result.effect,
          evidence: result.evidence,
        };
      }
    }

    return undefined;
  };
}
