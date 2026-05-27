import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";

export const trashFromDeckTopPrimitive: PrimitivePatternDefinition<InstructionParseResult> =
  {
    primitiveId: "instruction:moveCards",
    matches: [
      {
        id: "trash-n-cards-from-top-of-your-deck",
        pattern:
          /^trash (?<count>[1-9]\d*) cards? from the top of your deck\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "self", zone: "deck", position: "top" },
            to: { player: "self", zone: "trash" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "count:positiveInteger",
            "player:self",
            "zone:deck",
            "position:top",
            "destination:trash",
            "order:original",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseTrashFromDeckTopInstruction: InstructionParser = (input) =>
  parsePrimitivePattern(input, trashFromDeckTopPrimitive);
