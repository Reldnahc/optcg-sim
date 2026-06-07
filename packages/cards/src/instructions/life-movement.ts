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
          /^add up to (?<count>[1-9]\d*) cards? from the top of your deck to the top of your Life cards(?<faceUp> face-up)?\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            min: 0,
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "self", zone: "deck", position: "top" },
            to: { player: "self", zone: "life", position: "top" },
            order: "original",
            ...(groups["faceUp"] === undefined
              ? {}
              : { destinationFaceUp: true }),
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
        id: "add-up-to-n-cards-from-opponent-life-top-to-owner-hand",
        pattern:
          /^add up to (?<count>[1-9]\d*) cards? from the top of your opponent's Life cards to the owner's hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            min: 0,
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "opponent", zone: "life", position: "top" },
            to: { player: "owner", zone: "hand" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "cardinality:upTo",
            "count:positiveInteger",
            "player:opponent",
            "zone:life",
            "position:top",
            "destination:ownerHand",
            "order:original",
          ],
          rest: "",
        }),
      },
      {
        id: "opponent-adds-n-cards-from-life-top-to-hand",
        pattern:
          /^your opponent adds (?<count>[1-9]\d*) cards? from the top of their Life cards to their hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "moveCards",
            count: Number.parseInt(groups["count"] ?? "", 10),
            from: { player: "opponent", zone: "life", position: "top" },
            to: { player: "opponent", zone: "hand" },
            order: "original",
          },
          evidence: [
            "instruction:moveCards",
            "count:positiveInteger",
            "player:opponent",
            "zone:life",
            "position:top",
            "destination:hand",
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
        id: "trash-n-cards-from-top-of-each-players-life",
        pattern:
          /^trash (?<count>[1-9]\d*) cards? from the top of each of your and your opponent's Life cards\.?$/i,
        build: (groups) => {
          const count = Number.parseInt(groups["count"] ?? "", 10);
          return {
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "moveCards",
                    count,
                    from: { player: "self", zone: "life", position: "top" },
                    to: { player: "self", zone: "trash" },
                    order: "original",
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "moveCards",
                    count,
                    from: {
                      player: "opponent",
                      zone: "life",
                      position: "top",
                    },
                    to: { player: "opponent", zone: "trash" },
                    order: "original",
                  },
                },
              ],
            },
            evidence: [
              "instruction:moveCards",
              "expression:sequence",
              "count:positiveInteger",
              "player:self",
              "player:opponent",
              "zone:life",
              "position:top",
              "destination:trash",
              "order:original",
            ],
            rest: "",
          };
        },
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
