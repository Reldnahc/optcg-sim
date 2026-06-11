import type { InstructionParser } from "../types.js";

export const parsePlaySourceInstruction: InstructionParser = (input) => {
  const match =
    /^Play this (?:(?:Character )?card)(?: from your trash)?(?<rested> rested)?\.?$/i.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }
  const enterRested = match.groups?.["rested"] !== undefined;

  return {
    effect: {
      type: "playSource",
      source: { type: "triggerCard" },
      ignoreCost: true,
      ...(enterRested ? { enterRested: true } : {}),
    },
    evidence: [
      "instruction:playSource",
      "target:triggerCard",
      ...(enterRested ? (["state:rested"] as const) : []),
    ],
    rest: "",
  };
};
