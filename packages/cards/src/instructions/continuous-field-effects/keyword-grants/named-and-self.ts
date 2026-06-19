import { parseKeyword } from "../../../keywords/index.js";
import type { InstructionParseResult } from "../../../types.js";
import {
  continuousDuration,
  type ContinuousInstructionContext,
} from "../shared.js";

export const parseNamedCardsAndSelfKeywordGrant = (
  text: string,
  context: ContinuousInstructionContext,
): InstructionParseResult | undefined => {
  const namedAndSelfMatch =
    /^All of your \[(?<name>[^\]]+)\] cards and this Character gain (?<keyword>\[[^\]]+\])\.?$/i.exec(
      text,
    );
  const name = namedAndSelfMatch?.groups?.["name"]?.trim();
  const namedKeywordText = namedAndSelfMatch?.groups?.["keyword"];
  if (
    name === undefined ||
    name.length === 0 ||
    namedKeywordText === undefined
  ) {
    return undefined;
  }

  const keyword = parseKeyword({ text: namedKeywordText });
  if (keyword === undefined || keyword.rest.length > 0) {
    return undefined;
  }

  const duration = continuousDuration(context.condition);
  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "giveKeyword",
            target: {
              type: "all",
              zone: "characterArea",
              player: "self",
              filter: { categories: ["character"], names: [name] },
            },
            keyword: keyword.keyword,
            duration,
          },
        },
        {
          connector: "always",
          effect: {
            type: "giveKeyword",
            target: { type: "self" },
            keyword: keyword.keyword,
            duration,
          },
        },
      ],
    },
    evidence: [
      "instruction:giveKeyword",
      "cardinality:all",
      "player:self",
      "zone:characterArea",
      "filter:name",
      "filter:category:character",
      "target:thisCharacter",
      ...keyword.evidence,
      context.condition === undefined
        ? "duration:whileSourceOnField"
        : "duration:whileConditionTrue",
    ],
    rest: "",
  };
};

export const parseNamedCardsKeywordGrant = (
  text: string,
  context: ContinuousInstructionContext,
): InstructionParseResult | undefined => {
  const namedMatch =
    /^Your \[(?<name>[^\]]+)\](?: cards?)? gains? (?<keyword>\[[^\]]+\])\.?$/i.exec(
      text,
    );
  const name = namedMatch?.groups?.["name"]?.trim();
  const namedKeywordText = namedMatch?.groups?.["keyword"];
  if (
    name === undefined ||
    name.length === 0 ||
    namedKeywordText === undefined
  ) {
    return undefined;
  }

  const keyword = parseKeyword({ text: namedKeywordText });
  if (keyword === undefined || keyword.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "giveKeyword",
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: { categories: ["character"], names: [name] },
      },
      keyword: keyword.keyword,
      duration: continuousDuration(context.condition),
    },
    evidence: [
      "instruction:giveKeyword",
      "cardinality:all",
      "player:self",
      "zone:characterArea",
      "filter:name",
      "filter:category:character",
      ...keyword.evidence,
      context.condition === undefined
        ? "duration:whileSourceOnField"
        : "duration:whileConditionTrue",
    ],
    rest: "",
  };
};
