import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  EffectDefinition,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import { resolveSupportedVanillaBattle } from "./actions.js";
import { hashCanonicalStateValue } from "../canonical-state.js";
import { assertGameStateInvariants } from "../invariants.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { setupAttackState, withOnKODrawEffect } from "./test-fixtures.js";

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

  const error = must(result.errors?.[0], "unsupported On K.O. metadata error");
  assert.equal(error.type, "illegalAction");
  assert.match(
    error.reason,
    /^Battle requires unsupported effect metadata; card=p2-a; reason=unsupported support-gate text$/u,
  );
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
};

test("ENG-027D: supported battle K.O. triggers resolve safely before cleanup", () => {
  assertRepeatedScriptStable(
    "ENG-027D supported On K.O. trigger",
    runEng027dSupportedOnKOBattleScript,
  );
  assertEng027dUnsupportedOnKOMetadataFailsClosed();
});
