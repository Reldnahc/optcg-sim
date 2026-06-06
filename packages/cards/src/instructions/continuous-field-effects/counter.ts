import { parseCardFilterPredicates } from "../../filters/index.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  type ContinuousInstructionParser,
} from "./shared.js";

export const parseHandCounterSetInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^The counter of all of your (?<filter>.+?) in your hand becomes \+(?<value>[1-9]\d*)\.?$/i.exec(
      input.text,
    );
  const filterText = match?.groups?.["filter"];
  const valueText = match?.groups?.["value"];
  if (filterText === undefined || valueText === undefined) {
    return undefined;
  }
  const parsedFilter = parseCardFilterPredicates({
    text: filterText.replace(/\s+cards?$/i, ""),
  });
  if (parsedFilter === undefined || parsedFilter.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCounter",
      player: "self",
      sourceZone: "hand",
      filter: parsedFilter.filter,
      value: Number.parseInt(valueText, 10),
      duration: continuousDuration(context.condition),
    },
    evidence: [
      "instruction:modifyCounter",
      "player:self",
      "zone:hand",
      ...parsedFilter.evidence,
      "modifier:positiveCounter",
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};
