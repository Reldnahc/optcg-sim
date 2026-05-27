import { describe, expect, it } from "vitest";

import { parseAndConnector } from "../connectors/index.js";
import { parseSupportedEntryPoint } from "../entry-points/index.js";
import { parseExpression } from "../expression-parser.js";
import { parseOncePerTurnMarker } from "../markers/index.js";
import { parseEffectLine } from "../orchestrator.js";
import { syntheticInstructionSegmentParser } from "../segments/index.js";
import { drawPrimitive, parseDrawInstruction } from "./draw.js";
import {
  parseTrashFromHandInstruction,
  trashFromHandPrimitive,
} from "./trash-from-hand.js";

const drawTrashInstructions = [
  parseDrawInstruction,
  parseTrashFromHandInstruction,
] as const;

describe("draw and trash-from-hand instruction parsers", () => {
  it("defines draw and trash as primitive parents with match families", () => {
    expect(drawPrimitive).toMatchObject({
      primitiveId: "instruction:draw",
      matches: [
        {
          id: "draw-n-cards",
        },
      ],
    });
    expect(trashFromHandPrimitive).toMatchObject({
      primitiveId: "instruction:trashFromHand",
      matches: [
        {
          id: "trash-n-cards-from-your-hand",
        },
        {
          id: "opponent-trashes-n-cards-from-their-hand",
        },
      ],
    });
  });

  it.each([
    {
      text: "Draw 1 card.",
      count: 1,
    },
    {
      text: "Draw 2 cards.",
      count: 2,
    },
    {
      text: "Draw 2 cards",
      count: 2,
    },
  ])("parses $text", ({ text, count }) => {
    expect(parseDrawInstruction({ text })).toEqual({
      effect: { type: "draw", count, player: "self" },
      evidence: ["instruction:draw", "count:positiveInteger", "player:self"],
      rest: "",
    });
  });

  it.each(["Draw 0 cards.", "Draw cards.", "Draw 1 card from your deck."])(
    "rejects unsupported draw wording: %s",
    (text) => {
      expect(parseDrawInstruction({ text })).toBeUndefined();
    },
  );

  it.each([
    {
      text: "Trash 1 card from your hand.",
      count: 1,
    },
    {
      text: "trash 2 cards from your hand",
      count: 2,
    },
  ])("parses $text", ({ text, count }) => {
    expect(parseTrashFromHandInstruction({ text })).toEqual({
      effect: {
        type: "trashFromHand",
        count,
        player: "self",
        chooser: "self",
      },
      evidence: [
        "instruction:trashFromHand",
        "count:positiveInteger",
        "player:self",
        "chooser:self",
      ],
      rest: "",
    });
  });

  it.each([
    "Trash 0 cards from your hand.",
    "Trash 1 card from your deck.",
    "Trash cards from your hand.",
  ])("rejects unsupported trash-from-hand wording: %s", (text) => {
    expect(parseTrashFromHandInstruction({ text })).toBeUndefined();
  });

  it("composes draw and trash through the and connector", () => {
    expect(
      parseExpression("Draw 2 cards and trash 1 card from your hand.", {
        connectors: [parseAndConnector],
        segments: [syntheticInstructionSegmentParser(drawTrashInstructions)],
      }),
    ).toEqual({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "draw", count: 2, player: "self" },
          },
          {
            connector: "then",
            effect: {
              type: "trashFromHand",
              count: 1,
              player: "self",
              chooser: "self",
            },
          },
        ],
      },
      evidence: [
        "expression:sequence",
        "instruction:draw",
        "count:positiveInteger",
        "player:self",
        "connector:andOrdered",
        "instruction:trashFromHand",
        "count:positiveInteger",
        "player:self",
        "chooser:self",
      ],
      rest: "",
    });
  });

  it("integrates through entry point and marker orchestration", () => {
    const result = parseEffectLine(
      "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
      {
        entryPoints: [parseSupportedEntryPoint],
        markers: [parseOncePerTurnMarker],
        expressions: [
          (input) =>
            parseExpression(input.text, {
              connectors: [parseAndConnector],
              segments: [
                syntheticInstructionSegmentParser(drawTrashInstructions),
              ],
            }),
        ],
      },
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 2, player: "self" },
            },
            {
              connector: "then",
              effect: {
                type: "trashFromHand",
                count: 1,
                player: "self",
                chooser: "self",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("entry:whenAttacking");
    expect(result?.evidence).toContain("marker:oncePerTurn");
    expect(result?.evidence).toContain("connector:andOrdered");
    expect(result?.evidence).toContain("instruction:draw");
    expect(result?.evidence).toContain("instruction:trashFromHand");
  });
});
