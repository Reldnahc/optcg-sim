import type { Effect } from "@optcg/types";

import type { InstructionParser } from "../types.js";

export const preventDrawInstructionPrimitive = {
  primitiveId: "instruction:preventDraw",
  childPrimitiveIds: ["player:self", "target:player", "duration:thisTurn"],
  parseEvidence: [
    "instruction:preventDraw",
    "player:self",
    "target:player",
    "duration:thisTurn",
  ],
} as const;

export const parsePreventDrawInstruction: InstructionParser = (input) => {
  const match =
    /^you cannot draw cards using your own effects during this turn\.?$/i.exec(
      input.text.trim(),
    );
  if (match === null) {
    return undefined;
  }

  const effect = {
    type: "preventDraw",
    player: "self",
    source: "ownEffects",
    duration: { type: "thisTurn" },
  } satisfies Effect;

  return {
    effect,
    evidence: preventDrawInstructionPrimitive.parseEvidence,
    rest: "",
  };
};
