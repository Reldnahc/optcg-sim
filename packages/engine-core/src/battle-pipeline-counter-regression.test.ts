import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent, EngineResult, GameState } from "@optcg/types";

import { applyAction, getLegalActions } from "./actions.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { assertGameStateInvariants } from "./invariants.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  passCounterStep,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";

const assertStrictlyIncreasingSeq = (
  events: readonly EngineEvent[],
  label: string,
) => {
  for (let index = 1; index < events.length; index += 1) {
    const previous = must(events[index - 1], `${label} previous event`);
    const current = must(events[index], `${label} current event`);
    assert.ok(current.seq > previous.seq, `${label} seq must increase`);
  }
};

const assertAcceptedResult = (
  previousState: GameState,
  result: EngineResult,
  label: string,
) => {
  assert.equal(result.errors, undefined, `${label} should be accepted`);
  assert.notEqual(result.events.length, 0, `${label} should emit events`);
  assertStrictlyIncreasingSeq(result.events, `${label} result.events`);
  assert.equal(
    new Set(result.events.map((event) => event.id)).size,
    result.events.length,
    `${label} event ids should be unique`,
  );
  assert.deepEqual(
    result.state.eventJournal.slice(previousState.eventJournal.length),
    result.events,
    `${label} appended eventJournal suffix should match result.events`,
  );
  assertStrictlyIncreasingSeq(
    result.state.eventJournal,
    `${label} full eventJournal`,
  );
  // Legacy event ids are batch-scoped; global order is asserted by event seq.
  assertGameStateInvariants(result.state);
};

const runNoCounterLeaderAttackScript = () => {
  const state = setupAttackState();
  const attacker = must(state.players[p1], "p1").leader;
  const defender = must(state.players[p2], "p2").leader;
  const beforeLife = must(state.players[p2], "p2 before").life.length;
  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: defender.instanceId,
      cardId: defender.cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(state, opened, "no-counter leader attack open");
  const result = passCounterStep(opened.state, p2);
  assertAcceptedResult(opened.state, result, "no-counter leader attack");
  assert.equal(result.state.battle, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    must(result.state.players[p2], "p2 after").life.length,
    beforeLife - 1,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
  return result;
};

const runBlockerThenCounterScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const blocker = target;
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 4500,
  });
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 4000,
    }),
    printedKeywords: ["blocker"],
  };
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  blocker.state = "active";
  attacker.state = "active";
  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: must(p2State.leader, "p2 leader").instanceId,
      cardId: must(p2State.leader, "p2 leader").cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(state, opened, "blocker+counter declare");
  const blockDecision = must(opened.state.pendingDecision, "block decision");
  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: blockDecision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: blocker.instanceId,
          cardId: blocker.cardId,
          playerId: p2,
          zone: blocker.zone,
        },
      ],
    },
  });
  assertAcceptedResult(opened.state, blocked, "blocker resolution");
  assert.equal(blocked.state.battle?.step, "counter");
  const countered = applyAction(blocked.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: {
      instanceId: blocker.instanceId,
      cardId: blocker.cardId,
      playerId: p2,
      zone: blocker.zone,
    },
  });
  assertAcceptedResult(blocked.state, countered, "character counter");
  const pass = applyAction(countered.state, {
    type: "respondToDecision",
    decisionId: must(countered.state.pendingDecision, "counter decision").id,
    response: { type: "cards", cards: [] },
  });
  assertAcceptedResult(countered.state, pass, "counter pass");
  assert.equal(pass.state.battle, undefined);
  assert.equal(
    must(pass.state.players[p2], "p2 after").characters.some(
      (character) => character.instanceId === blocker.instanceId,
    ),
    true,
  );

  const controlState = setupAttackState();
  const controlP1 = must(controlState.players[p1], "control p1");
  const controlP2 = must(controlState.players[p2], "control p2");
  const controlAttacker = must(controlP1.characters[0], "control attacker");
  const controlBlocker = must(controlP2.characters[0], "control blocker");
  controlState.cardManifest.cards[controlAttacker.cardId] = resolvedCard({
    cardId: controlAttacker.cardId,
    category: "character",
    power: 4500,
  });
  controlState.cardManifest.cards[controlBlocker.cardId] = {
    ...resolvedCard({
      cardId: controlBlocker.cardId,
      category: "character",
      power: 4000,
    }),
    printedKeywords: ["blocker"],
  };
  controlBlocker.state = "active";
  controlAttacker.state = "active";
  const controlOpened = applyAction(controlState, {
    type: "declareAttack",
    attacker: {
      instanceId: controlAttacker.instanceId,
      cardId: controlAttacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: controlP2.leader.instanceId,
      cardId: controlP2.leader.cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(controlState, controlOpened, "blocker control declare");
  const controlBlocked = applyAction(controlOpened.state, {
    type: "respondToDecision",
    decisionId: must(controlOpened.state.pendingDecision, "control block").id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: controlBlocker.instanceId,
          cardId: controlBlocker.cardId,
          playerId: p2,
          zone: controlBlocker.zone,
        },
      ],
    },
  });
  assertAcceptedResult(
    controlOpened.state,
    controlBlocked,
    "blocker control resolution",
  );
  const controlPassed = passCounterStep(controlBlocked.state, p2);
  assertAcceptedResult(
    controlBlocked.state,
    controlPassed,
    "blocker control counter pass",
  );
  assert.equal(controlPassed.state.battle, undefined);
  assert.equal(
    controlPassed.events.some((event) => event.type === "cardKOd"),
    true,
  );
  assert.equal(
    must(controlPassed.state.players[p2], "control p2 after").characters.some(
      (character) => character.instanceId === controlBlocker.instanceId,
    ),
    false,
  );
  return [opened, blocked, countered, pass];
};

const runCounterPassScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(state, opened, "counter-pass declare");
  assert.equal(opened.state.battle?.step, "counter");
  const passed = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "pass decision").id,
    response: { type: "cards", cards: [] },
  });
  assertAcceptedResult(opened.state, passed, "counter-pass respond");
  assert.equal(passed.state.battle, undefined);
  assert.equal(
    passed.events.some((event) => event.type === "damageDealt"),
    true,
  );
  return [opened, passed];
};

const runCounterChangesOutcomeScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 4000,
  });
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 2000,
  });
  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(state, opened, "counter-outcome declare");
  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
      zone: target.zone,
    },
  });
  assertAcceptedResult(opened.state, countered, "counter-outcome counter");
  const passed = applyAction(countered.state, {
    type: "respondToDecision",
    decisionId: must(countered.state.pendingDecision, "counter decision").id,
    response: { type: "cards", cards: [] },
  });
  assertAcceptedResult(countered.state, passed, "counter-outcome pass");
  assert.equal(
    must(passed.state.players[p2], "p2 after").characters.some(
      (character) => character.instanceId === target.instanceId,
    ),
    true,
  );
  assert.equal(
    passed.events.some((event) => event.type === "cardKOd"),
    false,
  );

  const controlState = setupAttackState();
  const controlP1 = must(controlState.players[p1], "control p1");
  const controlP2 = must(controlState.players[p2], "control p2");
  const controlAttacker = must(controlP1.characters[0], "control attacker");
  const controlTarget = must(controlP2.characters[0], "control target");
  controlState.cardManifest.cards[controlAttacker.cardId] = resolvedCard({
    cardId: controlAttacker.cardId,
    category: "character",
    power: 5000,
  });
  controlState.cardManifest.cards[controlTarget.cardId] = resolvedCard({
    cardId: controlTarget.cardId,
    category: "character",
    power: 4000,
  });
  const control = applyAction(controlState, {
    type: "declareAttack",
    attacker: {
      instanceId: controlAttacker.instanceId,
      cardId: controlAttacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: controlTarget.instanceId,
      cardId: controlTarget.cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(controlState, control, "counter-outcome control");
  const controlPassed = passCounterStep(control.state, p2);
  assertAcceptedResult(
    control.state,
    controlPassed,
    "counter-outcome control pass",
  );
  assert.equal(
    controlPassed.events.some((event) => event.type === "cardKOd"),
    true,
  );
  assert.equal(
    must(controlPassed.state.players[p2], "control p2 after").characters.some(
      (character) => character.instanceId === controlTarget.instanceId,
    ),
    false,
  );
  return [opened, countered, passed];
};

const runBanishLeaderVsCharacterScript = () => {
  const leaderState = setupAttackState();
  const p1Leader = must(leaderState.players[p1], "p1");
  const p2Leader = must(leaderState.players[p2], "p2");
  const topLife = must(p2Leader.life[0], "life").card.instanceId;
  leaderState.cardManifest.cards[p1Leader.leader.cardId] = {
    ...resolvedCard({
      cardId: p1Leader.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };
  const leaderOpened = applyAction(leaderState, {
    type: "declareAttack",
    attacker: {
      instanceId: p1Leader.leader.instanceId,
      cardId: p1Leader.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2Leader.leader.instanceId,
      cardId: p2Leader.leader.cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(leaderState, leaderOpened, "banish leader damage open");
  const leaderDamage = passCounterStep(leaderOpened.state, p2);
  assertAcceptedResult(
    leaderOpened.state,
    leaderDamage,
    "banish leader damage",
  );
  assert.equal(
    must(leaderDamage.state.players[p2], "p2 after").trash.some(
      (card) => card.instanceId === topLife,
    ),
    true,
  );
  assert.equal(
    must(leaderDamage.state.players[p2], "p2 after").hand.some(
      (card) => card.instanceId === topLife,
    ),
    false,
  );

  const characterState = setupAttackState();
  const p1Character = must(characterState.players[p1], "p1");
  const p2Character = must(characterState.players[p2], "p2");
  const attacker = must(p1Character.characters[0], "attacker");
  const target = must(p2Character.characters[0], "target");
  const beforeLife = p2Character.life.length;
  characterState.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["banish"],
  });
  characterState.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });
  const characterOpened = applyAction(characterState, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(
    characterState,
    characterOpened,
    "banish character open",
  );
  const characterBattle = passCounterStep(characterOpened.state, p2);
  assertAcceptedResult(
    characterOpened.state,
    characterBattle,
    "banish character KO",
  );
  assert.equal(
    must(characterBattle.state.players[p2], "p2 after").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    false,
  );
  assert.equal(
    must(characterBattle.state.players[p2], "p2 after").life.length,
    beforeLife,
  );
  return [leaderDamage, characterBattle];
};

const runRushLegalityScript = () => {
  const rushState = setupAttackState();
  const p1Rush = must(rushState.players[p1], "p1");
  const p2Rush = must(rushState.players[p2], "p2");
  const rushAttacker = must(p1Rush.characters[0], "rush attacker");
  rushAttacker.turnPlayed = rushState.turn.globalTurn;
  rushState.cardManifest.cards[rushAttacker.cardId] = resolvedCard({
    cardId: rushAttacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["rush"],
  });
  const rushLegal = getLegalActions(rushState, p1);
  assert.equal(
    rushLegal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === rushAttacker.instanceId &&
        action.target.instanceId === p2Rush.leader.instanceId,
    ),
    true,
  );

  const rushCharacterState = setupAttackState();
  const p1RushCharacter = must(rushCharacterState.players[p1], "p1");
  const p2RushCharacter = must(rushCharacterState.players[p2], "p2");
  const attacker = must(
    p1RushCharacter.characters[0],
    "rushCharacter attacker",
  );
  const target = must(p2RushCharacter.characters[0], "rested target");
  attacker.turnPlayed = rushCharacterState.turn.globalTurn;
  rushCharacterState.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["rushCharacter"],
  });
  const rushCharacterLegal = getLegalActions(rushCharacterState, p1);
  assert.equal(
    rushCharacterLegal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === p2RushCharacter.leader.instanceId,
    ),
    false,
  );
  assert.equal(
    rushCharacterLegal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === target.instanceId,
    ),
    true,
  );
};

const runPlayerViewCounterPrivacyScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(state, opened, "player-view counter-step setup");
  assert.equal(opened.state.battle?.step, "counter");
  const p1View = filterStateForPlayer(opened.state, p1);
  const p2View = filterStateForPlayer(opened.state, p2);
  assert.equal(
    JSON.stringify(p1View).includes(String(counterCard.cardId)),
    false,
  );
  assert.equal(
    JSON.stringify(p1View).includes(String(counterCard.instanceId)),
    false,
  );
  assert.equal(
    p1View.legalActions.some((action) => action.type === "useCounter"),
    false,
  );
  assert.equal(
    p2View.legalActions.some((action) => action.type === "useCounter"),
    true,
  );
  assert.equal(
    p2View.legalActions.some((action) => action.type === "respondToDecision"),
    true,
  );
};

test("ENG-020: battle/counter pipeline regressions preserve expected behavior and determinism", () => {
  const scripts = [
    ["no-counter leader attack", () => [runNoCounterLeaderAttackScript()]],
    ["blocker then counter through damage", runBlockerThenCounterScript],
    ["counter pass reaches damage", runCounterPassScript],
    ["counter power changes outcome", runCounterChangesOutcomeScript],
    ["banish leader-vs-character split", runBanishLeaderVsCharacterScript],
  ] as const;

  for (const [name, script] of scripts) {
    const first = script();
    const second = script();
    assert.deepEqual(
      first.map((result) => ({
        seq: result.events.map((event) => event.seq),
        ids: result.events.map((event) => event.id),
        types: result.events.map((event) => event.type),
        stateHash: result.stateHash,
        journalHash: hashCanonicalStateValue(result.state),
      })),
      second.map((result) => ({
        seq: result.events.map((event) => event.seq),
        ids: result.events.map((event) => event.id),
        types: result.events.map((event) => event.type),
        stateHash: result.stateHash,
        journalHash: hashCanonicalStateValue(result.state),
      })),
      `${name} should be deterministic`,
    );
  }

  runRushLegalityScript();
  runPlayerViewCounterPrivacyScript();

  const unsupportedCounterEventState = setupAttackState();
  const counterEvent = must(
    must(unsupportedCounterEventState.players[p2], "p2").hand[0],
    "counter event",
  );
  unsupportedCounterEventState.cardManifest.cards[counterEvent.cardId] =
    resolvedCard({
      cardId: counterEvent.cardId,
      category: "event",
      effectText: "[Counter] Draw 1 card.",
    });
  const unsupported = applyAction(unsupportedCounterEventState, {
    type: "declareAttack",
    attacker: {
      instanceId: must(unsupportedCounterEventState.players[p1], "p1").leader
        .instanceId,
      cardId: must(unsupportedCounterEventState.players[p1], "p1").leader
        .cardId,
      playerId: p1,
    },
    target: {
      instanceId: must(unsupportedCounterEventState.players[p2], "p2").leader
        .instanceId,
      cardId: must(unsupportedCounterEventState.players[p2], "p2").leader
        .cardId,
      playerId: p2,
    },
  });
  const unsupportedError = must(unsupported.errors?.[0], "unsupported error");
  assert.equal(unsupportedError.type, "illegalAction");
  assert.equal(
    unsupportedError.reason,
    "Counter Events are unsupported in the Counter Step.",
  );
  assert.equal(
    unsupported.state.battle,
    undefined,
    "unsupported continuation should fail closed before battle starts",
  );
});
