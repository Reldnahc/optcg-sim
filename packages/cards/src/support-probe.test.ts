import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";
import {
  createSupportProbeReport,
  findPoneglyphFixtureByCardId,
} from "./support-probe-report.js";

describe("text-only support probe parser backend", () => {
  it("parses text without requiring card IDs or fixtures", () => {
    expect(parseCardEffectLine("[On Play] Draw 1 card.")).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: { type: "draw", count: 1, player: "self" },
      },
    });
  });

  it("reports engine runtime support for parsed reusable primitives", () => {
    const report = createSupportProbeReport({
      text: "[On Play] Trash 1 card from your hand.",
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: passed");
  });

  it("reports parser success separately from unsupported engine runtime entry points", () => {
    const report = createSupportProbeReport({
      text: "[On Block] Draw 1 card.",
    });

    expect(report.exitCode).toBe(1);
    expect(report.lines).toContain("Parse: passed");
    expect(report.lines).toContain("Engine runtime: failed");
    expect(report.lines).toContain(
      "Engine runtime reason: unsupported trigger/category/source-presence envelope",
    );
  });

  it("loads Poneglyph card fixtures by card id for card probe mode", () => {
    const fixture = findPoneglyphFixtureByCardId("OP10-045");

    expect(fixture?.cardId).toBe("OP10-045");
    expect(fixture?.effect).toBe(
      "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
    );
  });

  it("reports engine runtime support for every parsed card effect line", () => {
    const report = createSupportProbeReport({ cardId: "OP10-045" });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Card ID: OP10-045");
    expect(report.lines).toContain("Line 1 parse: passed");
    expect(report.lines).toContain("Line 1 engine runtime: passed");
  });
});
