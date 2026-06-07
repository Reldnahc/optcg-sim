import type { InstructionParser } from "../../types.js";
import { parseNegativePowerInstruction } from "./negative.js";
import { parsePowerGainInstruction } from "./positive.js";
import { modifyPowerInstructionPrimitive } from "./shared.js";

export { modifyPowerInstructionPrimitive };

export const parseModifyPowerInstruction: InstructionParser = (input) =>
  parsePowerGainInstruction(input) ?? parseNegativePowerInstruction(input);
