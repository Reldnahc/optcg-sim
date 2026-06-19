import type { Trigger } from "@optcg/types";

import type { ReactionPredicateParser } from "../event-reaction.js";

export const parseDonReturnedPredicate: ReactionPredicateParser = ({
  text,
}) => {
  const returned =
    /^(?:(?<count>[1-9]\d*) or more DON!! cards on (?<countField>your|the) field are returned|a DON!! card on (?<singleField>your|the) field is returned) to your DON!! deck(?<byYourEffect> by your effect)?$/iu.exec(
      text.trim(),
    );
  if (returned === null) {
    return undefined;
  }

  const byYourEffect = returned.groups?.["byYourEffect"] !== undefined;
  const countText = returned.groups?.["count"];
  const trigger: Trigger = {
    type: "donReturned",
    player: "self",
    ...(byYourEffect
      ? {
          sourceController: "self" as const,
          sourceKind: "effect" as const,
        }
      : {}),
  };
  return {
    trigger:
      countText === undefined
        ? trigger
        : {
            type: "eventCount",
            trigger,
            count: { op: "gte", value: Number.parseInt(countText, 10) },
          },
    evidence: [
      "trigger:donReturned",
      "player:self",
      ...(countText === undefined ? [] : (["count:positiveInteger"] as const)),
      ...(byYourEffect ? (["replacementSource:cardEffect"] as const) : []),
    ],
  };
};
