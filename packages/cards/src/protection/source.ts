import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface ProtectionSource {
  readonly kind: "battle" | "cardEffect";
  readonly controllerRelation: "eitherController" | "opponentControlled";
}

export interface ProtectionSourceParseResult {
  readonly source: ProtectionSource;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const opponentEffectsProtectionSourcePrimitive = {
  primitiveId: "protectionSource:opponentEffects",
  matches: [
    {
      id: "by-your-opponents-effects",
    },
  ],
} as const;

export const effectsProtectionSourcePrimitive = {
  primitiveId: "protectionSource:effects",
  matches: [
    {
      id: "by-effects",
    },
  ],
} as const;

export const battleProtectionSourcePrimitive = {
  primitiveId: "protectionSource:battle",
  matches: [
    {
      id: "in-battle",
    },
  ],
} as const;

export function parseProtectionSource(
  input: ParseInput,
): ProtectionSourceParseResult | undefined {
  if (/^by your opponent's effects\.?$/i.test(input.text)) {
    return {
      source: {
        kind: "cardEffect",
        controllerRelation: "opponentControlled",
      },
      evidence: ["protectionSource:opponentEffects"],
      rest: "",
    };
  }

  if (/^by effects\.?$/i.test(input.text)) {
    return {
      source: {
        kind: "cardEffect",
        controllerRelation: "eitherController",
      },
      evidence: ["protectionSource:effects"],
      rest: "",
    };
  }

  const battleMatch = /^in battle\b\s*(?<rest>.*)$/i.exec(input.text);
  if (battleMatch !== null) {
    return {
      source: {
        kind: "battle",
        controllerRelation: "eitherController",
      },
      evidence: ["protectionSource:battle"],
      rest: trimTrailingPeriod(battleMatch.groups?.["rest"]?.trim() ?? ""),
    };
  }

  return undefined;
}

function trimTrailingPeriod(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}
