import assert from "node:assert/strict";
import { test } from "vitest";

import type { ResolvedCard } from "@optcg/types";

import {
  assertPlayCardReplayDrifts,
  loadFixtureV1,
  loadFixtureV2,
  loadPlayCardFixture,
  must,
  replayFixtureV1,
  replayPlayCardScenario,
  replayScenario,
} from "./replay-smoke-test-support.js";

test("ENG-002F action-script drift changes final hash from fixture expectation", () => {
  const fixture = loadFixtureV1();
  const replayed = replayFixtureV1({
    ...fixture,
    actionScript: [{ type: "concede", playerId: "p2" }],
  });
  assert.notEqual(replayed.finalStateHash, fixture.expected.finalStateHash);
});

test("ENG-002F mulligan responder drift is rejected before replaying decisions", () => {
  const fixture = loadFixtureV1();
  const firstResponse = must(
    fixture.mulliganResponses[0],
    "first mulligan response",
  );
  const secondResponse = must(
    fixture.mulliganResponses[1],
    "second mulligan response",
  );
  assert.throws(
    () =>
      replayFixtureV1({
        ...fixture,
        mulliganResponses: [
          { ...firstResponse, playerId: secondResponse.playerId },
          { ...secondResponse, playerId: firstResponse.playerId },
        ],
      }),
    /mulligan responder drift at index 0/,
  );
});

test("action-script drift changes final hash from fixture expectation", () => {
  const fixture = loadFixtureV2();
  const scenario = must(fixture.scenarios[0], "scenario 0");
  const replayed = replayScenario(fixture, {
    ...scenario,
    actionScript: [{ type: "endMainPhase" }],
  });
  assert.notEqual(replayed.finalStateHash, scenario.expected.finalStateHash);
});

test("manifest-stat drift changes final hash from fixture expectation", () => {
  const fixture = loadFixtureV2();
  const scenario = must(fixture.scenarios[0], "scenario 0");
  const replayed = replayScenario(fixture, {
    ...scenario,
    setupScript: [
      ...scenario.setupScript,
      {
        type: "setCardPower",
        cardId: "leader-red",
        category: "leader",
        power: 1000,
      },
    ],
  });
  assert.notEqual(replayed.finalStateHash, scenario.expected.finalStateHash);
});

test("ENG-005C action-script drift changes final hash from play-card fixture expectation", () => {
  const fixture = loadPlayCardFixture();
  const scenario = must(fixture.scenarios[1], "stage replacement scenario");
  const replayed = replayPlayCardScenario(fixture, {
    ...scenario,
    actionScript: scenario.actionScript.slice(0, 2),
  });
  assert.notEqual(replayed.finalStateHash, scenario.expected.finalStateHash);
  assert.notDeepEqual(replayed.checkpoints, scenario.expected.checkpoints);
});

test("ENG-005C payment-selection drift changes final hash from play-card fixture expectation", () => {
  const fixture = loadPlayCardFixture();
  const scenario = must(fixture.scenarios[0], "paid character scenario");
  assertPlayCardReplayDrifts(fixture, {
    ...scenario,
    actionScript: scenario.actionScript.map((action) =>
      action.type === "respondToPayment"
        ? { ...action, costAreaIndices: [1, 2] }
        : action,
    ),
  });
});

test("ENG-005C overflow-response drift changes final hash from play-card fixture expectation", () => {
  const fixture = loadPlayCardFixture();
  const scenario = must(fixture.scenarios[2], "overflow scenario");
  assertPlayCardReplayDrifts(fixture, {
    ...scenario,
    actionScript: scenario.actionScript.map((action) =>
      action.type === "respondToOverflow"
        ? { ...action, characterIndex: 1 }
        : action,
    ),
  });
});

test("ENG-005C manifest-stat drift changes final hash from play-card fixture expectation", () => {
  const fixture = loadPlayCardFixture();
  const scenario = must(fixture.scenarios[0], "paid character scenario");
  const mutatedCard = must(
    fixture.setupInput.cardManifest.cards["p1-a"],
    "p1-a manifest card",
  ) as ResolvedCard;
  const replayed = replayPlayCardScenario(
    {
      ...fixture,
      setupInput: {
        ...fixture.setupInput,
        cardManifest: {
          ...fixture.setupInput.cardManifest,
          manifestHash: "fixture-eng-005c-play-card-manifest-drift",
          cards: {
            ...fixture.setupInput.cardManifest.cards,
            "p1-a": { ...mutatedCard, power: 9000 },
          },
        },
      },
    },
    scenario,
  );
  assert.notEqual(replayed.finalStateHash, scenario.expected.finalStateHash);
});
