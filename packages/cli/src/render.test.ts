import assert from "node:assert/strict";
import {
  getLegalActions,
  hashCanonicalStateValue,
  respondToMulliganDecision,
} from "@optcg/engine-core";
import type { GameState, PlayerId } from "@optcg/types";
import { test } from "vitest";

import { bootFixtureMatch } from "./boot.js";
import {
  renderDeveloperHand,
  renderLegalActions,
  renderShow,
} from "./render.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const keepPendingMulligan = (state: GameState): GameState => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "mulligan") {
    throw new TypeError("Expected a pending mulligan decision.");
  }
  const result = respondToMulliganDecision(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "mulligan", keep: true },
  });
  assert.equal(result.errors, undefined);
  return result.state;
};

const bootActiveFixtureMatch = (): GameState =>
  keepPendingMulligan(keepPendingMulligan(bootFixtureMatch().state));

const expectedP1Hand = `Developer-local hand for p1
[0] p1-card-1 [p1:deck:0:p1-card-1]
[1] p1-card-2 [p1:deck:1:p1-card-2]
[2] p1-card-3 [p1:deck:2:p1-card-3]
[3] p1-card-4 [p1:deck:3:p1-card-4]
[4] p1-card-5 [p1:deck:4:p1-card-5]`;

const expectedP2Hand = `Developer-local hand for p2
[0] p2-card-1 [p2:deck:0:p2-card-1]
[1] p2-card-2 [p2:deck:1:p2-card-2]
[2] p2-card-3 [p2:deck:2:p2-card-3]
[3] p2-card-4 [p2:deck:3:p2-card-4]
[4] p2-card-5 [p2:deck:4:p2-card-5]`;

const expectedShowForHash = (
  stateHash: string,
): string => `Developer-local terminal state
State seq: 1
Status: setup
Phase: refresh
Turn: p1 (global 1)
Pending decision: mulligan mulligan:0:p1 for p1 - Choose whether to keep your hand or mulligan.
Legal actions for p1:
  none
State hash: ${stateHash}

Players:
  p1:
    Leader: p1-leader [p1:leader] state=unset attachedDon=0
    Hand (5):
      [0] p1-card-1 [p1:deck:0:p1-card-1]
      [1] p1-card-2 [p1:deck:1:p1-card-2]
      [2] p1-card-3 [p1:deck:2:p1-card-3]
      [3] p1-card-4 [p1:deck:3:p1-card-4]
      [4] p1-card-5 [p1:deck:4:p1-card-5]
    Life (5):
      [0] p1-card-10 [p1:deck:9:p1-card-10] face-down
      [1] p1-card-9 [p1:deck:8:p1-card-9] face-down
      [2] p1-card-8 [p1:deck:7:p1-card-8] face-down
      [3] p1-card-7 [p1:deck:6:p1-card-7] face-down
      [4] p1-card-6 [p1:deck:5:p1-card-6] face-down
    Deck (4):
      [0] p1-card-11 [p1:deck:10:p1-card-11]
      [1] p1-card-12 [p1:deck:11:p1-card-12]
      [2] p1-card-13 [p1:deck:12:p1-card-13]
      [3] p1-card-14 [p1:deck:13:p1-card-14]
    DON deck (10):
      [0] p1-don-1 [p1:don:0:p1-don-1]
      [1] p1-don-2 [p1:don:1:p1-don-2]
      [2] p1-don-3 [p1:don:2:p1-don-3]
      [3] p1-don-4 [p1:don:3:p1-don-4]
      [4] p1-don-5 [p1:don:4:p1-don-5]
      [5] p1-don-6 [p1:don:5:p1-don-6]
      [6] p1-don-7 [p1:don:6:p1-don-7]
      [7] p1-don-8 [p1:don:7:p1-don-8]
      [8] p1-don-9 [p1:don:8:p1-don-9]
      [9] p1-don-10 [p1:don:9:p1-don-10]
    Cost area: empty
    Characters: empty
    Stage: empty
    Trash: empty
  p2:
    Leader: p2-leader [p2:leader] state=unset attachedDon=0
    Hand (5):
      [0] p2-card-1 [p2:deck:0:p2-card-1]
      [1] p2-card-2 [p2:deck:1:p2-card-2]
      [2] p2-card-3 [p2:deck:2:p2-card-3]
      [3] p2-card-4 [p2:deck:3:p2-card-4]
      [4] p2-card-5 [p2:deck:4:p2-card-5]
    Life (5):
      [0] p2-card-10 [p2:deck:9:p2-card-10] face-down
      [1] p2-card-9 [p2:deck:8:p2-card-9] face-down
      [2] p2-card-8 [p2:deck:7:p2-card-8] face-down
      [3] p2-card-7 [p2:deck:6:p2-card-7] face-down
      [4] p2-card-6 [p2:deck:5:p2-card-6] face-down
    Deck (4):
      [0] p2-card-11 [p2:deck:10:p2-card-11]
      [1] p2-card-12 [p2:deck:11:p2-card-12]
      [2] p2-card-13 [p2:deck:12:p2-card-13]
      [3] p2-card-14 [p2:deck:13:p2-card-14]
    DON deck (10):
      [0] p2-don-1 [p2:don:0:p2-don-1]
      [1] p2-don-2 [p2:don:1:p2-don-2]
      [2] p2-don-3 [p2:don:2:p2-don-3]
      [3] p2-don-4 [p2:don:3:p2-don-4]
      [4] p2-don-5 [p2:don:4:p2-don-5]
      [5] p2-don-6 [p2:don:5:p2-don-6]
      [6] p2-don-7 [p2:don:6:p2-don-7]
      [7] p2-don-8 [p2:don:7:p2-don-8]
      [8] p2-don-9 [p2:don:8:p2-don-9]
      [9] p2-don-10 [p2:don:9:p2-don-10]
    Cost area: empty
    Characters: empty
    Stage: empty
    Trash: empty`;

test("renderShow produces deterministic plain text for a booted fixture match", () => {
  const first = bootFixtureMatch();
  const second = bootFixtureMatch();

  assert.equal(renderShow(first.state), expectedShowForHash(first.stateHash));
  assert.equal(renderShow(second.state), expectedShowForHash(second.stateHash));
  assert.equal(renderShow(first.state), renderShow(second.state));
});

test("renderDeveloperHand is deterministic and scoped to the requested player", () => {
  const { state } = bootFixtureMatch();

  assert.equal(renderDeveloperHand(state, p1), expectedP1Hand);
  assert.equal(renderDeveloperHand(state, p1), expectedP1Hand);
  assert.equal(renderDeveloperHand(state, p2), expectedP2Hand);
  assert.doesNotMatch(renderDeveloperHand(state, p1), /p2-card/u);
  assert.doesNotMatch(renderDeveloperHand(state, p2), /p1-card/u);
});

test("renderLegalActions reflects existing engine-core legal actions", () => {
  const { state } = bootFixtureMatch();
  const legalActions = getLegalActions(state, p1);

  assert.deepEqual(legalActions, []);
  assert.equal(renderLegalActions(state, p1), `Legal actions for p1:\n  none`);

  const activeState = bootActiveFixtureMatch();
  assert.deepEqual(getLegalActions(activeState, p1), [
    { type: "concede", playerId: p1 },
  ]);
  assert.equal(
    renderLegalActions(activeState, p1),
    `Legal actions for p1:\n  [0] concede player=p1`,
  );
});

test("render helpers do not mutate state or change its canonical hash", () => {
  const { state } = bootFixtureMatch();
  const beforeHash = hashCanonicalStateValue(state);

  renderShow(state);
  renderDeveloperHand(state, p1);
  renderDeveloperHand(state, p2);
  renderLegalActions(state, p1);

  assert.equal(hashCanonicalStateValue(state), beforeHash);
});
