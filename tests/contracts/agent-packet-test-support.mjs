import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const storyPath = path.join(
  repoRoot,
  "tests/fixtures/stories/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
);

export const expectedRelevantConstraintBullets = [
  "one approved story may be active for implementation or review handoff at a time",
  "dormant approved backlog stories do not require checked-in packets",
  "completed stories must move to done history and must not remain in the active packet manifest",
  "the parent agent owns story-state transitions and active-packet cleanup",
  "packet tooling should enforce lifecycle invariants rather than relying on reviewer memory",
  "use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`",
  "TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification",
  "ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale",
];

const tempRepoFixtureEntries = [
  {
    fileName: "build-agent-packet.ts",
    sourceDir: "tools",
    targetDir: "tools",
  },
  {
    fileName: "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
    sourceDir: "tests/fixtures/stories",
    targetDir: "stories/approved",
  },
  {
    fileName: "15-implementation-kickoff.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "23-repo-tooling-and-enforcement.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "24-story-schema.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "26-agent-packet-template.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "27-spec-driven-story-generation-workflow.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "32-codex-agent-integration.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
];

const tempDirs = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true })),
  );
});

export async function makeTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "optcg-agent-packets-"));
  tempDirs.push(tempDir);
  return tempDir;
}

export function runPacketTool(args, options = {}) {
  return runPacketToolFromRepo(repoRoot, args, options);
}

export function runPacketToolFromRepo(targetRepoRoot, args, options = {}) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(targetRepoRoot, "tools/build-agent-packet.ts"),
      ...args,
    ],
    {
      cwd: targetRepoRoot,
      encoding: "utf8",
      ...options,
    },
  );
}

export async function makeTempRepoFixture() {
  const tempDir = await makeTempDir();
  const tempRepoRoot = path.join(tempDir, "repo");

  await mkdir(tempRepoRoot, { recursive: true });

  for (const fixtureEntry of tempRepoFixtureEntries) {
    const sourcePath = path.join(
      repoRoot,
      fixtureEntry.sourceDir,
      fixtureEntry.fileName,
    );
    const targetDir = path.join(tempRepoRoot, fixtureEntry.targetDir);
    const targetPath = path.join(targetDir, fixtureEntry.fileName);

    await mkdir(targetDir, { recursive: true });
    await cp(sourcePath, targetPath);
  }

  return tempRepoRoot;
}

export async function listFilesRecursive(rootDir, baseDir = rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const filePaths = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...(await listFilesRecursive(entryPath, baseDir)));
      continue;
    }

    if (entry.isFile()) {
      filePaths.push(
        path.relative(baseDir, entryPath).split(path.sep).join("/"),
      );
    }
  }

  return filePaths.sort();
}

export async function readStoryValues(readFile) {
  const story = await readFile(storyPath, "utf8");
  return {
    acceptanceCriteria: readStoryList(story, "acceptance_criteria"),
    allowedTouchPoints: readStoryList(story, "allowed_touch_points"),
    nonScope: readStoryList(story, "non_scope"),
    repoRules: readStoryList(story, "repo_rules"),
    specRefs: readStoryList(story, "spec_refs"),
    storyBoundary: readStoryScalar(story, "story_boundary"),
  };
}

function readStoryScalar(source, key) {
  const blockMatch = source.match(
    new RegExp(`^${key}:\\s*[>|][-+]?\\r?\\n((?:  .*\\r?\\n?)*)`, "m"),
  );

  if (blockMatch?.[1]) {
    return blockMatch[1]
      .split(/\r?\n/)
      .filter((line) => line.startsWith("  "))
      .map((line) => line.slice(2).trim())
      .join(" ")
      .trim();
  }

  const scalarMatch = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));

  if (!scalarMatch?.[1]) {
    throw new Error(`Unable to read story scalar ${key}`);
  }

  return scalarMatch[1].trim();
}

function readStoryList(source, key) {
  const listMatch = source.match(
    new RegExp(`^${key}:\\r?\\n((?:  - .*\\r?\\n?)*)`, "m"),
  );

  if (!listMatch?.[1]) {
    throw new Error(`Unable to read story list ${key}`);
  }

  return listMatch[1]
    .split(/\r?\n/)
    .filter((line) => line.startsWith("  - "))
    .map((line) => parseYamlScalar(line.slice(4)));
}

function parseYamlScalar(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function readPacketSection(packet, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionMatch = packet.match(
    new RegExp(
      `^## ${escapedHeading}\\r?\\n\\r?\\n([\\s\\S]*?)(?=^## |\\Z)`,
      "m",
    ),
  );

  if (!sectionMatch?.[1]) {
    throw new Error(`Unable to read packet section ${heading}`);
  }

  return sectionMatch[1].trimEnd();
}

export function readPacketBullets(packet, heading) {
  return readPacketRawBullets(packet, heading);
}

export function readPacketRawBullets(packet, heading) {
  return readPacketSection(packet, heading)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function toCrlf(value) {
  return value.replace(/\r?\n/g, "\r\n");
}
