import assert from "node:assert/strict";
import { test } from "vitest";

import {
  applyDeclareAttack,
  expireBattleDurationStateForCleanup,
} from "./actions.js";
import { must, p1, p2 } from "../action-test-fixtures.js";
import {
  cardRef,
  continuousEffectRecord,
  passCounterStep,
  setupAttackState,
} from "./test-fixtures.js";
type EngineInternalBattleState = NonNullable<
  ReturnType<typeof setupAttackState>["battle"]
> & { counterPower?: number };
test("End of Battle cleanup removes thisBattle effects and preserves longer durations", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const thisBattle = continuousEffectRecord(state, "effect-this-battle", {
    type: "thisBattle",
  });
  const thisTurn = continuousEffectRecord(state, "effect-this-turn", {
    type: "thisTurn",
  });
  const permanent = continuousEffectRecord(state, "effect-permanent", {
    type: "permanent",
  });
  const battleWithCounter: EngineInternalBattleState = {
    attacker: cardRef(p1State.leader, p1),
    originalTarget: cardRef(p2State.leader, p2),
    currentTarget: cardRef(p2State.leader, p2),
    step: "counter",
    damageCount: 1,
    counterPower: 2000,
  };
  state.battle = battleWithCounter;
  state.continuousEffects = [thisBattle, thisTurn, permanent];
  const before = structuredClone(state);

  const cleaned = expireBattleDurationStateForCleanup(state);

  assert.equal(cleaned.battle, undefined);
  assert.deepEqual(cleaned.continuousEffects, [thisTurn, permanent]);
  assert.deepEqual(state, before);
});

test("leader damage at zero life still routes through end-of-battle cleanup ordering", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.life = [];

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(result.errors, undefined);
  const passed = passCounterStep(result.state, p2);
  assert.equal(passed.errors, undefined);
  assert.equal(passed.state.battle, undefined);
  assert.deepEqual(
    passed.events.map((event) => event.type),
    [
      "decisionResolved",
      "damageDealt",
      "spotlightEntryCreated",
      "battleEnded",
      "ruleProcessingChecked",
      "gameEnded",
      "effectResolved",
    ],
  );
  assert.deepEqual(passed.events[6]?.payload, {
    systemStep: "endBattle",
    battleCleared: true,
  });
});
