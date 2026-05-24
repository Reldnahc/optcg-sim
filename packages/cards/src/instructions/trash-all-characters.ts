import type { InstructionParseResult, InstructionParser } from "../types.js";
import { parseAllFieldTarget } from "../targets/index.js";

export const parseTrashAllYourCharactersInstruction: InstructionParser = (
  input,
) => {
  const actionMatch = /^Trash\s+(?<target>.+)$/i.exec(input.text);
  const targetText = actionMatch?.groups?.["target"];
  if (targetText === undefined) {
    return undefined;
  }

  const normalizedTargetText = targetText.replace(/\.$/, "");
  const target = parseAllFieldTarget({ text: normalizedTargetText });
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "trash",
      target: target.target,
    },
    evidence: ["instruction:trash", ...target.evidence],
    rest: "",
  } satisfies InstructionParseResult;
};
