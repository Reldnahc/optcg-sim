import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { PlayerId } from "@optcg/types";

import { chooseBotAction } from "./bot-player.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

const botId = "p2" as PlayerId;

const snapshotWithActions = (
  actions: DevMatchSnapshot["players"][PlayerId]["actions"],
): DevMatchSnapshot =>
  ({
    stateSeq: 7,
    actionSeq: 3,
    stateHash: "hash",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: botId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botId]: 1 },
    },
    activePlayerId: botId,
    players: {
      [botId]: {
        view: {},
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("bot player", () => {
  test("keeps mulligans when a mulligan decision is available", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "respondToDecision",
          label: "Mulligan",
          responseKey: "mulligan",
        },
        {
          index: 1,
          type: "respondToDecision",
          label: "Keep",
          responseKey: "keep",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("plays cards before ending main phase", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "playCard",
          label: "Play card",
        },
        {
          index: 1,
          type: "endMainPhase",
          label: "End main phase",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("attacks before ending main phase", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "endMainPhase",
          label: "End main phase",
        },
        {
          index: 1,
          type: "declareAttack",
          label: "Attack leader",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("activates effects before ending main phase", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "endMainPhase",
          label: "End main phase",
        },
        {
          index: 1,
          type: "activateEffect",
          label: "Activate effect",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("attaches DON before ending main phase", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "endMainPhase",
          label: "End main phase",
        },
        {
          index: 1,
          type: "attachDon",
          label: "Attach DON",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("ignores concession when another legal action exists", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "concede",
          label: "Concede",
        },
        {
          index: 1,
          type: "advanceToMainPhase",
          label: "Advance to main phase",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("does not concede when concession is the only visible action", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "concede",
          label: "Concede",
        },
      ]),
      botId,
    );

    assert.equal(chosen, undefined);
  });
});
