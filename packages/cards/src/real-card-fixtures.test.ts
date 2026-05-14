import { describe, expect, it } from "vitest";

import type {
  CardId,
  CardSupportStatus,
  EffectDefinition,
  LoadoutId,
  PlayerId,
} from "@optcg/types";

import {
  computeMatchCardManifestHash,
  validateDecklist,
  validateLoadout,
} from "./index.js";
import { normalizePoneglyphCardDetail } from "./normalization.js";
import {
  buildFixtureOnlyRealCardDslMatchCardManifest,
  fixtureOnlyRealCardDslMatchCardManifestPath,
  listRealCardFixtureIds,
  loadCheckedInEb01023OnPlayDraw1EffectDefinition,
  loadFixtureOnlyRealCardDslMatchCardManifest,
  loadCheckedInOp10045GeneratedSupportEffectDefinition,
  loadCheckedInRealPoneglyphFixture,
  realKeywordProofFixtureCorpus,
  realEffectShapeFixtureCorpus,
  realCardDslEffectDefinitionFixturePath,
} from "./real-card-fixtures.js";

const toCardId = (value: string): CardId => value as CardId;
const toLoadoutId = (value: string): LoadoutId => value as LoadoutId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;

const hasTargetKoEffect = (definition: EffectDefinition): boolean =>
  definition.effects.some(
    (block) =>
      block.effect.type === "ko" && block.effect.target.type === "choose",
  );

type RealMechanicsRuntimeStance =
  | "implemented-dsl-runtime"
  | "supported-keyword-runtime"
  | "fail-closed-unsupported";

type RealMechanicsMatrixEntry = {
  readonly cardId: string;
  readonly effectFamily: string;
  readonly expectedSupportStatus: CardSupportStatus;
  readonly expectedRuntimeStance: RealMechanicsRuntimeStance;
  readonly rationale: string;
};

const supportedRealMechanicsMatrix = [
  {
    cardId: "EB01-023",
    effectFamily: "on-play-draw",
    expectedSupportStatus: "implemented-dsl",
    expectedRuntimeStance: "implemented-dsl-runtime",
    rationale:
      "Reviewed complete real [On Play] Draw 1 card fixture with checked-in DSL runtime coverage.",
  },
  {
    cardId: "OP04-014",
    effectFamily: "banish",
    expectedSupportStatus: "vanilla-confirmed",
    expectedRuntimeStance: "supported-keyword-runtime",
    rationale:
      "Reviewed complete real Banish keyword fixture with no extra printed behavior beyond parenthetical explanatory text.",
  },
  {
    cardId: "OP10-045",
    effectFamily: "when-attacking",
    expectedSupportStatus: "implemented-dsl",
    expectedRuntimeStance: "implemented-dsl-runtime",
    rationale:
      "Reviewed complete real [When Attacking] [Once Per Turn] draw-then-trash fixture with generated-support runtime linkage.",
  },
] as const satisfies readonly RealMechanicsMatrixEntry[];

const realMechanicsMatrix = [
  ...supportedRealMechanicsMatrix,
  ...realEffectShapeFixtureCorpus.map((entry) => ({
    cardId: entry.cardId,
    effectFamily: entry.effectFamily,
    expectedSupportStatus: "unsupported" as const,
    expectedRuntimeStance: "fail-closed-unsupported" as const,
    rationale: entry.rationale,
  })),
] as const satisfies readonly RealMechanicsMatrixEntry[];

describe("real card fixtures", () => {
  it("records CARD-013A keyword proof roles for every human-supplied card", () => {
    expect(realKeywordProofFixtureCorpus).toEqual([
      expect.objectContaining({
        cardId: "OP01-025",
        intendedProofRole: "exact Rush",
        keywordEvidence: "[Rush]",
      }),
      expect.objectContaining({
        cardId: "OP04-014",
        intendedProofRole: "exact Banish",
        keywordEvidence: "[Banish]",
      }),
      expect.objectContaining({
        cardId: "EB04-011",
        intendedProofRole: "mixed Rush: Character residue",
        keywordEvidence: "[Rush: Character]",
        residueEvidence:
          "Neptunian field-count draw-then-trash text remains unsupported residue evidence.",
      }),
      expect.objectContaining({
        cardId: "P-028",
        intendedProofRole: "exact Double Attack",
        keywordEvidence: "[Double Attack]",
      }),
    ]);
  });

  it("records a broad selected corpus of unsupported real effect-shape fixtures", () => {
    const cardIds = realEffectShapeFixtureCorpus.map((entry) => entry.cardId);
    const families = new Set(
      realEffectShapeFixtureCorpus.map((entry) => entry.effectFamily),
    );

    expect(realEffectShapeFixtureCorpus).toHaveLength(50);
    expect(new Set(cardIds).size).toBe(cardIds.length);
    expect(cardIds).not.toContain("EB01-023");
    expect(families.size).toBeGreaterThanOrEqual(14);
    expect([...families].sort()).toEqual(
      expect.arrayContaining([
        "activate-main",
        "banish",
        "blocker",
        "counter-event",
        "double-attack",
        "event-main",
        "life-manipulation",
        "on-ko",
        "replacement",
        "rush",
        "search-reveal",
        "target-ko",
        "trigger",
        "when-attacking",
      ]),
    );

    for (const entry of realEffectShapeFixtureCorpus) {
      expect(entry.rationale).toContain(entry.effectFamily);
      expect(entry.printedTextIncludes.length).toBeGreaterThan(0);
    }
  });

  it("records a broad real mechanics support/runtime matrix for every CARD-005 fixture and reviewed supported real card", () => {
    const corpusCardIds = realEffectShapeFixtureCorpus.map(
      (entry) => entry.cardId,
    );
    const matrixCardIds = realMechanicsMatrix.map((entry) => entry.cardId);
    const matrixByCardId = new Map(
      realMechanicsMatrix.map((entry) => [entry.cardId, entry]),
    );

    expect(realMechanicsMatrix).toHaveLength(corpusCardIds.length + 3);
    expect(new Set(matrixCardIds).size).toBe(matrixCardIds.length);
    expect(matrixCardIds).toEqual(
      expect.arrayContaining([
        "EB01-023",
        "OP04-014",
        "OP10-045",
        ...corpusCardIds,
      ]),
    );
    expect(
      realMechanicsMatrix.filter(
        (entry) => entry.expectedSupportStatus !== "unsupported",
      ),
    ).toEqual([...supportedRealMechanicsMatrix]);

    for (const corpusEntry of realEffectShapeFixtureCorpus) {
      const matrixEntry = matrixByCardId.get(corpusEntry.cardId);

      expect(matrixEntry).toEqual({
        cardId: corpusEntry.cardId,
        effectFamily: corpusEntry.effectFamily,
        expectedSupportStatus: "unsupported",
        expectedRuntimeStance: "fail-closed-unsupported",
        rationale: corpusEntry.rationale,
      });
    }

    for (const entry of realMechanicsMatrix) {
      expect(entry.cardId.length).toBeGreaterThan(0);
      expect(entry.effectFamily.length).toBeGreaterThan(0);
      expect(entry.rationale).toMatch(/\S/u);
    }
  });

  it("validates every checked-in real fixture through the Poneglyph detail schema", async () => {
    const fixtures = await Promise.all(
      listRealCardFixtureIds().map((cardId) =>
        loadCheckedInRealPoneglyphFixture(cardId),
      ),
    );

    expect(fixtures.map((fixture) => fixture.card_number)).toEqual([
      "OP01-060",
      "OP05-091",
      "EB01-023",
      "OP04-014",
      "OP10-045",
      ...realEffectShapeFixtureCorpus.map((entry) => entry.cardId),
      "OP01-025",
      "EB04-011",
      "P-028",
    ]);
  });

  it("normalizes real fixtures and preserves behavior-sensitive fields", async () => {
    const doflamingo = normalizePoneglyphCardDetail(
      await loadCheckedInRealPoneglyphFixture("OP01-060"),
    );
    const rebecca = normalizePoneglyphCardDetail(
      await loadCheckedInRealPoneglyphFixture("OP05-091"),
    );
    const weevil = normalizePoneglyphCardDetail(
      await loadCheckedInRealPoneglyphFixture("EB01-023"),
    );
    const cavendish = normalizePoneglyphCardDetail(
      await loadCheckedInRealPoneglyphFixture("OP10-045"),
    );

    expect(doflamingo.cardId).toBe("OP01-060");
    expect(doflamingo.category).toBe("leader");
    expect(doflamingo.sourceTextHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(doflamingo.behaviorHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(doflamingo.variants.length).toBeGreaterThan(0);
    expect(doflamingo.legality).toHaveProperty("extra.status");

    expect(rebecca.cardId).toBe("OP05-091");
    expect(rebecca.category).toBe("character");
    expect(rebecca.printedKeywords).toContain("blocker");
    expect(rebecca.effectText).toContain("[On Play]");
    expect(rebecca.colors).toEqual(["black"]);
    expect(rebecca.attributes).toEqual(["wisdom"]);

    expect(weevil.cardId).toBe("EB01-023");
    expect(weevil.category).toBe("character");
    expect(weevil.effectText).toBe("[On Play] Draw 1 card.");
    expect(weevil.types).toEqual(["The Seven Warlords of the Sea"]);
    expect(weevil.sourceTextHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(weevil.behaviorHash).toMatch(/^[a-f0-9]{64}$/u);

    expect(cavendish.cardId).toBe("OP10-045");
    expect(cavendish.colors).toEqual(["blue"]);
    expect(cavendish.cost).toBe(4);
    expect(cavendish.power).toBe(6000);
    expect(cavendish.counter).toBeUndefined();
    expect(cavendish.types).toEqual(["Dressrosa", "Beautiful Pirates"]);
    expect(cavendish.effectText).toBe(
      "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
    );
    expect(cavendish.sourceTextHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(cavendish.behaviorHash).toMatch(/^[a-f0-9]{64}$/u);

    for (const entry of realEffectShapeFixtureCorpus) {
      const fixture = await loadCheckedInRealPoneglyphFixture(entry.cardId);
      const normalized = normalizePoneglyphCardDetail(fixture);
      const sourceText = [fixture.effect, fixture.trigger, fixture.block]
        .filter((value): value is string => value !== null && value !== "")
        .join("\n");

      expect(normalized.cardId).toBe(entry.cardId);
      expect(normalized.name.length).toBeGreaterThan(0);
      expect(normalized.category).toMatch(
        /^(leader|character|event|stage|don)$/u,
      );
      expect(normalized.colors.length).toBeGreaterThan(0);
      expect(normalized.types.length).toBeGreaterThan(0);
      expect(sourceText).toContain(entry.printedTextIncludes);
      expect(normalized.sourceTextHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(normalized.behaviorHash).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("records OP04-014 as a complete Banish keyword candidate for reviewed support-gate coverage", async () => {
    const fixture = await loadCheckedInRealPoneglyphFixture("OP04-014");
    const normalized = normalizePoneglyphCardDetail(fixture);

    expect(fixture.card_number).toBe("OP04-014");
    expect(fixture.effect).toBe(
      "[Banish] (When this card deals damage, the target card is trashed without activating its Trigger.)",
    );
    expect(fixture.trigger).toBeNull();
    expect(fixture.official_faq).toEqual([]);
    expect(fixture.variants.map((variant) => variant.errata)).toEqual([[], []]);
    expect(normalized.printedKeywords).toEqual(["banish"]);
    expect(normalized.effectText).toBe(fixture.effect);
    expect(normalized.triggerText).toBeUndefined();
    expect(normalized.officialFaq).toEqual([]);
    expect(normalized.errata).toEqual([]);
    expect(normalized.legality["Extra Regulation"]?.status).toBe("legal");
  });

  it("records CARD-013A keyword proof fixture fields without promoting gameplay support", async () => {
    for (const entry of realKeywordProofFixtureCorpus) {
      const fixture = await loadCheckedInRealPoneglyphFixture(entry.cardId);
      const normalized = normalizePoneglyphCardDetail(fixture);
      const sourceText = [fixture.effect, fixture.trigger, fixture.block]
        .filter((value): value is string => value !== null && value !== "")
        .join("\n");

      expect(fixture.card_number).toBe(entry.cardId);
      expect(fixture.card_type.length).toBeGreaterThan(0);
      expect(sourceText).toContain(entry.keywordEvidence);
      expect(normalized.cardId).toBe(entry.cardId);
      expect(normalized.category).toMatch(
        /^(leader|character|event|stage|don)$/u,
      );
      expect(normalized.printedKeywords).toEqual(
        expectedNormalizedPrintedKeywords(entry),
      );
      expect(normalized.sourceTextHash).toBe(entry.expectedSourceTextHash);
      expect(normalized.behaviorHash).toBe(entry.expectedBehaviorHash);
      expect(normalized.officialFaq).toHaveLength(fixture.official_faq.length);
      expect(normalized.officialFaq).toEqual(
        expect.arrayContaining(fixture.official_faq),
      );
      expect(normalized.errata).toEqual([]);

      if (entry.residueEvidence === undefined) {
        expect(entry.intendedProofRole).toMatch(/^exact /u);
      } else {
        expect(entry.intendedProofRole).toMatch(/^mixed /u);
        expect(sourceText).toContain("Neptunian");
        expect(sourceText).toContain("Draw a card");
        expect(sourceText).toContain("trash the same number of cards");
      }
    }
  });

  it("keeps newly captured CARD-013A keyword proof fixtures out of runtime admission manifests", async () => {
    const manifest = await buildFixtureOnlyRealCardDslMatchCardManifest();

    for (const entry of realKeywordProofFixtureCorpus) {
      if (entry.cardId === "OP04-014") {
        continue;
      }

      const card = manifest.cards[toCardId(entry.cardId)];

      expect(card).toBeUndefined();
      expect(manifest.effectDefinitions?.[entry.cardId]).toBeUndefined();
    }
  });

  it("keeps overlay as gameplay authority and fails closed for unsupported non-vanilla cards in ranked mode", async () => {
    const manifest = await buildFixtureOnlyRealCardDslMatchCardManifest();
    const unsupported = manifest.cards[toCardId("OP05-091")];
    const implementedDsl = manifest.cards[toCardId("EB01-023")];
    const supportedBanishCandidate = manifest.cards[toCardId("OP04-014")];
    const selectedUnsupported = realEffectShapeFixtureCorpus.map((entry) => {
      const card = manifest.cards[toCardId(entry.cardId)];

      expect(card, entry.cardId).toBeDefined();
      return card;
    });

    expect(unsupported?.support.status).toBe("unsupported");
    expect(implementedDsl?.support.status).toBe("implemented-dsl");
    expect(implementedDsl?.support.effectDefinitionId).toBe(
      "eb01-023.on-play-draw-1",
    );
    expect(supportedBanishCandidate?.support.status).toBe("vanilla-confirmed");
    expect(supportedBanishCandidate?.support.tested).toBe(true);
    expect(
      supportedBanishCandidate?.support.effectDefinitionId,
    ).toBeUndefined();
    expect(supportedBanishCandidate?.support.customHandlerIds).toBeUndefined();
    for (const card of selectedUnsupported) {
      expect(card?.support.status).toBe("unsupported");
      expect(card?.support.tested).toBe(false);
      expect(card?.support.effectDefinitionId).toBeUndefined();
      expect(card?.support.customHandlerIds).toBeUndefined();
    }

    const ranked = validateDecklist({
      deck: [
        { cardId: toCardId("OP01-060"), quantity: 1 },
        { cardId: toCardId("OP05-091"), quantity: 1 },
        { cardId: toCardId("EB01-003"), quantity: 1 },
        { cardId: toCardId("EB01-010"), quantity: 1 },
        { cardId: toCardId("OP04-108"), quantity: 1 },
      ],
      enforceLeaderColorIdentity: false,
      format: "extra",
      manifest,
      mode: "ranked",
      overlayVersion: "real-card-overlays-v1",
    });
    const sandbox = validateDecklist({
      deck: [
        { cardId: toCardId("OP01-060"), quantity: 1 },
        { cardId: toCardId("OP05-091"), quantity: 1 },
        { cardId: toCardId("EB01-003"), quantity: 1 },
        { cardId: toCardId("EB01-010"), quantity: 1 },
        { cardId: toCardId("OP04-108"), quantity: 1 },
      ],
      enforceLeaderColorIdentity: false,
      format: "extra",
      manifest,
      mode: "dev-sandbox",
      overlayVersion: "real-card-overlays-v1",
    });

    expect(ranked.valid).toBe(false);
    expect(ranked.errors).toContainEqual(
      expect.objectContaining({
        code: "unsupported-card",
        cardId: toCardId("OP05-091"),
      }),
    );
    for (const cardId of ["EB01-003", "EB01-010", "OP04-108"]) {
      expect(ranked.errors).toContainEqual(
        expect.objectContaining({
          code: "unsupported-card",
          cardId: toCardId(cardId),
        }),
      );
    }
    expect(sandbox.warnings).toContainEqual(
      expect.objectContaining({
        code: "unsupported-card",
        cardId: toCardId("OP05-091"),
      }),
    );
    for (const cardId of ["EB01-003", "EB01-010", "OP04-108"]) {
      expect(sandbox.warnings).toContainEqual(
        expect.objectContaining({
          code: "unsupported-card",
          cardId: toCardId(cardId),
        }),
      );
    }
    expect(sandbox.warnings).not.toContainEqual(
      expect.objectContaining({
        code: "unsupported-card",
        cardId: toCardId("OP04-014"),
      }),
    );
  });

  it("builds the checked-in real-card manifest and keeps raw payload fields out", async () => {
    const built = await buildFixtureOnlyRealCardDslMatchCardManifest();
    const checkedIn = await loadFixtureOnlyRealCardDslMatchCardManifest();
    const serializedCards = JSON.stringify(checkedIn.cards);

    expect(fixtureOnlyRealCardDslMatchCardManifestPath).toBe(
      "fixtures/cards/real-card-dsl-match-card-manifest.json",
    );
    expect(built).toEqual(checkedIn);
    expect(Object.keys(checkedIn.cards)).toEqual(
      [
        "EB01-023",
        "OP04-014",
        "OP10-045",
        "OP01-060",
        "OP05-091",
        ...realEffectShapeFixtureCorpus.map((entry) => entry.cardId).sort(),
      ].sort(),
    );
    expect(Object.keys(checkedIn.effectDefinitions ?? {})).toEqual(
      ["eb01-023.on-play-draw-1", "op10-045.generated-support"].sort(),
    );
    expect(computeMatchCardManifestHash(checkedIn)).toBe(
      checkedIn.manifestHash,
    );
    for (const card of Object.values(checkedIn.cards)) {
      expect("raw" in card).toBe(false);
    }
    expect(serializedCards).not.toContain("card_number");
    expect(serializedCards).not.toContain("available_languages");
  });

  it("keeps the real-card DSL manifest surface fixture-only and detached from runtime admission authority", async () => {
    const fixtureManifest = await loadFixtureOnlyRealCardDslMatchCardManifest();
    const builtManifest = await buildFixtureOnlyRealCardDslMatchCardManifest();

    expect(fixtureOnlyRealCardDslMatchCardManifestPath).toBe(
      "fixtures/cards/real-card-dsl-match-card-manifest.json",
    );
    expect(fixtureManifest).toEqual(builtManifest);
    expect(fixtureManifest.source).toBe("poneglyph-fixture");
    expect(fixtureManifest.cards[toCardId("EB01-023")]?.support.status).toBe(
      "implemented-dsl",
    );
    expect(fixtureManifest.cards[toCardId("OP04-014")]?.support.status).toBe(
      "vanilla-confirmed",
    );
    expect(fixtureManifest.cards[toCardId("OP10-045")]?.support.status).toBe(
      "implemented-dsl",
    );
    expect(fixtureManifest.cards[toCardId("OP05-091")]?.support.status).toBe(
      "unsupported",
    );
  });

  it("links implemented support.effectDefinitionId values to the effect definition registry", async () => {
    const manifest = await loadFixtureOnlyRealCardDslMatchCardManifest();
    const effectDefinition =
      await loadCheckedInEb01023OnPlayDraw1EffectDefinition();
    const generatedSupportEffectDefinition =
      await loadCheckedInOp10045GeneratedSupportEffectDefinition();
    const eb = manifest.cards[toCardId("EB01-023")];
    const op10045 = manifest.cards[toCardId("OP10-045")];
    const op04014 = manifest.cards[toCardId("OP04-014")];

    expect(realCardDslEffectDefinitionFixturePath).toBe(
      "fixtures/effect-dsl/valid/eb01-023-on-play-draw-1.json",
    );
    expect(eb?.support.status).toBe("implemented-dsl");
    expect(eb?.support.effectDefinitionId).toBe("eb01-023.on-play-draw-1");
    expect(eb?.support.effectDefinitionId).toBe(
      `${effectDefinition.cardId.toLowerCase()}.on-play-draw-1`,
    );
    expect(
      manifest.effectDefinitions?.[String(eb?.support.effectDefinitionId)],
    ).toEqual(effectDefinition);
    expect(op10045?.support.status).toBe("implemented-dsl");
    expect(op10045?.support.effectDefinitionId).toBe(
      "op10-045.generated-support",
    );
    expect(generatedSupportEffectDefinition.effects[0]).not.toHaveProperty(
      "optional",
    );
    expect(
      manifest.effectDefinitions?.[String(op10045?.support.effectDefinitionId)],
    ).toEqual(generatedSupportEffectDefinition);
    expect(op10045?.support.customHandlerIds).toBeUndefined();
    expect(op10045?.support.sourceTextHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(op10045?.support.behaviorHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(op10045?.support.tested).toBe(true);
    expect(op10045?.support.rulesVersion).toBe("2026-01-16");
    expect(op10045?.support.cardDataVersion).toBe(
      "real-card-poneglyph-fixture-v1",
    );
    expect(op04014?.support.status).toBe("vanilla-confirmed");
    expect(op04014?.support.effectDefinitionId).toBeUndefined();
    expect(op04014?.support.customHandlerIds).toBeUndefined();
    expect(op04014?.support.sourceTextHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(op04014?.support.behaviorHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(op04014?.support.tested).toBe(true);
    expect(op04014?.support.rulesVersion).toBe("op04-014-banish-v1");
    expect(op04014?.support.cardDataVersion).toBe(
      "real-card-poneglyph-fixture-v1",
    );
    expect(op04014?.support.notes).toContain("Banish");
  });

  it("keeps real target-KO fixture support absent until reviewed Poneglyph text supports it", async () => {
    const manifest = await loadFixtureOnlyRealCardDslMatchCardManifest();
    const unsupportedRealCards = [
      manifest.cards[toCardId("OP01-060")],
      manifest.cards[toCardId("OP05-091")],
      ...realEffectShapeFixtureCorpus.map(
        (entry) => manifest.cards[toCardId(entry.cardId)],
      ),
    ];

    expect(
      Object.values(manifest.effectDefinitions ?? {}).filter(hasTargetKoEffect),
    ).toEqual([]);
    for (const card of unsupportedRealCards) {
      expect(card?.support.status).toBe("unsupported");
      expect(card?.support.effectDefinitionId).toBeUndefined();
      expect(card?.support.tested).toBe(false);
    }
  });

  it("fails loadout validation closed for unsupported real non-vanilla cards in ranked mode", async () => {
    const manifest = await loadFixtureOnlyRealCardDslMatchCardManifest();
    const result = validateLoadout({
      format: "extra",
      loadout: {
        loadoutId: toLoadoutId("loadout-real-card-unsupported"),
        ownerPlayerId: toPlayerId("player-1"),
        name: "Unsupported Real Card Loadout",
        deck: [
          { cardId: toCardId("OP01-060"), quantity: 1 },
          { cardId: toCardId("OP05-091"), quantity: 1 },
          { cardId: toCardId("EB01-003"), quantity: 1 },
          { cardId: toCardId("EB01-010"), quantity: 1 },
          { cardId: toCardId("OP04-108"), quantity: 1 },
        ],
      },
      manifest,
      mode: "ranked",
      overlayVersion: "real-card-overlays-v1",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "unsupported-card",
        cardId: toCardId("OP05-091"),
      }),
    );
    for (const cardId of ["EB01-003", "EB01-010", "OP04-108"]) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: "unsupported-card",
          cardId: toCardId(cardId),
        }),
      );
    }
  });

  it("accepts OP04-014 in ranked deck and loadout validation after reviewed Banish support", async () => {
    const manifest = await loadFixtureOnlyRealCardDslMatchCardManifest();
    const leader = manifest.cards[toCardId("OP03-077")];
    if (leader === undefined) {
      throw new Error("missing OP03-077 manifest leader");
    }
    const manifestWithSupportedLeader = {
      ...manifest,
      cards: {
        ...manifest.cards,
        [toCardId("OP03-077")]: {
          ...leader,
          support: {
            behaviorHash: leader.behaviorHash,
            cardDataVersion: "real-card-poneglyph-fixture-v1",
            cardId: toCardId("OP03-077"),
            rulesVersion: "fixture-real-card",
            sourceTextHash: leader.sourceTextHash,
            status: "vanilla-confirmed",
            tested: true,
          },
        },
      },
    };
    const deck = [
      { cardId: toCardId("OP03-077"), quantity: 1 },
      { cardId: toCardId("OP04-014"), quantity: 1 },
    ];

    const deckResult = validateDecklist({
      deck,
      enforceLeaderColorIdentity: false,
      format: "Extra Regulation",
      manifest: manifestWithSupportedLeader,
      mode: "ranked",
      overlayVersion: "real-card-overlays-v1",
    });
    const loadoutResult = validateLoadout({
      enforceLeaderColorIdentity: false,
      format: "Extra Regulation",
      loadout: {
        loadoutId: toLoadoutId("loadout-real-card-banish"),
        ownerPlayerId: toPlayerId("player-1"),
        name: "Supported Banish Real Card Loadout",
        deck,
      },
      manifest: manifestWithSupportedLeader,
      mode: "ranked",
      overlayVersion: "real-card-overlays-v1",
    });

    expect(deckResult.valid).toBe(true);
    expect(deckResult.errors).toEqual([]);
    expect(loadoutResult.valid).toBe(true);
    expect(loadoutResult.errors).toEqual([]);
  });

  it("accepts OP10-045 in ranked deck and loadout validation after generated-support linkage", async () => {
    const manifest = await loadFixtureOnlyRealCardDslMatchCardManifest();
    const leader = manifest.cards[toCardId("OP03-077")];
    if (leader === undefined) {
      throw new Error("missing OP03-077 manifest leader");
    }
    const manifestWithSupportedLeader = {
      ...manifest,
      cards: {
        ...manifest.cards,
        [toCardId("OP03-077")]: {
          ...leader,
          support: {
            behaviorHash: leader.behaviorHash,
            cardDataVersion: "real-card-poneglyph-fixture-v1",
            cardId: toCardId("OP03-077"),
            rulesVersion: "fixture-real-card",
            sourceTextHash: leader.sourceTextHash,
            status: "vanilla-confirmed",
            tested: true,
          },
        },
      },
    };
    const deck = [
      { cardId: toCardId("OP03-077"), quantity: 1 },
      { cardId: toCardId("OP10-045"), quantity: 1 },
    ];

    const deckResult = validateDecklist({
      deck,
      enforceLeaderColorIdentity: false,
      format: "Extra Regulation",
      manifest: manifestWithSupportedLeader,
      mode: "ranked",
      overlayVersion: "real-card-overlays-v1",
    });
    const loadoutResult = validateLoadout({
      enforceLeaderColorIdentity: false,
      format: "Extra Regulation",
      loadout: {
        loadoutId: toLoadoutId("loadout-real-card-op10-045"),
        ownerPlayerId: toPlayerId("player-1"),
        name: "Generated-Support Real Card Loadout",
        deck,
      },
      manifest: manifestWithSupportedLeader,
      mode: "ranked",
      overlayVersion: "real-card-overlays-v1",
    });

    expect(deckResult.valid).toBe(true);
    expect(deckResult.errors).toEqual([]);
    expect(loadoutResult.valid).toBe(true);
    expect(loadoutResult.errors).toEqual([]);
  });

  it("matches every real mechanics matrix entry to checked-in manifest support metadata without broadening support", async () => {
    const manifest = await loadFixtureOnlyRealCardDslMatchCardManifest();
    const supportedCardIds = supportedRealMechanicsMatrix.map(
      (entry) => entry.cardId,
    );
    const supportedEffectDefinitionIds = [
      "eb01-023.on-play-draw-1",
      "op10-045.generated-support",
    ];

    expect(Object.keys(manifest.effectDefinitions ?? {})).toEqual(
      supportedEffectDefinitionIds,
    );

    for (const entry of realMechanicsMatrix) {
      const card = manifest.cards[toCardId(entry.cardId)];

      expect(card, entry.cardId).toBeDefined();
      expect(card?.support.cardId).toBe(toCardId(entry.cardId));
      expect(card?.support.status).toBe(entry.expectedSupportStatus);
      expect(card?.support.sourceTextHash).toBe(card?.sourceTextHash);
      expect(card?.support.behaviorHash).toBe(card?.behaviorHash);
      expect(card?.support.sourceTextHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(card?.support.behaviorHash).toMatch(/^[a-f0-9]{64}$/u);

      if (entry.expectedRuntimeStance === "implemented-dsl-runtime") {
        expect(card?.support.tested).toBe(true);
        expect(card?.support.effectDefinitionId).toBeDefined();
        expect(card?.support.customHandlerIds).toBeUndefined();
        expect(
          manifest.effectDefinitions?.[
            String(card?.support.effectDefinitionId)
          ],
        ).toBeDefined();
      } else if (entry.expectedRuntimeStance === "supported-keyword-runtime") {
        expect(card?.support.tested).toBe(true);
        expect(card?.support.effectDefinitionId).toBeUndefined();
        expect(card?.support.customHandlerIds).toBeUndefined();
      } else {
        expect(card?.support.tested).toBe(false);
        expect(card?.support.effectDefinitionId).toBeUndefined();
        expect(card?.support.customHandlerIds).toBeUndefined();
        expect(manifest.effectDefinitions?.[entry.cardId]).toBeUndefined();
        expect(
          Object.values(manifest.effectDefinitions ?? {}).some(
            (definition) => definition.cardId === toCardId(entry.cardId),
          ),
        ).toBe(false);
      }
    }

    expect(
      realMechanicsMatrix
        .filter((entry) => entry.expectedSupportStatus !== "unsupported")
        .map((entry) => entry.cardId)
        .sort(),
    ).toEqual(supportedCardIds.sort());
    expect(
      Object.values(manifest.cards)
        .filter((card) => card.support.status !== "unsupported")
        .map((card) => card.cardId)
        .sort(),
    ).toEqual(supportedCardIds.sort().map(toCardId));
  });

  it("rejects every unsupported CARD-005 real effect-shape fixture in ranked decks while allowing sandbox warnings", async () => {
    const manifest = await loadFixtureOnlyRealCardDslMatchCardManifest();
    const deck = realEffectShapeFixtureCorpus.map((entry) => ({
      cardId: toCardId(entry.cardId),
      quantity: 1,
    }));

    const ranked = validateDecklist({
      deck,
      enforceLeaderColorIdentity: false,
      format: "extra",
      manifest,
      mode: "ranked",
      overlayVersion: "real-card-overlays-v1",
    });
    const sandbox = validateDecklist({
      deck,
      enforceLeaderColorIdentity: false,
      format: "extra",
      manifest,
      mode: "dev-sandbox",
      overlayVersion: "real-card-overlays-v1",
    });

    for (const entry of realEffectShapeFixtureCorpus) {
      expect(ranked.errors).toContainEqual(
        expect.objectContaining({
          code: "unsupported-card",
          cardId: toCardId(entry.cardId),
        }),
      );
      expect(sandbox.warnings).toContainEqual(
        expect.objectContaining({
          code: "unsupported-card",
          cardId: toCardId(entry.cardId),
        }),
      );
    }
  });
});

function expectedNormalizedPrintedKeywords(
  entry: (typeof realKeywordProofFixtureCorpus)[number],
) {
  if (entry.cardId === "EB04-011") {
    return ["rushCharacter"];
  }

  return entry.normalizedPrintedKeywords;
}
