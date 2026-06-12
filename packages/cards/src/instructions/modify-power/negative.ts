import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
} from "../../durations/index.js";
import { parseNegativePowerModifier } from "../../modifiers/index.js";
import {
  opponentNegativePowerTargetParsers,
  parseAllFieldTarget,
  parseTargetFromSet,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { parseAttachedDonScaledDuration, withCardinality } from "./shared.js";

export const parseNegativePowerInstruction: InstructionParser = (input) => {
  const actionRest = /^give\s+(?<rest>.*)$/i.exec(input.text)?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const modifierFirst = parseModifierFirstNegativePowerInstruction(actionRest);
  if (modifierFirst !== undefined) {
    return modifierFirst;
  }

  const allTarget = parseAllFieldTarget({ text: actionRest });
  if (allTarget !== undefined) {
    const modifier = parseNegativePowerModifier({ text: allTarget.rest });
    if (modifier === undefined) {
      return undefined;
    }

    const dynamicDuration = parseAttachedDonScaledDuration(
      modifier.value,
      modifier.rest,
    );
    const duration =
      dynamicDuration ??
      parseDurationFromSet({ text: modifier.rest }, fieldEffectDurationParsers);
    if (duration === undefined || duration.duration === undefined) {
      return undefined;
    }

    return {
      effect: {
        type: "modifyPower",
        target: allTarget.target,
        value: dynamicDuration?.value ?? modifier.value,
        duration: duration.duration,
      },
      evidence: [
        "instruction:modifyPower",
        ...allTarget.evidence,
        ...modifier.evidence,
        ...duration.evidence,
        ...(dynamicDuration?.evidence ?? []),
      ],
      rest: "",
    };
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseTargetFromSet(
    { text: cardinality.rest },
    opponentNegativePowerTargetParsers(),
  );
  if (target?.target === undefined) {
    return undefined;
  }

  const modifier = parseNegativePowerModifier({ text: target.rest });
  if (modifier === undefined) {
    return undefined;
  }

  const dynamicDuration = parseAttachedDonScaledDuration(
    modifier.value,
    modifier.rest,
  );
  const duration =
    dynamicDuration ??
    parseDurationFromSet({ text: modifier.rest }, fieldEffectDurationParsers);
  if (duration === undefined || duration.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: withCardinality(target.target, cardinality.cardinality),
      value: dynamicDuration?.value ?? modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...modifier.evidence,
      ...duration.evidence,
      ...(dynamicDuration?.evidence ?? []),
    ],
    rest: "",
  };
};

function parseModifierFirstNegativePowerInstruction(
  actionRest: string,
): ReturnType<InstructionParser> {
  const modifier = parseNegativePowerModifier({ text: actionRest });
  if (modifier === undefined) {
    return undefined;
  }
  const match =
    /^(?<duration>[\s\S]+?)\s+to\s+(?<target>up to [1-9]\d*[\s\S]+)$/iu.exec(
      modifier.rest,
    );
  const durationText = match?.groups?.["duration"];
  const targetText = match?.groups?.["target"];
  if (durationText === undefined || targetText === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: durationText },
    fieldEffectDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }
  const cardinality = parseUpToCardinality({ text: targetText });
  if (cardinality === undefined) {
    return undefined;
  }
  const target = parseTargetFromSet(
    { text: cardinality.rest },
    opponentNegativePowerTargetParsers(),
  );
  if (target?.target === undefined) {
    return undefined;
  }
  if (target.rest.length > 0 && target.rest !== ".") {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: withCardinality(target.target, cardinality.cardinality),
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      ...modifier.evidence,
      ...duration.evidence,
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    rest: "",
  };
}
