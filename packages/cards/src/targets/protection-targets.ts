import type { Target } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";
import { parseAllFieldTarget } from "./all-field-targets.js";
import { parseThisCharacterTarget } from "./this-character.js";

interface ProtectionTargetParseResult {
  readonly target: Target;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

type ProtectionTargetParser = (
  input: ParseInput,
) => ProtectionTargetParseResult | undefined;

const protectionTargetParsers = (): readonly ProtectionTargetParser[] =>
  [
    parseAllProtectionTarget,
    parseImplicitAllProtectionTarget,
    parseBareFilteredCharacterProtectionTarget,
    (input) => parseThisCharacterTarget({ ...input, allowImplicit: true }),
  ] as const;

export function parseProtectionTarget(
  input: ParseInput,
): ProtectionTargetParseResult | undefined {
  for (const parser of protectionTargetParsers()) {
    const parsed = parser(input);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

const parseAllProtectionTarget: ProtectionTargetParser = (
  input,
): ProtectionTargetParseResult | undefined => {
  const match = /^(?<target>All of .+?)\s+(?<process>cannot be .+)$/iu.exec(
    input.text,
  );
  const targetText = match?.groups?.["target"];
  const processText = match?.groups?.["process"];
  if (targetText === undefined || processText === undefined) {
    return undefined;
  }
  const target = parseAllFieldTarget({ text: targetText });
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }
  return { ...target, rest: processText };
};

const parseBareFilteredCharacterProtectionTarget: ProtectionTargetParser = (
  input,
): ProtectionTargetParseResult | undefined => {
  const match =
    /^(?<target>.+?Characters?\b.*?)\s+(?<process>cannot be .+)$/iu.exec(
      input.text,
    );
  const targetText = match?.groups?.["target"]?.trim();
  const processText = match?.groups?.["process"];
  if (targetText === undefined || processText === undefined) {
    return undefined;
  }

  const target = parseAllFieldTarget({ text: `All of your ${targetText}` });
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  return { ...target, rest: processText };
};

const parseImplicitAllProtectionTarget: ProtectionTargetParser = (
  input,
): ProtectionTargetParseResult | undefined => {
  const match =
    /^(?<target>(?:your opponent's|your|Characters?\b).+?)\s+(?<process>cannot be .+)$/iu.exec(
      input.text,
    );
  const targetText = match?.groups?.["target"]?.trim();
  const processText = match?.groups?.["process"];
  if (targetText === undefined || processText === undefined) {
    return undefined;
  }

  const normalizedTarget = targetText.startsWith("Characters")
    ? `All ${targetText}`
    : `All of ${targetText}`;
  const target = parseAllFieldTarget({ text: normalizedTarget });
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  return { ...target, rest: processText };
};
