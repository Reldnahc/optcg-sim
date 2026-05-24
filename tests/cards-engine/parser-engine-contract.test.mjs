import assert from "node:assert/strict";
import { test } from "vitest";

import { parseCardEffectLine } from "../../packages/cards/src/card-effect-line-parser.ts";
import {
  isSupportedNoChoiceOnPlayDrawEffect,
  isSupportedNoChoiceOnKODrawEffect,
  isSupportedNoChoiceWhenAttackingDrawEffect,
} from "../../packages/engine-core/src/effect-runtime.ts";
import {
  hasCombatSafeImplementedDslDefinition,
  isSupportedContinuousQueueEffect,
} from "../../packages/engine-core/src/effect-runtime-continuous.ts";
import { isSupportedQueuedEffectConditionShape } from "../../packages/engine-core/src/effect-runtime-conditions.ts";
import {
  isSupportedQueuedAutoSequenceForEntryPoint,
  isSupportedSequenceBlock,
} from "../../packages/engine-core/src/effect-runtime-sequence-support.ts";
import { createSupportedSearchRevealTransientSet } from "../../packages/engine-core/src/effect-runtime-search-reveal.ts";
import { isSupportedWhenAttackingCompatibleQueuedEffect } from "../../packages/engine-core/src/effect-runtime-trigger-queueing-attack.ts";
import { isSupportedOnKOCompatibleQueuedEffect } from "../../packages/engine-core/src/effect-runtime-trigger-queueing-ko.ts";
import {
  createActiveState,
  queueDrawForP1,
} from "../../packages/engine-core/src/effect-runtime-queue-processing-test-support.ts";

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

const activateMainSequenceEntry = {
  id: "queue-entry:activate-main:cards-engine-contract",
  state: "pending",
  timingWindowId: "timing-window:activate-main:cards-engine-contract",
  generation: 0,
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

  assert.equal(isSupportedNoChoiceOnPlayDrawEffect(effectBlock), true);
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

  assert.equal(isSupportedNoChoiceWhenAttackingDrawEffect(effectBlock), true);
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

test("cards parser emits On K.O. draw accepted by engine On K.O. support", () => {
  const effectBlock = parseSupportedEffectBlock("[On K.O.] Draw 1 card.", [
    "entry:onKO",
    "sourcePresence:resolveFromDestination",
    "instruction:draw",
  ]);

  assert.equal(isSupportedNoChoiceOnKODrawEffect(effectBlock), true);
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

test("cards parser keeps recognized unsupported entry points out of engine support", () => {
  const cases = [
    ["[On Block] Draw 1 card.", "entry:onBlock"],
    ["[End of Your Turn] Draw 1 card.", "entry:endOfYourTurn"],
    ["[Main] Draw 1 card.", "entry:eventMain"],
    ["[Counter] Draw 1 card.", "entry:eventCounter"],
  ];

  for (const [text, entryEvidence] of cases) {
    const effectBlock = parseSupportedEffectBlock(text, [
      entryEvidence,
      "entrySupport:unsupported",
      "instruction:draw",
    ]);

    assert.equal(isSupportedNoChoiceOnPlayDrawEffect(effectBlock), false);
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

test("cards parser emits planned field-effect primitives while current engine support fails closed", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] Rest up to 1 of your opponent's Characters and that Character will not become active in your opponent's next Refresh Phase. Then, if your opponent has 2 or more rested Characters, your Leader gains +2000 power until the end of your opponent's next End Phase.",
    [
      "entry:onPlay",
      "instructionSupport:planned",
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
  assert.ok(conditionalSegment, "expected planned conditional segment");
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
    false,
  );
});

test("cards parser emits top-of-deck type search accepted by engine search-reveal support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    [
      "entry:onPlay",
      "instruction:search",
      "look:topDeck",
      "filter:type",
      "cardinality:upTo",
      "destination:hand",
      "reveal:bothPlayers",
      "remaining:bottomDeck",
      "order:anyOrder",
    ],
  );

  assert.equal(effectBlock.effect.type, "search");
  assert.deepEqual(effectBlock.effect.request.filter, {
    typesAny: ["Five Elders"],
  });
  const result = createSupportedSearchRevealTransientSet(
    createActiveState(),
    queueDrawForP1(),
    effectBlock.effect,
  );
  assert.equal(result.ok, true);
});

test("cards parser emits costed private search plus trash accepted by engine sequence support", () => {
  const effectBlock = parseSupportedEffectBlock(
    "[On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
    [
      "entry:onPlay",
      "cost:returnDon",
      "instruction:search",
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
  const searchSegment = body.effects.find(
    (segment) => segment.effect.type === "search",
  );
  assert.ok(searchSegment, "expected search segment after DON cost");
  assert.equal(searchSegment.effect.request.revealTo, "chooserOnly");
  assert.deepEqual(searchSegment.effect.request.filter, {});
  assert.equal(
    createSupportedSearchRevealTransientSet(
      createActiveState(),
      queueDrawForP1(),
      searchSegment.effect,
    ).ok,
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

test("cards parser emits start-of-game stage search and play-selected in engine setup shape", () => {
  const effectBlock = parseSupportedEffectBlock(
    "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
    [
      "entry:startOfGame",
      "deckRestriction:ignored",
      "deckRestriction:eventCostGte",
      "instruction:search",
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
  assert.deepEqual(effectBlock.effect.effects[0]?.effect.request, {
    zone: "deck",
    player: "self",
    filter: { categories: ["stage"], typesAny: ["Mary Geoise"] },
    min: 0,
    max: 1,
    destination: "stageArea",
    revealTo: "chooserOnly",
    shuffleAfter: false,
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
