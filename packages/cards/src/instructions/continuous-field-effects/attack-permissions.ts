import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseTargetFromSet,
  parseThisCharacterTarget,
  selectedPowerGainTargetParsers,
} from "../../targets/index.js";
import type { InstructionParseResult, ParseInput } from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  parseFieldEffectDuration,
  type ContinuousInstructionContext,
} from "./shared.js";

const activeCharactersPermissionPattern =
  /^can also attack (?:your opponent's )?active Characters\s*(?<rest>.*)$/iu;

export const parseAllowAttackActiveCharactersInstruction = (
  input: ParseInput,
  context?: ContinuousInstructionContext,
): InstructionParseResult | undefined =>
  parseSelectedAttackPermission(input) ??
  parseSelfAttackPermission(input, context);

const parseSelectedAttackPermission = (
  input: ParseInput,
): InstructionParseResult | undefined => {
  const cardinality = parseUpToCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseTargetFromSet(
    { text: cardinality.rest },
    selectedPowerGainTargetParsers(),
  );
  if (target?.target === undefined) {
    return undefined;
  }

  const permissionText =
    activeCharactersPermissionPattern.exec(target.rest)?.groups?.["rest"] ??
    undefined;
  if (permissionText === undefined) {
    return undefined;
  }

  const duration = parseFieldEffectDuration({ text: permissionText });
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "allowAttackActiveCharacters",
      target: target.target,
      duration: duration.duration,
    },
    evidence: [
      "instruction:allowAttackActiveCharacters",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};

const parseSelfAttackPermission = (
  input: ParseInput,
  context: ContinuousInstructionContext | undefined,
): InstructionParseResult | undefined => {
  const target = parseThisCharacterTarget({
    text: input.text,
    allowImplicit: true,
  });
  if (target === undefined) {
    return undefined;
  }

  const permissionMatch = activeCharactersPermissionPattern.exec(target.rest);
  const rest = permissionMatch?.groups?.["rest"]?.trim();
  if (rest === undefined) {
    return undefined;
  }

  const explicitDuration =
    rest.length > 0 && rest !== "."
      ? parseFieldEffectDuration({ text: rest })
      : undefined;
  if (explicitDuration !== undefined && explicitDuration.rest.length > 0) {
    return undefined;
  }
  if (explicitDuration === undefined && context === undefined) {
    return undefined;
  }
  const duration =
    explicitDuration?.duration ??
    (context === undefined ? undefined : continuousDuration(context.condition));
  const durationEvidence =
    explicitDuration?.duration === undefined
      ? context === undefined
        ? undefined
        : [continuousDurationEvidence(context.condition)]
      : explicitDuration.evidence;
  if (duration === undefined || durationEvidence === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "allowAttackActiveCharacters",
      target: { type: "self" },
      duration,
    },
    evidence: [
      "instruction:allowAttackActiveCharacters",
      ...target.evidence,
      ...durationEvidence,
    ],
    rest: "",
  };
};
