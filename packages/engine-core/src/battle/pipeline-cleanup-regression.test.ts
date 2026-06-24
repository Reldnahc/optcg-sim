import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent, EngineResult, GameState } from "@optcg/types";

import { applyAction } from "../actions.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { passCounterStep, setupAttackState } from "./test-fixtures.js";

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
  // Event ids are scoped to emitted batches in legacy fixtures; global event
  // ordering is asserted through monotonically increasing event seq values.
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
  const passed = passCounterStep(blocked.state, p2);
  assertNoBattleContextAfterCleanup(
    blocked.state,
    passed,
    "ENG-021C blocker K.O. cleanup",
    ["damageDealt", "cardKOd", "cardMoved"],
  );
  assert.equal(
    must(passed.state.players[p2], "ENG-021C blocked p2").characters.some(
      (character) => character.instanceId === blocker.instanceId,
    ),
    false,
  );

  return [opened, blocked, passed] as const;
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
  const damaged = passCounterStep(opened.state, p2);
  assertNoBattleContextAfterCleanup(
    opened.state,
    damaged,
    "ENG-021C leader damage cleanup",
    ["damageDealt", "lifeTaken"],
  );
  assert.equal(
    must(damaged.state.players[p2], "ENG-021C damaged p2").life.length,
    beforeLife - 1,
  );

  return [opened, damaged] as const;
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
  const damaged = passCounterStep(opened.state, p2);
  assertNoBattleContextAfterCleanup(
    opened.state,
    damaged,
    "ENG-021D vanilla Leader damage cleanup",
    ["damageDealt", "lifeTaken"],
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

  return [opened, damaged] as const;
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
  const knockedOut = passCounterStep(opened.state, p2);
  assertNoBattleContextAfterCleanup(
    opened.state,
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

  return [opened, knockedOut] as const;
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
  const passed = passCounterStep(blocked.state, p2);
  assertNoBattleContextAfterCleanup(
    blocked.state,
    passed,
    "ENG-021D blocker redirection cleanup",
    ["damageDealt", "cardKOd", "cardMoved"],
  );
  assertJournalEventOrder(
    passed.state,
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
    must(passed.state.players[p2], "ENG-021D blocked p2").characters.some(
      (character) => character.instanceId === blocker.instanceId,
    ),
    false,
  );

  return [opened, blocked, passed] as const;
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
  assert.equal(
    (
      countered.state.battle as
        | (NonNullable<typeof countered.state.battle> & {
            counterPower?: number;
          })
        | undefined
    )?.counterPower,
    2000,
  );
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
  assert.equal(
    (
      passed.state.battle as
        | (NonNullable<typeof passed.state.battle> & {
            counterPower?: number;
          })
        | undefined
    )?.counterPower,
    undefined,
  );

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
  const damaged = passCounterStep(opened.state, p2);
  assertNoBattleContextAfterCleanup(
    opened.state,
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

  return [opened, damaged] as const;
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
});
