import { parseUpToCardinality } from "../../../cardinality/index.js";
import { parseKeyword } from "../../../keywords/index.js";
import {
  parseCompoundYourCharactersTarget,
  parseYourCharactersTarget,
} from "../../../targets/index.js";
import type { InstructionParser } from "../../../types.js";
import { parseExplicitFieldEffectDuration } from "../shared.js";

export const parseTargetedKeywordGrantInstruction: InstructionParser = (
  input,
) => {
  const cardinality = parseUpToCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const target =
    parseCompoundYourCharactersTarget(
      { text: cardinality.rest },
      cardinality.cardinality,
    ) ?? parseYourCharactersTarget({ text: cardinality.rest });
  if (target?.target === undefined) {
    return undefined;
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
  const duration = parseExplicitFieldEffectDuration({ text: keyword.rest });
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
