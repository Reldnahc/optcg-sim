import { parseCardFilterPredicates } from "../filters/index.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseLeaderNameCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const nameListMatch = /^your Leader is\s+(?<names>.+)$/i.exec(input.text);
  const nameListText = nameListMatch?.groups?.["names"];
  if (
    nameListText !== undefined &&
    /^\[[^\]]+\](?:,\s*\[[^\]]+\])*(?:\s+or\s+\[[^\]]+\])$/i.test(
      nameListText.trim(),
    )
  ) {
    const names = [...nameListText.matchAll(/\[([^\]]+)\]/g)]
      .map((match) => match[1]?.trim())
      .filter((name): name is string => name !== undefined && name.length > 0);
    if (names.length > 1) {
      return {
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: {
            categories: ["leader"],
            anyOf: names.map((name) => ({ names: [name] })),
          },
        },
        evidence: [
          "condition:leaderIdentity",
          "player:self",
          "zone:leaderArea",
          "filter:category:leader",
          "filter:anyOf",
          ...names.map(() => "filter:name" as const),
        ],
        rest: "",
      };
    }
  }

  const nameContainsMatch =
    /^your Leader's card name includes\s+"(?<name>[^"]+)"$/i.exec(input.text);
  const includedName = nameContainsMatch?.groups?.["name"]?.trim();
  if (includedName !== undefined && includedName.length > 0) {
    return {
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          nameContains: includedName,
        },
      },
      evidence: [
        "condition:leaderIdentity",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:name",
      ],
      rest: "",
    };
  }

  const typeIncludesMatch =
    /^your Leader's type includes\s+"(?<quotedType>[^"]+)"$/i.exec(
      input.text,
    ) ??
    /^your Leader's type includes\s+(?<bareType>[^",.]+)$/i.exec(input.text);
  const includedType = (
    typeIncludesMatch?.groups?.["quotedType"] ??
    typeIncludesMatch?.groups?.["bareType"]
  )?.trim();
  if (
    includedType !== undefined &&
    includedType.length > 0 &&
    !/\band\b/iu.test(includedType)
  ) {
    return {
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          typesIncludeAny: [includedType],
        },
      },
      evidence: [
        "condition:leaderIdentity",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:type",
      ],
      rest: "",
    };
  }

  const subjectMatch = /^your Leader (?:is|has the)\s+(?<predicate>.+)$/i.exec(
    input.text,
  );
  const predicateText = subjectMatch?.groups?.["predicate"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: predicateText },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    condition: {
      type: "hasCardInZone",
      zone: "leaderArea",
      player: "self",
      filter: {
        categories: ["leader"],
        ...predicates.filter,
      },
    },
    evidence: [
      "condition:leaderIdentity",
      "player:self",
      "zone:leaderArea",
      "filter:category:leader",
      ...predicates.evidence,
    ],
    rest: "",
  };
};
