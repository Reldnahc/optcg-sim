import { describe, expect, it } from "vitest";

import {
  getRepresentativeFixtureSupportMetadata,
  hasCheckedInRepresentativePoneglyphFixture,
  listRepresentativeFixtureIds,
  loadCheckedInRepresentativePoneglyphFixture,
} from "./representative-fixtures.js";

describe("representative fixtures", () => {
  it("exposes the required representative fixture ids", () => {
    expect(listRepresentativeFixtureIds()).toEqual([
      "FX-LEADER-VANILLA",
      "FX-CHAR-VANILLA",
      "FX-BLOCKER",
      "FX-ONPLAY-DRAW",
      "OP01-060",
      "OP05-091",
    ]);
  });

  it("distinguishes checked-in Poneglyph fixtures from unsupported placeholders", () => {
    expect(hasCheckedInRepresentativePoneglyphFixture("OP01-060")).toBe(true);
    expect(hasCheckedInRepresentativePoneglyphFixture("OP05-091")).toBe(true);
    expect(
      hasCheckedInRepresentativePoneglyphFixture("FX-LEADER-VANILLA"),
    ).toBe(false);

    expect(
      getRepresentativeFixtureSupportMetadata("FX-ONPLAY-DRAW").support.status,
    ).toBe("unsupported");
    expect(
      getRepresentativeFixtureSupportMetadata("OP01-060").support.status,
    ).toBe("unsupported");
    expect(
      getRepresentativeFixtureSupportMetadata("OP05-091").support.status,
    ).toBe("unsupported");
  });

  it("loads checked-in OP fixtures without live network calls", async () => {
    const doflamingo =
      await loadCheckedInRepresentativePoneglyphFixture("OP01-060");
    const rebecca =
      await loadCheckedInRepresentativePoneglyphFixture("OP05-091");

    expect(doflamingo.card_number).toBe("OP01-060");
    expect(rebecca.card_number).toBe("OP05-091");
  });

  it("throws when a placeholder fixture has no checked-in Poneglyph payload", async () => {
    await expect(
      loadCheckedInRepresentativePoneglyphFixture("FX-BLOCKER"),
    ).rejects.toThrow(/no checked-in Poneglyph payload/i);
  });
});
