import type { Effect } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/card-filter-predicates.js";
import type { InstructionParser } from "../types.js";

export const preventPlayInstructionPrimitive = {
  primitiveId: "instruction:preventPlay",
  childPrimitiveIds: ["player:self", "zone:hand", "duration:thisTurn"],
  parseEvidence: [
    "instruction:preventPlay",
    "player:self",
    "zone:hand",
    "duration:thisTurn",
  ],
} as const;

export const parsePreventPlayInstruction: InstructionParser = (input) => {
  const match =
    /^you cannot play (?<filterText>.+?) during this turn\.?$/i.exec(
      input.text.trim(),
    );
  const filterText = match?.groups?.["filterText"];
  if (filterText === undefined) {
    return undefined;
  }

  const parsedFilter = parseCardFilterPredicates({ text: filterText });
  if (parsedFilter === undefined || parsedFilter.rest.trim().length > 0) {
    return undefined;
  }

  const effect = {
    type: "preventPlay",
    player: "self",
    filter: parsedFilter.filter,
    duration: { type: "thisTurn" },
  } satisfies Effect;

  return {
    effect,
    evidence: [
      ...preventPlayInstructionPrimitive.parseEvidence,
      ...parsedFilter.evidence,
    ],
    rest: "",
  };
};
