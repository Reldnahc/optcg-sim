import type { Effect } from "@optcg/types";

import type { InstructionParseResult } from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  type ContinuousInstructionParser,
} from "./shared.js";

type DonPhasePlacementEffect = Extract<
  Effect,
  { type: "redirectDonPhasePlacement" }
>;

export const parseDonPhasePlacementInstruction: ContinuousInstructionParser = (
  input,
  context,
): InstructionParseResult | undefined => {
  const match =
    /^(?<count>[1-9]\d*) DON!! cards? placed during your DON!! Phase is given to (?<target>your Leader|this Leader)\.?$/iu.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const targetText = match?.groups?.["target"];
  if (countText === undefined || targetText === undefined) {
    return undefined;
  }

  const effect: DonPhasePlacementEffect = {
    type: "redirectDonPhasePlacement",
    player: "self",
    count: Number.parseInt(countText, 10),
    target: { type: "myLeader" },
    duration: continuousDuration(context.condition),
  };

  return {
    effect,
    evidence: [
      "instruction:redirectDonPhasePlacement",
      "phase:don",
      "count:positiveInteger",
      "player:self",
      "target:yourLeader",
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};
