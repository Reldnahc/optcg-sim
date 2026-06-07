import {
  parseThisCharacterTarget,
  parseYourLeaderTarget,
} from "../../../targets/index.js";
import type { InstructionParseResult } from "../../../types.js";
import type { ContinuousInstructionParser } from "../shared.js";
import { parseKeywordAndPositivePowerGrant } from "./keyword-and-power.js";
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
    parseNamedCardsAndSelfKeywordGrant(input.text, context) ??
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
    parseKeywordAndPositivePowerGrant({
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

  return parseKeywordGrantForTarget({
    target: { type: "self" },
    targetEvidence: target.evidence,
    text: keywordText,
    context,
  });
};
