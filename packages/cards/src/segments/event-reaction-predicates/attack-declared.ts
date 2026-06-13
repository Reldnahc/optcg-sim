import type { CardCategory } from "@optcg/types";

import type { ExpressionParseResult } from "../../types.js";
import type { ReactionPredicateParser } from "../event-reaction.js";

const attackCategoryFromText = (text: string): CardCategory | undefined => {
  const normalized = text.toLowerCase();
  if (normalized === "leader" || normalized === "character") {
    return normalized;
  }
  return undefined;
};

const attackCategoryEvidence = (
  category: CardCategory,
  owner: "self" | "opponent",
): readonly ExpressionParseResult["evidence"][number][] => {
  if (category === "leader") {
    return owner === "self"
      ? ["target:thisLeader", "filter:category:leader"]
      : ["target:opponentLeader", "filter:category:leader"];
  }
  if (category === "character") {
    return owner === "self"
      ? ["target:thisCharacter", "filter:category:character"]
      : ["target:opponentCharacter", "filter:category:character"];
  }
  return [];
};

export const parseAttackDeclaredPredicate: ReactionPredicateParser = ({
  text,
}) => {
  const normalized = text.trim();
  const attack =
    /^this (?<source>Leader|Character) attacks your opponent's (?<target>Leader|Character)$/iu.exec(
      normalized,
    );
  const sourceCategoryText = attack?.groups?.["source"];
  const targetCategoryText = attack?.groups?.["target"];
  if (sourceCategoryText === undefined || targetCategoryText === undefined) {
    return undefined;
  }
  const sourceCategory = attackCategoryFromText(sourceCategoryText);
  const targetCategory = attackCategoryFromText(targetCategoryText);
  if (sourceCategory === undefined || targetCategory === undefined) {
    return undefined;
  }

  return {
    trigger: {
      type: "attackDeclared",
      role: "attacker",
      player: "self",
      filter: { categories: [sourceCategory] },
      targetPlayer: "opponent",
      targetFilter: { categories: [targetCategory] },
    },
    evidence: [
      "trigger:attackDeclared",
      ...attackCategoryEvidence(sourceCategory, "self"),
      ...attackCategoryEvidence(targetCategory, "opponent"),
      "player:self",
      "player:opponent",
    ],
  };
};
