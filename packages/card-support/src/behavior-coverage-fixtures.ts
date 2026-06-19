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
    label: "fixture:rest-target:on-play",
    text: "[On Play] Rest up to 1 of your opponent's Characters.",
    expectedPrimitiveTypes: ["rest", "selectTargets", "sequence"],
  },
  {
    label: "fixture:ko-target:on-play",
    text: "[On Play] K.O. up to 1 of your opponent's Characters with a cost of 3 or less.",
    expectedPrimitiveTypes: ["ko", "selectTargets", "sequence"],
  },
  {
    label: "fixture:bounce-target:on-play",
    text: "[On Play] Return up to 1 of your opponent's Characters with a cost of 3 or less to the owner's hand.",
    expectedPrimitiveTypes: ["bounce", "selectTargets", "sequence"],
  },
  {
    label: "fixture:trash-target:on-play",
    text: "[On Play] Trash up to 1 of your opponent's Characters with a cost of 3 or less.",
    expectedPrimitiveTypes: ["selectTargets", "sequence", "trash"],
  },
  {
    label: "fixture:modify-power:on-play",
    text: "[On Play] Give up to 1 of your opponent's Characters -2000 power during this turn.",
    expectedPrimitiveTypes: ["modifyPower"],
  },
  {
    label: "fixture:return-don:on-play",
    text: "[On Play] Your opponent returns 1 DON!! card from their field to their DON!! deck.",
    expectedPrimitiveTypes: ["returnDon"],
  },
  {
    label: "fixture:pay-cost-draw:on-play",
    text: "[On Play] You may trash 1 card from your hand: Draw 2 cards.",
    expectedPrimitiveTypes: ["draw", "payCost", "sequence"],
  },
  {
    label: "fixture:activate-don:on-play",
    text: "[On Play] Set up to 1 of your DON!! cards as active.",
    expectedPrimitiveTypes: ["activate", "selectTargets", "sequence"],
  },
  {
    label: "fixture:play-selected:on-play",
    text: "[On Play] Play up to 1 {Land of Wano} type Character card with a cost of 3 or less from your hand.",
    expectedPrimitiveTypes: ["playSelected", "selectCards", "sequence"],
  },
  {
    label: "fixture:move-cards:on-play",
    text: "[On Play] Add up to 1 card from the top of your deck to the top of your Life cards.",
    expectedPrimitiveTypes: ["moveCards"],
  },
  {
    label: "fixture:give-keyword:on-play",
    text: "[On Play] Up to 1 of your Characters gains [Unblockable] during this turn.",
    expectedPrimitiveTypes: ["giveKeyword"],
  },
  {
    label: "fixture:cannot-attack:on-play",
    text: "[On Play] Up to 1 of your opponent's Characters cannot attack until the end of your opponent's next turn.",
    expectedPrimitiveTypes: ["cannotAttack", "selectTargets", "sequence"],
  },
  {
    label: "fixture:trash-from-hand:on-play",
    text: "[On Play] Draw 1 card. Then, trash 1 card from your hand.",
    expectedPrimitiveTypes: ["draw", "sequence", "trashFromHand"],
  },
  {
    label: "fixture:attach-selected-don:on-play",
    text: "[On Play] Rest up to 1 of your opponent's cards. Then, you may trash 1 card from your hand. If you do, give up to 3 rested DON!! cards to your Leader.",
    expectedPrimitiveTypes: [
      "attachSelectedDon",
      "payCost",
      "rest",
      "selectCards",
      "selectTargets",
      "sequence",
    ],
  },
  {
    label: "fixture:when-attacking:draw",
    text: "[When Attacking] Draw 1 card.",
    expectedPrimitiveTypes: ["draw"],
  },
] as const satisfies readonly BehaviorCoverageFixtureEntry[];
