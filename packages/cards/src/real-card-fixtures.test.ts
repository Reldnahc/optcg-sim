import { describe, expect, it } from "vitest";

import type { CardId, LoadoutId, PlayerId } from "@optcg/types";

import {
  computeMatchCardManifestHash,
  validateDecklist,
  validateLoadout,
} from "./index.js";
import { normalizePoneglyphCardDetail } from "./normalization.js";
import {
  buildRealCardDslMatchCardManifest,
  listRealCardFixtureIds,
  loadCheckedInEb01023OnPlayDraw1EffectDefinition,
  loadCheckedInRealPoneglyphFixture,
  loadRealCardDslMatchCardManifestFixture,
  realCardDslEffectDefinitionFixturePath,
  realCardDslMatchCardManifestFixturePath,
} from "./real-card-fixtures.js";

const toCardId = (value: string): CardId => value as CardId;
const toLoadoutId = (value: string): LoadoutId => value as LoadoutId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;

describe("real card fixtures", () => {
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
  });

  it("keeps overlay as gameplay authority and fails closed for unsupported non-vanilla cards in ranked mode", async () => {
    const manifest = await buildRealCardDslMatchCardManifest();
    const unsupported = manifest.cards[toCardId("OP05-091")];
    const implementedDsl = manifest.cards[toCardId("EB01-023")];

    expect(unsupported?.support.status).toBe("unsupported");
    expect(implementedDsl?.support.status).toBe("implemented-dsl");
    expect(implementedDsl?.support.effectDefinitionId).toBe(
      "eb01-023.on-play-draw-1",
    );

    const ranked = validateDecklist({
      deck: [
        { cardId: toCardId("OP01-060"), quantity: 1 },
        { cardId: toCardId("OP05-091"), quantity: 1 },
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
    expect(sandbox.valid).toBe(true);
    expect(sandbox.warnings).toContainEqual(
      expect.objectContaining({
        code: "unsupported-card",
        cardId: toCardId("OP05-091"),
      }),
    );
  });

  it("builds the checked-in real-card manifest and keeps raw payload fields out", async () => {
    const built = await buildRealCardDslMatchCardManifest();
    const checkedIn = await loadRealCardDslMatchCardManifestFixture();
    const serializedCards = JSON.stringify(checkedIn.cards);

    expect(realCardDslMatchCardManifestFixturePath).toBe(
      "fixtures/cards/real-card-dsl-match-card-manifest.json",
    );
    expect(built).toEqual(checkedIn);
    expect(Object.keys(checkedIn.cards)).toEqual([
      "EB01-023",
      "OP01-060",
      "OP05-091",
    ]);
    expect(computeMatchCardManifestHash(checkedIn)).toBe(
      checkedIn.manifestHash,
    );
    for (const card of Object.values(checkedIn.cards)) {
      expect("raw" in card).toBe(false);
    }
    expect(serializedCards).not.toContain("card_number");
    expect(serializedCards).not.toContain("available_languages");
  });

  it("links EB01-023 support.effectDefinitionId to the effect definition registry", async () => {
    const manifest = await loadRealCardDslMatchCardManifestFixture();
    const effectDefinition =
      await loadCheckedInEb01023OnPlayDraw1EffectDefinition();
    const eb = manifest.cards[toCardId("EB01-023")];

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
  });

  it("fails loadout validation closed for unsupported real non-vanilla cards in ranked mode", async () => {
    const manifest = await loadRealCardDslMatchCardManifestFixture();
    const result = validateLoadout({
      format: "extra",
      loadout: {
        loadoutId: toLoadoutId("loadout-real-card-unsupported"),
        ownerPlayerId: toPlayerId("player-1"),
        name: "Unsupported Real Card Loadout",
        deck: [
          { cardId: toCardId("OP01-060"), quantity: 1 },
          { cardId: toCardId("OP05-091"), quantity: 1 },
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
  });
});
