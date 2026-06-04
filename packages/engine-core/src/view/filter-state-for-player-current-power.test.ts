import assert from "node:assert/strict";
import { test } from "vitest";

import type { ContinuousEffectRecord } from "@optcg/types";

import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import {
  cardRef,
  continuousEffectRecord,
  continuousKeywordEffectRecord,
  setupAttackState,
  withWhenAttackingDrawEffect,
} from "../battle/test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

test("projects computed current power only for public board card views", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  const p1Character = must(p1State.characters[0], "p1 character");
  const p2Character = must(p2State.characters[0], "p2 character");
  withWhenAttackingDrawEffect(state, p1Character);
  must(p1State.life[0], "p1 face-up life").faceUp = true;
  const p1TrashCard = must(p1State.hand.shift(), "p1 hand -> trash");
  p1TrashCard.zone = { zone: "trash", playerId: p1, slot: "trash", index: 0 };
  p1State.trash.push(p1TrashCard);
  const p1Stage = must(p1State.hand.shift(), "p1 hand -> stage");
  p1Stage.zone = { zone: "stageArea", playerId: p1, slot: "stage", index: 0 };
  p1State.stage = p1Stage;
  state.cardManifest.cards[p1Stage.cardId] = resolvedCard({
    cardId: p1Stage.cardId,
    category: "stage",
    cost: 0,
  });
  const attachedDon = must(p1State.donDeck.shift(), "p1 DON -> attached");
  p1State.leader.attachedDon.push(attachedDon.instanceId);
  const costDon = must(p1State.donDeck.shift(), "p1 DON -> cost");
  costDon.zone = { zone: "costArea", playerId: p1, slot: "cost", index: 0 };
  costDon.state = "active";
  p1State.costArea.push(costDon);
  state.continuousEffects = [
    continuousEffectRecord(state, "player-view-leader-power", {
      type: "permanent",
    }),
    continuousKeywordEffectRecord(
      state,
      "player-view-character-keyword",
      p1Character,
      "blocker",
      { duration: { type: "permanent" } },
    ),
    {
      ...continuousKeywordEffectRecord(
        state,
        "player-view-character-cannot-attack",
        p1Character,
        "blocker",
        { duration: { type: "permanent" } },
      ),
      modifier: {
        layer: "restriction",
        target: { type: "self" },
        operation: { type: "restriction", restriction: "cannotAttack" },
      },
    },
    {
      ...continuousKeywordEffectRecord(
        state,
        "player-view-leader-no-blocker",
        p1State.leader,
        "blocker",
        { duration: { type: "permanent" } },
      ),
      modifier: {
        layer: "restriction",
        target: { type: "self" },
        operation: {
          type: "restriction",
          restriction: "preventBlockerActivation",
        },
      },
    },
  ];

  const beforeLeaderPower = must(
    state.cardManifest.cards[p1State.leader.cardId],
    "p1 leader manifest",
  ).power;
  const view = filterStateForPlayer(state, p1);

  assert.equal(view.self.leader.currentPower, 7000);
  assert.deepEqual(view.self.leader.restrictions, ["no-blocker"]);
  assert.equal(view.self.leader.printedPower, 5000);
  assert.equal(must(view.self.characters[0], "self char").currentPower, 7000);
  assert.equal(must(view.self.characters[0], "self char").printedPower, 7000);
  assert.deepEqual(must(view.self.characters[0], "self char").keywords, [
    "blocker",
  ]);
  assert.deepEqual(
    (
      must(view.self.characters[0], "self char") as {
        restrictions?: string[];
      }
    ).restrictions,
    ["cannot-attack"],
  );
  assert.equal(view.opponent.leader.currentPower, 5000);
  assert.equal(
    must(view.opponent.characters[0], "opponent char").currentPower,
    3000,
  );
  assert.deepEqual(
    [
      view.self.leader.instanceId,
      must(view.self.characters[0], "self character").instanceId,
      must(view.opponent.characters[0], "opponent character").instanceId,
    ],
    [p1State.leader.instanceId, p1Character.instanceId, p2Character.instanceId],
  );
  assert.deepEqual(
    [
      must(view.self.hand[0], "self hand"),
      must(view.self.trash[0], "self trash"),
      must(view.self.costArea[0], "self cost"),
      must(view.self.life.faceUpCards[0], "self face-up life"),
      must(view.self.stage, "self stage"),
    ].map((card) => "currentPower" in card),
    [false, false, false, false, false],
  );
  assert.equal(
    state.cardManifest.cards[p1State.leader.cardId]?.power,
    beforeLeaderPower,
  );
  assert.equal(JSON.stringify(view).includes("continuousEffects"), false);
  assert.equal(JSON.stringify(view).includes("sourceSnapshot"), false);

  state.cardManifest.cards[p1State.leader.cardId] = {
    ...must(
      state.cardManifest.cards[p1State.leader.cardId],
      "p1 leader metadata",
    ),
    support: {
      ...must(
        state.cardManifest.cards[p1State.leader.cardId],
        "p1 leader metadata",
      ).support,
      status: "implemented-dsl",
    },
    printedKeywords: ["doubleAttack"],
  };
  const doubleAttackView = filterStateForPlayer(state, p1);
  assert.equal(
    doubleAttackView.self.leader.instanceId,
    p1State.leader.instanceId,
  );
  assert.equal(doubleAttackView.self.leader.currentPower, 7000);
  assert.deepEqual(doubleAttackView.self.leader.keywords, ["doubleAttack"]);
  assert.equal(
    "keywords" in must(doubleAttackView.self.hand[0], "self hand"),
    false,
  );
  assert.equal(
    "restrictions" in must(doubleAttackView.self.hand[0], "self hand"),
    false,
  );
});

test("projects setBasePower modifiers as current power in public board card views", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1 state");
  const character = must(p1State.characters[0], "p1 character");
  const metadata = must(
    state.cardManifest.cards[character.cardId],
    "character metadata",
  );
  state.cardManifest.cards[character.cardId] = {
    ...metadata,
    power: 5000,
    types: ["Five Elders"],
    support: {
      ...metadata.support,
      status: "unsupported",
    },
  };
  state.continuousEffects = [
    {
      id: "player-view-base-power-set",
      source: cardRef(p1State.leader, p1),
      sourceSnapshot: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: p1State.leader.zone,
        category: "leader",
        colors: ["red"],
        power: 5000,
        keywords: [],
      },
      controller: p1,
      modifier: {
        layer: "basePowerSet",
        target: {
          type: "all",
          player: "self",
          zone: "characterArea",
          filter: { categories: ["character"], typesAny: ["Five Elders"] },
        },
        operation: { type: "setBasePower", value: 7000 },
      },
      duration: { type: "permanent" },
      createdBy: { type: "ruleProcess", name: "player-view-test" },
      createdAtStateSeq: state.seq,
    },
  ];

  const view = filterStateForPlayer(state, p1);

  assert.equal(must(view.self.characters[0], "self char").currentPower, 7000);
  assert.equal(must(view.self.characters[0], "self char").printedPower, 5000);
  assert.equal(
    must(view.opponent.characters[0], "opponent char").currentPower,
    3000,
  );
});

test("projects computed current cost only for public board card views", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1 state");
  const character = must(p1State.characters[0], "p1 character");
  const metadata = must(
    state.cardManifest.cards[character.cardId],
    "character metadata",
  );
  state.cardManifest.cards[character.cardId] = {
    ...metadata,
    cost: 3,
    power: 5000,
  };
  const record: ContinuousEffectRecord = {
    id: "player-view-cost-add",
    source: cardRef(p1State.leader, p1),
    sourceSnapshot: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: p1State.leader.zone,
      category: "leader",
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "costAdd",
      target: {
        type: "exactCard",
        card: cardRef(character, p1),
        binding: { family: "selectedTargets", saveResultAs: "costTarget" },
        createdAtStateSeq: state.seq,
      },
      operation: { type: "addCost", value: 2 },
    },
    duration: { type: "permanent" },
    createdBy: { type: "ruleProcess", name: "player-view-cost-test" },
    createdAtStateSeq: state.seq,
  };
  state.continuousEffects = [record];

  const view = filterStateForPlayer(state, p1);

  const selfCharacter = must(view.self.characters[0], "self char");
  assert.equal(selfCharacter.printedCost, 3);
  assert.equal(selfCharacter.currentCost, 5);
  assert.equal("currentCost" in must(view.self.hand[0], "self hand"), false);
  if (view.self.costArea[0] !== undefined) {
    assert.equal("currentCost" in view.self.costArea[0], false);
  }
});

test("projects player-level DON activation restrictions separately from card restrictions", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1 state");
  const source = p1State.leader;
  const record: ContinuousEffectRecord = {
    id: "player-view-don-activation-restriction",
    source: cardRef(source, p1),
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "leader",
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "restriction",
      target: { type: "player", player: "self" },
      operation: {
        type: "restriction",
        restriction: "cannotActivateDon",
        sourceCategories: ["character"],
      },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "player-view-test" },
    createdAtStateSeq: state.seq,
  };
  state.continuousEffects = [record];

  const p1View = filterStateForPlayer(state, p1);
  const p2View = filterStateForPlayer(state, p2);

  assert.deepEqual(p1View.self.restrictions, ["no-character-don-refresh"]);
  assert.deepEqual(p1View.opponent.restrictions, undefined);
  assert.deepEqual(p2View.opponent.restrictions, ["no-character-don-refresh"]);
});
