import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  assertCliSmokePostActionOutputFields,
  assertCliSmokeScenarioResultMatchesFixture,
  loadCliSmokeFixtureFromFile,
  runCliSmokeScenarioFromNormalBootThroughCommandScript,
  runCliSmokeScenarioThroughCommandScript,
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

const scenarioCommands = (scenario: CliSmokeScenario): readonly string[] => [
  ...scenario.bootCommands,
  ...scenario.actionCommands,
];

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

  test("includes required post-action output fields for every smoke script output", async () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);

    for (const scenario of fixture.scenarios) {
      assertCliSmokePostActionOutputFields(
        scenario.id === "full-vanilla-terminal-match"
          ? await runCliSmokeScenarioFromNormalBootThroughCommandScript(
              fixture,
              scenario.id,
            )
          : runCliSmokeScenario(fixture, scenario.id),
      );
    }
  });
});

describe("CLI-001H play-card terminal smoke scripts", () => {
  test("executes play-card action scripts through command-script mode", async () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);

    for (const scenarioId of [
      "vanilla-character-play",
      "vanilla-stage-replacement",
      "character-overflow-selection",
    ]) {
      const result = await runCliSmokeScenarioThroughCommandScript(
        fixture,
        scenarioId,
      );

      assertCliSmokeScenarioResultMatchesFixture(fixture, result);
    }
  });

  test("replays deterministic vanilla Character play from hand", () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const scenario = findScenario(fixture, "vanilla-character-play");

    assert.equal(scenario.actionCommands[0], "play 0");
    assert.ok(
      scenario.actionCommands.includes("respond pay:0"),
      "scenario must exercise nonzero-cost play-card payment",
    );

    const result = assertDeterministicScenario(
      fixture,
      "vanilla-character-play",
    );

    assert.equal(result.finalStatus.type, "active");
  });

  test("replays deterministic vanilla Stage replacement from hand", () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const scenario = findScenario(fixture, "vanilla-stage-replacement");

    assert.equal(scenario.actionCommands[0], "play 1");
    assert.ok(
      scenario.actionCommands.includes("respond pay:0,1"),
      "scenario must exercise multi-DON play-card payment",
    );

    const result = assertDeterministicScenario(
      fixture,
      "vanilla-stage-replacement",
    );

    assert.equal(result.finalStatus.type, "active");
  });

  test("replays deterministic Character overflow selection from hand", () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const scenario = findScenario(fixture, "character-overflow-selection");

    assert.equal(scenario.actionCommands[0], "play 0");
    assert.ok(
      scenario.actionCommands.includes("respond cards:character:0"),
      "scenario must exercise Character overflow card selection",
    );

    const result = assertDeterministicScenario(
      fixture,
      "character-overflow-selection",
    );

    assert.equal(result.finalStatus.type, "active");
  });
});

describe("CLI-002A full vanilla terminal match smoke", () => {
  test("runs a complete vanilla match from normal boot through command-script mode", async () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const scenario = findScenario(fixture, "full-vanilla-terminal-match");

    assert.deepEqual(
      scenario.setupScript,
      [],
      "full-match smoke must not use post-boot setup mutation shortcuts",
    );
    assert.deepEqual(scenario.bootCommands, ["respond keep", "respond keep"]);
    assert.equal(
      scenarioCommands(scenario).includes("respond keep"),
      true,
      "full-match smoke must exercise normal mulligan respond commands",
    );

    const first = await runCliSmokeScenarioFromNormalBootThroughCommandScript(
      fixture,
      scenario.id,
    );
    const second = await runCliSmokeScenarioFromNormalBootThroughCommandScript(
      fixture,
      scenario.id,
    );

    assert.deepEqual(first.checkpoints, second.checkpoints);
    assert.equal(first.finalStateHash, second.finalStateHash);
    assert.deepEqual(first.finalStatus, second.finalStatus);
    assert.deepEqual(first.finalStatus, { type: "completed", winner: "p1" });
    assertCliSmokeScenarioResultMatchesFixture(fixture, first);
    assertCliSmokePostActionOutputFields(first);
  });

  test("documents the required terminal command surface used by the full-match script", () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const scenario = findScenario(fixture, "full-vanilla-terminal-match");
    const commands = scenarioCommands(scenario);

    assert.equal(
      commands.some((command) => command === "respond keep"),
      true,
    );
    assert.equal(
      commands.some((command) => /^play \d+$/u.test(command)),
      true,
    );
    assert.equal(
      commands.some((command) => /^respond pay:\d+(?:,\d+)*$/u.test(command)),
      true,
    );
    assert.equal(
      commands.some((command) => /^attach-don \d+ \S+$/u.test(command)),
      true,
    );
    assert.equal(
      commands.some((command) => /^attack \S+ \S+$/u.test(command)),
      true,
    );
    assert.equal(
      commands.some((command) => command === "respond none"),
      true,
    );
    assert.equal(
      commands.some((command) => command === "pass"),
      true,
    );
  });

  test("detects full-match command-script or manifest-stat drift", async () => {
    const fixture = loadCliSmokeFixtureFromFile(fixturePath);
    const scenario = findScenario(fixture, "full-vanilla-terminal-match");
    const driftedScenario = {
      ...scenario,
      expected: {
        ...scenario.expected,
        finalHash: `${scenario.expected.finalHash}:drift`,
      },
    };
    const commandDriftFixture = replaceScenario(fixture, driftedScenario);

    const commandDrift =
      await runCliSmokeScenarioFromNormalBootThroughCommandScript(
        commandDriftFixture,
        scenario.id,
      );
    assert.throws(() => {
      assertCliSmokeScenarioResultMatchesFixture(
        commandDriftFixture,
        commandDrift,
      );
    }, /(checkpoint|final) hash/u);

    await assert.rejects(
      () =>
        runCliSmokeScenarioFromNormalBootThroughCommandScript(
          {
            ...fixture,
            manifestStats: {
              ...fixture.manifestStats,
              manifestHash: `${fixture.manifestStats.manifestHash}:drift`,
            },
          },
          scenario.id,
        ),
      /manifest manifestHash/u,
    );
  });
});
