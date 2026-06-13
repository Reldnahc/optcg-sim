import { parseUpToCardinality } from "../../../cardinality/index.js";
import { parseKeyword } from "../../../keywords/index.js";
import {
  parseTargetFromSet,
  yourFieldEffectTargetParsers,
} from "../../../targets/index.js";
import type { InstructionParser } from "../../../types.js";
import { parseFieldEffectDuration } from "../shared.js";

export const parseTargetedKeywordGrantInstruction: InstructionParser = (
  input,
) => {
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

  const keyword = parseKeyword({ text: keywordText });
  if (keyword === undefined) {
    return undefined;
  }
  const duration = parseFieldEffectDuration({ text: keyword.rest });
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "giveKeyword",
      target: target.target,
      keyword: keyword.keyword,
      duration: duration.duration,
    },
    evidence: [
      "instruction:giveKeyword",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...keyword.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};
