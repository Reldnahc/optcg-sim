import {
  parseThisCharacterTarget,
  parseYourLeaderTarget,
} from "../../../targets/index.js";
import { parseThatCharacterReference } from "../../../references/index.js";
import type { InstructionParseResult } from "../../../types.js";
import type { ContinuousInstructionParser } from "../shared.js";
import { continuousDuration, continuousDurationEvidence } from "../shared.js";
import { parseContinuousModifierListForTarget } from "../modifier-list.js";
import { parseNamedCardsAndSelfKeywordGrant } from "./named-and-self.js";
import { parseKeywordGrantForTarget } from "./shared.js";

export const thisCharacterKeywordGrantPrimitive = {
  primitiveId: "instruction:giveKeyword",
  childPrimitiveIds: [
    "target:thisCharacter",
    "keyword:anySupported",
    "duration:whileConditionTrue",
    "duration:opponentNextEndPhase",
  ],
} as const;

export const parseThisCharacterKeywordGrantInstruction: ContinuousInstructionParser =
  (input, context) =>
    parseLeaderKeywordGrant(input, context) ??
    parseThatCharacterKeywordGrant(input.text, context) ??
    parseNamedCardsAndSelfKeywordGrant(input.text, context) ??
    parseNaturalRushCharacterGrant(input.text, context) ??
    parseFilteredNaturalRushCharacterGrant(input.text, context) ??
    parseSelfKeywordGrant(input.text, context);

const parseLeaderKeywordGrant: ContinuousInstructionParser = (
  input,
  context,
): InstructionParseResult | undefined => {
  const leaderTarget = parseYourLeaderTarget(input);
  if (leaderTarget?.target === undefined) {
    return undefined;
  }
  const leaderKeywordText = /^gains\s+(?<rest>.*)$/i.exec(leaderTarget.rest)
    ?.groups?.["rest"];
  if (leaderKeywordText === undefined) {
    return undefined;
  }

  return (
    parseContinuousModifierListForTarget({
      target: leaderTarget.target,
      targetEvidence: leaderTarget.evidence,
      text: leaderKeywordText,
      context,
    }) ??
    parseKeywordGrantForTarget({
      target: leaderTarget.target,
      targetEvidence: leaderTarget.evidence,
      text: leaderKeywordText,
      context,
    })
  );
};

const parseSelfKeywordGrant = (
  text: string,
  context: Parameters<ContinuousInstructionParser>[1],
): InstructionParseResult | undefined => {
  const target = parseThisCharacterTarget({
    text,
    allowImplicit: true,
  });
  if (target === undefined) {
    return undefined;
  }

  const keywordText = /^gains\s+(?<rest>.*)$/i.exec(target.rest)?.groups?.[
    "rest"
  ];
  if (keywordText === undefined) {
    return undefined;
  }

  return (
    parseContinuousModifierListForTarget({
      target: { type: "self" },
      targetEvidence: target.evidence,
      text: keywordText,
      context,
    }) ??
    parseKeywordGrantForTarget({
      target: { type: "self" },
      targetEvidence: target.evidence,
      text: keywordText,
      context,
    })
  );
};

const parseNaturalRushCharacterGrant = (
  text: string,
  context: Parameters<ContinuousInstructionParser>[1],
): InstructionParseResult | undefined => {
  if (
    !/^this Character can attack Characters on the turn in which it is played\.?$/iu.test(
      text,
    )
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "giveKeyword",
      target: { type: "self" },
      keyword: "rushCharacter",
      duration: continuousDuration(context.condition),
    },
    evidence: [
      "instruction:giveKeyword",
      "target:thisCharacter",
      "keyword:anySupported",
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};

const parseFilteredNaturalRushCharacterGrant = (
  text: string,
  context: Parameters<ContinuousInstructionParser>[1],
): InstructionParseResult | undefined => {
  const match =
    /^Your \{(?<type>[^}]+)\} type Characters can attack Characters on the turn in which they are played\.?$/iu.exec(
      text,
    );
  const type = match?.groups?.["type"]?.trim();
  if (type === undefined || type.length === 0) {
    return undefined;
  }

  return {
    effect: {
      type: "giveKeyword",
      target: {
        type: "all",
        player: "self",
        zone: "characterArea",
        filter: { categories: ["character"], typesAny: [type] },
      },
      keyword: "rushCharacter",
      duration: continuousDuration(context.condition),
    },
    evidence: [
      "instruction:giveKeyword",
      "target:yourCharacters",
      "filter:type",
      "keyword:anySupported",
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};

const parseThatCharacterKeywordGrant = (
  text: string,
  context: Parameters<ContinuousInstructionParser>[1],
): InstructionParseResult | undefined => {
  const reference = parseThatCharacterReference({ text });
  if (reference === undefined) {
    return undefined;
  }

  const keywordText = /^gains\s+(?<rest>.*)$/i.exec(reference.rest)?.groups?.[
    "rest"
  ];
  if (keywordText === undefined) {
    return undefined;
  }

  return parseKeywordGrantForTarget({
    target: {
      type: "savedFieldObject",
      binding: {
        family: "producedObjects",
        saveResultAs: "trigger:cardPlayed",
      },
      zone: "characterArea",
      player: "self",
      visibility: "publicOnly",
      onFailure: "failClosed",
    },
    targetEvidence: reference.evidence,
    text: keywordText,
    context,
  });
};
