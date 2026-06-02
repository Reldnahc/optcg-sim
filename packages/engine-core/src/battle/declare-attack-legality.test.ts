import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, CardInstance, PlayerId } from "@optcg/types";

import { applyDeclareAttack, getDeclareAttackLegalActions } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import { setupAttackState } from "../battle-actions-test-fixtures.js";

test("getLegalActions includes Leader-to-Leader declareAttack for turn player", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");

  const legal = getDeclareAttackLegalActions(state, p1);
  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === p1State.leader.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );
});

test("getLegalActions includes Character-to-rested-Character declareAttack and excludes active characters", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.characters.push({
    ...must(p2State.hand[0], "p2 hand active"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  });

  const attacker = must(p1State.characters[0], "attacker");
  const restedTarget = must(p2State.characters[0], "rested target");
  const activeTarget = must(p2State.characters[1], "active target");
  const legal = getDeclareAttackLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === restedTarget.instanceId,
    ),
    true,
  );
  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === activeTarget.instanceId,
    ),
    false,
  );
});

test("existing battle suppresses declareAttack legal actions and rejects applyAction", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.battle = {
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    step: "attack",
    damageCount: 1,
  };

  assert.deepEqual(getDeclareAttackLegalActions(state, p1), []);

  const before = JSON.stringify(state);
  const result = applyDeclareAttack(state, {
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
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("declareAttack rejection cases do not mutate input state", () => {
  const base = setupAttackState();
  const p1State = must(base.players[p1], "p1");
  const p2State = must(base.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;

  const run = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
    actionOverride?: {
      attacker?: {
        instanceId: CardInstance["instanceId"];
        cardId: CardId;
        playerId: PlayerId;
      };
      target?: {
        instanceId: CardInstance["instanceId"];
        cardId: CardId;
        playerId: PlayerId;
      };
    },
  ) => {
    const state = setupAttackState();
    mutate(state);
    const before = JSON.stringify(state);
    const result = applyDeclareAttack(state, {
      type: "declareAttack",
      attacker: actionOverride?.attacker ?? {
        instanceId: attacker.instanceId,
        cardId: attacker.cardId,
        playerId: p1,
      },
      target: actionOverride?.target ?? {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
      },
    });
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(state), before);
  };

  run((state) => {
    state.turn.phase = "draw";
  });
  run(() => {}, {
    attacker: {
      instanceId: must(base.players[p2], "p2 for attacker").leader.instanceId,
      cardId: must(base.players[p2], "p2 for attacker").leader.cardId,
      playerId: p2,
    },
  });
  run((state) => {
    must(state.players[p1], "rest p1").leader.state = "rested";
  });
  run((state) => {
    state.turn.globalTurn = 1;
    state.turn.playerTurnCounts[p1] = 1;
    state.turn.playerTurnCounts[p2] = 0;
  });
  run(
    (state) => {
      const character = must(
        must(state.players[p1], "p1 char").characters[0],
        "char",
      );
      character.turnPlayed = state.turn.globalTurn;
    },
    {
      attacker: {
        instanceId: must(
          must(base.players[p1], "p1 char ref").characters[0],
          "p1 char ref card",
        ).instanceId,
        cardId: must(
          must(base.players[p1], "p1 char ref").characters[0],
          "p1 char ref card",
        ).cardId,
        playerId: p1,
      },
    },
  );
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["doubleAttack"],
    };
  });
  run(() => {}, {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: toCardId("forged-attacker"),
      playerId: p1,
    },
  });
  run(() => {}, {
    target: {
      instanceId: target.instanceId,
      cardId: toCardId("forged-target"),
      playerId: p2,
    },
  });
});
