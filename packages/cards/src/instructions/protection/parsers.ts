import {
  parseDurationFromSet,
  selfNextTurnStartOnlyDurationParsers,
} from "../../durations/index.js";
import {
  type ProtectionProcess,
  parseProtectionProcess,
} from "../../protection/process.js";
import { parseProtectionSource } from "../../protection/source.js";
import {
  parseAllFieldTarget,
  parseProtectionTarget,
} from "../../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../../types.js";
import type { ContinuousInstructionParser } from "../continuous-field-effects.js";
import { buildProtectionEffectWithTarget } from "./builders.js";

export const protectionInstructionPrimitive = {
  primitiveId: "instruction:giveProtection",
  childPrimitiveIds: [
    "target:thisCharacter",
    "protectionProcess:fieldRemoval",
    "protectionProcess:ko",
    "protectionProcess:rest",
    "protectionSource:opponentCardCategoryEffects",
    "protectionSource:opponentCardFilterEffects",
    "protectionSource:cardFilterEffects",
    "protectionSource:opponentEffects",
    "protectionSource:effects",
    "protectionSource:battle",
  ],
} as const;

export const parseProtectionInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const target = parseProtectionTarget(input);
  if (target === undefined) {
    return undefined;
  }

  const parsedProcesses = parseProtectionProcesses(target.rest);
  if (parsedProcesses === undefined) {
    return undefined;
  }

  const source = parseProtectionSource({ text: parsedProcesses.rest });
  if (source === undefined || source.rest.length > 0) {
    return undefined;
  }

  const duration =
    context.condition === undefined
      ? { type: "whileSourceOnField" as const }
      : {
          type: "whileConditionTrue" as const,
          condition: context.condition,
        };

  const effects = parsedProcesses.processes.map((process) =>
    buildProtectionEffectWithTarget({
      duration,
      process: process.type,
      sourceCardCategories: source.source.cardCategories,
      sourceCardFilter: source.source.cardFilter,
      sourceKind: source.source.kind,
      sourceControllerRelation: source.source.controllerRelation,
      target: target.target,
    }),
  );
  const firstEffect = effects[0];
  if (firstEffect === undefined) {
    return undefined;
  }
  const effect =
    effects.length === 1
      ? firstEffect
      : ({
          type: "sequence",
          effects: effects.map((parsedEffect, index) => ({
            connector: index === 0 ? ("always" as const) : ("then" as const),
            effect: parsedEffect,
          })),
        } as const);

  return {
    effect,
    evidence: [
      "instruction:giveProtection",
      ...target.evidence,
      ...parsedProcesses.evidence,
      ...source.evidence,
      context.condition === undefined
        ? "duration:whileSourceOnField"
        : "duration:whileConditionTrue",
    ],
    rest: "",
  };
};

interface ProtectionProcessesParseResult {
  readonly processes: readonly ProtectionProcess[];
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

function parseProtectionProcesses(
  text: string,
): ProtectionProcessesParseResult | undefined {
  const koThenRestMatch =
    /^cannot be K\.O\.'d or rested\b\s*(?<rest>.*)$/i.exec(text);
  if (koThenRestMatch !== null) {
    return {
      processes: [{ type: "ko" }, { type: "rest" }],
      evidence: ["protectionProcess:ko", "protectionProcess:rest"],
      rest: koThenRestMatch.groups?.["rest"]?.trim() ?? "",
    };
  }

  const restThenKoMatch =
    /^cannot be rested or K\.O\.'d\b\s*(?<rest>.*)$/i.exec(text);
  if (restThenKoMatch !== null) {
    return {
      processes: [{ type: "rest" }, { type: "ko" }],
      evidence: ["protectionProcess:rest", "protectionProcess:ko"],
      rest: restThenKoMatch.groups?.["rest"]?.trim() ?? "",
    };
  }

  const singleProcess = parseProtectionProcess({ text });
  if (singleProcess !== undefined) {
    return {
      processes: [singleProcess.process],
      evidence: singleProcess.evidence,
      rest: singleProcess.rest,
    };
  }

  return undefined;
}

export const parseOpponentEffectFieldRemovalProtectionInstruction =
  parseProtectionInstruction;

export const parseExplicitProtectionInstruction: InstructionParser = (
  input,
) => {
  const noneMatch =
    /^None of your\s+(?<target>.+?)\s+can be\s+(?<process>.+)$/i.exec(
      input.text,
    );
  const targetText = noneMatch?.groups?.["target"];
  const processText = noneMatch?.groups?.["process"];
  if (targetText === undefined || processText === undefined) {
    return undefined;
  }

  const target = parseAllFieldTarget({ text: `All of your ${targetText}` });
  if (target === undefined) {
    return undefined;
  }
  const process = parseProtectionProcess({ text: `cannot be ${processText}` });
  if (process === undefined) {
    return undefined;
  }
  const source = parseProtectionSource({ text: process.rest });
  if (source === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: source.rest },
    selfNextTurnStartOnlyDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }

  return {
    effect: buildProtectionEffectWithTarget({
      duration: duration.duration,
      process: process.process.type,
      sourceCardCategories: source.source.cardCategories,
      sourceCardFilter: source.source.cardFilter,
      sourceKind: source.source.kind,
      sourceControllerRelation: source.source.controllerRelation,
      target: target.target,
    }),
    evidence: [
      "instruction:giveProtection",
      ...target.evidence,
      ...process.evidence,
      ...source.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};
