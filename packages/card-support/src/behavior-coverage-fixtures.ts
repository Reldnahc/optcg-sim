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
    label: "fixture:modify-cost:on-play",
    text: "[On Play] Up to 1 of your Characters gains +2 cost during this turn.",
    expectedPrimitiveTypes: ["modifyCost"],
  },
  {
    label: "fixture:op16-118:permanent-counter-modifier",
    text: "The counter of all of your Character cards with 8000 power in your hand becomes +2000.",
    expectedPrimitiveTypes: ["modifyCounter"],
  },
  {
    label: "fixture:op13-003:permanent-don-phase-placement",
    text: "If you have any DON!! cards on your field, 1 DON!! card placed during your DON!! Phase is given to your Leader.",
    expectedPrimitiveTypes: ["redirectDonPhasePlacement"],
  },
  {
    label: "fixture:set-base-cost:on-play",
    text: "[On Play] Set the cost of up to 1 of your opponent's Characters with no base effect to 0 during this turn.",
    expectedPrimitiveTypes: ["selectTargets", "sequence", "setBaseCost"],
  },
  {
    label: "fixture:set-base-power:on-play",
    text: "[On Play] If you have 10 DON!! cards on your field, all of your [Prisoner of Impel Down] cards' base power becomes 7000 during this turn.",
    expectedPrimitiveTypes: ["setBasePower"],
  },
  {
    label: "fixture:set-power-zero:on-play",
    text: "[On Play] Set the power of up to 1 of your opponent's Characters to 0 during this turn.",
    expectedPrimitiveTypes: ["selectTargets", "sequence", "setPowerToZero"],
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
    label: "fixture:choice:main",
    text: `[Main] Choose one:
\u2022 Draw 2 cards.
\u2022 Up to 1 of your {Dressrosa} type Characters gains [Blocker] until the end of your opponent's next End Phase.`,
    expectedPrimitiveTypes: ["choice", "draw", "giveKeyword"],
  },
  {
    label: "fixture:conditional:on-play",
    text: "[On Play] Draw 1 card. If you have 6 or less cards in your hand, draw 2 cards.",
    expectedPrimitiveTypes: ["conditional", "draw", "sequence"],
  },
  {
    label: "fixture:choose-number:main",
    text: "[Main] Choose a cost and reveal 1 card from the top of your opponent's deck. If the revealed card has the chosen cost, K.O. up to 1 of your opponent's Characters with a base cost of 8 or less.",
    expectedPrimitiveTypes: [
      "chooseNumber",
      "ko",
      "revealTop",
      "selectFromSet",
      "selectTargets",
      "sequence",
    ],
  },
  {
    label: "fixture:activate-don:on-play",
    text: "[On Play] Set up to 1 of your DON!! cards as active.",
    expectedPrimitiveTypes: ["activate", "selectTargets", "sequence"],
  },
  {
    label: "fixture:activate-main:draw",
    text: "[Activate: Main] Draw 1 card.",
    expectedPrimitiveTypes: ["draw"],
  },
  {
    label: "fixture:prevent-don-activation:activate-main",
    text: "[Activate: Main] Set up to 1 of your DON!! cards as active. Then, you cannot set DON!! cards as active using Character effects during this turn.",
    expectedPrimitiveTypes: [
      "activate",
      "preventDonActivation",
      "selectTargets",
      "sequence",
    ],
  },
  {
    label: "fixture:op06-020:prevent-life-to-hand",
    text: "[Activate: Main] You may rest this Leader: Rest up to 1 of your opponent's DON!! cards or Characters with a cost of 3 or less. Then, you cannot add Life cards to your hand using your own effects during this turn.",
    expectedPrimitiveTypes: [
      "payCost",
      "preventLifeToHand",
      "rest",
      "sequence",
    ],
  },
  {
    label: "fixture:op12-099:life-removed-prevent-draw",
    text: "[Your Turn] When a card is removed from your or your opponent's Life cards, draw 1 card. Then, you cannot draw cards using your own effects during this turn.",
    expectedPrimitiveTypes: ["draw", "preventDraw", "sequence"],
  },
  {
    label: "fixture:invalidate-entrypoint:activate-main",
    text: "[Activate: Main] You may trash 1 card from your hand: Your opponent's [On Play] effects are negated until the end of your opponent's next turn.",
    expectedPrimitiveTypes: [
      "invalidateEffectEntryPoint",
      "payCost",
      "sequence",
    ],
  },
  {
    label: "fixture:invalidate-effects:main",
    text: "[Main] Negate the effect of up to 1 of your opponent's Characters during this turn. Then, if that Character has a cost of 4 or less, K.O. it.",
    expectedPrimitiveTypes: [
      "conditional",
      "invalidateEffects",
      "ko",
      "selectTargets",
      "sequence",
    ],
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
    label: "fixture:allow-attack-active:on-play",
    text: "[On Play] Up to 1 of your Characters can also attack active Characters during this turn.",
    expectedPrimitiveTypes: ["allowAttackActiveCharacters"],
  },
  {
    label: "fixture:op06-026:cannot-attack-target",
    text: "[On Play] Set up to 1 of your  attribute Characters with a cost of 4 or less as active. Then, you cannot attack a Leader during this turn.",
    expectedPrimitiveTypes: [
      "activate",
      "cannotAttackTarget",
      "selectTargets",
      "sequence",
    ],
  },
  {
    label: "fixture:cannot-block:on-play",
    text: "[On Play] Up to 1 of your opponent's Characters cannot activate [Blocker] during this turn.",
    expectedPrimitiveTypes: ["cannotBlock", "selectTargets", "sequence"],
  },
  {
    label: "fixture:cannot-become-active:on-play",
    text: "[On Play] Up to 1 of your opponent's rested Characters will not become active in your opponent's next Refresh Phase.",
    expectedPrimitiveTypes: ["cannotBecomeActive"],
  },
  {
    label: "fixture:give-attribute:on-play",
    text: "[On Play] Up to 1 of your [Sabo] Characters gains [Blocker] and the <Special> attribute during this turn.",
    expectedPrimitiveTypes: [
      "giveAttribute",
      "giveKeyword",
      "selectTargets",
      "sequence",
    ],
  },
  {
    label: "fixture:give-protection:on-play",
    text: "[On Play] Up to 1 of your opponent's Characters other than [Monkey.D.Luffy] cannot be rested until the end of your opponent's next End Phase.",
    expectedPrimitiveTypes: ["giveProtection"],
  },
  {
    label: "fixture:op10-070:protect-from-ko",
    text: "[On Play] All of your Characters with 1000 base power or less cannot be K.O.'d by your opponent's effects until the end of your opponent's next turn.",
    expectedPrimitiveTypes: ["protectFromKO"],
  },
  {
    label: "fixture:op08-043:attack-cost",
    text: "[On Play] If your Leader's type includes \"Whitebeard Pirates\" and you have 2 or less Life cards, select all of your opponent's Characters on their field. Until the end of your opponent's next turn, none of the selected Characters can attack unless your opponent trashes 2 cards from their hand whenever they attack.",
    expectedPrimitiveTypes: ["attackCost", "selectAllTargets", "sequence"],
  },
  {
    label: "fixture:swap-base-power:main",
    text: "[Main] Select 2 of your opponent's Characters with 9000 base power or less. Swap the base power of the selected Characters with each other during this turn.",
    expectedPrimitiveTypes: ["selectTargets", "sequence", "swapBasePower"],
  },
  {
    label: "fixture:place-top-deck:on-play",
    text: "[On Play] Look at 3 cards from the top of your deck; place them at the top or bottom of your deck in any order.",
    expectedPrimitiveTypes: ["placeTopDeckCards"],
  },
  {
    label: "fixture:shuffle-deck:on-play",
    text: "[On Play] Shuffle your deck. Then, draw 1 card.",
    expectedPrimitiveTypes: ["draw", "sequence", "shuffleDeck"],
  },
  {
    label: "fixture:prevent-play:on-play",
    text: "[On Play] You cannot play cards from your hand during this turn.",
    expectedPrimitiveTypes: ["preventPlay"],
  },
  {
    label: "fixture:op13-057:prevent-blocker-activation",
    text: "[Main] You may rest 1 of your DON!! cards: If you have 1 or less Life cards, your opponent cannot activate [Blocker] whenever your Leader attacks during this turn.",
    expectedPrimitiveTypes: [
      "conditional",
      "payCost",
      "preventBlockerActivation",
      "sequence",
    ],
  },
  {
    label: "fixture:op06-116:damage",
    text: `[Main] Choose one:
\u2022 K.O. up to 1 of your opponent's Characters with a cost of 5 or less.
\u2022 If your opponent has 1 Life card, deal 1 damage to your opponent. Then, add 1 card from the top of your Life cards to your hand.`,
    expectedPrimitiveTypes: [
      "choice",
      "conditional",
      "damage",
      "ko",
      "moveCards",
      "selectTargets",
      "sequence",
    ],
  },
  {
    label: "fixture:set-life-face-down:on-play",
    text: "[On Play] Draw 1 card. Then, turn all of your Life cards face-down.",
    expectedPrimitiveTypes: ["draw", "sequence", "setLifeFaceUp"],
  },
  {
    label: "fixture:reorder-life:on-play",
    text: "[On Play] Draw 1 card. Then, look at all of your opponent's Life cards and place them back in their Life area in any order.",
    expectedPrimitiveTypes: ["draw", "reorderLife", "sequence"],
  },
  {
    label: "fixture:life-to-deck-top-reorder:on-play",
    text: "[On Play] Draw 1 card. Then, look at all of your Life cards; place 1 card at the top of your deck and place the rest back in your Life area in any order.",
    expectedPrimitiveTypes: [
      "draw",
      "moveLifeToDeckTopAndReorderRest",
      "sequence",
    ],
  },
  {
    label: "fixture:trash-from-hand:on-play",
    text: "[On Play] Draw 1 card. Then, trash 1 card from your hand.",
    expectedPrimitiveTypes: ["draw", "sequence", "trashFromHand"],
  },
  {
    label: "fixture:reveal-zone:on-play",
    text: "[On Play] Your opponent trashes 1 card from their hand and reveals their hand. Then, your opponent draws 1 card.",
    expectedPrimitiveTypes: [
      "draw",
      "revealFromZone",
      "sequence",
      "trashFromHand",
    ],
  },
  {
    label: "fixture:trash-hand-until:on-play",
    text: "[On Play] Trash cards from your hand until you have 2 cards in your hand.",
    expectedPrimitiveTypes: ["trashFromHandUntilCount"],
  },
  {
    label: "fixture:delayed-self-activate:on-play",
    text: "[On Play] Draw 1 card. Then, set this Character as active at the end of this turn.",
    expectedPrimitiveTypes: ["activate", "delayed", "draw", "sequence"],
  },
  {
    label: "fixture:extra-turn:on-play",
    text: "[On Play] Take an extra turn after this one.",
    expectedPrimitiveTypes: ["takeExtraTurn"],
  },
  {
    label: "fixture:op15-014:activate-selected-event",
    text: "[On Play] Activate up to 1 {Dressrosa} type Event with a base cost of 3 or less from your hand.",
    expectedPrimitiveTypes: [
      "activateSelectedEvent",
      "selectCards",
      "sequence",
    ],
  },
  {
    label: "fixture:win-game:on-play",
    text: "[On Play] You win the game.",
    expectedPrimitiveTypes: ["winGame"],
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
    label: "fixture:for-each-saved-target:on-play",
    text: "[On Play] Give up to 3 of your {Straw Hat Crew} type Characters up to 1 rested DON!! card each.",
    expectedPrimitiveTypes: [
      "attachSelectedDon",
      "forEachSavedTarget",
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
  {
    label: "fixture:op16-080:on-opponent-attack-retarget",
    text: "[On Your Opponent's Attack] [Once Per Turn] You may trash 1 card with a [Trigger] from your hand: Change the target of that attack to this Leader or to one of your {Blackbeard Pirates} type Character cards.",
    expectedPrimitiveTypes: [
      "changeAttackTarget",
      "payCost",
      "selectTargets",
      "sequence",
    ],
  },
  {
    label: "fixture:op03-099:when-attacking-life-placement",
    text: "[DON!! x1] [When Attacking] Look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom of the Life cards. Then, this Leader gains +1000 power during this battle.",
    expectedPrimitiveTypes: ["modifyPower", "placeTopLifeCard", "sequence"],
  },
  {
    label: "fixture:eb01-061:when-attacking-copy-selected-power",
    text: "[When Attacking] Select up to 1 of your opponent's Characters. This Character's base power becomes the same as the selected Character's power during this turn.",
    expectedPrimitiveTypes: ["selectTargets", "sequence", "setBasePower"],
  },
  {
    label: "fixture:eb01-030:trigger-play-source",
    text: "[Trigger] Play this card.",
    expectedPrimitiveTypes: ["playSource"],
  },
  {
    label: "fixture:op13-096:trigger-activate-referenced-main",
    text: `[Main] Look at 3 cards from the top of your deck; reveal up to 1 {Celestial Dragons} type card other than [The Five Elders Are at Your Service!!!] and add it to your hand. Then, trash the rest.
[Trigger] Activate this card's [Main] effect.`,
    expectedPrimitiveTypes: [
      "activateReferencedEffect",
      "moveSelected",
      "placeSetRemainder",
      "revealSelected",
      "revealTop",
      "selectFromSet",
      "sequence",
    ],
  },
  {
    label: "fixture:eb03-053:on-ko-life-face-up-cost-play",
    text: "[On K.O.] You may turn 1 card from the top of your Life cards face-up: Play up to 1 Character card with 6000 power or less from your hand.",
    expectedPrimitiveTypes: [
      "payCost",
      "playSelected",
      "selectCards",
      "sequence",
    ],
  },
  {
    label: "fixture:eb02-030:counter-ko-replacement",
    text: "[Counter] If any of your Characters would be K.O.'d in battle during this turn, you may trash 1 card from your hand instead.",
    expectedPrimitiveTypes: [
      "grantReplacement",
      "replacement",
      "trashFromHand",
    ],
  },
] as const satisfies readonly BehaviorCoverageFixtureEntry[];
