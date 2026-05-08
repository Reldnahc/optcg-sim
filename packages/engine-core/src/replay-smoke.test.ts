import assert from "node:assert/strict";
import { test } from "vitest";

import type { ResolvedCard } from "@optcg/types";

import {
  assertPlayCardFinalState,
  assertPlayCardReplayDrifts,
  collectForbiddenKeys,
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

test("ENG-002F fixture rejects timestamp-like and transport-only metadata keys", () => {
  const fixture = loadFixtureV1();
  assert.equal(
    fixture.setupInput.cardManifest.createdAt,
    "2026-05-04T00:00:00.000Z",
  );
  assert.deepEqual(collectForbiddenKeys(fixture, ""), []);
  assert.deepEqual(
    collectForbiddenKeys(
      {
        ...fixture,
        receivedAt: "2026-05-04T00:00:00.000Z",
        connectionId: "conn-1",
        actionScript: [
          {
            ...fixture.actionScript[0],
            clientActionId: "client-action-1",
          },
        ],
      },
      "",
    ).sort(),
    ["actionScript[0].clientActionId", "connectionId", "receivedAt"],
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

test("fixture determinism rejects transport/audit keys and allows deterministic manifest createdAt", () => {
  const fixture = loadFixtureV2();
  assert.equal(
    fixture.setupInput.cardManifest.createdAt,
    "2026-05-04T00:00:00.000Z",
  );
  assert.deepEqual(collectForbiddenKeys(fixture, ""), []);
  assert.deepEqual(
    collectForbiddenKeys(
      {
        ...fixture,
        connectionId: "conn-1",
        receivedAt: "2026-05-04T00:00:00.000Z",
        scenarios: [
          { ...fixture.scenarios[0], clientActionId: "client-action-1" },
        ],
      },
      "",
    ).sort(),
    ["connectionId", "receivedAt", "scenarios[0].clientActionId"],
  );
});

test("ENG-005C/ENG-006 replay smoke fixture reproduces paid Character, Stage replacement, Character overflow, and Event play hashes", () => {
  const fixture = loadPlayCardFixture();
  for (const scenario of fixture.scenarios) {
    const replayed = replayPlayCardScenario(fixture, scenario);
    assert.deepEqual(replayed.checkpoints, scenario.expected.checkpoints);
    assert.equal(replayed.finalStateHash, scenario.expected.finalStateHash);
    assert.deepEqual(replayed.finalStatus, scenario.expected.finalStatus);
    assertPlayCardFinalState(replayed.finalState, scenario.expected.finalState);
  }
});

test("ENG-005C replay smoke final hashes remain pinned", () => {
  const fixture = loadPlayCardFixture();

  assert.deepEqual(
    fixture.scenarios.map((scenario) => ({
      id: scenario.id,
      finalStateHash: scenario.expected.finalStateHash,
    })),
    [
      {
        id: "paid-character",
        finalStateHash:
          "44b92fdbdc0fe5126a1cf835915ffaa983f1068e4c4909ae1e4dc37092f71902",
      },
      {
        id: "stage-replacement",
        finalStateHash:
          "47400b8386558c12b1285da9c026f74f16cb4d9fbccad331ebe31e24d7b8b993",
      },
      {
        id: "character-overflow",
        finalStateHash:
          "4e25f4b591af1f23c15f7c9983c79a6db68a5c09137bed3dc7906e143068bb5d",
      },
      {
        id: "paid-event",
        finalStateHash:
          "08ac1decd6cc538d110891bcb2ad6cd4510443bd7245b46a4bcb4bf7cd32469b",
      },
    ],
  );
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

test("ENG-005C fixture determinism rejects transport/audit keys and allows deterministic manifest createdAt", () => {
  const fixture = loadPlayCardFixture();
  assert.equal(
    fixture.setupInput.cardManifest.createdAt,
    "2026-05-04T00:00:00.000Z",
  );
  assert.deepEqual(collectForbiddenKeys(fixture, ""), []);
  assert.deepEqual(
    collectForbiddenKeys(
      {
        ...fixture,
        audit: [{ receivedAt: "2026-05-04T00:00:00.000Z" }],
        clientId: "client-1",
        signature: "sig",
        scenarios: [
          {
            ...fixture.scenarios[0],
            actionScript: [
              {
                ...fixture.scenarios[0]?.actionScript[0],
                clientActionId: "client-action-1",
              },
            ],
          },
        ],
      },
      "",
    ).sort(),
    [
      "audit[0].receivedAt",
      "clientId",
      "scenarios[0].actionScript[0].clientActionId",
      "signature",
    ],
  );
});
