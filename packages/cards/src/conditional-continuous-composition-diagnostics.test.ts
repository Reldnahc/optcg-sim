import { describe, expect, it } from "vitest";

import { deriveConditionalContinuousCompositionDiagnosticDecomposition } from "./conditional-continuous-composition-diagnostics.js";

describe("conditional continuous composition diagnostics", () => {
  it("reports ordered body parts for single body input", () => {
    const decomposition =
      deriveConditionalContinuousCompositionDiagnosticDecomposition(
        "If your Leader is multicolored, this Character gains [Rush].",
      );

    expect(decomposition?.recognizedSyntaxFragments).toEqual(
      expect.arrayContaining(["conditional-body-parts:ordered"]),
    );
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "conditional-body-part:0",
          status: "supported",
        }),
      ]),
    );
  });

  it("reports repeated body connectors and ordered parts for three bodies", () => {
    const decomposition =
      deriveConditionalContinuousCompositionDiagnosticDecomposition(
        "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Rush] and this Character gains [Banish].",
      );

    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "conditional-body-connector:and:0",
          status: "supported",
        }),
        expect.objectContaining({
          id: "conditional-body-connector:and:1",
          status: "supported",
        }),
      ]),
    );
  });

  it("does not mark chained targetless keyword body parts as supported", () => {
    const decomposition =
      deriveConditionalContinuousCompositionDiagnosticDecomposition(
        "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Rush] and gains [Banish].",
      );

    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "conditional-body-part:2",
          status: "unsupported",
        }),
      ]),
    );
    expect(decomposition?.unsupportedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "conditional-continuous-composition:unsupported-body-fragment",
      ]),
    );
  });

  it("fails closed for unsupported punctuation body lists", () => {
    expect(
      deriveConditionalContinuousCompositionDiagnosticDecomposition(
        "If your Leader is multicolored, this Character gains [Rush], and this Character gains [Banish].",
      ),
    ).toBeUndefined();
    expect(
      deriveConditionalContinuousCompositionDiagnosticDecomposition(
        "If your Leader is multicolored, this Character gains [Rush]; this Character gains [Banish].",
      ),
    ).toBeUndefined();
  });
});
