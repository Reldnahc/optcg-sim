import { describe, expect, it } from "vitest";

import { createBehaviorProbeReport } from "./behavior-probe.js";
import { behaviorCoverageFixtureCorpus } from "./behavior-coverage-fixtures.js";

describe("behavior coverage fixture corpus", () => {
  it("contains stable labels and representative text", () => {
    expect(behaviorCoverageFixtureCorpus).toEqual(
      expect.arrayContaining([
        {
          label: "fixture:draw:on-play",
          text: "[On Play] Draw 1 card.",
          expectedPrimitiveTypes: ["draw"],
        },
        {
          label: "fixture:search:on-play",
          text: "[On Play] Look at 3 cards from the top of your deck; reveal up to 1 {Land of Wano} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
          expectedPrimitiveTypes: [
            "moveSelected",
            "placeSetRemainder",
            "revealSelected",
            "revealTop",
            "selectFromSet",
            "sequence",
          ],
        },
      ]),
    );
  });

  it("does not contain duplicate labels", () => {
    const labels = behaviorCoverageFixtureCorpus.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps expected primitive metadata aligned with emitted primitives", () => {
    for (const fixture of behaviorCoverageFixtureCorpus) {
      const report = createBehaviorProbeReport({ text: fixture.text });
      const emitted = [
        ...new Set(
          report.scenarios.flatMap((scenario) => scenario.primitiveTypes),
        ),
      ].sort((left, right) => left.localeCompare(right));
      const expected = [...fixture.expectedPrimitiveTypes].sort((left, right) =>
        left.localeCompare(right),
      );

      expect(emitted, fixture.label).toEqual(expected);
    }
  });
});
