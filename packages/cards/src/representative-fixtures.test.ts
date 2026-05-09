import { describe, expect, it } from "vitest";

import type { MatchCardManifest } from "@optcg/types";
import {
  computeMatchCardManifestHash,
  representativeMatchCardManifestFixturePath,
} from "./index.js";
import {
  buildRepresentativeMatchCardManifest,
  getRepresentativeFixtureSupportMetadata,
  hasCheckedInRepresentativePoneglyphFixture,
  listRepresentativeFixtureIds,
  loadCheckedInRepresentativePoneglyphFixture,
  loadRepresentativeMatchCardManifestFixture,
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

  it("builds the checked-in representative match card manifest deterministically", async () => {
    const built = await buildRepresentativeMatchCardManifest();
    const checkedIn = await loadRepresentativeMatchCardManifestFixture();

    expect(representativeMatchCardManifestFixturePath).toBe(
      "fixtures/cards/representative-match-card-manifest.json",
    );
    expect(built).toEqual(checkedIn);
    expect(Object.keys(built.cards)).toEqual(["OP01-060", "OP05-091"]);
    expect(built.createdAt).toBe("2026-05-09T00:00:00.000Z");
    expect(built.source).toBe("poneglyph-fixture");
  });

  it("keeps raw Poneglyph payload fields out of the representative manifest cards", async () => {
    const manifest = await loadRepresentativeMatchCardManifestFixture();
    const serializedCards = JSON.stringify(manifest.cards);

    for (const card of Object.values(manifest.cards)) {
      expect("raw" in card).toBe(false);
    }
    expect(serializedCards).not.toContain("card_number");
    expect(serializedCards).not.toContain("available_languages");
    expect(serializedCards).not.toContain("market_price");
  });

  it("pins a stable representative manifest hash", async () => {
    const manifest = await loadRepresentativeMatchCardManifestFixture();

    expect(computeMatchCardManifestHash(manifest)).toBe(manifest.manifestHash);
    expect(manifest.manifestHash).toBe(
      "4a246598c566ce027427293970f8fd0769f97a013cb1adb8401df64d11c87c4b",
    );
  });

  it("keeps unsupported representative gameplay explicitly unsupported", async () => {
    const manifest = await loadRepresentativeMatchCardManifestFixture();

    expect(unsupportedCards(manifest)).toEqual(["OP01-060", "OP05-091"]);
    expect(
      Object.values(manifest.cards).map((card) => card.support.tested),
    ).toEqual([false, false]);
  });
});

function unsupportedCards(manifest: MatchCardManifest): string[] {
  return Object.values(manifest.cards)
    .filter((card) => card.support.status === "unsupported")
    .map((card) => card.cardId)
    .sort();
}
