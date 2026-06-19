import type { ReactionPredicateParser } from "../event-reaction.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import type { PrimitiveEvidence } from "../../types.js";

export const parseEndOfBattlePredicate: ReactionPredicateParser = ({
  text,
}) => {
  const match =
    /^the end of a battle in which this (?<source>Leader|Character) battles your opponent's (?<target>Leader|Character)(?<targetPredicates>\s+with\s+.+)?$/iu.exec(
      text.trim(),
    );
  const sourceText = match?.groups?.["source"]?.toLowerCase();
  const targetText = match?.groups?.["target"]?.toLowerCase();
  const targetPredicatesText = match?.groups?.["targetPredicates"]?.trim();
  if (
    (sourceText !== "leader" && sourceText !== "character") ||
    (targetText !== "leader" && targetText !== "character")
  ) {
    return undefined;
  }
  const counterpart = parseBattleCounterpartFilter(
    targetText,
    targetPredicatesText,
  );
  if (counterpart === undefined) {
    return undefined;
  }

  return {
    trigger: {
      type: "endOfBattle",
      role: "attackerOrTarget",
      player: "self",
      filter: { categories: [sourceText] },
      counterpartPlayer: "opponent",
      counterpartFilter: counterpart.filter,
    },
    evidence: [
      "trigger:endOfBattle",
      sourceText === "leader" ? "target:thisLeader" : "target:thisCharacter",
      targetText === "leader"
        ? "target:opponentLeader"
        : "target:opponentCharacter",
      sourceText === "leader"
        ? "filter:category:leader"
        : "filter:category:character",
      ...counterpart.evidence,
      "player:self",
      "player:opponent",
    ],
  };
};

function parseBattleCounterpartFilter(
  category: "leader" | "character",
  predicateText: string | undefined,
):
  | {
      readonly filter: NonNullable<
        NonNullable<ReturnType<typeof parseCardFilterPredicates>>["filter"]
      >;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  if (predicateText === undefined) {
    return {
      filter: { categories: [category] },
      evidence:
        category === "leader"
          ? ["filter:category:leader"]
          : ["filter:category:character"],
    };
  }

  const parsed = parseCardFilterPredicates(
    { text: `${category} ${predicateText}` },
    { powerSemantics: "current" },
  );
  if (
    parsed === undefined ||
    parsed.rest.length > 0 ||
    parsed.filter.categories?.includes(category) !== true
  ) {
    return undefined;
  }
  return {
    filter: parsed.filter,
    evidence: parsed.evidence,
  };
}
