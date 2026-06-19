import type { ReactionPredicateParser } from "../event-reaction.js";

export const parseDonAttachedPredicate: ReactionPredicateParser = ({
  text,
}) => {
  const normalized = text.trim();

  const thisCard =
    /^this (?<source>Leader|Character) is given a DON!! card$/iu.exec(
      normalized,
    );
  const source = thisCard?.groups?.["source"]?.toLowerCase();
  if (source === "leader" || source === "character") {
    return {
      trigger: {
        type: "donAttached",
        player: "self",
        target: "self",
        filter: { categories: [source] },
      },
      evidence: [
        "trigger:donAttached",
        source === "leader" ? "target:thisLeader" : "target:thisCharacter",
        "player:self",
        source === "leader"
          ? "filter:category:leader"
          : "filter:category:character",
      ],
    };
  }

  if (
    /^this Leader or any of your Characters is given a DON!! card$/iu.test(
      normalized,
    )
  ) {
    return {
      trigger: {
        type: "donAttached",
        player: "self",
        target: "yourLeaderOrCharacters",
      },
      evidence: [
        "trigger:donAttached",
        "target:yourLeaderOrCharacters",
        "player:self",
      ],
    };
  }

  return undefined;
};
