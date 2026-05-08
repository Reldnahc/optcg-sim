import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EngineResult,
  GameState,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./play-card.js";
import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";

const applyPlayCardTestAction = (
  state: GameState,
  action:
    | Extract<Action, { type: "playCard" }>
    | Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  if (action.type === "playCard") {
    return applyPlayCard(state, action);
  }
  const result = applyPlayCardDecisionResponse(state, action);
  assert.ok(result !== null, "expected play-card decision response");
  return result;
};

test("nonzero playCard creates payCost decision and legal decision responses for decision player only", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });

  const first = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(first.errors, undefined);
  assert.equal(first.state.pendingDecision?.type, "payCost");
  assert.deepEqual(
    first.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.deepEqual(
    first.events.map((event) => event.visibility),
    [{ type: "public" }, { type: "public" }],
  );

  const legalForP1 = getPlayCardLegalActions(first.state, p1);
  const legalForP2 = getPlayCardLegalActions(first.state, p2);
  assert.equal(
    legalForP1.some((action) => action.type === "respondToDecision"),
    true,
  );
  assert.equal(
    legalForP2.some((action) => action.type === "respondToDecision"),
    false,
  );
});

test("valid respondToDecision payment resolves nonzero Character play", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const selected = must(
    must(opened.state.players[p1], "p1").costArea[0],
    "don0",
  );
  const selected2 = must(
    must(opened.state.players[p1], "p1").costArea[1],
    "don1",
  );

  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const resolvedP1 = must(resolved.state.players[p1], "p1");
  const played = must(resolvedP1.characters[0], "played character");
  assert.equal(played.instanceId, card.instanceId);
  assert.equal(played.turnPlayed, state.turn.globalTurn);
  assert.equal(
    resolvedP1.costArea.filter((don) => don.state === "rested").length >= 2,
    true,
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "costPaid",
      "decisionResolved",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(
    resolved.events.map((event) => event.visibility),
    [
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "replayOnly" },
    ],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("valid respondToDecision payment resolves nonzero Stage play", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.hand[1], "stage");
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 2,
  });
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: stage.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const selected = must(
    must(opened.state.players[p1], "p1").costArea[0],
    "don0",
  );
  const selected2 = must(
    must(opened.state.players[p1], "p1").costArea[1],
    "don1",
  );

  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p1], "p1").stage?.instanceId,
    stage.instanceId,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("zero-cost playCard resolves directly for Character without payCost decision", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "character");
  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 0,
    power: 2000,
  });

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: character.instanceId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  const played = must(
    must(result.state.players[p1], "p1").characters[0],
    "played",
  );
  assert.equal(played.instanceId, character.instanceId);
  assert.equal(played.turnPlayed, state.turn.globalTurn);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "cardMoved", "cardPlayed", "ruleProcessingChecked"],
  );
});

test("zero-cost playCard resolves directly for Stage without payCost decision", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.hand[1], "stage");
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 0,
  });

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: stage.instanceId,
  });
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    must(result.state.players[p1], "p1").stage?.instanceId,
    stage.instanceId,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "cardMoved", "cardPlayed", "ruleProcessingChecked"],
  );
  assert.deepEqual(
    result.events.map((event) => event.visibility),
    [
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "replayOnly" },
    ],
  );
});

test("respondToDecision rejects duplicate/forged DON!! selections without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 2000,
  });
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const validDon = must(
    must(opened.state.players[p1], "p1").costArea[0],
    "don",
  );
  const before = JSON.stringify(opened.state);

  const duplicate = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [validDon.instanceId, validDon.instanceId],
    },
  });
  assert.equal(duplicate.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const forged = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [
        validDon.instanceId,
        "forged-don" as CardInstance["instanceId"],
      ],
    },
  });
  assert.equal(forged.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);
});

test("respondToDecision rejects invalid payment variants without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 2000,
  });
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const openedP1 = must(opened.state.players[p1], "opened p1");
  const selected = must(openedP1.costArea[0], "don0");
  const selected2 = must(openedP1.costArea[1], "don1");
  const wrongPlayerDon = must(
    must(opened.state.players[p2], "opened p2").costArea[0],
    "p2 don",
  );
  const before = JSON.stringify(opened.state);

  const wrongDecision = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: `${String(decision.id)}:wrong` as typeof decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(wrongDecision.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const insufficient = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId],
    },
  });
  assert.equal(insufficient.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const wrongPlayerSelection = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, wrongPlayerDon.instanceId],
    },
  });
  assert.equal(wrongPlayerSelection.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const restedState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        costArea: openedP1.costArea.map((don) =>
          don.instanceId === selected.instanceId
            ? { ...don, state: "rested" }
            : don,
        ),
      },
    },
  };
  const restedBefore = JSON.stringify(restedState);
  const rested = applyPlayCardTestAction(restedState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(rested.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(restedState), restedBefore);

  const attachedState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        leader: {
          ...openedP1.leader,
          attachedDon: [selected.instanceId],
        },
        costArea: openedP1.costArea
          .filter((don) => don.instanceId !== selected.instanceId)
          .map((don, index) => ({
            ...don,
            zone: { zone: "costArea", playerId: p1, slot: "cost", index },
          })),
      },
    },
  };
  const attachedBefore = JSON.stringify(attachedState);
  const attached = applyPlayCardTestAction(attachedState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(attached.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(attachedState), attachedBefore);

  const staleState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        hand: openedP1.hand
          .filter((handCard) => handCard.instanceId !== card.instanceId)
          .map((handCard, index) => ({
            ...handCard,
            zone: { zone: "hand", playerId: p1, slot: "hand", index },
          })),
      },
    },
  };
  const staleBefore = JSON.stringify(staleState);
  const stale = applyPlayCardTestAction(staleState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(stale.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(staleState), staleBefore);
});
