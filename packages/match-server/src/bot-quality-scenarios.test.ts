import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  botQualityScenarios,
  expectedActionTypeByScenarioId,
} from "./bot-quality-scenarios.js";
import { runBotProbe } from "./bot-probe.js";

describe("bot quality scenarios", () => {
  test("bot does not stall on quality scenarios", () => {
    const report = runBotProbe(botQualityScenarios());

    assert.deepEqual(report.failures, []);
  });

  test("bot chooses expected action classes for doctrine scenarios", () => {
    const scenarios = botQualityScenarios();
    const report = runBotProbe(scenarios);

    for (const scenarioReport of report.scenarios) {
      const expectedType = expectedActionTypeByScenarioId.get(
        scenarioReport.id,
      );
      if (expectedType === undefined) {
        continue;
      }
      const scenario = scenarios.find(
        (candidate) => candidate.id === scenarioReport.id,
      );
      const choice = scenarioReport.choice;
      const action =
        choice?.type === "submitAction"
          ? scenario?.snapshot.players[scenario.botPlayerId]?.actions.find(
              (candidate) => candidate.index === choice.actionIndex,
            )
          : undefined;

      assert.equal(action?.type, expectedType, scenarioReport.id);
    }
  });
});
