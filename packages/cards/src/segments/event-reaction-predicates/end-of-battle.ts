import type { ReactionPredicateParser } from "../event-reaction.js";

export const parseEndOfBattlePredicate: ReactionPredicateParser = ({
  text,
}) => {
  const match =
    /^the end of a battle in which this (?<source>Leader|Character) battles your opponent's (?<target>Leader|Character)$/iu.exec(
      text.trim(),
    );
  const sourceText = match?.groups?.["source"]?.toLowerCase();
  const targetText = match?.groups?.["target"]?.toLowerCase();
  if (
    (sourceText !== "leader" && sourceText !== "character") ||
    (targetText !== "leader" && targetText !== "character")
  ) {
    return undefined;
  }

  return {
    trigger: {
      type: "endOfBattle",
      role: "attackerOrTarget",
      player: "self",
      filter: { categories: [sourceText] },
      counterpartPlayer: "opponent",
      counterpartFilter: { categories: [targetText] },
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
      targetText === "leader"
        ? "filter:category:leader"
        : "filter:category:character",
      "player:self",
      "player:opponent",
    ],
  };
};
