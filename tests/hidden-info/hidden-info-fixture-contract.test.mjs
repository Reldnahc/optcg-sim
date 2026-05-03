import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const cleanFixturePath = path.join(
  repoRoot,
  "fixtures",
  "hidden-info",
  "clean-filtered-player-view.json",
);
const leakFixturesDir = path.join(repoRoot, "fixtures", "hidden-info", "leaks");
const baselinePrivateCategories = [
  "opponent-hand-card-ids",
  "deck-order",
  "deck-card-ids-beyond-count",
  "face-down-life-identity",
  "rng-state",
  "non-public-queue-internals",
  "private-decision-candidates",
  "internal-crash-recovery-metadata",
];

async function readJsonFixture(fixturePath) {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

function assertHiddenInfoFixture(fixture) {
  const publicPaths = fixture.publicPaths ?? [];
  const privatePaths = fixture.privatePaths ?? [];

  for (const publicPath of publicPaths) {
    if (!hasPath(fixture.view, publicPath.path)) {
      throw new Error(
        `${fixture.name} is missing allowed public path ${publicPath.path}`,
      );
    }
  }

  for (const privatePath of privatePaths) {
    if (hasPath(fixture.view, privatePath.path)) {
      throw new Error(
        `${fixture.name} leaks ${privatePath.category} at ${privatePath.path}`,
      );
    }
  }
}

function hasPath(value, fixturePath) {
  let current = value;

  for (const segment of fixturePath.split(".")) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return false;
    }

    current = current[segment];
  }

  return true;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withLeak(cleanFixture, leakFixture) {
  return {
    ...cleanFixture,
    name: leakFixture.name,
    view: setPath(
      cleanFixture.view,
      leakFixture.leakPath,
      leakFixture.leakValue,
    ),
  };
}

function setPath(source, fixturePath, value) {
  const segments = fixturePath.split(".");
  return setPathSegments(source, segments, value);
}

function setPathSegments(source, segments, value) {
  const [segment, ...remainingSegments] = segments;

  if (segment === undefined) {
    return value;
  }

  const sourceRecord = isRecord(source) ? source : {};
  return {
    ...sourceRecord,
    [segment]: setPathSegments(sourceRecord[segment], remainingSegments, value),
  };
}

test("accepts a filtered player-view fixture that preserves public fields", async () => {
  const fixture = await readJsonFixture(cleanFixturePath);

  expect(() => assertHiddenInfoFixture(fixture)).not.toThrow();
});

test("rejects each baseline private category independently when present", async () => {
  const cleanFixture = await readJsonFixture(cleanFixturePath);
  const leakFixtureNames = await readdir(leakFixturesDir);
  const leakFixtures = await Promise.all(
    leakFixtureNames
      .filter((fixtureName) => fixtureName.endsWith(".json"))
      .sort()
      .map((fixtureName) =>
        readJsonFixture(path.join(leakFixturesDir, fixtureName)),
      ),
  );

  expect(leakFixtures.map((fixture) => fixture.leakCategory).sort()).toEqual(
    [...baselinePrivateCategories].sort(),
  );

  for (const leakFixture of leakFixtures) {
    const fixture = withLeak(cleanFixture, leakFixture);

    expect(() => assertHiddenInfoFixture(fixture)).toThrow(
      `leaks ${leakFixture.leakCategory} at ${leakFixture.leakPath}`,
    );
  }
});
