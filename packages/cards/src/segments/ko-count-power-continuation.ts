import type { Effect } from "@optcg/types";

import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
} from "../durations/index.js";
import {
  koTargetSelectionId,
  parseKoInstruction,
  parseModifyPowerInstruction,
} from "../instructions/index.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

export function koCountPowerContinuationExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const match =
    /^(?<first>Your Leader gains \+[1-9]\d* power [^.]+)\.\s+Then,\s+(?<ko>you may K\.O\. any number [^.]+)\.\s+Your Leader gains an additional \+(?<amount>[1-9]\d*) power (?<duration>.+?) for every Character K\.O\.['’]d\.?$/iu.exec(
      input.text,
    );
  const firstText = match?.groups?.["first"];
  const koText = match?.groups?.["ko"];
  const amountText = match?.groups?.["amount"];
  const durationText = match?.groups?.["duration"];
  if (
    firstText === undefined ||
    koText === undefined ||
    amountText === undefined ||
    durationText === undefined
  ) {
    return undefined;
  }

  const first = parseModifyPowerInstruction({ text: `${firstText}.` });
  const ko = parseKoInstruction({ text: koText });
  const duration = parseDurationFromSet(
    { text: durationText },
    fieldEffectDurationParsers,
  );
  if (
    first === undefined ||
    first.rest.length > 0 ||
    first.effect.type !== "modifyPower" ||
    first.effect.target.type !== "myLeader" ||
    ko === undefined ||
    ko.rest.length > 0 ||
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  const additionalPower: Effect = {
    type: "modifyPower",
    target: { type: "myLeader" },
    value: {
      type: "selectedCardCount",
      selection: koTargetSelectionId,
      multiplier: Number.parseInt(amountText, 10),
    },
    duration: duration.duration,
  };

  return {
    effect: {
      type: "sequence",
      effects: [
        { connector: "always", effect: first.effect },
        { connector: "then", effect: ko.effect },
        { connector: "then", effect: additionalPower },
      ],
    },
    evidence: [
      "expression:sequence",
      ...first.evidence,
      ...ko.evidence,
      ...duration.evidence,
      "value:dynamic:selectedCardCount",
      "count:selectedCardCount",
    ],
    rest: "",
  };
}
