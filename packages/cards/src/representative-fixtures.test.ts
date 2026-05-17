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
  listRepresentativeSupportProofMatrixRows,
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

  it("records the CARD-014H representative support proof matrix", () => {
    const rows = listRepresentativeSupportProofMatrixRows();

    expect(
      rows.map((row) => ({
        candidateId: row.candidateId,
        status: row.status,
      })),
    ).toEqual([
      { candidateId: "op10-045-cavendish", status: "included-real" },
      { candidateId: "reverse-cavendish", status: "synthetic-only" },
      { candidateId: "ulti-style", status: "blocked-missing-layer" },
      {
        candidateId: "impel-down-all-stars-style",
        status: "blocked-missing-layer",
      },
      { candidateId: "rest", status: "blocked-missing-layer" },
      { candidateId: "lock", status: "blocked-missing-layer" },
      { candidateId: "power", status: "blocked-missing-layer" },
    ]);

    const includedReal = rows.find(
      (row) => row.candidateId === "op10-045-cavendish",
    );
    expect(includedReal).toMatchObject({
      cardId: "OP10-045",
      doneStoryPath:
        "stories/done/CARD-009C-op10-045-generated-support-fixture-proof.yaml",
      effectDefinitionId: "op10-045.generated-support",
      expectedBehaviorHash:
        "91be13cae1812281f832a9d4801ab16b17f162937783b27a572ce153dc88f234",
      expectedSourceTextHash:
        "021421b539ccd217aba7f1b12a71c8237e0c0fda28985041d9e91d5df1cd2a28",
      fixturePath: "fixtures/poneglyph/cards/OP10-045.cavendish.json",
      sourceText:
        "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
      status: "included-real",
    });
    expect(includedReal?.missingLayers).toEqual([]);

    const syntheticOnly = rows.find(
      (row) => row.candidateId === "reverse-cavendish",
    );
    expect(syntheticOnly).toMatchObject({
      cardId: undefined,
      realCardPlayableSupport: false,
      sourceText: "[On Play] Trash 2 cards from your hand. Draw 1 card.",
      status: "synthetic-only",
    });

    for (const row of rows.filter(
      (candidate) => candidate.status === "blocked-missing-layer",
    )) {
      expect(row.missingLayers).toEqual(
        expect.arrayContaining([
          "exact-card-id",
          "checked-in-fixture-provenance",
          "behavior-sensitive-printed-fields",
          "source-text-hash",
          "behavior-hash",
          "parser-rule-evidence",
          "runtime-capability-record",
          "support-metadata",
          "manifest-regeneration-plan",
        ]),
      );
      expect(row.existingDiagnosticCodes.length).toBeGreaterThan(0);
      expect(row.realCardPlayableSupport).toBe(false);
    }
  });
});

function unsupportedCards(manifest: MatchCardManifest): string[] {
  return Object.values(manifest.cards)
    .filter((card) => card.support.status === "unsupported")
    .map((card) => card.cardId)
    .sort();
}
