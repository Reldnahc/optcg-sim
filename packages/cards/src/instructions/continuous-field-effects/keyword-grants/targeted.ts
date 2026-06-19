import type { Target } from "@optcg/types";

import { parseUpToCardinality } from "../../../cardinality/index.js";
import {
  parseAllFieldTarget,
  directPowerGainTargetParsers,
  parseTargetFromSet,
  yourFieldEffectTargetParsers,
} from "../../../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../../../types.js";
import { parseContinuousModifierListForTarget } from "../modifier-list.js";
import { parseKeywordGrantForTarget } from "./shared.js";

export const parseTargetedKeywordGrantInstruction: InstructionParser = (
  input,
) => {
  const allTarget = parseAllFieldTarget(input);
  if (allTarget?.target !== undefined) {
    const parsed = parseKeywordModifierText({
      target: allTarget.target,
      targetEvidence: allTarget.evidence,
      rest: allTarget.rest,
    });
    if (parsed !== undefined) {
      return parsed;
    }
  }

  const directTarget = parseTargetFromSet(
    input,
    directPowerGainTargetParsers(),
  );
  if (directTarget?.target !== undefined) {
    const parsed = parseKeywordModifierText({
      target: directTarget.target,
      targetEvidence: directTarget.evidence,
      rest: directTarget.rest,
    });
    if (parsed !== undefined) {
      return parsed;
    }
  }

  const cardinality = parseUpToCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseTargetFromSet(
    { text: cardinality.rest },
    yourFieldEffectTargetParsers(cardinality.cardinality),
  );
  if (target?.target === undefined) {
    return undefined;
  }

  const naturalRushCharacterText =
    /^can attack Characters on the turn in which it is played\.?$/iu.exec(
      target.rest,
    );
  if (naturalRushCharacterText !== null) {
    return {
      effect: {
        type: "giveKeyword",
        target: target.target,
        keyword: "rushCharacter",
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:giveKeyword",
        ...cardinality.evidence,
        "chooser:self:upTo",
        ...target.evidence,
        "keyword:anySupported",
        "duration:thisTurn",
      ],
      rest: "",
    };
  }

  const keywordText = /^gains\s+(?<rest>.*)$/i.exec(target.rest)?.groups?.[
    "rest"
  ];
  if (keywordText === undefined) {
    return undefined;
  }

  const parsed = parseContinuousModifierListForTarget({
    target: target.target,
    targetEvidence: [
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    text: keywordText,
    context: { condition: undefined },
  });
  if (parsed !== undefined) {
    return parsed;
  }

  return parseKeywordGrantForTarget({
    target: target.target,
    targetEvidence: [
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    text: keywordText,
    context: { condition: undefined },
  });
};

function parseKeywordModifierText({
  target,
  targetEvidence,
  rest,
}: {
  readonly target: Target;
  readonly targetEvidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}): ReturnType<InstructionParser> {
  const keywordText = /^gains?\s+(?<rest>.*)$/i.exec(rest)?.groups?.["rest"];
  if (keywordText === undefined) {
    return undefined;
  }

  return (
    parseContinuousModifierListForTarget({
      target,
      targetEvidence,
      text: keywordText,
      context: { condition: undefined },
    }) ??
    parseKeywordGrantForTarget({
      target,
      targetEvidence,
      text: keywordText,
      context: { condition: undefined },
    })
  );
}
