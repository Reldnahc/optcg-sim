import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizePoneglyphCardDetail } from "./normalization.js";
import { realKeywordProofFixtureCorpus } from "./real-card-fixtures.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

async function readJsonFixture(relativePath: string): Promise<unknown> {
  const source = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(source) as unknown;
}

describe("Poneglyph normalization", () => {
  it("normalizes OP01-060 variant indexes into stable variant keys including index 0", async () => {
    const card = normalizePoneglyphCardDetail(
      await readJsonFixture(
        "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
      ),
    );

    expect(card.cardId).toBe("OP01-060");
    expect(card.category).toBe("leader");
    expect(card.colors).toEqual(["blue"]);
    expect(card.attributes).toEqual(["special"]);
    expect(card.variants.map((variant) => variant.variantIndex)).toEqual([
      0, 1, 2,
    ]);
    expect(card.variants.map((variant) => variant.variantKey)).toEqual([
      "OP01-060:v0",
      "OP01-060:v1",
      "OP01-060:v2",
    ]);
  });

  it("normalizes OP05-091 nullable variant fields without throwing", async () => {
    const card = normalizePoneglyphCardDetail(
      await readJsonFixture("fixtures/poneglyph/cards/OP05-091.rebecca.json"),
    );
    const regionalVariant = card.variants.find(
      (variant) => variant.variantIndex === 1,
    );

    expect(card.cardId).toBe("OP05-091");
    expect(card.category).toBe("character");
    expect(card.colors).toEqual(["black"]);
    expect(card.attributes).toEqual(["wisdom"]);
    expect(card.printedKeywords).toEqual(["blocker"]);
    expect(regionalVariant).toMatchObject({
      label: "Alternate Art",
      scanImageDisplay: "https://example.test/op05-091-v1-display.png",
      variantKey: "OP05-091:v1",
      variantIndex: 1,
    });
    expect(regionalVariant).not.toHaveProperty("productId");
    expect(regionalVariant).not.toHaveProperty("productSetCode");
    expect(regionalVariant).not.toHaveProperty("stockImageFull");
  });

  it("changes sourceTextHash when effect or trigger text changes", async () => {
    const fixture = await readJsonFixture(
      "fixtures/poneglyph/cards/OP05-091.rebecca.json",
    );
    const base = normalizePoneglyphCardDetail(fixture);
    const changedEffect = normalizePoneglyphCardDetail({
      ...base.raw,
      effect: `${base.raw.effect ?? ""}\nChanged effect text.`,
    });
    const changedTrigger = normalizePoneglyphCardDetail({
      ...base.raw,
      trigger: "Changed trigger text.",
    });

    expect(changedEffect.sourceTextHash).not.toBe(base.sourceTextHash);
    expect(changedTrigger.sourceTextHash).not.toBe(base.sourceTextHash);
  });

  it("changes behaviorHash when FAQ, errata, stats, type line, effect, or trigger changes", async () => {
    const fixture = await readJsonFixture(
      "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
    );
    const base = normalizePoneglyphCardDetail(fixture);
    const changes = [
      { ...base.raw, power: 6000 },
      { ...base.raw, card_type: "Character" },
      { ...base.raw, types: ["Donquixote Pirates"] },
      { ...base.raw, effect: `${base.raw.effect ?? ""}\nChanged effect.` },
      { ...base.raw, trigger: "Changed trigger." },
      {
        ...base.raw,
        official_faq: [
          {
            answer: "Changed answer.",
            question: "Changed question?",
            updated_on: "2026-05-09",
          },
        ],
      },
      {
        ...base.raw,
        variants: [
          {
            ...base.raw.variants[0],
            errata: [
              {
                after_text: "Changed errata text.",
                before_text: base.raw.effect,
                date: "2026-05-09",
                label: "Errata",
              },
            ],
          },
        ],
      },
    ].map((change) => normalizePoneglyphCardDetail(change));

    for (const changed of changes) {
      expect(changed.behaviorHash).not.toBe(base.behaviorHash);
    }
  });

  it("rejects search-result DTOs as card-detail sources", () => {
    expect(() =>
      normalizePoneglyphCardDetail({
        data: [{ card_number: "OP01-060", name: "Donquixote Doflamingo" }],
        meta: { total: 1 },
      }),
    ).toThrow(/Invalid Poneglyph card detail/);
  });

  it("normalizes CARD-013A keyword proof fixtures into stable keyword and hash evidence", async () => {
    for (const entry of realKeywordProofFixtureCorpus) {
      const fixture = await readJsonFixture(
        `fixtures/poneglyph/cards/${entry.fixtureFileName}`,
      );
      const card = normalizePoneglyphCardDetail(fixture);

      expect(card.cardId).toBe(entry.cardId);
      expect(card.printedKeywords).toEqual(entry.normalizedPrintedKeywords);
      expect(card.effectText ?? card.triggerText ?? "").toContain(
        entry.keywordEvidence,
      );
      expect(card.sourceTextHash).toBe(entry.expectedSourceTextHash);
      expect(card.behaviorHash).toBe(entry.expectedBehaviorHash);
      expect(card.officialFaq).toEqual(
        expect.arrayContaining(card.raw.official_faq),
      );
      expect(card.officialFaq).toHaveLength(card.raw.official_faq.length);
      expect(card.errata).toEqual([]);
    }
  });
});
