import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";

import {
  scanGenericCardTextDiagnostics,
  type GenericDiagnosticComponent,
} from "./generic-card-text-diagnostic-scanner.js";
import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { listAllGeneratedSupportParserCertificationIds } from "./generated-support-types.js";

const parserCertificationEvidence = {
  currentCertificationIds: listAllGeneratedSupportParserCertificationIds(),
} as const;

function pick(
  components: readonly GenericDiagnosticComponent[],
  kind: GenericDiagnosticComponent["kind"],
): readonly GenericDiagnosticComponent[] {
  return components.filter((component) => component.kind === kind);
}

describe("generic card text diagnostic scanner", () => {
  it("recognizes wrappers, slash wrappers, activate-main candidates, and no-bracket continuous text", () => {
    const slash = scanGenericCardTextDiagnostics(
      "[Trigger]/[On Play] Draw 1 card.",
    );
    expect(pick(slash.components, "wrapper").map((item) => item.text)).toEqual([
      "[Trigger]",
      "[On Play]",
    ]);

    const activateMain = scanGenericCardTextDiagnostics(
      "[Activate: Main] You may draw 1 card.",
    );
    expect(activateMain.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "wrapper",
          status: "unsupported",
          text: "[Activate: Main]",
        }),
      ]),
    );

    const continuous = scanGenericCardTextDiagnostics(
      "During your turn, this Character gets +1000 power.",
    );
    expect(continuous.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "wrapper",
          status: "recognized",
          text: "During your turn",
        }),
      ]),
    );
  });

  it("distinguishes boolean or from comparator phrases and handles up to N generically", () => {
    const scan = scanGenericCardTextDiagnostics(
      "[On Play] Up to 2 of your opponent's Characters with 5000 power or less cannot attack during this turn or trash 1 card.",
    );
    expect(scan.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "cardinality",
          text: "Up to 2",
        }),
        expect.objectContaining({
          kind: "predicate",
          text: "5000 power or less",
        }),
        expect.objectContaining({
          kind: "condition-connector",
          text: "or",
        }),
      ]),
    );
  });

  it("does not classify card-count comparator phrasing as boolean connectors", () => {
    const scan = scanGenericCardTextDiagnostics(
      "If you have 5 or less cards in your hand, draw 1 card.",
    );
    expect(
      scan.components.filter(
        (component) =>
          component.kind === "condition-connector" && component.text === "or",
      ),
    ).toEqual([]);
    expect(scan.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "predicate",
          text: "5 or less cards",
        }),
      ]),
    );
  });

  it("does not emit cost separator for wrapper colons like Activate Main", () => {
    const scan = scanGenericCardTextDiagnostics(
      "[Activate: Main] Draw 1 card.",
    );
    expect(
      scan.components.filter(
        (component) => component.kind === "cost" && component.text === ":",
      ),
    ).toEqual([]);
  });

  it("normalizes ASCII hyphen and unicode minus equally while preserving source spans", () => {
    const ascii = scanGenericCardTextDiagnostics("DON!! -1: Draw 1 card.");
    const unicode = scanGenericCardTextDiagnostics(
      "DON!! \u22121: Draw 1 card.",
    );
    const asciiCost = pick(ascii.components, "cost")[0];
    const unicodeCost = pick(unicode.components, "cost")[0];

    expect(asciiCost).toBeDefined();
    expect(unicodeCost).toBeDefined();
    expect(asciiCost?.normalizedText).toBe(unicodeCost?.normalizedText);
    expect(asciiCost?.text).toBe("-1");
    expect(unicodeCost?.text).toBe("\u22121");
  });

  it("produces stable deterministic ids across repeated scans and normalized-equivalent variants", () => {
    const text = "[On Play] Draw up to 1 card.";
    const first = scanGenericCardTextDiagnostics(text).components;
    const second = scanGenericCardTextDiagnostics(text).components;
    expect(first.map((entry) => entry.id)).toEqual(
      second.map((entry) => entry.id),
    );

    const normalizedA = scanGenericCardTextDiagnostics(
      "DON!! -1: Draw 1 card.",
    );
    const normalizedB = scanGenericCardTextDiagnostics(
      "DON!! \u22121: Draw 1 card.",
    );
    const costA = pick(normalizedA.components, "cost")[0];
    const costB = pick(normalizedB.components, "cost")[0];
    expect(costA?.id).toBe(costB?.id);
  });

  it("scans representative condition, target/filter, action, destination, duration, modifier, restriction, sequence, and residue components", () => {
    const scan = scanGenericCardTextDiagnostics(
      "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, place up to 1 of your opponent's Character cards named Zoro with [Slash] attribute and 5000 power or less at the bottom of the owner's deck. Then, that Character cannot attack during this turn.",
    );

    expect(scan.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "condition", text: "If" }),
        expect.objectContaining({
          kind: "condition",
          text: "your Leader is multicolored",
        }),
        expect.objectContaining({
          kind: "condition",
          text: "you have 5 or less cards in your hand",
        }),
        expect.objectContaining({ kind: "condition-connector", text: "and" }),
        expect.objectContaining({
          kind: "sequence",
          text: "Then",
          normalizedText: "sequence:then",
        }),
        expect.objectContaining({
          kind: "target",
          text: "your opponent's Character cards",
        }),
        expect.objectContaining({
          kind: "predicate",
          text: "5000 power or less",
        }),
        expect.objectContaining({ kind: "cardinality", text: "up to 1" }),
        expect.objectContaining({ kind: "action", text: "place" }),
        expect.objectContaining({
          kind: "destination",
          text: "bottom of the owner's deck",
        }),
        expect.objectContaining({ kind: "duration", text: "this turn" }),
        expect.objectContaining({ kind: "restriction", text: "cannot attack" }),
        expect.objectContaining({ kind: "modifier", text: "multicolored" }),
      ]),
    );
  });

  it("captures cost separators and DON/hand/public/opponent targets", () => {
    const scan = scanGenericCardTextDiagnostics(
      "DON!! -2: You may rest 1 DON!! card and trash 1 card from your hand to select up to 1 of your opponent's Characters.",
    );
    expect(scan.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "cost", text: "-2" }),
        expect.objectContaining({ kind: "cost", text: ":" }),
        expect.objectContaining({
          kind: "optionality",
          normalizedText: "optionality:may",
          text: "may",
        }),
        expect.objectContaining({ kind: "quantity", text: "1 card" }),
        expect.objectContaining({ kind: "target", text: "DON!! card" }),
        expect.objectContaining({ kind: "target", text: "your hand" }),
        expect.objectContaining({
          kind: "target",
          text: "your opponent's Characters",
        }),
      ]),
    );
  });

  it("uses same component paths across wording/value variations", () => {
    const variantA = scanGenericCardTextDiagnostics(
      "[Trigger] If your Leader is multicolored and you have 5 or less cards in your hand, draw up to 1 card with 1000 power or less.",
    );
    const variantB = scanGenericCardTextDiagnostics(
      "[On Play] If your Leader is multicolored and you have 7 or less cards in your hand, draw up to 2 cards with 2000 power or less.",
    );

    expect(
      pick(variantA.components, "wrapper").map((item) => item.kind),
    ).toEqual(pick(variantB.components, "wrapper").map((item) => item.kind));
    expect(pick(variantA.components, "condition").length).toBeGreaterThan(0);
    expect(pick(variantB.components, "condition").length).toBeGreaterThan(0);
    expect(pick(variantA.components, "predicate").length).toBeGreaterThan(0);
    expect(pick(variantB.components, "predicate").length).toBeGreaterThan(0);
    expect(pick(variantA.components, "cardinality").length).toBeGreaterThan(0);
    expect(pick(variantB.components, "cardinality").length).toBeGreaterThan(0);
    expect(pick(variantA.components, "action").length).toBeGreaterThan(0);
    expect(pick(variantB.components, "action").length).toBeGreaterThan(0);
    expect(pick(variantA.components, "duration").length).toBe(
      pick(variantB.components, "duration").length,
    );
  });

  it("does not expose generated support/playable metadata in scanner output", () => {
    const scan = scanGenericCardTextDiagnostics(
      "[On Play] Draw 1 card. Then rest 1 DON!!.",
    );
    const serialized = JSON.stringify(scan);
    expect(serialized).not.toContain("effectDefinition");
    expect(serialized).not.toContain("implemented-dsl");
    expect(serialized).not.toContain("missing-runtime-capability");
    expect(serialized).not.toContain("sourceTextHash");
    expect(serialized).not.toContain("playable");
  });

  it("keeps generated-support CARD-008 through CARD-019 behavior unchanged for representative supported and unsupported inputs", () => {
    const validateEffectDefinition = () => ({ valid: true }) as const;
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: "sha256:a",
          cardDataVersion: "cards-v1",
          cardId: "CARD-017C-SUPPORTED" as CardId,
          effectDefinitionsVersion: "effects-v1",
          rulesVersion: "rules-v1",
          sourceText: "[On Play] Draw 1 card.",
          sourceTextHash: "sha256:supported",
        },
        {
          behaviorHash: "sha256:b",
          cardDataVersion: "cards-v1",
          cardId: "CARD-016A-UNSUPPORTED" as CardId,
          effectDefinitionsVersion: "effects-v1",
          rulesVersion: "rules-v1",
          sourceText:
            "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.",
          sourceTextHash: "sha256:unsupported",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(
      index.entries.find((entry) => entry.cardId === "CARD-017C-SUPPORTED")
        ?.status,
    ).toBe("supported");
    expect(
      index.entries.find((entry) => entry.cardId === "CARD-016A-UNSUPPORTED")
        ?.status,
    ).toBe("unsupported");
  });

  it("emits whole-span unsupported residue when no narrower component matches", () => {
    const scan = scanGenericCardTextDiagnostics(
      "gibberish xyz @@ totally unknown",
    );
    expect(scan.components).toEqual([
      expect.objectContaining({
        kind: "action",
        status: "unsupported",
        text: "gibberish xyz @@ totally unknown",
      }),
    ]);
  });

  it("keeps recognized components and adds unsupported residue for unmatched spans", () => {
    const scan = scanGenericCardTextDiagnostics("[On Play] gibberish xyz");
    expect(scan.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "wrapper",
          text: "[On Play]",
        }),
        expect.objectContaining({
          kind: "action",
          status: "unsupported",
          text: "gibberish xyz",
        }),
      ]),
    );
  });
});
