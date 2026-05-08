import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, GameState, PlayerId } from "@optcg/types";

import {
  applyAction,
  getLegalActions,
  resolveSupportedVanillaBattle,
} from "./actions.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  effectDefinition,
  setupAttackState,
  withOnKODrawEffect,
} from "./battle-actions-test-fixtures.js";
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

const supportedLifeTriggerDefinition = (
  cardId: Parameters<typeof resolvedCard>[0]["cardId"],
): EffectDefinition => {
  const definition = effectDefinition(cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "life trigger effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  return {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };
};

const createLifeTriggerDecisionState = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "life trigger p1");
  const p2State = must(state.players[p2], "life trigger p2");
  const topLife = must(p2State.life[0], "life trigger top life");
  const lifeCardId = "real-view-life-trigger" as typeof topLife.card.cardId;
  const adjacentLifeId = must(p2State.life[1], "adjacent hidden life").card
    .cardId;
  const hiddenHandId = must(p2State.hand[0], "hidden hand").cardId;
  const hiddenDeckId = must(p2State.deck[0], "hidden deck").cardId;
  const definition = supportedLifeTriggerDefinition(lifeCardId);
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: lifeCardId },
  };
  state.cardManifest.cards[lifeCardId] = resolvedCard({
    cardId: lifeCardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1 card",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-real-view-life-trigger",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-real-view-life-trigger": definition,
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
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "confirmLifeTrigger");
  return {
    opened,
    lifeCardId,
    adjacentLifeId,
    hiddenHandId,
    hiddenDeckId,
  };
};

const assertPublicDecisionShape = (
  view: ReturnType<typeof filterStateForPlayer>,
  label: string,
): void => {
  const pending = view.pendingDecision;
  assert.ok(pending, `${label}: pending decision must exist`);
  const keys = Object.keys(pending).sort();
  const required = ["causedBy", "id", "playerId", "prompt", "type"].sort();
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
      "candidates",
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

const createAfterOnKOTriggerBattleState = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "On K.O. p1");
  const p2State = must(state.players[p2], "On K.O. p2");
  const attacker = must(p1State.characters[0], "On K.O. attacker");
  const target = must(p2State.characters[0], "On K.O. target");
  const hiddenDrawnCard = must(p2State.deck[0], "On K.O. hidden drawn card");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  const definition = withOnKODrawEffect(state, target, "def-filter-real-on-ko");
  const effectId = must(definition.effects[0], "On K.O. effect").id;
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
  const result = resolveSupportedVanillaBattle(state);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.battle, undefined);
  return { state: result.state, hiddenDrawnCard, effectId };
};

test("real K.O. trigger battle views omit runtime queue internals and hidden draw identity", () => {
  const { state, hiddenDrawnCard, effectId } =
    createAfterOnKOTriggerBattleState();

  for (const recipient of [p1, p2] as const) {
    assertNoHiddenLeak(
      state,
      recipient,
      `On K.O. trigger:${String(recipient)}`,
    );
    const view = filterStateForPlayer(state, recipient);
    const serialized = JSON.stringify(view);
    assert.equal(serialized.includes("queue-entry:"), false);
    assert.equal(serialized.includes("timing-window:"), false);
    assert.equal(serialized.includes("queueEntryId"), false);
    assert.equal(serialized.includes("effectBlockId"), false);
    assert.equal(serialized.includes("sourcePresencePolicy"), false);
    assert.equal(serialized.includes("sourceSnapshot"), false);
    assert.equal(serialized.includes("triggerIds"), false);
    assert.equal(serialized.includes("orderedIds"), false);
    assert.equal(serialized.includes("orderingGroup"), false);
    assert.equal(serialized.includes('"generation"'), false);
    assert.equal(serialized.includes(String(effectId)), false);
  }

  const p1View = filterStateForPlayer(state, p1);
  assertNoScalarValue(
    p1View,
    String(hiddenDrawnCard.instanceId),
    "p1 must not see opponent's On K.O. drawn card instance id",
  );
  assertNoScalarValue(
    p1View,
    String(hiddenDrawnCard.cardId),
    "p1 must not see opponent's On K.O. drawn card id",
  );
});

test("real life trigger views keep decline, activation, no-zone, and adjacent hidden state safe", () => {
  const { opened, lifeCardId, adjacentLifeId, hiddenHandId, hiddenDeckId } =
    createLifeTriggerDecisionState();
  const pending = must(opened.state.pendingDecision, "life trigger decision");
  assertNoHiddenLeak(opened.state, p1, "life-trigger-open:p1");
  assertNoHiddenLeak(opened.state, p2, "life-trigger-open:p2");
  const attackerDecisionView = filterStateForPlayer(opened.state, p1);
  const defenderDecisionView = filterStateForPlayer(opened.state, p2);

  assert.equal(attackerDecisionView.pendingDecision, undefined);
  assert.deepEqual(
    attackerDecisionView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.equal(
    defenderDecisionView.pendingDecision?.type,
    "confirmLifeTrigger",
  );
  assert.equal(
    defenderDecisionView.legalActions.some(
      (action) => action.type === "respondToDecision",
    ),
    true,
  );
  for (const hidden of [
    lifeCardId,
    adjacentLifeId,
    hiddenHandId,
    hiddenDeckId,
  ]) {
    assertNoScalarValue(
      attackerDecisionView,
      String(hidden),
      `attacker pre-decision view must not leak ${String(hidden)}`,
    );
  }

  const declined = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });
  assert.equal(declined.errors, undefined);
  assertNoHiddenLeak(declined.state, p1, "life-trigger-decline:p1");
  assertNoHiddenLeak(declined.state, p2, "life-trigger-decline:p2");
  const attackerDeclineView = filterStateForPlayer(declined.state, p1);
  assert.deepEqual(attackerDeclineView.revealedCards, []);
  assertNoScalarValue(
    attackerDeclineView,
    String(lifeCardId),
    "attacker decline view must not reveal declined trigger identity",
  );
  assert.equal(
    JSON.stringify(attackerDeclineView).includes("confirmLifeTrigger"),
    false,
  );

  const activated = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: pending.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  assert.equal(activated.errors, undefined);
  assert.deepEqual(activated.state.effectQueue, []);
  assert.deepEqual(activated.state.revealedCards, []);
  const activatedP2 = must(activated.state.players[p2], "activated p2");
  assert.equal(
    activatedP2.trash.some((card) => card.cardId === lifeCardId),
    true,
  );
  assertNoHiddenLeak(activated.state, p1, "life-trigger-activation:p1");
  assertNoHiddenLeak(activated.state, p2, "life-trigger-activation:p2");

  const attackerActivationView = filterStateForPlayer(activated.state, p1);
  const defenderActivationView = filterStateForPlayer(activated.state, p2);
  const attackerPublicTrigger = attackerActivationView.opponent.trash.find(
    (card) => card.cardId === lifeCardId,
  );
  const defenderPublicTrigger = defenderActivationView.self.trash.find(
    (card) => card.cardId === lifeCardId,
  );
  assert.ok(
    attackerPublicTrigger,
    "attacker activation view must show activated trigger in opponent trash",
  );
  assert.ok(
    defenderPublicTrigger,
    "defender activation view must show activated trigger in self trash",
  );
  assert.equal(
    attackerPublicTrigger.instanceId,
    defenderPublicTrigger.instanceId,
    "activated trigger public trash identity should match for both players",
  );

  for (const recipient of [p1, p2] as const) {
    const view = filterStateForPlayer(activated.state, recipient);
    const serialized = JSON.stringify(view);
    assert.deepEqual(view.revealedCards, []);
    assert.equal(serialized.includes("queueEntryId"), false);
    assert.equal(serialized.includes("sourceSnapshot"), false);
    assert.equal(serialized.includes("sourcePresencePolicy"), false);
    assert.equal(serialized.includes("orderingGroup"), false);
    assert.equal(serialized.includes('"effectQueue"'), false);
    assertNoScalarValue(
      view,
      String(adjacentLifeId),
      `${String(recipient)} activation view must not leak adjacent life`,
    );
    if (recipient === p1) {
      assertNoScalarValue(
        view,
        String(hiddenHandId),
        "attacker activation view must not leak defender hand",
      );
      assertNoScalarValue(
        view,
        String(hiddenDeckId),
        "attacker activation view must not leak defender deck order",
      );
    }
  }
});
