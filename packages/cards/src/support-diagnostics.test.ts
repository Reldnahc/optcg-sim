import { describe, expect, it } from "vitest";

import { scanCardTextDiagnostics } from "./support-diagnostics.js";

describe("card text support diagnostics", () => {
  it("scans slash wrappers, conditions, connectors, targets, and unsupported body components independently", () => {
    const diagnostics = scanCardTextDiagnostics(
      "[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.",
    );

    expect(diagnostics.supportAuthority).toBe("diagnostic-only");
    expect(diagnostics.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "wrapper:on-play:0-9",
          kind: "wrapper",
          normalizedText: "[On Play]",
          status: "recognized",
          text: "[On Play]",
        }),
        expect.objectContaining({
          id: "wrapper:when-attacking:10-26",
          kind: "wrapper",
          normalizedText: "[When Attacking]",
          status: "recognized",
          text: "[When Attacking]",
        }),
        expect.objectContaining({
          id: "condition:leader-type:Supernovas",
          kind: "condition",
          normalizedText: "your Leader has the {Supernovas} type",
          status: "recognized",
        }),
        expect.objectContaining({
          id: "condition-connector:and",
          kind: "condition-connector",
          normalizedText: "and",
          status: "recognized",
        }),
        expect.objectContaining({
          id: "condition:named-character:absent:Cavendish",
          kind: "condition",
          normalizedText: "you have no other [Cavendish] Characters",
          status: "unsupported",
        }),
        expect.objectContaining({
          id: "cardinality:up-to:2",
          kind: "cardinality",
          normalizedText: "up to 2",
          status: "recognized",
        }),
        expect.objectContaining({
          id: "target:don:self",
          kind: "target",
          normalizedText: "your DON!! cards",
          status: "recognized",
        }),
        expect.objectContaining({
          id: "action:set-active",
          kind: "action",
          normalizedText: "set active",
          status: "unsupported",
        }),
      ]),
    );
    expect(diagnostics.components).not.toContainEqual(
      expect.objectContaining({ kind: "playable-support" }),
    );
  });

  it("uses the same component paths for wording and value variations instead of exact sample text", () => {
    const first = scanCardTextDiagnostics(
      "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.",
    );
    const second = scanCardTextDiagnostics(
      "[When Attacking] Place up to 3 of your opponent's Characters with 4000 power or less at the bottom of the owner's deck.",
    );

    expect(componentPath(first, "cardinality")).toBe("cardinality:up-to");
    expect(componentPath(second, "cardinality")).toBe("cardinality:up-to");
    expect(componentPath(first, "predicate")).toBe("predicate:power:lte");
    expect(componentPath(second, "predicate")).toBe("predicate:power:lte");
    expect(componentPath(first, "destination")).toBe(
      "destination:owner-deck-bottom",
    );
    expect(componentPath(second, "destination")).toBe(
      "destination:owner-deck-bottom",
    );
  });

  it("does not classify comparator phrases as boolean or connectors", () => {
    const diagnostics = scanCardTextDiagnostics(
      "[On Play] If you have 5 or less cards in your hand or your opponent has 7 or more Life cards, draw 1 card.",
    );

    const connectors = diagnostics.components.filter(
      (component) => component.kind === "condition-connector",
    );
    const predicates = diagnostics.components.filter(
      (component) => component.kind === "predicate",
    );

    expect(connectors).toEqual([
      expect.objectContaining({
        id: "condition-connector:or",
        normalizedText: "or",
      }),
    ]);
    expect(predicates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "predicate:hand-count:self:lte:5",
          normalizedText: "5 or less cards in your hand",
        }),
        expect.objectContaining({
          id: "predicate:life-count:opponent:gte:7",
          normalizedText: "7 or more Life cards",
        }),
      ]),
    );
  });

  it("normalizes ASCII and Unicode minus modifiers while preserving source spans", () => {
    const ascii = scanCardTextDiagnostics(
      "[On Play] Give up to 1 of your opponent's Characters -1 cost during this turn.",
    );
    const unicode = scanCardTextDiagnostics(
      "[On Play] Give up to 1 of your opponent's Characters −1 cost during this turn.",
    );

    const asciiModifier = requiredComponent(ascii, "modifier");
    const unicodeModifier = requiredComponent(unicode, "modifier");

    expect(asciiModifier.id).toBe("modifier:cost:-1");
    expect(unicodeModifier.id).toBe("modifier:cost:-1");
    expect(asciiModifier.normalizedText).toBe("-1 cost");
    expect(unicodeModifier.normalizedText).toBe("-1 cost");
    expect(asciiModifier.text).toBe("-1 cost");
    expect(unicodeModifier.text).toBe("−1 cost");
  });

  it("emits unsupported residue only when no narrower component can be classified", () => {
    const diagnostics = scanCardTextDiagnostics("Completely unmodeled text.");

    expect(diagnostics.components).toEqual([
      {
        componentPath: "residue:unsupported",
        id: "residue:unsupported:0-26",
        kind: "residue",
        normalizedText: "Completely unmodeled text.",
        span: { end: 26, start: 0, text: "Completely unmodeled text." },
        status: "unsupported",
        text: "Completely unmodeled text.",
      },
    ]);
  });

  it("keeps representative variation coverage on reusable component paths", () => {
    const slashConditional = scanCardTextDiagnostics(
      "[On Play]/[When Attacking] If your Leader has the {Heart Pirates} type and you have no other [Bepo] Characters, set up to 3 of your DON!! cards as active.",
    );
    const slashSequence = scanCardTextDiagnostics(
      "[When Attacking]/[On Play] Give up to 2 of your opponent's Characters -2 cost during this turn. Then, K.O. up to 1 of your opponent's Characters with a cost of 1.",
    );
    const conditionalDraw = scanCardTextDiagnostics(
      "[On Play] If your Leader is multicolored and you have 4 or less cards in your hand, draw 1 card.",
    );
    const bottomDeck = scanCardTextDiagnostics(
      "[On Play] Place up to 2 of your opponent's Characters with 3000 power or less at the bottom of the owner's deck.",
    );
    const activateMain = scanCardTextDiagnostics(
      "[Activate: Main] You may rest this Stage and turn 1 card from the top of your Life cards face-up: Up to 2 of your {Heart Pirates} type Characters gains +2000 power until the end of your opponent's next turn.",
    );
    const continuous = scanCardTextDiagnostics(
      "If your Leader has the {Fish-Man} type, this Character gains [Rush].",
    );

    expect(componentPath(slashConditional, "condition")).toBe(
      "condition:leader-type",
    );
    expect(componentPath(slashSequence, "modifier")).toBe(
      "modifier:cost:negative",
    );
    expect(componentPath(conditionalDraw, "predicate")).toBe(
      "predicate:hand-count:self:lte",
    );
    expect(componentPath(bottomDeck, "destination")).toBe(
      "destination:owner-deck-bottom",
    );
    expect(componentPath(activateMain, "optionality")).toBe("optionality:may");
    expect(componentPath(continuous, "wrapper")).toBe("wrapper:unbracketed-if");
  });
});

function componentPath(
  diagnostics: ReturnType<typeof scanCardTextDiagnostics>,
  kind: string,
): string {
  return requiredComponent(diagnostics, kind).componentPath;
}

function requiredComponent(
  diagnostics: ReturnType<typeof scanCardTextDiagnostics>,
  kind: string,
) {
  const component = diagnostics.components.find(
    (candidate) => candidate.kind === kind,
  );
  expect(component).toBeDefined();
  if (component === undefined) {
    throw new Error(`Missing diagnostic component kind ${kind}.`);
  }
  return component;
}
