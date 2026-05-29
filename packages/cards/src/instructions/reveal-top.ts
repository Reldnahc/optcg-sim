import type { SelectionSetId } from "@optcg/types";

import type { InstructionParser } from "../types.js";

export const revealedTopLifeSet = "set:revealed-top-life" as SelectionSetId;

export const parseRevealTopInstruction: InstructionParser = (input) => {
  const match =
    /^reveal up to (?<count>\d+) card(?:s)? from the top of your Life cards\.?$/iu.exec(
      input.text.trim(),
    );
  const rawCount = match?.groups?.["count"];
  if (rawCount === undefined) {
    return undefined;
  }
  const count = Number(rawCount);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }

  return {
    effect: {
      type: "revealTop",
      player: "self",
      zone: "life",
      count,
      min: 0,
      saveAs: revealedTopLifeSet,
      visibility: "bothPlayers",
    },
    evidence: [
      "instruction:revealTop",
      "zone:life",
      "count:positiveInteger",
      "cardinality:upTo",
      "reveal:bothPlayers",
    ],
    rest: "",
  };
};
