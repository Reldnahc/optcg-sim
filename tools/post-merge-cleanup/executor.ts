import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type * as PacketLifecycle from "../agent-packet-lifecycle.js";
import type { BoundCleanupPlan } from "./types.js";
import type * as Validator from "./validator.js";

const { sha256, toManifestPath }: typeof PacketLifecycle = createRequire(
  import.meta.url,
)("../agent-packet-lifecycle.ts") as typeof PacketLifecycle;
const { validateBoundCleanupPlanArtifact }: typeof Validator = createRequire(
  import.meta.url,
)("./validator.ts") as typeof Validator;

const ACTIVE_MANIFEST_PATH = "agent-packets/active.json";
const CLEANUP_WORKSPACE_PREFIX = ".cleanup/";

export function selectPacketCompletionCommand(plan: BoundCleanupPlan) {
  assertPacketCommandMatchesStories(plan);
  return {
    args: [
      "pnpm",
      "run",
      plan.packetCommand.command,
      ...plan.packetCommand.args,
    ],
    command: "corepack",
  };
}

export function assertCleanWorktreeStatus(status: string) {
  const dirtyLines = status
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .filter((line) => !isAllowedCleanupWorkspaceStatus(line));
  if (dirtyLines.length > 0) {
    throw new Error(
      "Post-merge cleanup worktree must be clean before packet completion starts.",
    );
  }
}

export function buildCleanupCommitMessage(plan: BoundCleanupPlan) {
  const storyIds = plan.stories
    .map((story) => story.storyId)
    .sort((left, right) => left.localeCompare(right))
    .join(", ");
  return `Post-merge packet cleanup for PR #${String(
    plan.mergedPullRequest.number,
  )}: ${storyIds}`;
}

export async function validateBoundCleanupPlanForExecution(options: {
  plan: unknown;
  repoRoot: string;
  trustedMainSha: string;
}) {
  const plan = validateBoundCleanupPlanArtifact(options.plan);
  assertPacketCommandMatchesStories(plan);
  if (plan.mergedPullRequest.mergeSha !== options.trustedMainSha) {
    throw new Error(
      "Bound cleanup plan is stale: trusted main SHA does not match the merged PR SHA.",
    );
  }

  for (const story of plan.stories) {
    const storyPath = resolveRepoPath(options.repoRoot, story.storyPath);
    const packetPath = resolveRepoPath(options.repoRoot, story.packetPath);
    const donePath = resolveRepoPath(
      options.repoRoot,
      toDoneStoryPath(story.storyPath),
    );
    const storySource = await readRequiredFile(
      storyPath,
      `approved story ${story.storyPath}`,
    );
    const packetSource = await readRequiredFile(
      packetPath,
      `packet ${story.packetPath}`,
    );

    if (sha256(storySource) !== story.storySha256) {
      throw new Error(
        `Bound cleanup plan has stale story evidence for ${story.storyId}.`,
      );
    }
    if (sha256(packetSource) !== story.packetSha256) {
      throw new Error(
        `Bound cleanup plan has stale packet evidence for ${story.storyId}.`,
      );
    }
    if (await fileExists(donePath)) {
      throw new Error(
        `Bound cleanup plan is stale: done story already exists for ${story.storyId}.`,
      );
    }
  }

  return plan;
}

export async function executePacketCleanupPlan(options: {
  plan: unknown;
  repoRoot: string;
  trustedMainSha: string;
}) {
  const plan = await validateBoundCleanupPlanForExecution(options);
  assertCleanWorktreeStatus(
    git(options.repoRoot, ["status", "--porcelain=v1"]),
  );
  const command = selectPacketCompletionCommand(plan);
  execFileSync(command.command, command.args, {
    cwd: options.repoRoot,
    stdio: "inherit",
  });
  await validatePacketCompletionDiff({ plan, repoRoot: options.repoRoot });
}

export async function finalizePacketCleanupPlan(options: {
  plan: unknown;
  repoRoot: string;
  trustedMainSha: string;
}) {
  const plan = validateBoundCleanupPlanArtifact(options.plan);
  assertPacketCommandMatchesStories(plan);
  if (plan.mergedPullRequest.mergeSha !== options.trustedMainSha) {
    throw new Error(
      "Bound cleanup plan is stale: trusted main SHA does not match the merged PR SHA.",
    );
  }
  await validatePacketCompletionDiff({ plan, repoRoot: options.repoRoot });
  execFileSync(
    "git",
    ["-C", options.repoRoot, "add", "-A", "--", ...expectedAllowedPaths(plan)],
    {
      encoding: "utf8",
    },
  );
  execFileSync(
    "git",
    ["-C", options.repoRoot, "commit", "-m", buildCleanupCommitMessage(plan)],
    {
      encoding: "utf8",
    },
  );
}

export async function validatePacketCompletionDiff(options: {
  plan: BoundCleanupPlan;
  repoRoot: string;
}) {
  validateBoundCleanupPlanArtifact(options.plan);
  const allowedPaths = expectedAllowedPaths(options.plan);
  const changedPaths = gitChangedPaths(options.repoRoot);

  if (changedPaths.size === 0) {
    throw new Error("Packet completion produced no cleanup diff.");
  }

  for (const changedPath of changedPaths) {
    if (!allowedPaths.has(changedPath)) {
      throw new Error(`Unexpected cleanup output path: ${changedPath}.`);
    }
  }

  for (const story of options.plan.stories) {
    await validateStoryLifecycleOutput(options.repoRoot, story);
  }
  await validateActiveManifestOutput(options.repoRoot, options.plan);
}

function assertPacketCommandMatchesStories(plan: BoundCleanupPlan) {
  const expectedArgs = plan.stories.flatMap((story) => [
    "--story",
    story.storyPath,
  ]);
  const expectedCommand =
    plan.stories.length === 1 ? "packets:complete" : "packets:complete-many";

  if (
    plan.packetCommand.command !== expectedCommand ||
    !stringArraysEqual(plan.packetCommand.args, expectedArgs)
  ) {
    throw new Error(
      "Bound cleanup plan packet command does not match listed stories.",
    );
  }
}

async function validateStoryLifecycleOutput(
  repoRoot: string,
  story: BoundCleanupPlan["stories"][number],
) {
  const headStorySource = gitRaw(repoRoot, ["show", `HEAD:${story.storyPath}`]);
  const headPacketSource = gitRaw(repoRoot, [
    "show",
    `HEAD:${story.packetPath}`,
  ]);

  if (sha256(headStorySource) !== story.storySha256) {
    throw new Error(
      `HEAD story evidence does not match bound cleanup plan for ${story.storyId}.`,
    );
  }
  if (sha256(headPacketSource) !== story.packetSha256) {
    throw new Error(
      `HEAD packet evidence does not match bound cleanup plan for ${story.storyId}.`,
    );
  }
  if (await fileExists(resolveRepoPath(repoRoot, story.storyPath))) {
    throw new Error(
      `Approved story remains after packet completion for ${story.storyId}.`,
    );
  }
  if (await fileExists(resolveRepoPath(repoRoot, story.packetPath))) {
    throw new Error(
      `Agent packet remains after packet completion for ${story.storyId}.`,
    );
  }

  const expectedDoneSource = headStorySource.replace(
    /^status:\s+approved$/m,
    "status: done",
  );
  if (expectedDoneSource === headStorySource) {
    throw new Error(
      `HEAD approved story cannot be converted to done for ${story.storyId}.`,
    );
  }
  const doneStoryPath = toDoneStoryPath(story.storyPath);
  const doneStorySource = await readRequiredFile(
    resolveRepoPath(repoRoot, doneStoryPath),
    `done story ${doneStoryPath}`,
  );
  if (
    normalizeLineEndings(doneStorySource) !==
    normalizeLineEndings(expectedDoneSource)
  ) {
    throw new Error(
      `Done story ${doneStoryPath} does not match exact packet completion output.`,
    );
  }
}

async function validateActiveManifestOutput(
  repoRoot: string,
  plan: BoundCleanupPlan,
) {
  const manifestPath = resolveRepoPath(repoRoot, ACTIVE_MANIFEST_PATH);
  const manifestSource = await readRequiredFile(
    manifestPath,
    ACTIVE_MANIFEST_PATH,
  );
  const headManifestSource = gitRaw(repoRoot, [
    "show",
    `HEAD:${ACTIVE_MANIFEST_PATH}`,
  ]);
  const manifest = parseActiveManifest(manifestSource);
  const headManifest = parseActiveManifest(headManifestSource);
  const completedStoryIds = new Set(plan.stories.map((story) => story.storyId));
  const completedStoryPaths = new Set(
    plan.stories.map((story) => story.storyPath),
  );
  const expectedManifest = {
    activeStories: headManifest.activeStories.filter(
      (activeStory) =>
        !completedStoryIds.has(activeStory.storyId) &&
        !completedStoryPaths.has(activeStory.storyPath),
    ),
    version: headManifest.version,
  };

  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
    throw new Error(
      "Active packet manifest does not match exact packet completion output.",
    );
  }
}

function parseActiveManifest(source: string) {
  const manifest = JSON.parse(source) as {
    activeStories?: unknown;
    version?: unknown;
  };
  if (manifest.version !== 1 || !Array.isArray(manifest.activeStories)) {
    throw new Error(
      "Active packet manifest does not match exact packet completion output.",
    );
  }
  const activeStories = manifest.activeStories.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(
        "Active packet manifest contains malformed active story output.",
      );
    }
    const activeStory = entry as Record<string, unknown>;
    const packetPath = activeStory["packetPath"];
    const storyId = activeStory["storyId"];
    const storyPath = activeStory["storyPath"];
    const storySha256 = activeStory["storySha256"];
    if (
      typeof packetPath !== "string" ||
      typeof storyId !== "string" ||
      typeof storyPath !== "string" ||
      typeof storySha256 !== "string"
    ) {
      throw new Error(
        "Active packet manifest contains malformed active story output.",
      );
    }
    return {
      packetPath,
      storyId,
      storyPath,
      storySha256,
    };
  });
  return {
    activeStories,
    version: manifest.version,
  };
}

function expectedAllowedPaths(plan: BoundCleanupPlan) {
  return new Set([
    ACTIVE_MANIFEST_PATH,
    ...plan.stories.flatMap((story) => [
      story.storyPath,
      toDoneStoryPath(story.storyPath),
      story.packetPath,
    ]),
  ]);
}

function gitChangedPaths(repoRoot: string) {
  const output = git(repoRoot, ["status", "--porcelain=v1", "-uall"]);
  const paths = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }
    if (isAllowedCleanupWorkspaceStatus(line)) {
      continue;
    }
    for (const changedPath of readStatusPaths(line)) {
      paths.add(changedPath);
    }
  }
  return paths;
}

function isAllowedCleanupWorkspaceStatus(line: string) {
  return line.slice(3).startsWith(CLEANUP_WORKSPACE_PREFIX);
}

function readStatusPaths(line: string) {
  const status = line.slice(0, 2);
  const payload = line.slice(3);
  if (status.includes("R") || status.includes("C")) {
    return payload
      .split(" -> ")
      .filter((entry) => entry.length > 0)
      .map((entry) => toPortablePath(entry));
  }
  return [toPortablePath(payload)];
}

function git(repoRoot: string, args: string[]) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
  }).trimEnd();
}

function gitRaw(repoRoot: string, args: string[]) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
  });
}

async function readRequiredFile(filePath: string, label: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Missing required cleanup file: ${label}.`);
  }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveRepoPath(repoRoot: string, repoPath: string) {
  return path.join(repoRoot, ...repoPath.split("/"));
}

function toDoneStoryPath(storyPath: string) {
  return `stories/done/${path.posix.basename(storyPath)}`;
}

function toPortablePath(filePath: string) {
  return toManifestPath("", filePath).replace(/^\//, "");
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function stringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}
