import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

import type { Action, EngineResult, GameState } from "@optcg/types";

import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./core.js";
import { must, p1, p2 } from "../action-test-fixtures.js";
import {
  hasPlayCardAction,
  respondToDecisionActions,
  setupFullCharacterPlayState,
  toTestCardRef,
} from "./test-fixtures.js";

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

test("getLegalActions includes Character overflow play", () => {
  const fullCharacters = setupFullCharacterPlayState(1);

  assert.equal(
    hasPlayCardAction(
      getPlayCardLegalActions(fullCharacters.state, p1),
      fullCharacters.newCharacter,
    ),
    true,
  );
});

test("zero-cost Character overflow creates SelectCardsDecision with controlled Character candidates", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });

  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "overflow decision");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p1);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    existingCharacters.map((card) => card.instanceId),
  );
  assert.deepEqual(
    {
      min: decision.request.min,
      max: decision.request.max,
      zone: decision.request.zone,
    },
    { min: 1, max: 1, zone: "characterArea" },
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.some(
      (card) => card.instanceId === newCharacter.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
});

test("nonzero Character overflow creates payCost first and SelectCardsDecision after payment", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(2);
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "payCost");

  const openedP1 = must(opened.state.players[p1], "opened p1");
  const selected = must(openedP1.costArea[0], "don0");
  const selected2 = must(openedP1.costArea[1], "don1");
  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });

  assert.equal(resolved.errors, undefined);
  const decision = must(resolved.state.pendingDecision, "overflow decision");
  assert.equal(decision.type, "selectCards");
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    existingCharacters.map((card) => card.instanceId),
  );
  assert.equal(
    must(resolved.state.players[p1], "p1").costArea[0]?.state,
    "rested",
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["costPaid", "decisionResolved", "decisionCreated"],
  );
});

test("Character overflow legal actions expose matching card responses only to decision player", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");

  const legalForP1 = respondToDecisionActions(
    getPlayCardLegalActions(opened.state, p1),
  );
  const legalForP2 = respondToDecisionActions(
    getPlayCardLegalActions(opened.state, p2),
  );

  assert.deepEqual(
    legalForP1.map((action) => ({
      decisionId: action.decisionId,
      response: action.response,
    })),
    existingCharacters.map((character) => ({
      decisionId: decision.id,
      response: {
        type: "cards",
        cards: [
          {
            instanceId: character.instanceId,
            cardId: character.cardId,
            playerId: p1,
            zone: character.zone,
          },
        ],
      },
    })),
  );
  assert.deepEqual(legalForP2, []);
});

test("valid Character overflow response trashes selected Character and places new Character", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);
  const attachedDon = must(must(state.players[p1], "p1").costArea[0], "don");
  const selectedCharacter = must(existingCharacters[2], "selected character");
  selectedCharacter.attachedDon = [attachedDon.instanceId];
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");

  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: selectedCharacter.instanceId,
          cardId: selectedCharacter.cardId,
          playerId: p1,
          zone: selectedCharacter.zone,
        },
      ],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const resolvedP1 = must(resolved.state.players[p1], "p1");
  assert.equal(resolvedP1.characters.length, 5);
  assert.equal(
    resolvedP1.characters.some(
      (card) => card.instanceId === selectedCharacter.instanceId,
    ),
    false,
  );
  assert.equal(resolvedP1.characters[4]?.instanceId, newCharacter.instanceId);
  assert.equal(
    must(resolvedP1.trash[0], "trashed character").instanceId,
    selectedCharacter.instanceId,
  );
  assert.equal(
    resolvedP1.costArea.find(
      (card) => card.instanceId === attachedDon.instanceId,
    )?.state,
    "rested",
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "donReturned",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("Character overflow rejects stale, wrong-player, wrong-card, missing, and multi-card responses without mutation", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);
  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const selectedCharacter = must(existingCharacters[0], "selected character");
  const before = JSON.stringify(opened.state);
  const run = (
    action:
      | Extract<Action, { type: "playCard" }>
      | Extract<Action, { type: "respondToDecision" }>,
  ) => {
    const result = applyPlayCardTestAction(opened.state, action);
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(opened.state), before);
  };

  run({
    type: "respondToDecision",
    decisionId: `${String(decision.id)}:stale` as typeof decision.id,
    response: { type: "cards", cards: [toTestCardRef(selectedCharacter, p1)] },
  });
  const wrongPlayerState = {
    ...opened.state,
    pendingDecision: { ...decision, playerId: p2 },
  };
  const wrongPlayerBefore = JSON.stringify(wrongPlayerState);
  const wrongPlayer = applyPlayCardTestAction(wrongPlayerState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [toTestCardRef(selectedCharacter, p1)] },
  });
  assert.equal(wrongPlayer.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(wrongPlayerState), wrongPlayerBefore);
  run({
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });
  run({
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        toTestCardRef(must(existingCharacters[0], "first"), p1),
        toTestCardRef(must(existingCharacters[1], "second"), p1),
      ],
    },
  });
  run({
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: newCharacter.instanceId,
          cardId: newCharacter.cardId,
          playerId: p1,
          zone: newCharacter.zone,
        },
      ],
    },
  });
  run({
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "payment", optionId: "restDon" },
  });
});

test("Character overflow authority lives at the Character placement boundary", () => {
  const placementSource = readFileSync(
    new URL("./placement.ts", import.meta.url),
    {
      encoding: "utf8",
    },
  );
  const playCardSource = readFileSync(new URL("./core.ts", import.meta.url), {
    encoding: "utf8",
  });
  const placementStart = placementSource.indexOf(
    "const placePlayedCardResult =",
  );
  const responseStart = playCardSource.indexOf(
    "const applyCharacterOverflowResponse =",
  );
  assert.notEqual(placementStart, -1);
  assert.notEqual(responseStart, -1);

  const callPattern = /createCharacterOverflowDecisionResult\(/g;
  assert.equal([...playCardSource.matchAll(callPattern)].length, 0);
  assert.equal(
    [...placementSource.slice(placementStart).matchAll(callPattern)].length,
    1,
  );
});
