import type { Condition, Keyword } from "@optcg/types";

import { parsePrimitivePattern } from "../primitive-patterns.js";
import type {
  InstructionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

export interface ContinuousInstructionContext {
  readonly condition: Condition;
}

export type ContinuousInstructionParser = (
  input: ParseInput,
  context: ContinuousInstructionContext,
) => InstructionParseResult | undefined;

type ContinuousInstructionBuilder = (
  groups: Record<string, string | undefined>,
  context: ContinuousInstructionContext,
) => InstructionParseResult | undefined;

interface ContinuousPrimitiveMatch {
  readonly id: string;
  readonly pattern: RegExp;
  readonly build: ContinuousInstructionBuilder;
}

interface ContinuousPrimitiveDefinition {
  readonly primitiveId: PrimitiveEvidence;
  readonly matches: readonly ContinuousPrimitiveMatch[];
}

export const opponentEffectFieldRemovalProtectionPrimitive: ContinuousPrimitiveDefinition =
  {
    primitiveId: "instruction:giveProtection",
    matches: [
      {
        id: "this-character-cannot-be-removed-from-field-by-opponent-effects",
        pattern:
          /^(?:this Character )?cannot be removed from the field by your opponent's effects\.?$/i,
        build: (_groups, context) => ({
          effect: {
            type: "giveProtection",
            target: { type: "self" },
            protection: {
              process: "fieldRemoval",
              fieldRemoval: {
                processFamily: "fieldRemoval",
                classification: "moveFromFieldToOtherZone",
                sourceKind: "cardEffect",
                sourceControllerRelation: "opponentControlled",
                targetScope: "thisCard",
                exclusions: {
                  battleKO: "excluded",
                  ruleProcessTrash: "excluded",
                  controllerCost: "excluded",
                  controllerOwnedEffect: "excluded",
                  ambiguousCustomRemoval: "failClosed",
                },
              },
            },
            duration: {
              type: "whileConditionTrue",
              condition: context.condition,
            },
          },
          evidence: [
            "instruction:giveProtection",
            "protection:opponentEffectFieldRemoval",
            "target:thisCharacter",
            "duration:whileConditionTrue",
          ],
          rest: "",
        }),
      },
    ],
  };

export const thisCharacterKeywordGrantPrimitive: ContinuousPrimitiveDefinition =
  {
    primitiveId: "instruction:giveKeyword",
    matches: [
      {
        id: "this-character-gains-supported-keyword",
        pattern: /^(?:this Character )?gains \[(?<keyword>[^\]]+)\]\.?$/i,
        build: (groups, context) => {
          const keyword = parseSupportedKeyword(groups["keyword"]);
          if (keyword === undefined) {
            return undefined;
          }

          return {
            effect: {
              type: "giveKeyword",
              target: { type: "self" },
              keyword,
              duration: {
                type: "whileConditionTrue",
                condition: context.condition,
              },
            },
            evidence: [
              "instruction:giveKeyword",
              "keyword:anySupported",
              "target:thisCharacter",
              "duration:whileConditionTrue",
            ],
            rest: "",
          };
        },
      },
    ],
  };

export const parseOpponentEffectFieldRemovalProtectionInstruction: ContinuousInstructionParser =
  (input, context) =>
    parseContinuousPrimitivePattern(
      input,
      context,
      opponentEffectFieldRemovalProtectionPrimitive,
    );

export const parseThisCharacterKeywordGrantInstruction: ContinuousInstructionParser =
  (input, context) =>
    parseContinuousPrimitivePattern(
      input,
      context,
      thisCharacterKeywordGrantPrimitive,
    );

function parseContinuousPrimitivePattern(
  input: ParseInput,
  context: ContinuousInstructionContext,
  definition: ContinuousPrimitiveDefinition,
): InstructionParseResult | undefined {
  return parsePrimitivePattern(input, {
    primitiveId: definition.primitiveId,
    matches: definition.matches.map((match) => ({
      id: match.id,
      pattern: match.pattern,
      build: (groups) => match.build(groups, context),
    })),
  });
}

function parseSupportedKeyword(
  printed: string | undefined,
): Keyword | undefined {
  if (printed === undefined) {
    return undefined;
  }

  const normalized = printed.trim().toLowerCase();
  switch (normalized) {
    case "blocker":
      return "blocker";
    case "banish":
      return "banish";
    case "rush":
      return "rush";
    case "rush:character":
    case "rush character":
      return "rushCharacter";
    case "double attack":
      return "doubleAttack";
    case "unblockable":
      return "unblockable";
    default:
      return undefined;
  }
}
