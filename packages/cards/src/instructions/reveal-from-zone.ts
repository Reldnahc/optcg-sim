import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";

export const revealFromZonePrimitive: PrimitivePatternDefinition<InstructionParseResult> =
  {
    primitiveId: "instruction:revealFromZone",
    matches: [
      {
        id: "opponent-reveals-their-hand",
        pattern: /^your opponent reveals their hand\.?$/i,
        build: () => ({
          effect: {
            type: "revealFromZone",
            player: "opponent",
            zone: "hand",
            to: "bothPlayers",
          },
          evidence: [
            "instruction:revealFromZone",
            "player:opponent",
            "zone:hand",
            "reveal:bothPlayers",
          ],
          rest: "",
        }),
      },
      {
        id: "pronoun-reveals-their-hand",
        pattern: /^reveals their hand\.?$/i,
        build: () => ({
          effect: {
            type: "revealFromZone",
            player: "opponent",
            zone: "hand",
            to: "bothPlayers",
          },
          evidence: [
            "instruction:revealFromZone",
            "player:opponent",
            "zone:hand",
            "reveal:bothPlayers",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseRevealFromZoneInstruction: InstructionParser = (input) =>
  parsePrimitivePattern(input, revealFromZonePrimitive);
