import assert from "node:assert/strict";
import { test } from "vitest";

import type { GameState, PlayerId } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import {
  installSupportedCounterEvent,
  setupAttackState,
} from "../battle-actions-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const findScalarPaths = (
  value: unknown,
  target: string,
  path = "$",
): string[] => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value) === target ? [path] : [];
  }
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    const matches: string[] = [];
    for (const [index, item] of value.entries()) {
      matches.push(
        ...findScalarPaths(item, target, `${path}[${String(index)}]`),
      );
    }
    return matches;
  }
  if (typeof value === "object") {
    const matches: string[] = [];
    for (const [key, item] of Object.entries(value)) {
      matches.push(...findScalarPaths(item, target, `${path}.${key}`));
    }
    return matches;
  }
  return [];
};

const assertNoScalarValue = (
  value: unknown,
  target: string,
  message: string,
): void => {
  const paths = findScalarPaths(value, target);
  assert.equal(
    paths.length,
    0,
    paths.length === 0 ? message : `${message}; found at ${paths.join(", ")}`,
  );
};

const findKeyPaths = (value: unknown, key: string, path = "$"): string[] => {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    const matches: string[] = [];
    for (const [index, item] of value.entries()) {
      matches.push(...findKeyPaths(item, key, `${path}[${String(index)}]`));
    }
    return matches;
  }
  if (typeof value === "object") {
    const matches: string[] = [];
    for (const [entryKey, item] of Object.entries(value)) {
      if (entryKey === key) {
        matches.push(`${path}.${entryKey}`);
      }
      matches.push(...findKeyPaths(item, key, `${path}.${entryKey}`));
    }
    return matches;
  }
  return [];
};

const assertNoForbiddenKeys = (
  value: unknown,
  keys: readonly string[],
  label: string,
): void => {
  for (const key of keys) {
    const paths = findKeyPaths(value, key);
    assert.equal(
      paths.length,
      0,
      paths.length === 0
        ? `${label}: forbidden key ${key} must be absent`
        : `${label}: forbidden key ${key} found at ${paths.join(", ")}`,
    );
  }
};

const assertPublicDecisionShape = (
  view: ReturnType<typeof filterStateForPlayer>,
  label: string,
): void => {
  const pending = view.pendingDecision;
  assert.ok(pending, `${label}: pending decision must exist`);
  const keys = Object.keys(pending).sort();
  const baseRequired = ["causedBy", "id", "playerId", "prompt", "type"];
  const typeRequired =
    pending.type === "selectCards"
      ? ["candidates", "choices", "max", "min"]
      : pending.type === "orderCards"
        ? ["cards", "destination"]
        : [];
  const required = [...baseRequired, ...typeRequired].sort();
  if ("timeoutMs" in pending) {
    assert.deepEqual(
      keys,
      [...required, "timeoutMs"].sort(),
      `${label}: pending decision must be public`,
    );
    return;
  }
  assert.deepEqual(keys, required, `${label}: pending decision must be public`);
};

const assertPublicZonesVisible = (
  state: GameState,
  recipient: PlayerId,
  label: string,
): void => {
  const opponent = recipient === p1 ? p2 : p1;
  const recipientState = must(state.players[recipient], `${label} recipient`);
  const opponentState = must(state.players[opponent], `${label} opponent`);
  const view = filterStateForPlayer(state, recipient);

  const assertVisibleCardPayload = (
    expected: {
      instanceId: string;
      cardId: string;
      owner: string;
      controller: string;
      zone: unknown;
      attachedDon: readonly unknown[];
      state?: string;
      turnPlayed?: number;
    },
    actual: {
      instanceId: string;
      cardId: string;
      owner: string;
      controller: string;
      zone: unknown;
      attachedDonCount: number;
      state?: string;
      turnPlayed?: number;
    },
    cardLabel: string,
  ) => {
    assert.equal(
      actual.instanceId,
      expected.instanceId,
      `${cardLabel} instance`,
    );
    assert.equal(actual.cardId, expected.cardId, `${cardLabel} cardId`);
    assert.equal(actual.owner, expected.owner, `${cardLabel} owner`);
    assert.equal(
      actual.controller,
      expected.controller,
      `${cardLabel} controller`,
    );
    assert.deepEqual(actual.zone, expected.zone, `${cardLabel} zone`);
    assert.equal(
      actual.attachedDonCount,
      expected.attachedDon.length,
      `${cardLabel} attachedDonCount`,
    );
    if (expected.state !== undefined || actual.state !== undefined) {
      assert.equal(actual.state, expected.state, `${cardLabel} state`);
    }
    if (expected.turnPlayed !== undefined || actual.turnPlayed !== undefined) {
      assert.equal(
        actual.turnPlayed,
        expected.turnPlayed,
        `${cardLabel} turnPlayed`,
      );
    }
  };

  assertVisibleCardPayload(
    recipientState.leader,
    view.self.leader,
    `${label} self leader`,
  );
  assertVisibleCardPayload(
    opponentState.leader,
    view.opponent.leader,
    `${label} opponent leader`,
  );

  assert.equal(
    view.self.characters.length,
    recipientState.characters.length,
    `${label} self characters`,
  );
  for (const expected of recipientState.characters) {
    const actual = view.self.characters.find(
      (card) => card.instanceId === expected.instanceId,
    );
    assert.ok(actual, `${label} self character must be visible`);
    assertVisibleCardPayload(expected, actual, `${label} self character`);
  }

  assert.equal(
    view.opponent.characters.length,
    opponentState.characters.length,
    `${label} opponent characters`,
  );
  for (const expected of opponentState.characters) {
    const actual = view.opponent.characters.find(
      (card) => card.instanceId === expected.instanceId,
    );
    assert.ok(actual, `${label} opponent character must be visible`);
    assertVisibleCardPayload(expected, actual, `${label} opponent character`);
  }

  assert.equal(
    view.self.costArea.length,
    recipientState.costArea.length,
    `${label} self costArea`,
  );
  for (const expected of recipientState.costArea) {
    const actual = view.self.costArea.find(
      (card) => card.instanceId === expected.instanceId,
    );
    assert.ok(actual, `${label} self cost card must be visible`);
    assertVisibleCardPayload(expected, actual, `${label} self cost card`);
  }

  assert.equal(
    view.opponent.costArea.length,
    opponentState.costArea.length,
    `${label} opponent costArea`,
  );
  for (const expected of opponentState.costArea) {
    const actual = view.opponent.costArea.find(
      (card) => card.instanceId === expected.instanceId,
    );
    assert.ok(actual, `${label} opponent cost card must be visible`);
    assertVisibleCardPayload(expected, actual, `${label} opponent cost card`);
  }

  assert.equal(
    view.self.trash.length,
    recipientState.trash.length,
    `${label} self trash`,
  );
  for (const expected of recipientState.trash) {
    const actual = view.self.trash.find(
      (card) => card.instanceId === expected.instanceId,
    );
    assert.ok(actual, `${label} self trash card must be visible`);
    assertVisibleCardPayload(expected, actual, `${label} self trash card`);
  }

  assert.equal(
    view.opponent.trash.length,
    opponentState.trash.length,
    `${label} opponent trash`,
  );
  for (const expected of opponentState.trash) {
    const actual = view.opponent.trash.find(
      (card) => card.instanceId === expected.instanceId,
    );
    assert.ok(actual, `${label} opponent trash card must be visible`);
    assertVisibleCardPayload(expected, actual, `${label} opponent trash card`);
  }

  if (recipientState.stage !== undefined) {
    assert.ok(view.self.stage, `${label} self stage should be visible`);
    assertVisibleCardPayload(
      recipientState.stage,
      view.self.stage,
      `${label} self stage`,
    );
  }
  if (opponentState.stage !== undefined) {
    assert.ok(view.opponent.stage, `${label} opponent stage should be visible`);
    assertVisibleCardPayload(
      opponentState.stage,
      view.opponent.stage,
      `${label} opponent stage`,
    );
  }
};

const assertNoHiddenLeak = (
  state: GameState,
  recipient: PlayerId,
  label: string,
): void => {
  const opponent = recipient === p1 ? p2 : p1;
  const recipientState = must(state.players[recipient], `${label} recipient`);
  const opponentState = must(state.players[opponent], `${label} opponent`);
  const view = filterStateForPlayer(state, recipient);
  const publicVisibleCardIds = new Set<string>([
    ...view.self.hand.map((card) => String(card.cardId)),
    String(view.self.leader.cardId),
    String(view.opponent.leader.cardId),
    ...view.self.characters.map((card) => String(card.cardId)),
    ...view.opponent.characters.map((card) => String(card.cardId)),
    ...view.self.costArea.map((card) => String(card.cardId)),
    ...view.opponent.costArea.map((card) => String(card.cardId)),
    ...view.self.trash.map((card) => String(card.cardId)),
    ...view.opponent.trash.map((card) => String(card.cardId)),
    ...view.self.life.faceUpCards.map((card) => String(card.cardId)),
    ...view.opponent.life.faceUpCards.map((card) => String(card.cardId)),
    ...(view.self.stage === undefined ? [] : [String(view.self.stage.cardId)]),
    ...(view.opponent.stage === undefined
      ? []
      : [String(view.opponent.stage.cardId)]),
    ...view.revealedCards.flatMap((record) =>
      record.cards.map((card) => String(card.cardId)),
    ),
  ]);

  assert.equal(view.self.hand.length, recipientState.hand.length, label);
  assert.equal(view.opponent.handCount, opponentState.hand.length, label);
  assert.equal(view.self.deckCount, recipientState.deck.length, label);
  assert.equal(view.opponent.deckCount, opponentState.deck.length, label);
  assert.equal(view.self.donDeckCount, recipientState.donDeck.length, label);
  assert.equal(view.opponent.donDeckCount, opponentState.donDeck.length, label);

  for (const card of recipientState.hand) {
    const visible = view.self.hand.find(
      (entry) => entry.instanceId === card.instanceId,
    );
    assert.ok(visible, `${label} recipient hand card must remain visible`);
    assert.equal(visible.cardId, card.cardId, `${label} self hand cardId`);
    assert.equal(visible.owner, card.owner, `${label} self hand owner`);
    assert.equal(
      visible.controller,
      card.controller,
      `${label} self hand controller`,
    );
    assert.deepEqual(visible.zone, card.zone, `${label} self hand zone`);
    assert.equal(
      visible.attachedDonCount,
      card.attachedDon.length,
      `${label} self hand attachedDonCount`,
    );
  }

  for (const card of opponentState.hand) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} opponent hand card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} opponent hand instance id must stay hidden`,
    );
  }

  for (const card of recipientState.deck) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} recipient deck card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} recipient deck instance id must stay hidden`,
    );
  }
  for (const card of opponentState.deck) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} opponent deck card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} opponent deck instance id must stay hidden`,
    );
  }
  for (const card of recipientState.donDeck) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} recipient DON deck card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} recipient DON deck instance id must stay hidden`,
    );
  }
  for (const card of opponentState.donDeck) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} opponent DON deck card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} opponent DON deck instance id must stay hidden`,
    );
  }

  for (const lifeCard of recipientState.life.filter((card) => !card.faceUp)) {
    if (!publicVisibleCardIds.has(String(lifeCard.card.cardId))) {
      assertNoScalarValue(
        view,
        String(lifeCard.card.cardId),
        `${label} recipient face-down life card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(lifeCard.card.instanceId),
      `${label} recipient face-down life instance id must stay hidden`,
    );
  }
  for (const lifeCard of opponentState.life.filter((card) => !card.faceUp)) {
    if (!publicVisibleCardIds.has(String(lifeCard.card.cardId))) {
      assertNoScalarValue(
        view,
        String(lifeCard.card.cardId),
        `${label} opponent face-down life card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(lifeCard.card.instanceId),
      `${label} opponent face-down life instance id must stay hidden`,
    );
  }

  assert.ok(view.self.leader);
  assert.ok(view.opponent.leader);

  assertNoForbiddenKeys(
    view,
    [
      "rng",
      "effectQueue",
      "deferredTriggers",
      "replacementState",
      "continuousEffects",
      "audit",
      "eventJournal",
      "serverOnly",
      "response",
      "defaultResponse",
      "queueEntryId",
      "effectBlockId",
      "orderedIds",
      "triggerIds",
      "sourceSnapshot",
      "sourcePresencePolicy",
      "orderingGroup",
      "damageProcess",
      "remainingDamagePoints",
      "sourceKeyword",
      "paymentOptions",
      "targetOptions",
      "cardOptions",
    ],
    label,
  );

  const pending = state.pendingDecision;
  if (pending !== undefined && pending.playerId === recipient) {
    assertPublicDecisionShape(view, label);
  } else {
    assert.equal(
      view.pendingDecision,
      undefined,
      `${label} pending decision hidden from non-recipient`,
    );
  }

  const expectedLegal = getLegalActions(state, recipient);
  if (expectedLegal.length > 0) {
    assert.ok(view.legalActions.length > 0, `${label} legal actions present`);
  }
};

const createAfterAttackDamageState = (): GameState => {
  const state = setupAttackState();
  const attacker = must(must(state.players[p1], "p1").leader, "p1 leader");
  const target = must(must(state.players[p2], "p2").leader, "p2 leader");
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
  assert.equal(opened.errors, undefined);
  return opened.state;
};

const createAfterBlockerState = (): GameState => {
  const state = setupAttackState();
  const p2State = must(state.players[p2], "p2");
  const blocker = must(p2State.characters[0], "blocker");
  blocker.state = "active";
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
      instanceId: must(state.players[p1], "p1").leader.instanceId,
      cardId: must(state.players[p1], "p1").leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assert.equal(opened.errors, undefined);
  const pending = must(opened.state.pendingDecision, "block decision");
  const blocked = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: pending.id,
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
  assert.equal(blocked.errors, undefined);
  return blocked.state;
};

const createCounterEventWindowState = (): GameState => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  installSupportedCounterEvent(state, counterEvent, 2000);
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
  assert.equal(opened.errors, undefined);
  return opened.state;
};

test("real battle engine states stay hidden-info safe across battle progression", () => {
  const afterAttackDamage = createAfterAttackDamageState();
  const afterBlocker = createAfterBlockerState();
  const counterEventWindow = createCounterEventWindowState();

  const samples: ReadonlyArray<[string, GameState]> = [
    ["after-attack-damage", afterAttackDamage],
    ["after-blocker", afterBlocker],
    ["counter-event-window", counterEventWindow],
  ];

  for (const [label, state] of samples) {
    assertNoHiddenLeak(state, p1, `${label}:p1`);
    assertNoHiddenLeak(state, p2, `${label}:p2`);
    assertPublicZonesVisible(state, p1, `${label}:p1`);
    assertPublicZonesVisible(state, p2, `${label}:p2`);
  }
});

test("supported Counter Event legal action is private to defender view", () => {
  const state = createCounterEventWindowState();
  const counterEvent = must(
    must(state.players[p2], "p2").hand[0],
    "counter event",
  );
  const attackerView = filterStateForPlayer(state, p1);
  const defenderView = filterStateForPlayer(state, p2);

  assertNoScalarValue(
    attackerView,
    String(counterEvent.instanceId),
    "attacker view must not reveal defender Counter Event instance",
  );
  assertNoScalarValue(
    attackerView,
    String(counterEvent.cardId),
    "attacker view must not reveal defender Counter Event card",
  );
  assert.equal(
    attackerView.legalActions.some((action) => action.type === "useCounter"),
    false,
  );
  assert.equal(
    defenderView.legalActions.some(
      (action) =>
        action.type === "useCounter" &&
        action.card.instanceId === counterEvent.instanceId,
    ),
    true,
  );
});
