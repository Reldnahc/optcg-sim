import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type * as PacketParser from "./agent-packet-parser.js";
import type * as PacketRenderer from "./agent-packet-renderer.js";

type PacketParserModule = typeof PacketParser;
type PacketRendererModule = typeof PacketRenderer;

const { parseStoryYaml, readStoryChildStoryIds }: PacketParserModule =
  createRequire(import.meta.url)(
    "./agent-packet-parser.ts",
  ) as PacketParserModule;

const {
  buildPacket,
  normalizePacketContent,
  REQUIRED_PACKET_HEADINGS,
}: PacketRendererModule = createRequire(import.meta.url)(
  "./agent-packet-renderer.ts",
) as PacketRendererModule;

export type ActiveStoryEntry = {
  packetPath: string;
  storyId: string;
  storyPath: string;
  storySha256: string;
};

export type ActiveStoryManifest = {
  activeStories: ActiveStoryEntry[];
  version: number;
};

export type BuildOptions = {
  activate: boolean;
  manifestPath: string;
  outputPath: string;
  repoRoot: string;
  storyPath: string;
};

export type VerifyOptions = {
  manifestPath: string;
  repoRoot: string;
};

export type CompleteOptions = {
  manifestPath: string;
  repoRoot: string;
  storyPath: string;
};

export type CompleteManyOptions = {
  manifestPath: string;
  parentCleanupPlanFile?: string;
  parentStoryPath?: string;
  parentStorySha256?: string;
  repoRoot: string;
  storyPaths: string[];
};

const PACKET_META_PREFIX = "<!-- agent-packet:";
const APPROVED_STORIES_DIR = "stories/approved";
const AGENT_PACKETS_DIR = "agent-packets";

export async function runBuild(options: BuildOptions) {
  const storySource = await readUtf8(options.storyPath);
  const story = parseStoryYaml(storySource);

  if (story.status !== "approved") {
    throw new Error(
      `Only approved stories may be turned into packets. ${story.id} has status ${story.status}.`,
    );
  }

  const resolvedOutputPath =
    path.basename(options.outputPath) === "AUTO.md"
      ? path.join(path.dirname(options.outputPath), `${story.id}.md`)
      : options.outputPath;
  const storyPathLabel = toManifestPath(options.repoRoot, options.storyPath);
  const outputPathLabel = toManifestPath(options.repoRoot, resolvedOutputPath);

  if (options.activate) {
    assertCanonicalActiveManifestPath(options.repoRoot, options.manifestPath);
    assertCanonicalActiveStoryPath(story.id, storyPathLabel);
    assertCanonicalActivePacketPath(story.id, outputPathLabel);
  }

  const packet = await buildPacket({
    repoRoot: options.repoRoot,
    story,
    storyPath: options.storyPath,
    storySource,
  });
  const storySha256 = sha256(storySource);

  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, packet);

  if (options.activate) {
    const manifest = await loadManifest(options.manifestPath);
    const nextEntry: ActiveStoryEntry = {
      packetPath: outputPathLabel,
      storyId: story.id,
      storyPath: storyPathLabel,
      storySha256,
    };

    manifest.activeStories = [nextEntry];

    await mkdir(path.dirname(options.manifestPath), { recursive: true });
    await writeFile(
      options.manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }

  process.stdout.write(`${outputPathLabel}\n`);
}

export async function runVerifyActive(options: VerifyOptions) {
  assertCanonicalActiveManifestPath(options.repoRoot, options.manifestPath);
  const manifestExists = await fileExists(options.manifestPath);

  if (!manifestExists) {
    throw new Error(
      `Active story manifest is required: ${toManifestPath(options.repoRoot, options.manifestPath)}.`,
    );
  }

  const manifest = await loadManifest(options.manifestPath);

  assertAtMostOneActiveStory(manifest);

  for (const entry of manifest.activeStories) {
    assertCanonicalActiveStoryPath(entry.storyId, entry.storyPath);
    assertCanonicalActivePacketPath(entry.storyId, entry.packetPath);
    const storyPath = resolveManifestPath(options.repoRoot, entry.storyPath);
    const packetPath = resolveManifestPath(options.repoRoot, entry.packetPath);

    if (!(await fileExists(packetPath))) {
      throw new Error(
        `Active story ${entry.storyId} is missing packet ${entry.packetPath}.`,
      );
    }

    const storySource = await readUtf8(storyPath);
    const story = parseStoryYaml(storySource);

    if (story.status !== "approved") {
      throw new Error(
        `Active story ${entry.storyId} must still parse as status approved before packet verification; found ${story.status}.`,
      );
    }

    const currentStorySha256 = sha256(storySource);

    if (currentStorySha256 !== entry.storySha256) {
      throw new Error(
        `Active story ${entry.storyId} has a stale manifest entry: ${entry.storyPath}.`,
      );
    }

    const packetSource = await readUtf8(packetPath);
    const normalizedPacketSource = normalizeLineEndings(packetSource);
    const packetStoryId = readPacketMetadata(packetSource, "story-id");
    const packetStorySha256 = readPacketMetadata(packetSource, "story-sha256");

    if (packetStoryId !== entry.storyId) {
      throw new Error(
        `Active story ${entry.storyId} packet metadata does not match the manifest.`,
      );
    }

    if (packetStorySha256 !== currentStorySha256) {
      throw new Error(
        `Active story ${entry.storyId} has a stale packet relative to ${entry.storyPath}.`,
      );
    }

    for (const heading of REQUIRED_PACKET_HEADINGS) {
      if (!normalizedPacketSource.includes(`${heading}\n`)) {
        throw new Error(
          `Active story ${entry.storyId} packet is missing required section ${heading}.`,
        );
      }
    }
    if (!hasRequiredCodeStandardSubsection(normalizedPacketSource)) {
      throw new Error(
        `Active story ${entry.storyId} packet is missing required Code Standard subsection under ## Constraints.`,
      );
    }

    const expectedPacketSource = await buildPacket({
      repoRoot: options.repoRoot,
      story,
      storyPath,
      storySource,
    });

    if (
      normalizePacketContent(packetSource) !==
      normalizePacketContent(expectedPacketSource)
    ) {
      throw new Error(
        `Active story ${entry.storyId} packet does not match the canonical packet content generated from ${entry.storyPath}.`,
      );
    }
  }

  process.stdout.write(
    `Verified ${String(manifest.activeStories.length)} active story packet(s).\n`,
  );
}

export async function runComplete(options: CompleteOptions) {
  assertCanonicalActiveManifestPath(options.repoRoot, options.manifestPath);
  const storySource = await readUtf8(options.storyPath);
  const story = parseStoryYaml(storySource);
  const storyPathLabel = toManifestPath(options.repoRoot, options.storyPath);

  assertCanonicalActiveStoryPath(story.id, storyPathLabel);

  if (story.status !== "approved") {
    throw new Error(
      `Only approved active stories may be completed. ${story.id} has status ${story.status}.`,
    );
  }

  const manifest = await loadManifest(options.manifestPath);

  assertAtMostOneActiveStory(manifest);

  const activeEntry = manifest.activeStories[0];

  if (
    activeEntry === undefined ||
    activeEntry.storyId !== story.id ||
    activeEntry.storyPath !== storyPathLabel
  ) {
    throw new Error(
      `Story ${story.id} must be the active story before completion.`,
    );
  }

  await runVerifyActive({
    manifestPath: options.manifestPath,
    repoRoot: options.repoRoot,
  });

  const donePath = path.join(
    options.repoRoot,
    "stories",
    "done",
    path.basename(options.storyPath),
  );
  const donePathLabel = toManifestPath(options.repoRoot, donePath);

  if (await fileExists(donePath)) {
    throw new Error(`Done story already exists: ${donePathLabel}.`);
  }

  const doneStorySource = storySource.replace(
    /^status:\s+approved$/m,
    "status: done",
  );

  if (doneStorySource === storySource) {
    throw new Error(`Unable to mark ${story.id} as done.`);
  }

  await mkdir(path.dirname(donePath), { recursive: true });
  await writeFile(donePath, doneStorySource);
  await rm(options.storyPath);
  await rm(resolveManifestPath(options.repoRoot, activeEntry.packetPath), {
    force: true,
  });
  await writeFile(
    options.manifestPath,
    `${JSON.stringify({ activeStories: [], version: manifest.version }, null, 2)}\n`,
  );

  process.stdout.write(`${donePathLabel}\n`);
}

export async function runCompleteMany(options: CompleteManyOptions) {
  assertCanonicalActiveManifestPath(options.repoRoot, options.manifestPath);

  if (!(await fileExists(options.manifestPath))) {
    throw new Error(
      `Active story manifest is required: ${toManifestPath(options.repoRoot, options.manifestPath)}.`,
    );
  }

  const manifest = await loadManifest(options.manifestPath);
  assertAtMostOneActiveStory(manifest);

  const seenStoryIds = new Set<string>();
  const seenStoryPaths = new Set<string>();
  const completions: Array<{
    donePath: string;
    donePathLabel: string;
    doneStorySource: string;
    packetPath: string;
    storyId: string;
    storyPath: string;
    storyPathLabel: string;
  }> = [];
  let parentCompletion:
    | {
        donePath: string;
        donePathLabel: string;
        doneStorySource: string;
        storyPath: string;
      }
    | undefined;

  for (const storyPath of options.storyPaths) {
    const storyPathLabel = toManifestPath(options.repoRoot, storyPath);

    if (seenStoryPaths.has(storyPathLabel)) {
      throw new Error(`Duplicate --story argument: ${storyPathLabel}.`);
    }

    seenStoryPaths.add(storyPathLabel);
    const storySource = await readUtf8(storyPath);
    const story = parseStoryYaml(storySource);

    assertCanonicalStoryPathForStoryId(story.id, storyPathLabel);

    if (seenStoryIds.has(story.id)) {
      throw new Error(`Duplicate story id in --story arguments: ${story.id}.`);
    }

    seenStoryIds.add(story.id);

    if (story.status !== "approved") {
      throw new Error(
        `Only approved stories may be completed. ${story.id} has status ${story.status}.`,
      );
    }

    const currentStorySha256 = sha256(storySource);
    const packetPath = path.join(
      options.repoRoot,
      AGENT_PACKETS_DIR,
      `${story.id}.md`,
    );
    const packetPathLabel = toManifestPath(options.repoRoot, packetPath);

    if (!(await fileExists(packetPath))) {
      throw new Error(
        `Story ${story.id} is missing packet ${packetPathLabel}.`,
      );
    }

    const packetSource = await readUtf8(packetPath);
    const normalizedPacketSource = normalizeLineEndings(packetSource);
    const packetStoryId = readPacketMetadata(packetSource, "story-id");
    const packetStorySha256 = readPacketMetadata(packetSource, "story-sha256");

    if (packetStoryId !== story.id) {
      throw new Error(`Story ${story.id} packet metadata does not match.`);
    }

    if (packetStorySha256 !== currentStorySha256) {
      throw new Error(`Story ${story.id} has a stale packet.`);
    }

    for (const heading of REQUIRED_PACKET_HEADINGS) {
      if (!normalizedPacketSource.includes(`${heading}\n`)) {
        throw new Error(
          `Story ${story.id} packet is missing required section ${heading}.`,
        );
      }
    }
    if (!hasRequiredCodeStandardSubsection(normalizedPacketSource)) {
      throw new Error(
        `Story ${story.id} packet is missing required Code Standard subsection under ## Constraints.`,
      );
    }

    const expectedPacketSource = await buildPacket({
      repoRoot: options.repoRoot,
      story,
      storyPath,
      storySource,
    });

    if (
      normalizePacketContent(packetSource) !==
      normalizePacketContent(expectedPacketSource)
    ) {
      throw new Error(
        `Story ${story.id} packet does not match the canonical packet content generated from ${storyPathLabel}.`,
      );
    }

    const donePath = path.join(
      options.repoRoot,
      "stories",
      "done",
      path.basename(storyPath),
    );
    const donePathLabel = toManifestPath(options.repoRoot, donePath);

    if (await fileExists(donePath)) {
      throw new Error(`Done story already exists: ${donePathLabel}.`);
    }

    const doneStorySource = storySource.replace(
      /^status:\s+approved$/m,
      "status: done",
    );

    if (doneStorySource === storySource) {
      throw new Error(`Unable to mark ${story.id} as done.`);
    }

    completions.push({
      donePath,
      donePathLabel,
      doneStorySource,
      packetPath,
      storyId: story.id,
      storyPath,
      storyPathLabel,
    });
  }

  if (options.parentStoryPath || options.parentStorySha256) {
    if (!options.parentStoryPath || !options.parentStorySha256) {
      throw new Error(
        "Parent story closeout requires --parent-story and --parent-story-sha256.",
      );
    }
    parentCompletion = await prepareParentCompletion({
      childStoryIds: completions.map((completion) => completion.storyId),
      parentCleanupPlanFile: options.parentCleanupPlanFile,
      parentStoryPath: options.parentStoryPath,
      parentStorySha256: options.parentStorySha256,
      repoRoot: options.repoRoot,
    });
  }

  for (const completion of completions) {
    await mkdir(path.dirname(completion.donePath), { recursive: true });
    await writeFile(completion.donePath, completion.doneStorySource);
    await rm(completion.storyPath);
    await rm(completion.packetPath, { force: true });
  }
  if (parentCompletion) {
    await mkdir(path.dirname(parentCompletion.donePath), { recursive: true });
    await writeFile(
      parentCompletion.donePath,
      parentCompletion.doneStorySource,
    );
    await rm(parentCompletion.storyPath);
  }

  const remainingActiveStories = manifest.activeStories.filter(
    (entry) =>
      !completions.some(
        (completion) =>
          completion.storyId === entry.storyId ||
          completion.storyPathLabel === entry.storyPath,
      ),
  );
  assertAtMostOneActiveStory({
    ...manifest,
    activeStories: remainingActiveStories,
  });
  await writeFile(
    options.manifestPath,
    `${JSON.stringify(
      { activeStories: remainingActiveStories, version: manifest.version },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(
    `${[
      ...completions.map((completion) => completion.donePathLabel),
      ...(parentCompletion ? [parentCompletion.donePathLabel] : []),
    ].join("\n")}\n`,
  );
}

async function prepareParentCompletion(options: {
  childStoryIds: string[];
  parentCleanupPlanFile: string | undefined;
  parentStoryPath: string;
  parentStorySha256: string;
  repoRoot: string;
}) {
  requireSha256(options.parentStorySha256, "--parent-story-sha256");
  const parentStoryPathLabel = toManifestPath(
    options.repoRoot,
    options.parentStoryPath,
  );
  if (!isCanonicalApprovedStoryPath(parentStoryPathLabel)) {
    throw new Error(
      `Parent story must use a checked-in approved story path under ${APPROVED_STORIES_DIR}/.`,
    );
  }
  const parentSource = await readUtf8(options.parentStoryPath);
  const parentStory = parseStoryYaml(parentSource);
  assertCanonicalStoryPathForStoryId(parentStory.id, parentStoryPathLabel);
  if (parentStory.status !== "approved") {
    throw new Error(
      `Only approved parent stories may be completed. ${parentStory.id} has status ${parentStory.status}.`,
    );
  }
  const parentPacketPath = path.join(
    options.repoRoot,
    AGENT_PACKETS_DIR,
    `${parentStory.id}.md`,
  );
  if (await fileExists(parentPacketPath)) {
    throw new Error(
      `Parent story ${parentStory.id} must be non-packetized for parent closeout.`,
    );
  }
  const currentSha = sha256(parentSource);
  if (currentSha !== options.parentStorySha256) {
    throw new Error(`Parent story ${parentStory.id} has stale evidence.`);
  }
  await validateBoundParentCleanupPlan({
    childStoryIds: options.childStoryIds,
    parentCleanupPlanFile: options.parentCleanupPlanFile,
    parentStoryPath: parentStoryPathLabel,
    parentStorySha256: options.parentStorySha256,
  });
  const parentChildStoryIds = readStoryChildStoryIds(parentStory).sort(
    (left, right) => left.localeCompare(right),
  );
  const childStoryIds = [...options.childStoryIds].sort((left, right) =>
    left.localeCompare(right),
  );
  if (!stringArraysEqual(parentChildStoryIds, childStoryIds)) {
    throw new Error(
      `Parent story ${parentStory.id} child_stories must exactly match completed child story IDs.`,
    );
  }
  const donePath = path.join(
    options.repoRoot,
    "stories",
    "done",
    path.basename(options.parentStoryPath),
  );
  const donePathLabel = toManifestPath(options.repoRoot, donePath);
  if (await fileExists(donePath)) {
    throw new Error(`Done parent story already exists: ${donePathLabel}.`);
  }
  const doneStorySource = parentSource.replace(
    /^status:\s+approved$/m,
    "status: done",
  );
  if (doneStorySource === parentSource) {
    throw new Error(`Unable to mark parent story ${parentStory.id} as done.`);
  }
  return {
    donePath,
    donePathLabel,
    doneStorySource,
    storyPath: options.parentStoryPath,
  };
}

async function validateBoundParentCleanupPlan(options: {
  childStoryIds: string[];
  parentCleanupPlanFile: string | undefined;
  parentStoryPath: string;
  parentStorySha256: string;
}) {
  if (!options.parentCleanupPlanFile) {
    throw new Error(
      "Parent story closeout requires --bound-cleanup-plan evidence.",
    );
  }
  const plan = JSON.parse(await readUtf8(options.parentCleanupPlanFile)) as {
    boundParentStory?: {
      storyPath?: unknown;
      storySha256?: unknown;
    };
    packetCommand?: {
      args?: unknown;
      command?: unknown;
    };
    schemaVersion?: unknown;
    status?: unknown;
    stories?: unknown;
  };
  if (
    plan.schemaVersion !== "post-merge-cleanup-plan.v1" ||
    plan.status !== "valid"
  ) {
    throw new Error("Bound cleanup plan evidence is invalid.");
  }
  if (
    plan.boundParentStory?.storyPath !== options.parentStoryPath ||
    plan.boundParentStory.storySha256 !== options.parentStorySha256
  ) {
    throw new Error(
      "Bound cleanup plan evidence does not match parent story closeout.",
    );
  }
  if (plan.packetCommand?.command !== "packets:complete-many") {
    throw new Error("Bound cleanup plan must use packets:complete-many.");
  }
  if (!Array.isArray(plan.stories)) {
    throw new Error("Bound cleanup plan stories evidence is invalid.");
  }
  const planStoryIds = plan.stories
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error("Bound cleanup plan story evidence is invalid.");
      }
      const storyId = (entry as Record<string, unknown>)["storyId"];
      if (typeof storyId !== "string") {
        throw new Error("Bound cleanup plan story evidence is invalid.");
      }
      return storyId;
    })
    .sort((left, right) => left.localeCompare(right));
  const childStoryIds = [...options.childStoryIds].sort((left, right) =>
    left.localeCompare(right),
  );
  if (!stringArraysEqual(planStoryIds, childStoryIds)) {
    throw new Error(
      "Bound cleanup plan stories must match completed child story IDs.",
    );
  }
  const expectedArgs = [
    ...plan.stories.flatMap((entry) => {
      const storyPath = (entry as Record<string, unknown>)["storyPath"];
      if (typeof storyPath !== "string") {
        throw new Error("Bound cleanup plan story evidence is invalid.");
      }
      return ["--story", storyPath];
    }),
    "--parent-story",
    options.parentStoryPath,
    "--parent-story-sha256",
    options.parentStorySha256,
  ];
  if (!Array.isArray(plan.packetCommand.args)) {
    throw new Error(
      "Bound cleanup plan packet command does not match parent story closeout.",
    );
  }
  const packetCommandArgs = plan.packetCommand.args.map((entry) => {
    if (typeof entry !== "string") {
      throw new Error(
        "Bound cleanup plan packet command does not match parent story closeout.",
      );
    }
    return entry;
  });
  if (!stringArraysEqual(packetCommandArgs, expectedArgs)) {
    throw new Error(
      "Bound cleanup plan packet command does not match parent story closeout.",
    );
  }
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
}

async function loadManifest(manifestPath: string) {
  if (!(await fileExists(manifestPath))) {
    return {
      activeStories: [],
      version: 1,
    };
  }

  const source = await readUtf8(manifestPath);
  const manifest = JSON.parse(source) as ActiveStoryManifest;

  if (!Array.isArray(manifest.activeStories)) {
    throw new Error(`Invalid active story manifest: ${manifestPath}`);
  }

  return {
    activeStories: manifest.activeStories.map((entry) => ({
      packetPath: entry.packetPath,
      storyId: entry.storyId,
      storyPath: entry.storyPath,
      storySha256: entry.storySha256,
    })),
    version: typeof manifest.version === "number" ? manifest.version : 1,
  };
}

function assertAtMostOneActiveStory(manifest: ActiveStoryManifest) {
  if (manifest.activeStories.length > 1) {
    throw new Error(
      `Active story manifest may contain at most one active story; found ${String(
        manifest.activeStories.length,
      )}.`,
    );
  }
}

function readPacketMetadata(packetSource: string, key: string) {
  const match = packetSource.match(
    new RegExp(
      `^${escapeRegExp(PACKET_META_PREFIX)}${escapeRegExp(key)} ([^\\n]+) -->$`,
      "m",
    ),
  );
  return match?.[1]?.trim() ?? "";
}

function requireSha256(value: string, label: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a sha256 hash.`);
  }
}

function hasRequiredCodeStandardSubsection(packetSource: string) {
  const constraintsSection = readTopLevelSection(packetSource, "Constraints");
  return /^### Code Standard$/m.test(constraintsSection);
}

function readTopLevelSection(packetSource: string, heading: string) {
  const lines = packetSource.split("\n");
  const targetHeading = `## ${heading}`;
  let inCodeFence = false;
  let startIndex = -1;
  let endIndex = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";

    if (/^(```|~~~)/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      continue;
    }

    if (startIndex < 0) {
      if (line === targetHeading) {
        startIndex = index + 1;
      }
      continue;
    }

    if (/^##\s+/.test(line) && line !== targetHeading) {
      endIndex = index;
      break;
    }
  }

  if (startIndex < 0) {
    return "";
  }

  return lines.slice(startIndex, endIndex).join("\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sha256(value: string) {
  return createHash("sha256").update(normalizeLineEndings(value)).digest("hex");
}

async function readUtf8(filePath: string) {
  return readFile(filePath, "utf8");
}

export function resolveCliPath(filePath: string, baseDir: string) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}

function resolveManifestPath(repoRoot: string, storedPath: string) {
  return path.isAbsolute(storedPath)
    ? storedPath
    : path.resolve(repoRoot, fromPortablePath(storedPath));
}

function assertCanonicalActiveStoryPath(storyId: string, storyPath: string) {
  if (!isCanonicalApprovedStoryPath(storyPath)) {
    throw new Error(
      `Active story ${storyId} must use a checked-in approved story path under ${APPROVED_STORIES_DIR}/.`,
    );
  }
}

function assertCanonicalStoryPathForStoryId(
  storyId: string,
  storyPath: string,
) {
  if (!isCanonicalApprovedStoryPath(storyPath)) {
    throw new Error(
      `Story ${storyId} must use a checked-in approved story path under ${APPROVED_STORIES_DIR}/.`,
    );
  }

  const baseName = path.posix.basename(storyPath);

  if (!baseName.startsWith(`${storyId}-`)) {
    throw new Error(
      `Story ${storyId} path must match its story id under ${APPROVED_STORIES_DIR}/.`,
    );
  }
}

function assertCanonicalActivePacketPath(storyId: string, packetPath: string) {
  const expectedPacketPath = `${AGENT_PACKETS_DIR}/${storyId}.md`;

  if (packetPath !== expectedPacketPath) {
    throw new Error(
      `Active story ${storyId} must use checked-in ${expectedPacketPath}.`,
    );
  }
}

function assertCanonicalActiveManifestPath(
  repoRoot: string,
  manifestPath: string,
) {
  const expectedManifestPath = path.join(
    repoRoot,
    AGENT_PACKETS_DIR,
    "active.json",
  );

  if (path.resolve(manifestPath) !== expectedManifestPath) {
    throw new Error(
      `Active story operations must use checked-in ${AGENT_PACKETS_DIR}/active.json.`,
    );
  }
}

function isCanonicalApprovedStoryPath(storyPath: string) {
  return (
    storyPath.startsWith(`${APPROVED_STORIES_DIR}/`) &&
    !storyPath.includes("\\") &&
    !storyPath.startsWith("../") &&
    !storyPath.includes("/../")
  );
}

export function toManifestPath(repoRoot: string, filePath: string) {
  const relativePath = path.relative(repoRoot, filePath);

  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return toPortablePath(relativePath);
  }

  return toPortablePath(filePath);
}

function toPortablePath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function fromPortablePath(filePath: string) {
  return filePath.split("/").join(path.sep);
}

export function findRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export async function fileExists(filePath: string) {
  try {
    await access(filePath);
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

function stringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}
