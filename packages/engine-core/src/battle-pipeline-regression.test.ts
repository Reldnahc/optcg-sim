import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  EffectDefinition,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  getLegalActions,
  resolveSupportedVanillaBattle,
} from "./actions.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { assertGameStateInvariants } from "./invariants.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  setupAttackState,
  withOnKODrawEffect,
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
  assert.equal(
    new Set(result.state.eventJournal.map((event) => event.id)).size,
    result.state.eventJournal.length,
    `${label} full eventJournal event ids should be unique`,
  );
  assertGameStateInvariants(result.state);
};

const cleanupEventIndex = (events: readonly EngineEvent[], label: string) => {
  const index = events.findIndex((event) => {
    const payload = event.payload as Partial<{
      battleCleared: boolean;
      systemStep: string;
    }>;
    return (
      event.type === "effectResolved" &&
      payload.systemStep === "endBattle" &&
      payload.battleCleared === true
    );
  });
  assert.notEqual(index, -1, `${label} should emit End of Battle cleanup`);
  return index;
};

const lastEventIndex = (
  events: readonly EngineEvent[],
  type: EngineEvent["type"],
  label: string,
) => {
  const index = events.findLastIndex((event) => event.type === type);
  assert.notEqual(index, -1, `${label} should emit ${type}`);
  return index;
};

const assertCleanupAfterEventTypes = (
  result: EngineResult,
  eventTypes: readonly EngineEvent["type"][],
  label: string,
) => {
  const cleanupIndex = cleanupEventIndex(result.events, label);
  for (const type of eventTypes) {
    assert.ok(
      cleanupIndex > lastEventIndex(result.events, type, label),
      `${label} cleanup should be after ${type}`,
    );
  }
};

const assertNoBattleContextAfterCleanup = (
  previousState: GameState,
  result: EngineResult,
  label: string,
  eventTypesBeforeCleanup: readonly EngineEvent["type"][],
) => {
  assertAcceptedResult(previousState, result, label);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  assertCleanupAfterEventTypes(result, eventTypesBeforeCleanup, label);
};

const assertJournalEventOrder = (
  state: GameState,
  earlierType: EngineEvent["type"],
  laterType: EngineEvent["type"],
  label: string,
) => {
  const earlierIndex = lastEventIndex(state.eventJournal, earlierType, label);
  const laterIndex = lastEventIndex(state.eventJournal, laterType, label);
  assert.ok(
    laterIndex > earlierIndex,
    `${label} ${laterType} should be after ${earlierType} in eventJournal`,
  );
};

const assertNoCleanupEvent = (result: EngineResult, label: string) => {
  assert.equal(
    result.events.some((event) => {
      const payload = event.payload as Partial<{
        battleCleared: boolean;
        systemStep: string;
      }>;
      return (
        event.type === "effectResolved" &&
        payload.systemStep === "endBattle" &&
        payload.battleCleared === true
      );
    }),
    false,
    `${label} should not clear battle while a decision is pending`,
  );
};

const resultSignature = (result: EngineResult) => ({
  seq: result.events.map((event) => event.seq),
  ids: result.events.map((event) => event.id),
  types: result.events.map((event) => event.type),
  stateHash: result.stateHash,
  journalHash: hashCanonicalStateValue(result.state),
});

const assertRepeatedScriptStable = (
  name: string,
  script: () => readonly EngineResult[],
) => {
  assert.deepEqual(
    script().map(resultSignature),
    script().map(resultSignature),
    `${name} repeated script state hashes and event ordering should be stable`,
  );
};

const effectDefinition = (
  cardId: CardId,
  trigger: EffectDefinition["effects"][number]["trigger"],
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: `${String(cardId)}:effect:1` as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger,
      optional: false,
      oncePerTurn: false,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "draw",
        count: 1,
        player: "self",
      },
    },
  ],
  metadata: {
    sourceTextHash: "source-hash",
    rulesVersion: "r1",
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "qa-reviewer",
  },
});

const setupEng027dSupportedOnKOBattle = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-027D p1");
  const p2State = must(state.players[p2], "ENG-027D p2");
  const attacker = must(p1State.characters[0], "ENG-027D attacker");
  const target = must(p2State.characters[0], "ENG-027D target");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  const definition = withOnKODrawEffect(
    state,
    target,
    "def-eng-027d-on-ko-draw",
  );
  state.battle = {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    step: "counter",
    damageCount: 1,
  };
  return {
    state,
    target,
    onKOEffect: must(definition.effects[0], "ENG-027D On K.O. effect"),
  };
};

const effectEventIndex = (
  events: readonly EngineEvent[],
  eventType: "effectQueued" | "effectResolved",
  effectBlockId: string,
  label: string,
) => {
  const index = events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return event.type === eventType && payload.effectBlockId === effectBlockId;
  });
  assert.notEqual(index, -1, `${label} should emit ${eventType}`);
  return index;
};

const assertNoEng027dRuntimeResidue = (state: GameState, label: string) => {
  assert.equal(state.battle, undefined, `${label} battle context`);
  assert.equal(state.pendingDecision, undefined, `${label} pending decision`);
  assert.deepEqual(state.effectQueue, [], `${label} effect queue`);
  assert.deepEqual(state.deferredTriggers, [], `${label} deferred triggers`);
  assert.equal(
    JSON.stringify(state).includes('"type":"thisBattle"'),
    false,
    `${label} thisBattle modifiers`,
  );
  assert.equal(
    JSON.stringify(state).includes("counterPower"),
    false,
    `${label} stale battle counter power`,
  );
};

const runEng027dSupportedOnKOBattleScript = () => {
  const { state, target, onKOEffect } = setupEng027dSupportedOnKOBattle();
  const beforeP2 = must(state.players[p2], "ENG-027D p2 before");
  const beforeDeck = beforeP2.deck.length;
  const beforeHand = beforeP2.hand.length;

  const result = resolveSupportedVanillaBattle(state);

  assertNoBattleContextAfterCleanup(
    state,
    result,
    "ENG-027D supported On K.O. trigger cleanup",
    ["damageDealt", "cardKOd", "cardMoved", "effectQueued", "cardDrawn"],
  );
  assertNoEng027dRuntimeResidue(result.state, "ENG-027D supported On K.O.");
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));

  const damageDealtIndex = lastEventIndex(
    result.events,
    "damageDealt",
    "ENG-027D supported On K.O.",
  );
  const cardKOdIndex = lastEventIndex(
    result.events,
    "cardKOd",
    "ENG-027D supported On K.O.",
  );
  const battleCardMovedIndex = result.events.findIndex((event) => {
    const payload = event.payload as Partial<{
      instanceId: string;
      reason: string;
    }>;
    return (
      event.type === "cardMoved" &&
      payload.instanceId === target.instanceId &&
      payload.reason === "ko"
    );
  });
  assert.notEqual(
    battleCardMovedIndex,
    -1,
    "ENG-027D supported On K.O. should move K.O.'d card",
  );
  const effectQueuedIndex = effectEventIndex(
    result.events,
    "effectQueued",
    onKOEffect.id,
    "ENG-027D supported On K.O.",
  );
  const effectResolvedIndex = effectEventIndex(
    result.events,
    "effectResolved",
    onKOEffect.id,
    "ENG-027D supported On K.O.",
  );
  const cleanupIndex = cleanupEventIndex(
    result.events,
    "ENG-027D supported On K.O.",
  );

  assert.ok(damageDealtIndex < cardKOdIndex);
  assert.ok(cardKOdIndex < battleCardMovedIndex);
  assert.ok(battleCardMovedIndex < effectQueuedIndex);
  assert.ok(effectQueuedIndex < effectResolvedIndex);
  assert.ok(effectResolvedIndex < cleanupIndex);

  const p2After = must(result.state.players[p2], "ENG-027D p2 after");
  assert.equal(
    p2After.characters.some(
      (character) => character.instanceId === target.instanceId,
    ),
    false,
  );
  assert.equal(
    p2After.trash.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(p2After.deck.length, beforeDeck - 1);
  assert.equal(p2After.hand.length, beforeHand + 1);

  return [result] as const;
};

const runNoCounterLeaderAttackScript = () => {
  const state = setupAttackState();
  const attacker = must(state.players[p1], "p1").leader;
  const defender = must(state.players[p2], "p2").leader;
  const beforeLife = must(state.players[p2], "p2 before").life.length;
  const result = applyAction(state, {
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
  assertAcceptedResult(state, result, "no-counter leader attack");
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
  assert.equal(controlBlocked.state.battle, undefined);
  assert.equal(
    controlBlocked.events.some((event) => event.type === "cardKOd"),
    true,
  );
  assert.equal(
    must(controlBlocked.state.players[p2], "control p2 after").characters.some(
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
  assert.equal(
    control.events.some((event) => event.type === "cardKOd"),
    true,
  );
  assert.equal(
    must(control.state.players[p2], "control p2 after").characters.some(
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
  const leaderDamage = applyAction(leaderState, {
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
  assertAcceptedResult(leaderState, leaderDamage, "banish leader damage");
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
  const characterBattle = applyAction(characterState, {
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
  assertAcceptedResult(characterState, characterBattle, "banish character KO");
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

const runEng021cBlockerCleanupScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-021C block p1");
  const p2State = must(state.players[p2], "ENG-021C block p2");
  const blocker = must(p2State.characters[0], "ENG-021C blocker");
  blocker.state = "active";
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };

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
  assertAcceptedResult(state, opened, "ENG-021C pending Block Step");
  const blockBattle = must(opened.state.battle, "ENG-021C block battle");
  const blockDecision = must(
    opened.state.pendingDecision,
    "ENG-021C block decision",
  );
  assert.equal(blockBattle.step, "block");
  assert.equal(blockBattle.blocker, undefined);
  assert.equal(blockDecision.playerId, p2);
  assertNoCleanupEvent(opened, "ENG-021C pending Block Step");

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
  assertNoBattleContextAfterCleanup(
    opened.state,
    blocked,
    "ENG-021C blocker K.O. cleanup",
    ["blockerActivated", "damageDealt", "cardKOd", "cardMoved"],
  );
  assert.equal(
    must(blocked.state.players[p2], "ENG-021C blocked p2").characters.some(
      (character) => character.instanceId === blocker.instanceId,
    ),
    false,
  );

  return [opened, blocked] as const;
};

const runEng021cCounterNoDamageCleanupScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-021C counter p1");
  const p2State = must(state.players[p2], "ENG-021C counter p2");
  const counterCard = must(p2State.hand[0], "ENG-021C counter card");
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
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
  assertAcceptedResult(state, opened, "ENG-021C pending Counter Step");
  const counterBattle = must(
    opened.state.battle,
    "ENG-021C pending counter battle",
  );
  const counterDecision = must(
    opened.state.pendingDecision,
    "ENG-021C pending counter decision",
  );
  assert.equal(counterBattle.step, "counter");
  assert.equal(counterDecision.playerId, p2);
  assertNoCleanupEvent(opened, "ENG-021C pending Counter Step");

  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: counterBattle.currentTarget,
  });
  assertAcceptedResult(opened.state, countered, "ENG-021C counter use");
  assert.equal(countered.state.battle?.step, "counter");
  assert.equal(countered.state.pendingDecision?.id, counterDecision.id);
  assertNoCleanupEvent(countered, "ENG-021C counter use");

  const passed = applyAction(countered.state, {
    type: "respondToDecision",
    decisionId: must(
      countered.state.pendingDecision,
      "ENG-021C counter decision",
    ).id,
    response: { type: "cards", cards: [] },
  });
  assertNoBattleContextAfterCleanup(
    countered.state,
    passed,
    "ENG-021C no-damage comparison cleanup",
    ["decisionResolved"],
  );
  assert.equal(
    passed.events.some((event) =>
      ["damageDealt", "lifeTaken", "cardKOd", "cardMoved"].includes(event.type),
    ),
    false,
  );
  assertJournalEventOrder(
    passed.state,
    "counterUsed",
    "effectResolved",
    "ENG-021C no-damage comparison cleanup",
  );

  return [opened, countered, passed] as const;
};

const runEng021cLeaderDamageCleanupScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-021C damage p1");
  const p2State = must(state.players[p2], "ENG-021C damage p2");
  const beforeLife = p2State.life.length;

  const damaged = applyAction(state, {
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
  assertNoBattleContextAfterCleanup(
    state,
    damaged,
    "ENG-021C leader damage cleanup",
    ["damageDealt", "lifeTaken", "cardMoved"],
  );
  assert.equal(
    must(damaged.state.players[p2], "ENG-021C damaged p2").life.length,
    beforeLife - 1,
  );

  return [damaged] as const;
};

test("ENG-021C: battle context is retained while pending and cleared only after supported cleanup", () => {
  assertRepeatedScriptStable(
    "ENG-021C Block Step blocker K.O.",
    runEng021cBlockerCleanupScript,
  );
  assertRepeatedScriptStable(
    "ENG-021C Counter Step no-damage comparison",
    runEng021cCounterNoDamageCleanupScript,
  );
  assertRepeatedScriptStable(
    "ENG-021C Leader damage",
    runEng021cLeaderDamageCleanupScript,
  );
});

const runEng021dVanillaLeaderDamageCleanupScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-021D damage p1");
  const p2State = must(state.players[p2], "ENG-021D damage p2");
  const topLife = must(p2State.life[0], "ENG-021D top life").card.instanceId;
  const beforeLife = p2State.life.length;

  const damaged = applyAction(state, {
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
  assertNoBattleContextAfterCleanup(
    state,
    damaged,
    "ENG-021D vanilla Leader damage cleanup",
    ["damageDealt", "lifeTaken", "cardMoved"],
  );
  assert.equal(
    must(damaged.state.players[p2], "ENG-021D damaged p2").life.length,
    beforeLife - 1,
  );
  assert.equal(
    must(damaged.state.players[p2], "ENG-021D damaged p2").hand.some(
      (card) => card.instanceId === topLife,
    ),
    true,
  );

  return [damaged] as const;
};

const runEng021dCharacterKoCleanupScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-021D character p1");
  const p2State = must(state.players[p2], "ENG-021D character p2");
  const attacker = must(p1State.characters[0], "ENG-021D attacker");
  const target = must(p2State.characters[0], "ENG-021D target");
  const beforeLife = p2State.life.length;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });

  const knockedOut = applyAction(state, {
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
  assertNoBattleContextAfterCleanup(
    state,
    knockedOut,
    "ENG-021D Character K.O. cleanup",
    ["damageDealt", "cardKOd", "cardMoved"],
  );
  assert.equal(
    must(knockedOut.state.players[p2], "ENG-021D K.O. p2").characters.some(
      (character) => character.instanceId === target.instanceId,
    ),
    false,
  );
  assert.equal(
    must(knockedOut.state.players[p2], "ENG-021D K.O. p2").trash.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );
  assert.equal(
    must(knockedOut.state.players[p2], "ENG-021D K.O. p2").life.length,
    beforeLife,
  );

  return [knockedOut] as const;
};

const runEng021dBlockerRedirectCleanupScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-021D block p1");
  const p2State = must(state.players[p2], "ENG-021D block p2");
  const attacker = p1State.leader;
  const blocker = must(p2State.characters[0], "ENG-021D blocker");
  blocker.state = "active";
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };

  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assertAcceptedResult(state, opened, "ENG-021D pending Block Step");
  const openedBattle = must(
    opened.state.battle,
    "ENG-021D opened block battle",
  );
  assert.equal(openedBattle.step, "block");
  assert.equal(
    openedBattle.currentTarget.instanceId,
    p2State.leader.instanceId,
  );
  assertNoCleanupEvent(opened, "ENG-021D pending Block Step");

  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "ENG-021D block decision")
      .id,
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
  assertNoBattleContextAfterCleanup(
    opened.state,
    blocked,
    "ENG-021D blocker redirection cleanup",
    [
      "decisionResolved",
      "blockerActivated",
      "damageDealt",
      "cardKOd",
      "cardMoved",
    ],
  );
  assertJournalEventOrder(
    blocked.state,
    "blockerActivated",
    "damageDealt",
    "ENG-021D blocker redirection cleanup",
  );
  const blockerEvent = must(
    blocked.events.find((event) => event.type === "blockerActivated"),
    "ENG-021D blocker event",
  );
  const blockerPayload = blockerEvent.payload as Partial<{
    previousTarget: { instanceId: string };
    currentTarget: { instanceId: string };
  }>;
  assert.equal(
    blockerPayload.previousTarget?.instanceId,
    p2State.leader.instanceId,
  );
  assert.equal(blockerPayload.currentTarget?.instanceId, blocker.instanceId);
  assert.equal(
    must(blocked.state.players[p2], "ENG-021D blocked p2").characters.some(
      (character) => character.instanceId === blocker.instanceId,
    ),
    false,
  );

  return [opened, blocked] as const;
};

const runEng021dCounterPowerCleanupScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-021D counter p1");
  const p2State = must(state.players[p2], "ENG-021D counter p2");
  const attacker = must(p1State.characters[0], "ENG-021D counter attacker");
  const target = must(p2State.characters[0], "ENG-021D counter target");
  const counterCard = must(p2State.hand[0], "ENG-021D counter card");
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
  assertAcceptedResult(state, opened, "ENG-021D counter open");
  assert.equal(opened.state.battle?.step, "counter");

  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: must(opened.state.battle, "ENG-021D counter battle").currentTarget,
  });
  assertAcceptedResult(opened.state, countered, "ENG-021D counter use");
  assert.equal(countered.state.battle?.counterPower, 2000);
  assertNoCleanupEvent(countered, "ENG-021D counter use");

  const passed = applyAction(countered.state, {
    type: "respondToDecision",
    decisionId: must(
      countered.state.pendingDecision,
      "ENG-021D counter decision",
    ).id,
    response: { type: "cards", cards: [] },
  });
  assertNoBattleContextAfterCleanup(
    countered.state,
    passed,
    "ENG-021D counter power cleanup",
    ["decisionResolved"],
  );
  assert.equal(
    must(passed.state.players[p2], "ENG-021D counter p2 after").characters.some(
      (character) => character.instanceId === target.instanceId,
    ),
    true,
  );
  assert.equal(
    passed.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(JSON.stringify(passed.state).includes("counterPower"), false);

  return [opened, countered, passed] as const;
};

const runEng021dBanishLeaderDamageCleanupScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-021D banish p1");
  const p2State = must(state.players[p2], "ENG-021D banish p2");
  const topLife = must(p2State.life[0], "ENG-021D banish top life").card
    .instanceId;
  const beforeLife = p2State.life.length;
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    printedKeywords: ["banish"],
  };

  const damaged = applyAction(state, {
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
  assertNoBattleContextAfterCleanup(
    state,
    damaged,
    "ENG-021D Banish Leader damage cleanup",
    ["damageDealt", "lifeTaken", "cardMoved"],
  );
  assert.equal(
    must(damaged.state.players[p2], "ENG-021D banish p2 after").life.length,
    beforeLife - 1,
  );
  assert.equal(
    must(damaged.state.players[p2], "ENG-021D banish p2 after").trash.some(
      (card) => card.instanceId === topLife,
    ),
    true,
  );
  assert.equal(
    must(damaged.state.players[p2], "ENG-021D banish p2 after").hand.some(
      (card) => card.instanceId === topLife,
    ),
    false,
  );

  return [damaged] as const;
};

const assertEng021dEndOfBattleTriggerMetadataFailsClosed = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-021D eob p1");
  const p2State = must(state.players[p2], "ENG-021D eob p2");
  state.cardManifest.effectDefinitions = {
    endOfBattle: effectDefinition(p2State.leader.cardId, {
      type: "endOfBattle",
    }),
  };
  const before = JSON.stringify(state);

  const result = applyAction(state, {
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

  const error = must(result.errors?.[0], "ENG-021D end of battle error");
  assert.equal(error.type, "illegalAction");
  assert.equal(
    error.reason,
    "declareAttack is unsupported for current combat metadata.",
  );
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.state.battle, undefined);
};

const assertEng027dUnsupportedOnKOMetadataFailsClosed = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-027D unsupported p1");
  const p2State = must(state.players[p2], "ENG-027D unsupported p2");
  const attacker = must(p1State.characters[0], "ENG-027D unsupported attacker");
  const target = must(p2State.characters[0], "ENG-027D unsupported target");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  const definition = effectDefinition(target.cardId, { type: "onKO" });
  const onKOEffect = must(definition.effects[0], "unsupported On K.O. effect");
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-eng-027d-unsupported-on-ko": {
      ...definition,
      effects: [
        {
          ...onKOEffect,
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: { type: "rest", target: { type: "self" } },
        },
      ],
    },
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    effectText: "[On K.O.] Rest up to 1 of your opponent's Characters.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-eng-027d-unsupported-on-ko",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  state.battle = {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    step: "counter",
    damageCount: 1,
  };
  const before = JSON.stringify(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported effect metadata.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
};

test("ENG-021D: supported battle cleanup composes across accepted mechanics", () => {
  const scripts = [
    [
      "ENG-021D vanilla Leader damage",
      runEng021dVanillaLeaderDamageCleanupScript,
    ],
    ["ENG-021D Character K.O.", runEng021dCharacterKoCleanupScript],
    [
      "ENG-021D Blocker redirection and resolution",
      runEng021dBlockerRedirectCleanupScript,
    ],
    ["ENG-021D Character Counter power", runEng021dCounterPowerCleanupScript],
    [
      "ENG-021D Banish Leader damage",
      runEng021dBanishLeaderDamageCleanupScript,
    ],
  ] as const;

  for (const [name, script] of scripts) {
    assertRepeatedScriptStable(name, script);
  }

  assertEng021dEndOfBattleTriggerMetadataFailsClosed();
});

test("ENG-027D: supported battle K.O. triggers resolve safely before cleanup", () => {
  assertRepeatedScriptStable(
    "ENG-027D supported On K.O. trigger",
    runEng027dSupportedOnKOBattleScript,
  );
  assertEng027dUnsupportedOnKOMetadataFailsClosed();
});
