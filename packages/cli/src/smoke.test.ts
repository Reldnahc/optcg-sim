import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  assertCliSmokePostActionOutputFields,
  assertCliSmokeScenarioResultMatchesFixture,
  loadCliSmokeFixtureFromFile,
  runCliSmokeScenario,
} from "./smoke.js";
import type {
  CliSmokeFixture,
  CliSmokeScenario,
  CliSmokeScenarioResult,
} from "./smoke.js";

const fixturePath = fileURLToPath(
  new URL(
    "../../../fixtures/replays/cli-001d-terminal-runner.local.json",
    import.meta.url,
  ),
);

const findScenario = (
  fixture: CliSmokeFixture,
  scenarioId: string,
): CliSmokeScenario => {
  const scenario = fixture.scenarios.find(
    (candidate) => candidate.id === scenarioId,
  );
  assert.ok(scenario !== undefined, `missing scenario ${scenarioId}`);
  return scenario;
};

const replaceScenario = (
  fixture: CliSmokeFixture,
  replacement: CliSmokeScenario,
): CliSmokeFixture => ({
  ...fixture,
  scenarios: fixture.scenarios.map((scenario) =>
    scenario.id === replacement.id ? replacement : scenario,
  ),
});

const assertDeterministicScenario = (
  fixture: CliSmokeFixture,
  scenarioId: string,
): CliSmokeScenarioResult => {
  const first = runCliSmokeScenario(fixture, scenarioId);
  const second = runCliSmokeScenario(fixture, scenarioId);

  assert.deepEqual(first.checkpoints, second.checkpoints);
  assert.equal(first.finalStateHash, second.finalStateHash);
  assert.deepEqual(first.finalStatus, second.finalStatus);
  assertCliSmokeScenarioResultMatchesFixture(fixture, first);
  return first;
};

describe("CLI-001D terminal runner smoke scripts", () => {
  test("replays deterministic boot through concession completion", () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const result = assertDeterministicScenario(
      fixture,
      "concession-completion",
    );

    assert.deepEqual(result.finalStatus, { type: "completed", winner: "p2" });
  });

  test("replays deterministic supported leader-damage terminal defeat", () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const result = assertDeterministicScenario(
      fixture,
      "leader-damage-terminal-defeat",
    );

    assert.deepEqual(result.finalStatus, { type: "completed", winner: "p1" });
  });

  test("surfaces deterministic deck-out terminal defeat through engine rule processing", () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const result = assertDeterministicScenario(
      fixture,
      "deck-out-terminal-defeat",
    );

    assert.deepEqual(result.finalStatus, { type: "completed", winner: "p1" });
  });

  test("detects command-script drift or manifest-stat drift", () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const leaderDamage = findScenario(fixture, "leader-damage-terminal-defeat");
    const commandDriftFixture = replaceScenario(fixture, {
      ...leaderDamage,
      actionCommands: ["concede"],
    });

    const commandDrift = runCliSmokeScenario(
      commandDriftFixture,
      leaderDamage.id,
    );
    assert.notEqual(
      commandDrift.finalStateHash,
      leaderDamage.expected.finalHash,
    );
    assert.throws(() => {
      assertCliSmokeScenarioResultMatchesFixture(
        commandDriftFixture,
        commandDrift,
      );
    }, /(checkpoint|final) hash/u);

    assert.throws(
      () =>
        runCliSmokeScenario(
          {
            ...fixture,
            manifestStats: {
              ...fixture.manifestStats,
              cardCount: fixture.manifestStats.cardCount + 1,
            },
          },
          "concession-completion",
        ),
      /manifest cardCount/u,
    );
  });

  test("includes required post-action output fields for every smoke script output", () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);

    for (const scenario of fixture.scenarios) {
      assertCliSmokePostActionOutputFields(
        runCliSmokeScenario(fixture, scenario.id),
      );
    }
  });
});
