import type { Effect, Target } from "@optcg/types";

import { parseAllFieldTarget } from "../../targets/index.js";
import type { PrimitiveEvidence } from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  parseExplicitFieldEffectDuration,
  type ContinuousInstructionParser,
} from "./shared.js";

export const setBasePowerPrimitive = {
  primitiveId: "instruction:setBasePower",
  childPrimitiveIds: [
    "cardinality:all",
    "filter:type",
    "filter:category:character",
    "value:basePower:positiveInteger",
    "duration:whileConditionTrue",
  ],
} as const;

type BasePowerTargetSubject = {
  readonly target: Target;
  readonly evidence: readonly PrimitiveEvidence[];
};

const setBasePowerEffect = (
  target: Target,
  value: Extract<Effect, { type: "setBasePower" }>["value"],
  duration: Extract<Effect, { type: "setBasePower" }>["duration"],
): Extract<Effect, { type: "setBasePower" }> => ({
  type: "setBasePower",
  target,
  value,
  duration,
});

const parseBasePowerSubject = (
  text: string,
): BasePowerTargetSubject | undefined => {
  const normalizedText = text.trim();
  if (/^your Leader(?:'s base power)?$/i.test(normalizedText)) {
    return {
      target: { type: "myLeader" },
      evidence: ["target:yourLeader"],
    };
  }

  const namedCardsMatch =
    /^All of your \[(?<name>[^\]]+)\] cards' base power$/i.exec(normalizedText);
  const name = namedCardsMatch?.groups?.["name"]?.trim();
  if (name !== undefined && name.length > 0) {
    return {
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: { categories: ["character"], names: [name] },
      },
      evidence: [
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:name",
        "filter:category:character",
      ],
    };
  }

  if (/^this Character(?:'s base power)?$/i.test(normalizedText)) {
    return {
      target: { type: "self" },
      evidence: ["target:thisCharacter"],
    };
  }

  return undefined;
};

export const parseBasePowerBecomeInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const snapshot = parseBasePowerBecomeSnapshotInstruction(input, context);
  if (snapshot !== undefined) {
    return snapshot;
  }

  const match =
    /^(?<targets>.+?) becomes? (?<value>[1-9]\d*)(?<durationText>.*)$/i.exec(
      input.text,
    );
  const targetsText = match?.groups?.["targets"];
  const valueText = match?.groups?.["value"];
  const durationText = match?.groups?.["durationText"]?.trim() ?? "";
  if (targetsText === undefined || valueText === undefined) {
    return undefined;
  }

  const value = Number.parseInt(valueText, 10);
  const subjects = targetsText
    .split(/\s+and\s+/i)
    .map((subject) => parseBasePowerSubject(subject));
  if (
    subjects.length === 0 ||
    subjects.some((subject) => subject === undefined)
  ) {
    return undefined;
  }

  const explicitDuration =
    durationText.length === 0 || durationText === "."
      ? undefined
      : parseExplicitFieldEffectDuration({ text: durationText });
  if (durationText.length > 0 && durationText !== ".") {
    if (explicitDuration === undefined || explicitDuration.rest.length > 0) {
      return undefined;
    }
  }
  const duration =
    explicitDuration?.duration ?? continuousDuration(context.condition);
  const durationEvidence = explicitDuration?.evidence ?? [
    continuousDurationEvidence(context.condition),
  ];

  const parsedSubjects = subjects as BasePowerTargetSubject[];
  const effects = parsedSubjects.map((subject) =>
    setBasePowerEffect(subject.target, value, duration),
  );
  const singleEffect = effects[0];
  if (singleEffect === undefined) {
    return undefined;
  }
  const effect: Effect =
    effects.length === 1
      ? singleEffect
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
      "instruction:setBasePower",
      ...parsedSubjects.flatMap((subject) => subject.evidence),
      "value:basePower:positiveInteger",
      ...durationEvidence,
    ],
    rest: "",
  };
};

const parseBasePowerBecomeSnapshotInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^(?<targets>.+?) becomes? the same as your opponent's Leader's power(?<durationText>.*)$/i.exec(
      input.text,
    );
  const targetsText = match?.groups?.["targets"];
  const durationText = match?.groups?.["durationText"]?.trim() ?? "";
  if (targetsText === undefined) {
    return undefined;
  }

  const subjects = targetsText
    .split(/\s+and\s+/i)
    .map((subject) => parseBasePowerSubject(subject));
  if (
    subjects.length === 0 ||
    subjects.some((subject) => subject === undefined)
  ) {
    return undefined;
  }

  const explicitDuration =
    durationText.length === 0 || durationText === "."
      ? undefined
      : parseExplicitFieldEffectDuration({ text: durationText });
  if (durationText.length > 0 && durationText !== ".") {
    if (explicitDuration === undefined || explicitDuration.rest.length > 0) {
      return undefined;
    }
  }
  const duration =
    explicitDuration?.duration ?? continuousDuration(context.condition);
  const durationEvidence = explicitDuration?.evidence ?? [
    continuousDurationEvidence(context.condition),
  ];

  const value = {
    type: "snapshotCardStat" as const,
    target: { type: "opponentLeader" as const },
    stat: "currentPower" as const,
  };
  const parsedSubjects = subjects as BasePowerTargetSubject[];
  const effects = parsedSubjects.map((subject) =>
    setBasePowerEffect(subject.target, value, duration),
  );
  const singleEffect = effects[0];
  if (singleEffect === undefined) {
    return undefined;
  }

  return {
    effect:
      effects.length === 1
        ? singleEffect
        : {
            type: "sequence",
            effects: effects.map((sequenceEffect) => ({
              connector: "always" as const,
              effect: sequenceEffect,
            })),
          },
    evidence: [
      "instruction:setBasePower",
      ...parsedSubjects.flatMap((subject) => subject.evidence),
      "value:basePower:snapshotCurrentPower",
      "target:opponentLeader",
      ...durationEvidence,
    ],
    rest: "",
  };
};

export const parseSetBasePowerInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^set the base power of (?<target>.+) to (?<value>[1-9]\d*)\.?$/i.exec(
      input.text,
    );
  const targetText = match?.groups?.["target"];
  const valueText = match?.groups?.["value"];
  if (targetText === undefined || valueText === undefined) {
    return undefined;
  }

  const target = parseAllFieldTarget({ text: targetText });
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "setBasePower",
      target: target.target,
      value: Number.parseInt(valueText, 10),
      duration: continuousDuration(context.condition),
    },
    evidence: [
      "instruction:setBasePower",
      ...target.evidence,
      "value:basePower:positiveInteger",
      "duration:whileConditionTrue",
    ],
    rest: "",
  };
};
