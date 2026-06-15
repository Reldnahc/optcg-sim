import type { Effect } from "@optcg/types";

import { parseCardFilterPredicates } from "../../filters/card-filter-predicates.js";
import type { PrimitiveEvidence } from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  type ContinuousInstructionParser,
} from "./shared.js";

export const parsePlayEntryStateInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match = /^Your (?<filterText>.+?) are played rested\.?$/iu.exec(
    input.text.trim(),
  );
  const filterText = match?.groups?.["filterText"];
  if (filterText === undefined) {
    return undefined;
  }
  const parsed = parseCardFilterPredicates({ text: filterText });
  if (parsed === undefined || parsed.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "enterRested",
      player: "self",
      filter: parsed.filter,
      duration: continuousDuration(context.condition),
    } satisfies Effect,
    evidence: [
      "instruction:enterRested",
      "player:self",
      ...parsed.evidence,
      "state:rested",
      continuousDurationEvidence(context.condition),
    ] satisfies readonly PrimitiveEvidence[],
    rest: "",
  };
};
