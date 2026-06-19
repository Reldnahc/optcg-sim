export interface BehaviorCoverageFixtureEntry {
  readonly label: string;
  readonly text: string;
  readonly expectedPrimitiveTypes: readonly string[];
}

export const behaviorCoverageFixtureCorpus = [
  {
    label: "fixture:draw:on-play",
    text: "[On Play] Draw 1 card.",
    expectedPrimitiveTypes: ["draw"],
  },
  {
    label: "fixture:draw-up-to:on-play",
    text: "[On Play] Draw up to 2 cards.",
    expectedPrimitiveTypes: ["drawUpTo"],
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
  {
    label: "fixture:when-attacking:draw",
    text: "[When Attacking] Draw 1 card.",
    expectedPrimitiveTypes: ["draw"],
  },
] as const satisfies readonly BehaviorCoverageFixtureEntry[];
