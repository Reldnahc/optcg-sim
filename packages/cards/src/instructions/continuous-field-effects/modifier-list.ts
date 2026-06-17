import type { Duration, Effect, Target } from "@optcg/types";

import { parseKeyword } from "../../keywords/index.js";
import {
  allPowerModifierParsers,
  parseModifierFromSet,
} from "../../modifiers/index.js";
import type { InstructionParseResult, PrimitiveEvidence } from "../../types.js";
import { parseMatchingZoneCardsScaledSuffix } from "../../values/dynamic-number.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  parseFieldEffectDuration,
  type ContinuousInstructionContext,
} from "./shared.js";

export function parseContinuousModifierListForTarget({
  target,
  targetEvidence,
  text,
  context,
}: {
  readonly target: Target;
  readonly targetEvidence: readonly PrimitiveEvidence[];
  readonly text: string;
  readonly context: ContinuousInstructionContext;
}): InstructionParseResult | undefined {
  const dynamicValue = parseMatchingZoneCardsScaledSuffix(1, text);
  const modifierText = dynamicValue?.prefixText ?? text;
  const parts = modifierText
    .replace(/\.$/u, "")
    .split(/\s+and\s+/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return undefined;
  }

  const effects: Effect[] = [];
  const instructionEvidence: PrimitiveEvidence[] = [];
  const modifierEvidence: PrimitiveEvidence[] = [];
  const durationEvidence: PrimitiveEvidence[] = [];

  for (const part of parts) {
    const keyword = parseKeyword({ text: part });
    if (keyword !== undefined) {
      if (keyword.rest.length > 0 && keyword.rest !== ".") {
        return undefined;
      }
      effects.push({
        type: "giveKeyword",
        target,
        keyword: keyword.keyword,
        duration: continuousDuration(context.condition),
      });
      instructionEvidence.push("instruction:giveKeyword");
      modifierEvidence.push(...keyword.evidence);
      durationEvidence.push(continuousDurationEvidence(context.condition));
      continue;
    }

    const power = parseModifierFromSet({ text: part }, allPowerModifierParsers);
    if (power !== undefined) {
      const parsedDuration = parseContinuousModifierDuration(
        power.rest,
        context,
      );
      if (parsedDuration === undefined) {
        return undefined;
      }
      effects.push({
        type: "modifyPower",
        target,
        value:
          dynamicValue === undefined
            ? power.value
            : { ...dynamicValue.value, multiplier: power.value },
        duration: parsedDuration.duration,
      });
      instructionEvidence.push("instruction:modifyPower");
      modifierEvidence.push(...power.evidence);
      durationEvidence.push(...parsedDuration.evidence);
      if (dynamicValue !== undefined) {
        modifierEvidence.push(...dynamicValue.evidence);
      }
      continue;
    }

    const cost = /^\+(?<value>[1-9]\d*) cost\b(?<rest>.*)$/iu.exec(part);
    const costValueText = cost?.groups?.["value"];
    const costRestText = cost?.groups?.["rest"]?.trim() ?? "";
    if (costValueText !== undefined) {
      const parsedDuration = parseContinuousModifierDuration(
        costRestText,
        context,
      );
      if (parsedDuration === undefined) {
        return undefined;
      }
      effects.push({
        type: "modifyCost",
        player: "self",
        target,
        value:
          dynamicValue === undefined
            ? Number.parseInt(costValueText, 10)
            : {
                ...dynamicValue.value,
                multiplier: Number.parseInt(costValueText, 10),
              },
        duration: parsedDuration.duration,
      });
      instructionEvidence.push("instruction:modifyCost");
      modifierEvidence.push("modifier:positiveCost");
      durationEvidence.push(...parsedDuration.evidence);
      if (dynamicValue !== undefined) {
        modifierEvidence.push(...dynamicValue.evidence);
      }
      continue;
    }

    return undefined;
  }

  const firstEffect = effects[0];
  if (firstEffect === undefined) {
    return undefined;
  }
  const effect: Effect =
    effects.length === 1
      ? firstEffect
      : {
          type: "sequence",
          effects: effects.map((sequenceEffect) => ({
            connector: "always" as const,
            effect: sequenceEffect,
          })),
        };

  return {
    effect,
    evidence: [
      ...new Set<PrimitiveEvidence>([
        ...instructionEvidence,
        ...targetEvidence,
        ...modifierEvidence,
        ...durationEvidence,
      ]),
    ],
    rest: "",
  };
}

function parseContinuousModifierDuration(
  rest: string,
  context: ContinuousInstructionContext,
):
  | {
      readonly duration: Duration;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const normalized = rest.replace(/\.$/u, "").trim();
  if (normalized.length === 0) {
    return {
      duration: continuousDuration(context.condition),
      evidence: [continuousDurationEvidence(context.condition)],
    };
  }
  const explicit = parseFieldEffectDuration({ text: normalized });
  return explicit?.duration !== undefined && explicit.rest.length === 0
    ? { duration: explicit.duration, evidence: explicit.evidence }
    : undefined;
}
