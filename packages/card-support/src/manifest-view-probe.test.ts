import { describe, expect, it } from "vitest";
import type { CardId, MatchCardManifest, ResolvedCard } from "@optcg/types";

import {
  createManifestViewProbeReport,
  validateMatchCardManifestViewSafety,
} from "./manifest-view-probe.js";

describe("manifest view probe", () => {
  it("accepts metadata-only implemented DSL without an effect definition", () => {
    const report = createManifestViewProbeReport({
      entries: [
        {
          label: "OP16-042",
          cardId: "OP16-042",
          category: "character",
          effectText:
            "Under the rules of this game, you may have any number of this card in your deck.",
          triggerText: null,
        },
      ],
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Manifest view probe entries: 1");
    expect(report.lines).toContain("Manifest view probe passed: 1");
    expect(report.lines).toContain("Manifest view probe failed: 0");
  });

  it("accepts cards that only need rules metadata and printed keywords in the view manifest", () => {
    const report = createManifestViewProbeReport({
      entries: [
        {
          label: "OP01-075",
          cardId: "OP01-075",
          category: "character",
          effectText:
            "Under the rules of this game, you may have any number of this card in your deck.\n[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
          triggerText: null,
        },
        {
          label: "OP01-121",
          cardId: "OP01-121",
          category: "character",
          effectText:
            "Also treat this card's name as [Kouzuki Oden] according to the rules.\n[Double Attack] (This card deals 2 damage.)\n[Banish] (When this card deals damage, the target card is trashed without activating its Trigger.)",
          triggerText: null,
        },
        {
          label: "OP08-072",
          cardId: "OP08-072",
          category: "character",
          effectText:
            "Under the rules of this game, you may have any number of this card in your deck.\n[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
          triggerText: null,
        },
        {
          label: "P-000",
          cardId: "P-000",
          category: "leader",
          effectText:
            "This Leader can only be used in designated events according to the rules.\nThis Leader is treated as a card with all card names, types, and attributes according to the rules.",
          triggerText: null,
        },
      ],
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Manifest view probe failed: 0");
  });

  it("projects conditional continuous keyword grants without recursing through current power", () => {
    const report = createManifestViewProbeReport({
      entries: [
        {
          label: "OP06-002",
          cardId: "OP06-002",
          category: "character",
          effectText:
            "If this Character has 7000 power or more, this Character gains [Banish].\n(When this card deals damage, the target card is trashed without activating its Trigger.)",
          triggerText: null,
        },
        {
          label: "OP14-004",
          cardId: "OP14-004",
          category: "character",
          effectText:
            "If this Character has 5000 power or more, this Character gains [Rush].\n(This card can attack on the turn in which it is played.)",
          triggerText: null,
        },
      ],
    });

    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain("Manifest view probe failed: 0");
  });

  it("fails implemented DSL runtime text that has no effect definition", () => {
    const cardId = "BROKEN-001" as CardId;
    const results = validateMatchCardManifestViewSafety({
      manifest: manifestWithCard(
        resolvedCard({
          cardId,
          effectText: "[On Play] Draw 1 card.",
          support: {
            cardId,
            status: "implemented-dsl",
            tested: true,
            rulesVersion: "probe",
            cardDataVersion: "probe",
            sourceTextHash: "source",
            behaviorHash: "behavior",
          },
        }),
      ),
      cardIds: [cardId],
    });

    expect(results).toEqual([
      {
        label: "BROKEN-001",
        cardId: "BROKEN-001",
        status: "failed",
        reason:
          "implemented-dsl card has runtime text but no effect definition",
      },
    ]);
  });

  it("accepts implemented DSL raw keyword text that has no effect definition", () => {
    const cardId = "BLOCKER-001" as CardId;
    const results = validateMatchCardManifestViewSafety({
      manifest: manifestWithCard(
        resolvedCard({
          cardId,
          effectText:
            "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
          support: {
            cardId,
            status: "implemented-dsl",
            tested: true,
            rulesVersion: "probe",
            cardDataVersion: "probe",
            sourceTextHash: "source",
            behaviorHash: "behavior",
          },
        }),
      ),
      cardIds: [cardId],
    });

    expect(results[0]).toMatchObject({
      label: "BLOCKER-001",
      cardId: "BLOCKER-001",
      status: "passed",
    });
  });
});

const manifestWithCard = (card: ResolvedCard): MatchCardManifest => ({
  manifestHash: "probe",
  source: "manual-test",
  cardDataVersion: "probe",
  effectDefinitionsVersion: "probe",
  customHandlerVersion: "probe",
  banlistVersion: "probe",
  createdAt: "2026-06-26T00:00:00.000Z",
  cards: {
    [card.cardId]: card,
  },
});

const resolvedCard = (params: {
  readonly cardId: CardId;
  readonly effectText: string;
  readonly support: ResolvedCard["support"];
}): ResolvedCard => ({
  cardId: params.cardId,
  language: "en",
  name: String(params.cardId),
  category: "character",
  set: "PROBE",
  setName: "Manifest View Probe",
  released: true,
  colors: ["red"],
  cost: 1,
  power: 2000,
  attributes: [],
  types: [],
  effectText: params.effectText,
  printedKeywords: [],
  variants: [],
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: params.support.sourceTextHash,
  behaviorHash: params.support.behaviorHash,
  support: params.support,
});
