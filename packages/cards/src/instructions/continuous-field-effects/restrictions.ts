import {
  continuousDuration,
  continuousDurationEvidence,
  type ContinuousInstructionParser,
} from "./shared.js";

export const selfCannotAttackPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "target:thisCard",
    "target:thisCharacter",
    "duration:whileSourceOnField",
    "duration:whileConditionTrue",
  ],
} as const;

export const parseSelfCannotAttackInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match = /^This (?<subject>Leader|Character) cannot attack\.?$/i.exec(
    input.text,
  );
  const subject = match?.groups?.["subject"]?.toLowerCase();
  if (subject !== "leader" && subject !== "character") {
    return undefined;
  }

  return {
    effect: {
      type: "cannotAttack",
      target: { type: "self" },
      duration: continuousDuration(context.condition),
    },
    evidence: [
      "instruction:preventActivation",
      subject === "character" ? "target:thisCharacter" : "target:thisCard",
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};
