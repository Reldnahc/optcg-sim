import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EngineResult,
  GameState,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../canonical-state.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./core.js";
import { must, p1 } from "../action-test-fixtures.js";
import {
  hasPlayCardAction,
  setupFullCharacterPlayState,
  setupOccupiedStagePlayState,
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

test("getLegalActions includes payable Stage replacement", () => {
  const occupiedStage = setupOccupiedStagePlayState(1);

  assert.equal(
    hasPlayCardAction(
      getPlayCardLegalActions(occupiedStage.state, p1),
      occupiedStage.newStage,
    ),
    true,
  );
});

test("zero-cost Stage replacement trashes old Stage before placing new Stage", () => {
  const { state, newStage, oldStage } = setupOccupiedStagePlayState(0);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newStage.instanceId,
  });

  assert.equal(result.errors, undefined);
  const p1State = must(result.state.players[p1], "p1");
  assert.equal(p1State.stage?.instanceId, newStage.instanceId);
  assert.equal(
    must(p1State.trash[0], "trash stage").instanceId,
    oldStage.instanceId,
  );
  assert.equal(p1State.trash[0]?.zone.index, 0);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "cardRevealed",
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  const oldStageMove = must(
    result.events.find(
      (event) =>
        event.type === "cardMoved" &&
        (event.payload as { instanceId?: CardInstance["instanceId"] })
          .instanceId === oldStage.instanceId,
    ),
    "old stage movement",
  );
  const newStageMove = must(
    result.events.find(
      (event) =>
        event.type === "cardMoved" &&
        (event.payload as { instanceId?: CardInstance["instanceId"] })
          .instanceId === newStage.instanceId,
    ),
    "new stage movement",
  );
  assert.equal(oldStageMove.seq < newStageMove.seq, true);
  assert.equal(
    result.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("zero-cost Stage play does not create Character overflow when Character area is full", () => {
  const { state, newCharacter } = setupFullCharacterPlayState(0);
  state.cardManifest.cards[newCharacter.cardId] = {
    ...must(state.cardManifest.cards[newCharacter.cardId], "stage manifest"),
    category: "stage",
  };

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  const p1State = must(result.state.players[p1], "p1");
  assert.equal(p1State.stage?.instanceId, newCharacter.instanceId);
  assert.equal(p1State.characters.length, 5);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "cardMoved", "cardPlayed", "ruleProcessingChecked"],
  );
});

test("nonzero occupied-Stage play pays before replacing old Stage", () => {
  const { state, newStage, oldStage } = setupOccupiedStagePlayState(2);

  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newStage.instanceId,
  });
  assert.equal(opened.errors, undefined);
  assert.equal(opened.state.pendingDecision?.type, "payCost");
  assert.equal(
    must(opened.state.players[p1], "opened p1").stage?.instanceId,
    oldStage.instanceId,
  );
  assert.deepEqual(
    opened.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );

  const openedP1 = must(opened.state.players[p1], "opened p1");
  const selected = must(openedP1.costArea[0], "don0");
  const selected2 = must(openedP1.costArea[1], "don1");
  const beforeInvalid = JSON.stringify(opened.state);
  const invalid = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: must(opened.state.pendingDecision, "decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId],
    },
  });
  assert.equal(invalid.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), beforeInvalid);

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
  const resolvedP1 = must(resolved.state.players[p1], "resolved p1");
  assert.equal(resolvedP1.stage?.instanceId, newStage.instanceId);
  assert.equal(
    must(resolvedP1.trash[0], "trash stage").instanceId,
    oldStage.instanceId,
  );
  assert.equal(resolvedP1.costArea[0]?.state, "rested");
  assert.equal(resolvedP1.costArea[1]?.state, "rested");
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "costPaid",
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
});

test("Stage replacement fails closed when old Stage has attached DON!! state", () => {
  const { state, newStage } = setupOccupiedStagePlayState(0);
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.stage, "stage");
  p1State.stage = {
    ...stage,
    attachedDon: ["invalid-stage-don" as CardInstance["instanceId"]],
  };
  const before = JSON.stringify(state);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newStage.instanceId,
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});
