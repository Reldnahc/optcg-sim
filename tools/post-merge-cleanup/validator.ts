import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type * as PacketParser from "../agent-packet-parser.js";
import type * as PacketLifecycle from "../agent-packet-lifecycle.js";
import type {
  CleanupDryRunPlan,
  CleanupMetadata,
  CleanupStoryValidation,
} from "./types.js";

const { parseStoryYaml }: typeof PacketParser = createRequire(import.meta.url)(
  "../agent-packet-parser.ts",
) as typeof PacketParser;
const { fileExists, sha256, toManifestPath }: typeof PacketLifecycle =
  createRequire(import.meta.url)(
    "../agent-packet-lifecycle.ts",
  ) as typeof PacketLifecycle;

const APPROVED_PREFIX = "stories/approved/";

export async function buildCleanupDryRunPlan(options: {
  metadata: CleanupMetadata;
  repoRoot: string;
}): Promise<CleanupDryRunPlan> {
  validateStoryCardinality(options.metadata);
  const stories = await validateStories(
    options.repoRoot,
    options.metadata.stories,
  );

  return {
    branches: options.metadata.branches,
    localOnly: true,
    mode: options.metadata.mode,
    notAuthorizingUntil:
      "INF-027C-reviewed-pr-evidence-and-merge-state-binding",
    statement:
      "Local dry-run only. This output is not cleanup-authorizing until INF-027C binds reviewed PR evidence and merge state.",
    stories,
  };
}

function validateStoryCardinality(metadata: CleanupMetadata) {
  if (metadata.mode === "single" && metadata.stories.length !== 1) {
    throw new Error("Single-mode cleanup requires exactly one story.");
  }

  if (metadata.mode === "parent" && metadata.stories.length < 2) {
    throw new Error("Parent-mode cleanup requires at least two stories.");
  }
}

async function validateStories(repoRoot: string, storyPaths: string[]) {
  const seenStoryPaths = new Set<string>();
  const stories: CleanupStoryValidation[] = [];

  for (const storyPathArg of storyPaths) {
    validateCanonicalStoryPath(storyPathArg);

    if (seenStoryPaths.has(storyPathArg)) {
      throw new Error(`Duplicate story path: ${storyPathArg}.`);
    }

    seenStoryPaths.add(storyPathArg);
    const storyPath = path.join(repoRoot, ...storyPathArg.split("/"));

    if (!(await fileExists(storyPath))) {
      throw new Error(`Story path does not exist: ${storyPathArg}.`);
    }

    const storySource = await readFile(storyPath, "utf8");
    const story = parseStoryYaml(storySource);

    if (story.status !== "approved") {
      throw new Error(
        `Story ${story.id} must be approved for cleanup planning; found ${story.status}.`,
      );
    }

    const expectedPrefix = `${APPROVED_PREFIX}${story.id}-`;

    if (!storyPathArg.startsWith(expectedPrefix)) {
      throw new Error(
        `Story id/path mismatch: ${story.id} does not match ${storyPathArg}.`,
      );
    }

    const donePath = path.join(
      repoRoot,
      "stories",
      "done",
      path.basename(storyPath),
    );

    if (await fileExists(donePath)) {
      throw new Error(`Story ${story.id} is already present in stories/done/.`);
    }

    stories.push(
      await validatePacketEvidence({
        repoRoot,
        storyId: story.id,
        storyPath: storyPathArg,
        storySha256: sha256(storySource),
      }),
    );
  }

  return stories.sort((a, b) => a.storyPath.localeCompare(b.storyPath));
}

function validateCanonicalStoryPath(storyPath: string) {
  if (!storyPath.startsWith(APPROVED_PREFIX)) {
    throw new Error(
      `Story path must be under ${APPROVED_PREFIX}: ${storyPath}.`,
    );
  }

  if (
    storyPath.includes("\\") ||
    storyPath.includes("/../") ||
    storyPath.startsWith("../")
  ) {
    throw new Error(
      `Story path must be a portable checked-in path: ${storyPath}.`,
    );
  }

  if (["?", "*", "[", "]"].some((character) => storyPath.includes(character))) {
    throw new Error(`Story path globs are not allowed: ${storyPath}.`);
  }
}

async function validatePacketEvidence(options: {
  repoRoot: string;
  storyId: string;
  storyPath: string;
  storySha256: string;
}): Promise<CleanupStoryValidation> {
  const packetPath = path.join(
    options.repoRoot,
    "agent-packets",
    `${options.storyId}.md`,
  );
  const packetPathLabel = toManifestPath(options.repoRoot, packetPath);

  if (!(await fileExists(packetPath))) {
    throw new Error(
      `Story ${options.storyId} is missing packet ${packetPathLabel}.`,
    );
  }

  const packetSource = await readFile(packetPath, "utf8");
  const packetStoryId = readPacketMetadata(packetSource, "story-id");
  const packetStoryPath = readPacketMetadata(packetSource, "story-path");
  const packetStorySha256 = readPacketMetadata(packetSource, "story-sha256");

  if (packetStoryId !== options.storyId) {
    throw new Error(
      `Story ${options.storyId} packet metadata story-id mismatch.`,
    );
  }

  if (packetStoryPath !== options.storyPath) {
    throw new Error(
      `Story ${options.storyId} packet metadata story-path mismatch.`,
    );
  }

  if (packetStorySha256 !== options.storySha256) {
    throw new Error(`Story ${options.storyId} has stale packet evidence.`);
  }

  return {
    packetPath: packetPathLabel,
    storyId: options.storyId,
    storyPath: options.storyPath,
    storySha256: options.storySha256,
  };
}

function readPacketMetadata(packetSource: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = packetSource.match(
    new RegExp(`^<!-- agent-packet:${escapedKey} ([^\\n]+) -->$`, "m"),
  );
  return match?.[1]?.trim() ?? "";
}
