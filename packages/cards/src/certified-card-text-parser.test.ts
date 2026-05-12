import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, EffectId } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";

const cardId = "CARD-008B-001" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

const parse = (sourceText: string) =>
  parseCertifiedCardText({
    cardId,
    effectDefinitionsVersion: "generated-support-parser-test",
    rulesVersion: "rules-test",
    sourceText,
    sourceTextHash: "sha256:source",
  });

describe("certified card text parser", () => {
  it("parses the exact On Play draw template to generated DSL", () => {
    const result = parse("[On Play] Draw 1 card.");

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual(["exact:on-play:draw-1:self"]);
    expect(result.effectDefinition).toMatchObject({
      cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          category: "auto",
          effect: { count: 1, player: "self", type: "draw" },
          id: toEffectId("CARD-008B-001:auto-on-play-draw-1"),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
      ],
      metadata: {
        effectDefinitionsVersion: "generated-support-parser-test",
        generatedBy: "rule-parser",
        rulesVersion: "rules-test",
        sourceTextHash: "sha256:source",
        tested: true,
      },
    } satisfies Partial<EffectDefinition>);
  });

  it("fails closed on near-miss wording", () => {
    const result = parse("[On Play] Draw one card.");

    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: 24,
            start: 0,
            text: "[On Play] Draw one card.",
          },
        },
      ],
      status: "partial",
      unparsedSpans: [
        {
          end: 24,
          start: 0,
          text: "[On Play] Draw one card.",
        },
      ],
    });
  });

  it("fails closed on standalone When Attacking because only the reviewed composition path is certified", () => {
    const text = "[When Attacking] Draw 1 card.";
    const result = parse(text);

    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: text.length,
            start: 0,
            text,
          },
        },
      ],
      status: "partial",
    });
  });

  it("records unparsed residue when an exact supported clause has unsupported leftover text", () => {
    const result = parse("[On Play] Draw 1 card. Then rest 1 DON!!.");

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
          span: {
            end: 41,
            start: 23,
            text: "Then rest 1 DON!!.",
          },
        },
      ],
      parsedRuleIds: ["exact:on-play:draw-1:self"],
      unparsedSpans: [
        {
          end: 41,
          start: 23,
          text: "Then rest 1 DON!!.",
        },
      ],
    });
  });

  it("composes the exact line-separated On Play and When Attacking templates into two EffectBlocks", () => {
    const result = parse(
      "[On Play] Draw 1 card.\n[When Attacking] Draw 1 card.",
    );

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual([
      "exact:on-play:draw-1:self",
      "exact:when-attacking:draw-1:self",
      "line-separated-effect-blocks:v1",
    ]);
    expect(result.effectDefinition.effects).toEqual([
      {
        category: "auto",
        effect: { count: 1, player: "self", type: "draw" },
        id: toEffectId("CARD-008B-001:auto-on-play-draw-1"),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
      {
        category: "auto",
        effect: { count: 1, player: "self", type: "draw" },
        id: toEffectId("CARD-008B-001:auto-when-attacking-draw-1"),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "whenAttacking" },
      },
    ]);
  });

  it.each([
    {
      name: "reversed",
      text: "[When Attacking] Draw 1 card.\n[On Play] Draw 1 card.",
    },
    {
      name: "duplicate",
      text: "[On Play] Draw 1 card.\n[On Play] Draw 1 card.",
    },
    {
      name: "extra line",
      text: "[On Play] Draw 1 card.\n[When Attacking] Draw 1 card.\n[On Play] Draw 1 card.",
    },
  ])("fails closed on non-certified $name composition", ({ text }) => {
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(isCompleteGeneratedSupportParseResult(result)).toBe(false);
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: text.length,
            start: 0,
            text,
          },
        },
      ],
      parsedRuleIds: [],
      unparsedSpans: [
        {
          end: text.length,
          start: 0,
          text,
        },
      ],
    });
  });
});
