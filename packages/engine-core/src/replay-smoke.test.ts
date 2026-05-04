import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import type { CardId, MatchId, PlayerId } from "@optcg/types";

import { applyAction } from "./actions.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { createInitialState } from "./initial-state.js";
import { respondToMulliganDecision, startMulliganFlow } from "./mulligan.js";

const toCardId = (value: string): CardId => value as CardId;
const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

type LocalReplayFixture = {
  fixtureType: "engineCoreReplaySmokeLocalV1";
  description: string;
  setupInput: {
    matchId: string;
    firstPlayerId: string;
    rngSeed: string;
    playerOrder: readonly [string, string];
    leaderCardIds: Record<string, string>;
    leaderLifeCounts: Record<string, number>;
    deckCardIds: Record<string, string[]>;
    donDeckCardIds: Record<string, string[]>;
    shuffleDecks: boolean;
  };
  mulliganResponses: ReadonlyArray<{ playerId: string; keep: boolean }>;
  actionScript: ReadonlyArray<{ type: "concede"; playerId: string }>;
  expected: {
    checkpoints: ReadonlyArray<{ label: string; stateHash: string }>;
    finalStateHash: string;
  };
};

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/replays/eng-002-smoke.local.json",
);

const forbiddenFixtureKeyPatterns = [
  /timestamp/i,
  /receivedAt/i,
  /clientActionId/i,
  /signature/i,
  /transport/i,
  /userId/i,
  /server/i,
  /metadata/i,
];

const loadFixture = (): LocalReplayFixture => {
  const parsed = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
  return parsed as LocalReplayFixture;
};

const collectForbiddenKeys = (value: unknown, pathPrefix: string): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectForbiddenKeys(item, `${pathPrefix}[${String(index)}]`),
    );
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  const entries = Object.entries(value);
  return entries.flatMap(([key, nestedValue]) => {
    const keyPath = pathPrefix.length > 0 ? `${pathPrefix}.${key}` : key;
    const matched = forbiddenFixtureKeyPatterns.some((pattern) =>
      pattern.test(key),
    )
      ? [keyPath]
      : [];
    return [...matched, ...collectForbiddenKeys(nestedValue, keyPath)];
  });
};

const replayFixture = (fixture: LocalReplayFixture) => {
  const checkpoints: Array<{ label: string; stateHash: string }> = [];
  const setupInput = fixture.setupInput;
  const p1 = toPlayerId(setupInput.playerOrder[0]);
  const p2 = toPlayerId(setupInput.playerOrder[1]);

  const stateSetup = createInitialState({
    matchId: toMatchId(setupInput.matchId),
    firstPlayerId: toPlayerId(setupInput.firstPlayerId),
    rngSeed: setupInput.rngSeed,
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId(must(setupInput.leaderCardIds[p1], "p1 leaderCardId")),
      [p2]: toCardId(must(setupInput.leaderCardIds[p2], "p2 leaderCardId")),
    },
    leaderLifeCounts: {
      [p1]: must(setupInput.leaderLifeCounts[p1], "p1 leaderLifeCounts"),
      [p2]: must(setupInput.leaderLifeCounts[p2], "p2 leaderLifeCounts"),
    },
    deckCardIds: {
      [p1]: must(setupInput.deckCardIds[p1], "p1 deckCardIds").map(toCardId),
      [p2]: must(setupInput.deckCardIds[p2], "p2 deckCardIds").map(toCardId),
    },
    donDeckCardIds: {
      [p1]: must(setupInput.donDeckCardIds[p1], "p1 donDeckCardIds").map(
        toCardId,
      ),
      [p2]: must(setupInput.donDeckCardIds[p2], "p2 donDeckCardIds").map(
        toCardId,
      ),
    },
    shuffleDecks: setupInput.shuffleDecks,
  });
  checkpoints.push({
    label: "setup",
    stateHash: hashCanonicalStateValue(stateSetup),
  });

  const started = startMulliganFlow(stateSetup);
  checkpoints.push({
    label: "mulligan-started",
    stateHash: started.stateHash,
  });

  let state = started.state;
  fixture.mulliganResponses.forEach((response, index) => {
    const pending = state.pendingDecision;
    assert.ok(
      pending,
      `missing pending mulligan decision at index ${String(index)}`,
    );
    assert.equal(
      pending.playerId,
      toPlayerId(response.playerId),
      `mulligan responder drift at index ${String(index)}`,
    );
    const result = respondToMulliganDecision(state, {
      type: "respondToDecision",
      decisionId: pending.id,
      response: { type: "mulligan", keep: response.keep },
    });
    assert.equal(result.errors, undefined);
    state = result.state;
    checkpoints.push({
      label: `mulligan-response-${String(index + 1)}`,
      stateHash: result.stateHash,
    });
  });

  fixture.actionScript.forEach((action, index) => {
    const parsedAction = {
      type: "concede" as const,
      playerId: toPlayerId(action.playerId),
    };
    const result = applyAction(state, parsedAction);
    assert.equal(result.errors, undefined);
    state = result.state;
    checkpoints.push({
      label: `action-${String(index + 1)}-${action.type}`,
      stateHash: result.stateHash,
    });
  });

  return { checkpoints, finalStateHash: checkpoints.at(-1)?.stateHash };
};

test("replay smoke fixture reproduces expected checkpoint and final hashes", () => {
  const fixture = loadFixture();
  const replayed = replayFixture(fixture);

  assert.deepEqual(replayed.checkpoints, fixture.expected.checkpoints);
  assert.equal(replayed.finalStateHash, fixture.expected.finalStateHash);
});

test("action-script drift changes final hash from fixture expectation", () => {
  const fixture = loadFixture();
  const mutatedActionScript: LocalReplayFixture["actionScript"] = [
    { type: "concede", playerId: "p2" },
  ];
  const replayed = replayFixture({
    ...fixture,
    actionScript: mutatedActionScript,
  });

  assert.notEqual(replayed.finalStateHash, fixture.expected.finalStateHash);
});

test("mulligan responder drift is rejected before replaying decisions", () => {
  const fixture = loadFixture();
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
      replayFixture({
        ...fixture,
        mulliganResponses: [
          { ...firstResponse, playerId: secondResponse.playerId },
          { ...secondResponse, playerId: firstResponse.playerId },
        ],
      }),
    /mulligan responder drift at index 0/,
  );
});

test("fixture rejects timestamp-like and transport-only metadata keys", () => {
  const fixture = loadFixture();
  const forbiddenKeys = collectForbiddenKeys(fixture, "");

  assert.deepEqual(forbiddenKeys, []);

  assert.deepEqual(
    collectForbiddenKeys(
      {
        ...fixture,
        receivedAt: "2026-05-04T00:00:00.000Z",
        actionScript: [
          {
            ...fixture.actionScript[0],
            clientActionId: "client-action-1",
          },
        ],
      },
      "",
    ).sort(),
    ["actionScript[0].clientActionId", "receivedAt"],
  );
});
