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
