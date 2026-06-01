import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";
import { createSupportProbeReport } from "./support-probe-report.js";

describe("text-only support probe parser backend", () => {
  it("parses text without requiring card IDs or fixtures", () => {
    expect(parseCardEffectLine("[On Play] Draw 1 card.")).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: { type: "draw", count: 1, player: "self" },
      },
    });
  });

  it("reports engine runtime support for parsed reusable primitives", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] Trash 1 card from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for deck-top trash movement", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] Trash 1 card from the top of your deck.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for trigger DON deck movement", async () => {
    const report = await createSupportProbeReport({
      text: "[Trigger] Add up to 1 DON!! card from your DON!! deck and set it as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for opponent-turn named-card base power", async () => {
    const report = await createSupportProbeReport({
      text: "[Opponent's Turn] All of your [Ohm] cards' base power and this Character's base power become 6000.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for relative DON-count self hand cost reduction", async () => {
    const report = await createSupportProbeReport({
      text: "If the number of DON!! cards on your field is at least 2 less than the number on your opponent's field, give this card in your hand −3 cost.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for named-card plus self keyword grants", async () => {
    const report = await createSupportProbeReport({
      text: "All of your [Ohm] cards and this Character gain [Double Attack].",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for filtered trash-count power and cost gains", async () => {
    const report = await createSupportProbeReport({
      text: "If you have 4 or more Events in your trash, this Character gains +2000 power and +5 cost.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for DON return, filtered trash-to-hand, and DON activation sequence", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] DON!! \u22121 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Add up to 1 purple Event with a cost of 5 or less from your trash to your hand. Then, set up to 1 of your DON!! cards as active.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for DON return into conditional opponent hand trash", async () => {
    const report = await createSupportProbeReport({
      text: "[On Play] DON!! \u22121 (You may return the specified number of DON!! cards from your field to your DON!! deck.): If your opponent has 7 or more cards in their hand, trash 2 cards from your opponent's hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for optional field-removal replacement effects", async () => {
    const report = await createSupportProbeReport({
      text: "If your {Sky Island} type Character with 6000 base power or more would be removed from the field by your opponent, you may add 1 card from the top of your Life cards to your hand instead.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports engine runtime support for opponent-attack optional rest-DON target-rest effects", async () => {
    const report = await createSupportProbeReport({
      text: "[On Your Opponent's Attack] [Once Per Turn] You may rest 1 of your DON!! cards: Rest up to 1 of your opponent's Leader or Character cards.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports raw keyword reminder lines as metadata-supported", async () => {
    const report = await createSupportProbeReport({
      text: "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Kind: raw keyword");
    expect(report.lines).toContain("Keyword: blocker");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("ignores fully parenthesized reminder lines from fetched card text", async () => {
    const report = await createSupportProbeReport({
      cardId: "OP01-001",
      fetchCard: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                card_number: "OP01-001",
                effect: [
                  "If you have 6 or less DON!! cards on your field, this Character gains [Rush].",
                  "(This card can attack on the turn in which it is played.)",
                  "[On Play] DON!! \u22121: Draw 1 card.",
                ].join("\n"),
              },
            }),
        }),
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Line 1 parse: passed");
    expect(report.lines).toContain("Line 2 parse: passed");
    expect(report.lines).not.toContain(
      "Line 2 text: (This card can attack on the turn in which it is played.)",
    );
    expect(report.lines).toContain(
      "Line 2 text: [On Play] DON!! \u22121: Draw 1 card.",
    );
  });

  it("reports parser success separately from unsupported engine runtime entry points", async () => {
    const report = await createSupportProbeReport({
      text: "[On Block] Draw 1 card.",
    });

    expect(report.exitCode).toBe(1);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: failed");
    expect(report.lines).toContain(
      "Engine runtime reason: unsupported trigger/category/source-presence envelope",
    );
  });

  it("fetches card probe text from Poneglyph API instead of local fixtures", async () => {
    const requestedUrls: string[] = [];
    const report = await createSupportProbeReport({
      cardId: "OP10-045",
      fetchCard: (url) => {
        requestedUrls.push(url);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                card_number: "OP10-045",
                effect:
                  "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
              },
            }),
        });
      },
    });

    expect(report.exitCode).toBe(0);
    expect(requestedUrls).toEqual([
      "https://api.poneglyph.one/v1/cards/OP10-045",
    ]);
    expect(report.lines).toContain("Card ID: OP10-045");
    expect(report.lines).toContain("Line 1 parse: passed");
    expect(report.lines).toContain("Line 1 engine runtime: passed");
  });

  it("reports Poneglyph API fetch failures in card probe mode", async () => {
    const report = await createSupportProbeReport({
      cardId: "OP10-999",
      fetchCard: () =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        }),
    });

    expect(report).toEqual({
      exitCode: 1,
      lines: [],
      errors: ["Poneglyph card fetch failed for OP10-999: HTTP 404"],
    });
  });
});
