import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";

export const drawPrimitive: PrimitivePatternDefinition<InstructionParseResult> =
  {
    primitiveId: "instruction:draw",
    matches: [
      {
        id: "draw-n-cards",
        pattern: /^Draw (?<count>[1-9]\d*) cards?\.?$/i,
        build: (groups) => ({
          effect: {
            type: "draw",
            count: Number.parseInt(groups["count"] ?? "", 10),
            player: "self",
          },
          evidence: [
            "instruction:draw",
            "count:positiveInteger",
            "player:self",
          ],
          rest: "",
        }),
      },
      {
        id: "opponent-draws-n-cards",
        pattern: /^your opponent draws (?<count>[1-9]\d*) cards?\.?$/i,
        build: (groups) => ({
          effect: {
            type: "draw",
            count: Number.parseInt(groups["count"] ?? "", 10),
            player: "opponent",
          },
          evidence: [
            "instruction:draw",
            "count:positiveInteger",
            "player:opponent",
          ],
          rest: "",
        }),
      },
      {
        id: "draw-per-trigger-hand-trash",
        pattern: /^Draw cards equal to the number of cards trashed\.?$/i,
        build: () => ({
          effect: {
            type: "draw",
            count: 1,
            player: "self",
          },
          evidence: ["instruction:draw", "player:self"],
          rest: "",
        }),
      },
      {
        id: "draw-until-hand-size",
        pattern:
          /^Draw (?:cards|card\(s\)) so that you have (?<count>[1-9]\d*) cards? in your hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "draw",
            count: {
              type: "countMatchingZoneCards",
              player: "self",
              zone: "hand",
              per: 1,
              multiplier: -1,
              offset: Number.parseInt(groups["count"] ?? "", 10),
              minimum: 0,
            },
            player: "self",
          },
          evidence: [
            "instruction:draw",
            "value:dynamic:matchingZoneCards",
            "valueTransform:offset",
            "valueTransform:minimum",
            "count:positiveInteger",
            "player:self",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseDrawInstruction: InstructionParser = (input) =>
  parsePrimitivePattern(input, drawPrimitive);
