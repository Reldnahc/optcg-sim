import type { Cardinality, Condition, Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseAllFieldTarget } from "../../targets/index.js";
import {
  parseOpponentCharactersTarget,
  parseYourLeaderOrCharacterCardsTarget,
} from "../../targets/index.js";
import type { PrimitiveEvidence } from "../../types.js";
import { effectSequence } from "../effect-builders.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  parseFieldEffectDuration,
  type ContinuousInstructionParser,
} from "./shared.js";

export const setBasePowerPrimitive = {
  primitiveId: "instruction:setBasePower",
  childPrimitiveIds: [
    "cardinality:all",
    "cardinality:upTo",
    "filter:type",
    "filter:category:character",
    "value:basePower:positiveInteger",
    "value:basePower:nonNegativeInteger",
    "value:basePower:snapshotBasePower",
    "duration:whileConditionTrue",
  ],
} as const;

type BasePowerTargetSubject = {
  readonly target: Target;
  readonly condition?: Condition;
  readonly evidence: readonly PrimitiveEvidence[];
};

type BasePowerSnapshotSource = {
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

  const typedLeaderMatch =
    /^your \{(?<type>[^}]+)\} type Leader(?:'s base power)?$/iu.exec(
      normalizedText,
    );
  const leaderType = typedLeaderMatch?.groups?.["type"]?.trim();
  if (leaderType !== undefined && leaderType.length > 0) {
    return {
      target: { type: "myLeader" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], typesAny: [leaderType] },
      },
      evidence: [
        "target:yourLeader",
        "condition:leaderIdentity",
        "filter:type",
        "filter:category:leader",
      ],
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

  const cardinality = parseUpToCardinality({ text: normalizedText });
  if (cardinality !== undefined) {
    const targetText = cardinality.rest
      .replace(/(?:'s|') base power$/iu, "")
      .trim();
    const parsedSelfTarget = parseYourLeaderOrCharacterCardsTarget({
      text: targetText,
    });
    if (
      parsedSelfTarget?.target !== undefined &&
      parsedSelfTarget.rest.length === 0
    ) {
      return {
        target: applyCardinality(
          parsedSelfTarget.target,
          cardinality.cardinality,
        ),
        evidence: [...cardinality.evidence, ...parsedSelfTarget.evidence],
      };
    }
    const opponentTarget = parseOpponentCharactersTarget({ text: targetText });
    if (opponentTarget !== undefined && opponentTarget.rest.length === 0) {
      return {
        target: {
          type: "choose",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zone: "characterArea",
            min: cardinality.cardinality.min,
            max: cardinality.cardinality.max,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: opponentTarget.filter ?? { categories: ["character"] },
          },
        },
        evidence: [...cardinality.evidence, ...opponentTarget.evidence],
      };
    }
  }

  return undefined;
};

const parseBasePowerSnapshotSource = (
  text: string,
): BasePowerSnapshotSource | undefined => {
  const normalizedText = text.trim();
  if (
    /^(?:the power of )?your opponent's attacking Leader or Character(?:'s (?:base )?power)?$/i.test(
      normalizedText,
    )
  ) {
    return {
      target: { type: "attacker" },
      evidence: ["target:attacker"],
    };
  }

  if (/^your Leader(?:'s (?:base )?power)?$/i.test(normalizedText)) {
    return {
      target: { type: "myLeader" },
      evidence: ["target:yourLeader"],
    };
  }

  if (/^your opponent's Leader(?:'s (?:base )?power)?$/i.test(normalizedText)) {
    return {
      target: { type: "opponentLeader" },
      evidence: ["target:opponentLeader"],
    };
  }

  return undefined;
};

function applyCardinality(target: Target, cardinality: Cardinality): Target {
  if (target.type === "chooseFromZones") {
    return {
      ...target,
      request: {
        ...target.request,
        min: cardinality.min,
        max: cardinality.max,
      },
    };
  }
  if (target.type === "choose") {
    return {
      ...target,
      request: {
        ...target.request,
        min: cardinality.min,
        max: cardinality.max,
      },
    };
  }
  return target;
}

function combineConditions(
  ...conditions: readonly (Condition | undefined)[]
): Condition | undefined {
  const present = conditions.filter(
    (condition): condition is Condition => condition !== undefined,
  );
  if (present.length === 0) {
    return undefined;
  }
  if (present.length === 1) {
    return present[0];
  }
  return { type: "and", conditions: present };
}

function continuousDurationEvidenceForSubject(
  subject: BasePowerTargetSubject,
  contextCondition: Condition | undefined,
): readonly PrimitiveEvidence[] {
  const combinedCondition = combineConditions(
    contextCondition,
    subject.condition,
  );
  return [
    continuousDurationEvidence(combinedCondition),
    ...(contextCondition !== undefined && subject.condition !== undefined
      ? (["composition:conditionAnd"] as const)
      : []),
  ];
}

function uniqueEvidence(
  evidence: readonly PrimitiveEvidence[],
): readonly PrimitiveEvidence[] {
  return [...new Set(evidence)];
}

function basePowerEffectForSubject(
  subject: BasePowerTargetSubject,
  contextCondition: Condition | undefined,
  value: Extract<Effect, { type: "setBasePower" }>["value"],
  explicitDuration:
    | Extract<Effect, { type: "setBasePower" }>["duration"]
    | undefined,
): Effect {
  const condition = combineConditions(contextCondition, subject.condition);
  const effect = setBasePowerEffect(
    subject.target,
    value,
    explicitDuration ?? continuousDuration(condition),
  );
  if (explicitDuration === undefined || condition === undefined) {
    return effect;
  }
  return {
    type: "conditional",
    if: condition,
    then: effect,
  };
}

function basePowerDurationEvidenceForSubject(
  subject: BasePowerTargetSubject,
  contextCondition: Condition | undefined,
  explicitDurationEvidence: readonly PrimitiveEvidence[] | undefined,
): readonly PrimitiveEvidence[] {
  if (explicitDurationEvidence !== undefined) {
    return [
      ...explicitDurationEvidence,
      ...(contextCondition !== undefined && subject.condition !== undefined
        ? (["composition:conditionAnd"] as const)
        : []),
    ];
  }
  return continuousDurationEvidenceForSubject(subject, contextCondition);
}

export const parseBasePowerBecomeInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const snapshot = parseBasePowerBecomeSnapshotInstruction(input, context);
  if (snapshot !== undefined) {
    return snapshot;
  }

  const match =
    /^(?<targets>.+?) becomes? (?<value>[0-9]\d*)(?<durationText>.*)$/i.exec(
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
      : parseFieldEffectDuration({ text: durationText });
  if (durationText.length > 0 && durationText !== ".") {
    if (explicitDuration === undefined || explicitDuration.rest.length > 0) {
      return undefined;
    }
  }
  const parsedSubjects = subjects as BasePowerTargetSubject[];
  const effects = parsedSubjects.map((subject) =>
    basePowerEffectForSubject(
      subject,
      context.condition,
      value,
      explicitDuration?.duration,
    ),
  );
  const effect = effectSequence(effects);
  if (effect === undefined) {
    return undefined;
  }

  return {
    effect,
    evidence: [
      "instruction:setBasePower",
      ...parsedSubjects.flatMap((subject) => subject.evidence),
      value === 0
        ? "value:basePower:nonNegativeInteger"
        : "value:basePower:positiveInteger",
      ...uniqueEvidence(
        parsedSubjects.flatMap((subject) =>
          basePowerDurationEvidenceForSubject(
            subject,
            context.condition,
            explicitDuration?.evidence,
          ),
        ),
      ),
    ],
    rest: "",
  };
};

const parseBasePowerBecomeSnapshotInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^(?<targets>.+?) becomes? the same as (?<source>.+?)(?<durationText>(?:\s+during\b.*|\s+until\b.*|\.)?)$/i.exec(
      input.text,
    );
  const targetsText = match?.groups?.["targets"];
  const sourceText = match?.groups?.["source"];
  const durationText = match?.groups?.["durationText"]?.trim() ?? "";
  if (targetsText === undefined || sourceText === undefined) {
    return undefined;
  }

  const source = parseBasePowerSnapshotSource(sourceText);
  if (source === undefined) {
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
      : parseFieldEffectDuration({ text: durationText });
  if (durationText.length > 0 && durationText !== ".") {
    if (explicitDuration === undefined || explicitDuration.rest.length > 0) {
      return undefined;
    }
  }
  const value = {
    type: "snapshotCardStat" as const,
    target: source.target,
    stat: "basePower" as const,
  };
  const parsedSubjects = subjects as BasePowerTargetSubject[];
  const effects = parsedSubjects.map((subject) =>
    basePowerEffectForSubject(
      subject,
      context.condition,
      value,
      explicitDuration?.duration,
    ),
  );
  const effect = effectSequence(effects);
  if (effect === undefined) {
    return undefined;
  }

  return {
    effect,
    evidence: [
      "instruction:setBasePower",
      ...parsedSubjects.flatMap((subject) => subject.evidence),
      "value:basePower:snapshotBasePower",
      ...source.evidence,
      ...uniqueEvidence(
        parsedSubjects.flatMap((subject) =>
          basePowerDurationEvidenceForSubject(
            subject,
            context.condition,
            explicitDuration?.evidence,
          ),
        ),
      ),
    ],
    rest: "",
  };
};

export const parseSetBasePowerInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^set the base power of (?<target>.+) to (?<value>[0-9]\d*)\.?$/i.exec(
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
      Number.parseInt(valueText, 10) === 0
        ? "value:basePower:nonNegativeInteger"
        : "value:basePower:positiveInteger",
      "duration:whileConditionTrue",
    ],
    rest: "",
  };
};
