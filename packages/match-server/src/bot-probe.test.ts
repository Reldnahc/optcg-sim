import { strict as assert } from "node:assert";
import type { DecisionId } from "@optcg/types";
import { describe, test } from "vitest";

import {
  defaultBotProbeScenarios,
  evaluateBotProbeFailures,
  probeScenarioWithNoLegalBotChoice,
  probeScenarioWithQuantityDecision,
  runBotProbe,
} from "./bot-probe.js";

describe("runBotProbe", () => {
  test("reports no stalls for baseline scenarios", () => {
    const report = runBotProbe(defaultBotProbeScenarios);

    assert.deepEqual(report.failures, []);
  });

  test("reports pending decision fallback usage", () => {
    const report = runBotProbe([probeScenarioWithQuantityDecision()]);

    assert.equal(report.scenarios[0]?.decisionReason?.kind, "fallback");
  });

  test("reports explainable score terms for visible action choices", () => {
    const report = runBotProbe(defaultBotProbeScenarios);
    const visibleActionReport = report.scenarios.find(
      (scenario) => scenario.choice?.type === "submitAction",
    );

    assert.notEqual(visibleActionReport, undefined);
    assert.ok((visibleActionReport?.explainableScore?.terms.length ?? 0) > 0);
  });

  test("reports quality summary", () => {
    const report = runBotProbe(defaultBotProbeScenarios);

    assert.equal(report.quality.scenarioCount, defaultBotProbeScenarios.length);
    assert.equal(report.quality.unexplainedChoiceCount, 0);
  });

  test("fails when a required choice is undefined", () => {
    const report = runBotProbe([probeScenarioWithNoLegalBotChoice()]);

    assert.equal(report.failures[0]?.kind, "stall");
  });

  test("fails when a direct decision response targets the wrong decision", () => {
    const scenario = probeScenarioWithQuantityDecision();
    const failures = evaluateBotProbeFailures(scenario, {
      id: scenario.id,
      choice: {
        type: "respondToDecision",
        decisionId: "decision:probe:other" as DecisionId,
        response: { type: "chooseQuantity", quantity: 1 },
      },
      intent: { type: "answerDecision" },
      turnLength: 0,
    });

    assert.equal(failures[0]?.kind, "missing-decision-response");
  });
});
