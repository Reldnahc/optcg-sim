import assert from "node:assert/strict";
import { test } from "vitest";

import { parseCardEffectLine } from "../../packages/cards/src/card-effect-line-parser.ts";
import { evaluateEffectBlockRuntimeSupport } from "../../packages/engine-core/src/effect-runtime-admission.ts";
import { isSupportedQueuedDrawEffectBlock } from "../../packages/engine-core/src/runtime/primitives/execute.ts";
import {
  hasCombatSafeImplementedDslDefinition,
  isSupportedContinuousQueueEffect,
} from "../../packages/engine-core/src/runtime/continuous/continuous.ts";
import { isSupportedQueuedEffectConditionShape } from "../../packages/engine-core/src/effect-runtime-conditions.ts";
import {
  isSupportedQueuedAutoSequenceForEntryPoint,
  isSupportedSequenceBlock,
} from "../../packages/engine-core/src/effect-runtime-sequence/support.ts";
import { isSupportedWhenAttackingCompatibleQueuedEffect } from "../../packages/engine-core/src/runtime/trigger-queueing/attack.ts";
import { isSupportedOnKOCompatibleQueuedEffect } from "../../packages/engine-core/src/runtime/trigger-queueing/ko.ts";

const parseSupportedEffectBlock = (text, evidence = []) => {
  const parsed = parseCardEffectLine(text);
  assert.ok(parsed !== undefined, `expected parser to support: ${text}`);
  for (const expectedEvidence of evidence) {
    assert.ok(
      parsed.evidence.includes(expectedEvidence),
      `expected evidence ${expectedEvidence} for ${text}`,
    );
  }

  return {
    id: `cards-engine-contract:${text}`,
    ...parsed.block,
  };
};

const assertRuntimeSupported = (effectBlock, message) => {
  const report = evaluateEffectBlockRuntimeSupport(effectBlock);
  assert.equal(report.supported, true, message);
  assert.deepEqual(report.missing, [], message);
};

const activateMainSequenceEntry = {
  id: "queue-entry:activate-main:cards-engine-contract",
  state: "pending",
  timingWindowId: "timing-window:activate-main:cards-engine-contract",
  generation: 0,
  queueOrigin: { type: "activateMain" },
  controllerId: "player-1",
  source: {
    instanceId: "instance:leader",
    cardId: "card:leader",
    playerId: "player-1",
    zone: {
      zone: "leaderArea",
      playerId: "player-1",
      slot: "leader",
    },
  },
  sourceSnapshot: {
    instanceId: "instance:leader",
    cardId: "card:leader",
    ownerId: "player-1",
    controllerId: "player-1",
    zone: {
      zone: "leaderArea",
      playerId: "player-1",
      slot: "leader",
    },
    category: "leader",
    colors: [],
    keywords: [],
  },
  effectBlockId: "effect:activate-main",
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0,
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: {
    type: "ruleProcess",
    name: "effectRuntime:activateMain",
  },
};

test("cards parser emits an On Play draw primitive block accepted by engine draw support", () => {
  const effectBlock = parseSupportedEffectBlock("[On Play] Draw 1 card.", [
    "entry:onPlay",
    "instruction:draw",
  ]);

  assert.equal(isSupportedQueuedDrawEffectBlock(effectBlock), true);
});

test("cards parser emits a DON-return On Play draw block accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] DON!! −1: Draw 1 card.",
    ["entry:onPlay", "cost:returnDon", "instruction:draw"],
  );

  assert.equal(
    isSupportedQueuedAutoSequenceForEntryPoint(
      effectBlock,
      "onPlay",
      "mustRemainInSameZone",
    ),
    true,
  );
});

test("cards parser emits once-per-turn attacking draw accepted by engine draw support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[When Attacking] [Once Per Turn] Draw 2 cards.",
    ["entry:whenAttacking", "marker:oncePerTurn", "instruction:draw"],
  );

  assert.equal(isSupportedQueuedDrawEffectBlock(effectBlock), true);
});

test("cards parser emits draw/trash sequence child primitives accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
    [
      "entry:whenAttacking",
      "marker:oncePerTurn",
      "instruction:draw",
      "connector:andOrdered",
      "instruction:trashFromHand",
    ],
  );

  assert.equal(
    isSupportedQueuedAutoSequenceForEntryPoint(
      effectBlock,
      "whenAttacking",
      "mustRemainInSameZone",
    ),
    true,
  );
});

test("cards parser emits conditional power reduction primitives accepted by engine condition and continuous gates", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[When Attacking] If you have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters −1000 power during this turn.",
    [
      "entry:whenAttacking",
      "expression:conditional",
      "condition:donFieldCount",
      "condition:comparator:lte",
      "target:opponentCharacters",
      "cardinality:upTo",
      "modifier:negativePower",
      "duration:thisTurn",
    ],
  );

  assert.equal(effectBlock.effect.type, "modifyPower");
  assert.equal(
    isSupportedQueuedEffectConditionShape(effectBlock.condition),
    true,
  );
  assert.equal(isSupportedContinuousQueueEffect(effectBlock.effect), true);
});

test("cards parser emits all-target rested refresh locks accepted by engine continuous gates", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[Main] All of your opponent's rested Characters with a cost of 7 or less will not become active in your opponent's next Refresh Phase.",
    [
      "entry:eventMain",
      "instruction:preventActivation",
      "cardinality:all",
      "target:opponentCharacters",
      "filter:state:rested",
      "filter:cost",
      "duration:opponentNextRefreshPhase",
    ],
  );

  assert.equal(effectBlock.effect.type, "cannotBecomeActive");
  assert.equal(isSupportedContinuousQueueEffect(effectBlock.effect), true);
  assertRuntimeSupported(effectBlock);
});

test("cards parser emits conditional power reduction accepted by engine attack queueing", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[When Attacking] If you have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters −1000 power during this turn.",
    [
      "entry:whenAttacking",
      "expression:conditional",
      "condition:donFieldCount",
      "condition:comparator:lte",
      "target:opponentCharacters",
      "cardinality:upTo",
      "modifier:negativePower",
      "duration:thisTurn",
    ],
  );

  assert.equal(
    isSupportedQueuedEffectConditionShape(effectBlock.condition),
    true,
  );
  assert.equal(isSupportedContinuousQueueEffect(effectBlock.effect), true);
  assert.equal(
    isSupportedWhenAttackingCompatibleQueuedEffect(effectBlock),
    true,
  );
});

test("cards parser emits conditional leader power permanent accepted by engine materialization", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[Your Turn] If you have 19 or more cards in your trash, your Leader gains +1000 power.",
    [
      "entry:yourTurn",
      "expression:conditionalContinuous",
      "condition:trashCount",
      "condition:comparator:gte",
      "instruction:modifyPower",
      "target:yourLeader",
      "duration:whileConditionTrue",
    ],
  );
  const definitionId = "cards-engine-contract:leader-power-permanent";

  assert.equal(effectBlock.category, "permanent");
  assert.equal(effectBlock.effect.type, "modifyPower");
  assert.equal(
    hasCombatSafeImplementedDslDefinition(
      {
        cardManifest: {
          effectDefinitions: {
            [definitionId]: {
              effects: [effectBlock],
            },
          },
        },
      },
      definitionId,
    ),
    true,
  );
});

test("cards parser emits On K.O. draw accepted by engine On K.O. support", () => {
  const effectBlock = parseSupportedEffectBlock("[On K.O.] Draw 1 card.", [
    "entry:onKO",
    "sourcePresence:resolveFromDestination",
    "instruction:draw",
  ]);

  assert.equal(isSupportedQueuedDrawEffectBlock(effectBlock), true);
  assert.equal(isSupportedOnKOCompatibleQueuedEffect(effectBlock), true);
});

test("cards parser emits On K.O. trash-from-hand accepted by engine On K.O. support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On K.O.] Trash 1 card from your hand.",
    [
      "entry:onKO",
      "sourcePresence:resolveFromDestination",
      "instruction:trashFromHand",
    ],
  );

  assert.equal(effectBlock.effect.type, "trashFromHand");
  assert.equal(isSupportedOnKOCompatibleQueuedEffect(effectBlock), true);
});

test("cards parser emits On Block draw accepted by generic auto support", () => {
  const cases = [["[On Block] Draw 1 card.", "entry:onBlock"]];

  for (const [text, entryEvidence] of cases) {
    const effectBlock = parseSupportedEffectBlock(text, [
      entryEvidence,
      "instruction:draw",
    ]);

    assertRuntimeSupported(effectBlock);
  }
});

test("cards parser emits end-of-your-turn draw accepted by generic auto support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[End of Your Turn] Draw 1 card.",
    ["entry:endOfYourTurn", "sourcePresence:mustRemain", "instruction:draw"],
  );

  assertRuntimeSupported(effectBlock);
});

test("cards parser emits event entry primitives without making them On Play effects", () => {
  const cases = [
    ["[Main] Draw 1 card.", "entry:eventMain"],
    ["[Counter] Draw 1 card.", "entry:eventCounter"],
  ];

  for (const [text, entryEvidence] of cases) {
    const effectBlock = parseSupportedEffectBlock(text, [
      entryEvidence,
      "instruction:draw",
    ]);

    assert.notEqual(effectBlock.trigger.type, "onPlay");
    assert.equal(
      isSupportedQueuedAutoSequenceForEntryPoint(
        effectBlock,
        "onPlay",
        "mustRemainInSameZone",
      ),
      false,
    );
  }
});

test("cards parser emits supported Event Main and Counter primitive blocks for runtime admission", () => {
  const cases = [
    "[Main] You may rest 1 of your DON!! cards: If your Leader is [Imu], K.O. up to 1 of your opponent's Stages with a cost of 7.",
    "[Counter] If your Leader is [Imu], up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    "[Main] You may rest 5 of your DON!! cards: If the only Characters on your field are {Celestial Dragons} type Characters, K.O. up to 1 of your opponent's Characters with a base cost of 6 or less.",
    "[Counter] Your Leader gains +3000 power during this battle.",
    "[Main] Look at 3 cards from the top of your deck; reveal up to 1 {Celestial Dragons} type card other than [The Five Elders Are at Your Service!!!] and add it to your hand. Then, trash the rest.",
    "[Trigger] Activate this card's [Main] effect.",
    "[Your Turn] The cost of playing {Celestial Dragons} type Character cards with a cost of 2 or more from your hand will be reduced by 1.",
  ];

  for (const text of cases) {
    const effectBlock = parseSupportedEffectBlock(text);

    assertRuntimeSupported(effectBlock, text);
  }
});

test("cards parser emits expanded leader, field-count, and replacement primitives accepted by engine admission", () => {
  const cases = [
    {
      text: "[Activate: Main] [Once Per Turn] If your opponent has a Character with 8000 power or more, this Character gains [Rush: Character] during this turn.",
      expected: ["entry:activateMain", "condition:opponentFieldCount"],
    },
    {
      text: "[On Play] If your Leader is [Sabo], [Portgas.D.Ace] or [Monkey.D.Luffy], look at 4 cards from the top of your deck; reveal up to 1 card with a cost of 3 or more and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
      expected: [
        "entry:onPlay",
        "condition:leaderIdentity",
        "filter:anyOf",
        "filter:cost",
      ],
    },
    {
      text: "[Your Turn] Your Leader gains [Double Attack] and +2000 power.",
      expected: ["entry:yourTurn", "modifier:positivePower"],
    },
    {
      text: "If one of your Characters would be removed from the field by your opponent's effect, you may K.O. this Character instead.",
      expected: ["entry:replacement", "instruction:ko", "target:thisCharacter"],
    },
    {
      text: 'If your Leader\'s card name includes "Ace" and you have 6 or more DON!! cards on your field, give this card in your hand −2 cost.',
      expected: [
        "condition:leaderIdentity",
        "condition:donFieldCount",
        "instruction:modifyCost",
        "modifier:costReduction",
      ],
    },
    {
      text: "[On Your Opponent's Attack] You may trash 1 Character card with 8000 power from your hand: Your Leader and this Character's base power becomes 7000 during this turn.",
      expected: [
        "entry:onOpponentAttack",
        "cost:trashFromHand",
        "instruction:setBasePower",
      ],
    },
    {
      text: 'If you have no Characters with a type including "Whitebeard Pirates" and a cost of 8 or more, give this Character −4000 power.',
      expected: [
        "condition:fieldCount",
        "filter:type",
        "filter:cost",
        "modifier:negativePower",
      ],
    },
  ];

  for (const { text, expected } of cases) {
    const effectBlock = parseSupportedEffectBlock(text, expected);

    assertRuntimeSupported(effectBlock, text);
  }
});

test("cards parser emits field-control primitives accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] Rest up to 1 of your opponent's Characters and that Character will not become active in your opponent's next Refresh Phase. Then, if your opponent has 2 or more rested Characters, your Leader gains +2000 power until the end of your opponent's next End Phase.",
    [
      "entry:onPlay",
      "instruction:rest",
      "reference:thatCharacter",
      "instruction:preventActivation",
      "condition:opponentFieldCount",
      "modifier:positivePower",
      "duration:opponentNextEndPhase",
    ],
  );
  const conditionalSegment = effectBlock.effect.effects.find(
    (segment) => segment.effect.type === "conditional",
  );

  assert.equal(effectBlock.effect.type, "sequence");
  assert.ok(conditionalSegment, "expected conditional segment");
  assert.equal(
    isSupportedQueuedEffectConditionShape(conditionalSegment.effect.if),
    true,
  );
  assert.equal(
    isSupportedQueuedAutoSequenceForEntryPoint(
      effectBlock,
      "onPlay",
      "mustRemainInSameZone",
    ),
    true,
  );
});

test("cards parser emits public top-of-deck type search accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    [
      "entry:onPlay",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "look:topDeck",
      "filter:type",
      "cardinality:upTo",
      "destination:hand",
      "reveal:bothPlayers",
      "remaining:bottomDeck",
      "order:anyOrder",
    ],
  );

  assert.equal(effectBlock.effect.type, "sequence");
  assert.deepEqual(
    effectBlock.effect.effects.map((segment) => segment.effect.type),
    [
      "revealTop",
      "selectFromSet",
      "revealSelected",
      "moveSelected",
      "placeSetRemainder",
    ],
  );
  const selectSegment = effectBlock.effect.effects.find(
    (segment) => segment.effect.type === "selectFromSet",
  );
  assert.deepEqual(selectSegment?.effect.filter, {
    typesAny: ["Five Elders"],
  });
  assert.equal(
    isSupportedQueuedAutoSequenceForEntryPoint(
      effectBlock,
      "onPlay",
      "mustRemainInSameZone",
    ),
    true,
  );
});

test("cards parser emits costed private search plus trash accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
    [
      "entry:onPlay",
      "cost:returnDon",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "look:topDeck",
      "filter:any",
      "reveal:chooserOnly",
      "remaining:bottomDeck",
      "instruction:trashFromHand",
    ],
  );

  assert.equal(effectBlock.effect.type, "sequence");
  const body = effectBlock.effect.effects[1]?.effect;
  assert.equal(body?.type, "sequence");
  assert.deepEqual(
    body.effects.map((segment) => segment.effect.type),
    [
      "revealTop",
      "selectFromSet",
      "moveSelected",
      "placeSetRemainder",
      "trashFromHand",
    ],
  );
  const revealSegment = body.effects.find(
    (segment) => segment.effect.type === "revealTop",
  );
  assert.equal(revealSegment?.effect.visibility, "chooserOnly");
  const selectSegment = body.effects.find(
    (segment) => segment.effect.type === "selectFromSet",
  );
  assert.deepEqual(selectSegment?.effect.filter, {});
  assert.equal(
    isSupportedQueuedAutoSequenceForEntryPoint(
      effectBlock,
      "onPlay",
      "mustRemainInSameZone",
    ),
    true,
  );
});

test("cards parser emits activate-main choose-one trash cost accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[Activate: Main] [Once Per Turn] You may trash 1 of your {Celestial Dragons} type Characters or 1 card from your hand: Draw 1 card.",
    [
      "entry:activateMain",
      "marker:oncePerTurn",
      "composition:optionalCostedEffect",
      "cost:chooseOne",
      "cost:trashFromField",
      "cost:trashFromHand",
      "filter:type",
      "filter:category:character",
      "instruction:draw",
    ],
  );

  assert.equal(effectBlock.category, "activate");
  assert.equal(effectBlock.trigger.type, "activateMain");
  assert.equal(
    isSupportedSequenceBlock(activateMainSequenceEntry, effectBlock),
    true,
  );
});

test("cards parser emits activate-main rest cost and dynamic hand play accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[Activate: Main] You may rest this card and 3 of your DON!! cards: Play up to 1 black {Five Elders} type Character card with a cost equal to or less than the number of DON!! cards on your field from your hand.",
    [
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:restSelf",
      "cost:restDon",
      "instruction:playSelected",
      "filter:color",
      "filter:type",
      "filter:category:character",
      "filter:cost",
      "valueSource:donFieldCount:self",
    ],
  );

  assert.equal(effectBlock.category, "activate");
  assert.equal(effectBlock.trigger.type, "activateMain");
  assert.equal(
    isSupportedSequenceBlock(activateMainSequenceEntry, effectBlock),
    true,
  );
});

test("cards parser emits start-of-game stage search and play-selected in engine setup shape", () => {
  const effectBlock = parseSupportedEffectBlock(
    "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
    [
      "entry:startOfGame",
      "deckRestriction:ignored",
      "deckRestriction:eventCostGte",
      "instruction:selectCards",
      "instruction:playSelected",
      "filter:type",
      "filter:category:stage",
      "destination:stageArea",
    ],
  );

  assert.equal(effectBlock.category, "auto");
  assert.equal(effectBlock.trigger.type, "startOfGame");
  assert.equal(effectBlock.sourcePresencePolicy, "noSourceRequired");
  assert.equal(effectBlock.effect.type, "sequence");
  assert.deepEqual(effectBlock.effect.effects[0]?.effect, {
    type: "selectCards",
    zone: "deck",
    player: "self",
    chooser: "self",
    filter: { categories: ["stage"], typesAny: ["Mary Geoise"] },
    min: 0,
    max: 1,
    saveAs: "selected:start-of-game",
    visibility: "chooserOnly",
  });
  assert.deepEqual(effectBlock.effect.effects[1]?.effect, {
    type: "playSelected",
    selection: "selected:start-of-game",
    ignoreCost: true,
  });
});

test("cards parser emits keyword-only permanent primitives accepted by engine materialization", () => {
  const effectBlock = parseSupportedEffectBlock(
    "If you have 7 or more cards in your trash, this Character gains [Blocker].",
    [
      "entry:implicitPermanent",
      "expression:conditionalContinuous",
      "condition:trashCount",
      "condition:comparator:gte",
      "instruction:giveKeyword",
      "target:thisCharacter",
      "keyword:anySupported",
    ],
  );
  const definitionId = "cards-engine-contract:keyword-permanent";

  assert.equal(effectBlock.effect.type, "giveKeyword");
  assert.equal(
    hasCombatSafeImplementedDslDefinition(
      {
        cardManifest: {
          effectDefinitions: {
            [definitionId]: {
              effects: [effectBlock],
            },
          },
        },
      },
      definitionId,
    ),
    true,
  );
});

test("cards parser emits protection-only permanent primitives accepted by broad engine materialization", () => {
  const effectBlock = parseSupportedEffectBlock(
    "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects.",
    [
      "entry:implicitPermanent",
      "expression:conditionalContinuous",
      "condition:trashCount",
      "condition:comparator:gte",
      "instruction:giveProtection",
      "target:thisCharacter",
      "protectionProcess:fieldRemoval",
      "protectionSource:opponentEffects",
    ],
  );
  const definitionId = "cards-engine-contract:protection-permanent";

  assert.equal(effectBlock.effect.type, "giveProtection");
  assert.equal(
    effectBlock.effect.protection.fieldRemoval.classification,
    "moveFromFieldToOtherZone",
  );
  assert.equal(
    hasCombatSafeImplementedDslDefinition(
      {
        cardManifest: {
          effectDefinitions: {
            [definitionId]: {
              effects: [effectBlock],
            },
          },
        },
      },
      definitionId,
    ),
    true,
  );
});

test("cards parser emits broad field-removal protection primitives accepted by engine materialization", () => {
  const effectBlock = parseSupportedEffectBlock(
    "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].",
    [
      "entry:implicitPermanent",
      "expression:conditionalContinuous",
      "condition:trashCount",
      "condition:comparator:gte",
      "instruction:giveProtection",
      "target:thisCharacter",
      "protectionProcess:fieldRemoval",
      "protectionSource:opponentEffects",
      "connector:andOrdered",
      "instruction:giveKeyword",
      "keyword:anySupported",
    ],
  );
  const protectionSegment = effectBlock.effect.effects.find(
    (segment) => segment.effect.type === "giveProtection",
  );
  const definitionId = "cards-engine-contract:permanent";

  assert.ok(protectionSegment, "expected field-removal protection segment");
  assert.equal(
    protectionSegment.effect.protection.fieldRemoval.classification,
    "moveFromFieldToOtherZone",
  );
  assert.equal(
    hasCombatSafeImplementedDslDefinition(
      {
        cardManifest: {
          effectDefinitions: {
            [definitionId]: {
              effects: [effectBlock],
            },
          },
        },
      },
      definitionId,
    ),
    true,
  );
});

test("cards parser emits any-player owner-hand return targets accepted by engine sequence gates", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] ① (You may rest the specified number of DON!! cards in your cost area.): Return up to 1 Character with a cost of 2 or less to the owner's hand.",
    [
      "entry:onPlay",
      "cost:restDon",
      "instruction:returnToOwnerHand",
      "player:any",
      "filter:category:character",
      "filter:cost",
      "destination:ownerHand",
      "composition:selectThenApply",
    ],
  );

  const body = effectBlock.effect.effects[1]?.effect;
  assert.equal(body?.type, "sequence");
  assert.equal(body.effects[0]?.effect.request.player, "anyPlayer");
  assert.equal(body.effects[1]?.effect.target.player, "anyPlayer");
  assertRuntimeSupported(effectBlock);
});

test("cards parser emits adjacent circled DON and rest-self costs accepted before search bodies", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[Activate: Main] ➀ (You may rest the specified number of DON!! cards in your cost area.) You may rest this Character: Look at 5 cards from the top of your deck; reveal up to 1 {Supernovas} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    [
      "entry:activateMain",
      "composition:costSequence",
      "cost:restDon",
      "cost:restSelf",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "filter:type",
      "remaining:bottomDeck",
    ],
  );

  assertRuntimeSupported(effectBlock);
});

test("cards parser emits return-cost into rested hand-play bodies accepted by engine", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] You may return 1 of your Characters to the owner's hand: Play up to 1 Character card with a cost of 5 or less from your hand rested.",
    [
      "entry:onPlay",
      "cost:returnToOwnerHand",
      "instruction:playSelected",
      "filter:category:character",
      "filter:cost",
      "state:rested",
      "composition:selectThenPlay",
    ],
  );

  assertRuntimeSupported(effectBlock);
});
