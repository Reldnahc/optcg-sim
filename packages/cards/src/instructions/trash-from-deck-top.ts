import type { SelectionId } from "@optcg/types";

import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";

export const handTrashSelectionForSameNumberDeckTrash =
  "selected:trash-from-hand" as SelectionId;

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
      {
        id: "trash-same-number-from-top-of-your-deck-as-hand-trash",
        pattern:
          /^trash the same number of cards? from the top of your deck as you did from your hand\.?$/i,
        build: () => ({
          effect: {
            type: "moveCards",
            count: {
              type: "selectedCardCount",
              selection: handTrashSelectionForSameNumberDeckTrash,
              multiplier: 1,
            },
            from: { player: "self", zone: "deck", position: "top" },
            to: { player: "self", zone: "trash" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "count:selectedCardCount",
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
