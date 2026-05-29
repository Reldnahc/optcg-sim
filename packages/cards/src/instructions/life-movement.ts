import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";

export const lifeMovementPrimitive: PrimitivePatternDefinition<InstructionParseResult> =
  {
    primitiveId: "instruction:moveCards",
    matches: [
      {
        id: "add-up-to-n-cards-from-deck-top-to-life-top",
        pattern:
          /^add up to (?<count>[1-9]\d*) cards? from the top of your deck to the top of your Life cards\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            min: 0,
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "self", zone: "deck", position: "top" },
            to: { player: "self", zone: "life", position: "top" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "cardinality:upTo",
            "count:positiveInteger",
            "player:self",
            "zone:deck",
            "position:top",
            "destination:life",
            "order:original",
          ],
          rest: "",
        }),
      },
      {
        id: "trash-n-cards-from-top-of-life",
        pattern:
          /^trash (?<count>[1-9]\d*) cards? from the top of your Life cards\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "self", zone: "life", position: "top" },
            to: { player: "self", zone: "trash" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "count:positiveInteger",
            "player:self",
            "zone:life",
            "position:top",
            "destination:trash",
            "order:original",
          ],
          rest: "",
        }),
      },
      {
        id: "add-n-cards-from-life-top-to-hand",
        pattern:
          /^add (?<count>[1-9]\d*) cards? from the top of your Life cards to your hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "self", zone: "life", position: "top" },
            to: { player: "self", zone: "hand" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "count:positiveInteger",
            "player:self",
            "zone:life",
            "position:top",
            "destination:hand",
            "order:original",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseLifeMovementInstruction: InstructionParser = (input) =>
  parsePrimitivePattern(input, lifeMovementPrimitive);
