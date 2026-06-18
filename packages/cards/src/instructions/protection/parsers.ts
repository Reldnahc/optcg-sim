import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
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
import type {
  InstructionParseResult,
  InstructionParser,
  PrimitiveEvidence,
} from "../../types.js";
import type { ContinuousInstructionParser } from "../continuous-field-effects.js";
import { effectSequence } from "../effect-builders.js";
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
  if (source === undefined) {
    return undefined;
  }
  const explicitDuration =
    source.rest.length === 0
      ? undefined
      : parseDurationFromSet({ text: source.rest }, fieldEffectDurationParsers);
  if (source.rest.length > 0 && explicitDuration?.rest !== "") {
    return undefined;
  }

  const duration =
    explicitDuration?.duration ??
    (context.condition === undefined
      ? { type: "whileSourceOnField" as const }
      : {
          type: "whileConditionTrue" as const,
          condition: context.condition,
        });

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
  const effect = effectSequence(effects, "then");
  if (effect === undefined) {
    return undefined;
  }

  return {
    effect,
    evidence: [
      "instruction:giveProtection",
      ...target.evidence,
      ...parsedProcesses.evidence,
      ...source.evidence,
      ...(explicitDuration?.evidence ??
        ([
          context.condition === undefined
            ? "duration:whileSourceOnField"
            : "duration:whileConditionTrue",
        ] as const)),
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
    const duration = parseDurationFromSet(
      { text: process.rest },
      fieldEffectDurationParsers,
    );
    if (
      process.process.type !== "ko" ||
      duration?.duration === undefined ||
      duration.rest.length > 0
    ) {
      return undefined;
    }
    return {
      effect: {
        type: "protectFromKO",
        target: target.target,
        duration: duration.duration,
      },
      evidence: [
        "instruction:giveProtection",
        ...target.evidence,
        ...process.evidence,
        ...duration.evidence,
      ],
      rest: "",
    };
  }
  const duration = parseDurationFromSet(
    { text: source.rest },
    fieldEffectDurationParsers,
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

export const parseExplicitDurationProtectionInstruction: InstructionParser = (
  input,
): InstructionParseResult | undefined => {
  const result = parseProtectionInstruction(input, { condition: undefined });
  if (
    result === undefined ||
    !result.evidence.some((evidence) => evidence.startsWith("duration:")) ||
    result.evidence.includes("duration:whileSourceOnField") ||
    result.evidence.includes("duration:whileConditionTrue")
  ) {
    return undefined;
  }
  return result;
};
