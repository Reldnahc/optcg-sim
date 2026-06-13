import assert from "node:assert/strict";
import { test } from "vitest";

import { must, p1, p2 } from "../action-test-fixtures.js";
import { restFieldObjects } from "../effect-runtime-sequence/saved-field-object.js";
import { applyBlockStepDecisionResponse } from "./block-actions.js";
import { applyDeclareAttack } from "./actions.js";
import {
  cardRef,
  setupAttackState,
  setupOpenedBlockStepDecision,
} from "./test-fixtures.js";

const cardRestedEvents = (
  events: readonly ReturnType<typeof applyDeclareAttack>["events"][number][],
) => events.filter((event) => event.type === "cardRested");

test("declaring an attack emits a reusable cardRested event for the attacker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(p2State.leader, p2),
  });

  assert.equal(result.errors, undefined);
  const restedEvent = cardRestedEvents(result.events)[0];
  assert.ok(restedEvent !== undefined);
  assert.deepEqual(restedEvent.payload, {
    playerId: p1,
    instanceId: attacker.instanceId,
    cardId: attacker.cardId,
    category: "character",
    sourceKind: "attack",
    sourceControllerId: p1,
  });
  assert.equal(restedEvent.visibility.type, "public");
});

test("shared field-object resting emits cardRested only for active-to-rested transitions", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const target = must(p1State.characters[0], "target");
  const events: ReturnType<typeof applyDeclareAttack>["events"] = [];

  const rested = restFieldObjects(state, [cardRef(target, p1)], undefined, {
    events,
    sourceKind: "effect",
    sourceControllerId: p1,
    sourceCardId: target.cardId,
  });
  const restedAgain = restFieldObjects(
    rested.state,
    [cardRef(target, p1)],
    undefined,
    {
      events,
      sourceKind: "effect",
      sourceControllerId: p1,
    },
  );

  assert.equal(rested.changed, true);
  assert.equal(restedAgain.changed, false);
  assert.equal(cardRestedEvents(events).length, 1);
  assert.deepEqual(must(cardRestedEvents(events)[0], "cardRested").payload, {
    playerId: p1,
    instanceId: target.instanceId,
    cardId: target.cardId,
    category: "character",
    sourceKind: "effect",
    sourceControllerId: p1,
    sourceCardId: target.cardId,
  });
});

test("activating a blocker emits cardRested through the shared rest transition", () => {
  const { openedState, decision, defenderBlocker } =
    setupOpenedBlockStepDecision();

  const result = applyBlockStepDecisionResponse(
    openedState,
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [cardRef(defenderBlocker, p2)] },
    },
    (state) => ({ events: [], state, stateHash: "" }),
  );

  assert.ok(result !== null);
  assert.equal(result.errors, undefined);
  assert.deepEqual(
    cardRestedEvents(result.events).map((event) => event.payload),
    [
      {
        playerId: p2,
        instanceId: defenderBlocker.instanceId,
        cardId: defenderBlocker.cardId,
        category: "character",
        sourceKind: "blocker",
        sourceControllerId: p2,
      },
    ],
  );
});
