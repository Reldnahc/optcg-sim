import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { summarizeBotSelfPlayMetrics } from "./bot-self-play.js";

describe("summarizeBotSelfPlayMetrics", () => {
  test("summarizes action and explanation counts", () => {
    const report = summarizeBotSelfPlayMetrics([
      {
        turnNumber: 1,
        botPlayerId: "p1",
        actionCount: 4,
        endedByChoice: true,
        unexplainedChoiceCount: 0,
      },
      {
        turnNumber: 2,
        botPlayerId: "p2",
        actionCount: 2,
        endedByChoice: true,
        unexplainedChoiceCount: 1,
      },
    ]);

    assert.equal(report.averageActionsPerTurn, 3);
    assert.equal(report.unexplainedChoiceCount, 1);
  });
});
