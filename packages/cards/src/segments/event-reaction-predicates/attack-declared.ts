import type { CardCategory } from "@optcg/types";

import { parseCardFilterPredicates } from "../../filters/index.js";
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
    /^this (?<source>Leader|Character) (?:attacks|battles) your opponent's (?<target>Leader|Character)$/iu.exec(
      normalized,
    );
  const sourceCategoryText = attack?.groups?.["source"];
  const targetCategoryText = attack?.groups?.["target"];
  if (sourceCategoryText !== undefined && targetCategoryText !== undefined) {
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
  }

  const filteredBattle =
    /^this (?<source>Leader|Character) battles (?<counterpart>.+)$/iu.exec(
      normalized,
    );
  const filteredSourceCategoryText = filteredBattle?.groups?.["source"];
  const counterpartText = filteredBattle?.groups?.["counterpart"];
  if (
    filteredSourceCategoryText === undefined ||
    counterpartText === undefined
  ) {
    return undefined;
  }
  const filteredSourceCategory = attackCategoryFromText(
    filteredSourceCategoryText,
  );
  const counterpartFilter = parseCardFilterPredicates({
    text: counterpartText,
  });
  if (
    filteredSourceCategory === undefined ||
    counterpartFilter === undefined ||
    counterpartFilter.rest.length > 0
  ) {
    return undefined;
  }

  return {
    trigger: {
      type: "attackDeclared",
      role: "attackerOrTarget",
      player: "self",
      filter: { categories: [filteredSourceCategory] },
      counterpartPlayer: "opponent",
      counterpartFilter: counterpartFilter.filter,
    },
    evidence: [
      "trigger:attackDeclared",
      ...attackCategoryEvidence(filteredSourceCategory, "self"),
      ...counterpartFilter.evidence,
      "player:self",
      "player:opponent",
    ],
  };
};
