import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type * as PacketRenderer from "./agent-packet-renderer.js";
import type * as PacketParser from "./agent-packet-parser.js";

type PacketParserModule = typeof PacketParser;
type PacketRendererModule = typeof PacketRenderer;

const { parseOptionMap, parseStoryYaml, requireOption }: PacketParserModule =
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

type ActiveStoryEntry = {
  packetPath: string;
  storyId: string;
  storyPath: string;
  storySha256: string;
};

type ActiveStoryManifest = {
  activeStories: ActiveStoryEntry[];
  version: number;
};

type BuildOptions = {
  activate: boolean;
  manifestPath: string;
  outputPath: string;
  repoRoot: string;
  storyPath: string;
};

type VerifyOptions = {
  manifestPath: string;
  repoRoot: string;
};

type CompleteOptions = {
  manifestPath: string;
  repoRoot: string;
  storyPath: string;
};

type CompleteManyOptions = {
  manifestPath: string;
  repoRoot: string;
  storyPaths: string[];
};

const PACKET_META_PREFIX = "<!-- agent-packet:";
const APPROVED_STORIES_DIR = "stories/approved";
const AGENT_PACKETS_DIR = "agent-packets";

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === "generate" || command === "build") {
      await runBuild(parseBuildOptions(args));
      return;
    }

    if (command === "verify-active") {
      await runVerifyActive(parseVerifyOptions(args));
      return;
    }

    if (command === "complete") {
      await runComplete(parseCompleteOptions(args));
      return;
    }

    if (command === "complete-many") {
      await runCompleteMany(parseCompleteManyOptions(args));
      return;
    }

    throw new Error(
      "Usage:\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts generate --story <path> [--output <path>] [--manifest <path>] [--activate]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts verify-active [--manifest <path>]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts complete --story <path> [--manifest <path>]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts complete-many --story <path> --story <path> [--manifest <path>]",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function parseBuildOptions(args: string[]): BuildOptions {
  const repoRoot = findRepoRoot();
  const options = new Map<string, string>();
  let activate = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (token === "--activate") {
      activate = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    options.set(token, value);
    index += 1;
  }

  const storyPath = resolveCliPath(
    requireOption(options, "--story"),
    process.cwd(),
  );
  const outputPath = resolveCliPath(
    options.get("--output") ?? path.join(repoRoot, "agent-packets", "AUTO.md"),
    process.cwd(),
  );
  const manifestPath = resolveCliPath(
    options.get("--manifest") ??
      path.join(repoRoot, "agent-packets", "active.json"),
    process.cwd(),
  );

  return {
    activate,
    manifestPath,
    outputPath,
    repoRoot,
    storyPath,
  };
}

function parseVerifyOptions(args: string[]): VerifyOptions {
  const repoRoot = findRepoRoot();
  const options = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    options.set(token, value);
    index += 1;
  }

  return {
    manifestPath: resolveCliPath(
      options.get("--manifest") ??
        path.join(repoRoot, "agent-packets", "active.json"),
      process.cwd(),
    ),
    repoRoot,
  };
}

function parseCompleteOptions(args: string[]): CompleteOptions {
  const repoRoot = findRepoRoot();
  const options = parseOptionMap(args);

  return {
    manifestPath: resolveCliPath(
      options.get("--manifest") ??
        path.join(repoRoot, "agent-packets", "active.json"),
      process.cwd(),
    ),
    repoRoot,
    storyPath: resolveCliPath(requireOption(options, "--story"), process.cwd()),
  };
}

function parseCompleteManyOptions(args: string[]): CompleteManyOptions {
  const repoRoot = findRepoRoot();
  const storyPaths: string[] = [];
  let manifestPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === undefined) {
      throw new Error("Unexpected missing CLI token.");
    }

    if (token === "--story") {
      const storyArg = args[index + 1];

      if (!storyArg || storyArg.startsWith("--")) {
        throw new Error("Missing value for --story");
      }

      storyPaths.push(resolveCliPath(storyArg, process.cwd()));
      index += 1;
      continue;
    }

    if (token === "--manifest") {
      const manifestArg = args[index + 1];

      if (!manifestArg || manifestArg.startsWith("--")) {
        throw new Error("Missing value for --manifest");
      }

      manifestPath = resolveCliPath(manifestArg, process.cwd());
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  if (storyPaths.length === 0) {
    throw new Error("Missing required option --story");
  }

  return {
    manifestPath:
      manifestPath ?? path.join(repoRoot, "agent-packets", "active.json"),
    repoRoot,
    storyPaths,
  };
}

async function runBuild(options: BuildOptions) {
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

async function runVerifyActive(options: VerifyOptions) {
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

async function runComplete(options: CompleteOptions) {
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

async function runCompleteMany(options: CompleteManyOptions) {
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

  for (const completion of completions) {
    await mkdir(path.dirname(completion.donePath), { recursive: true });
    await writeFile(completion.donePath, completion.doneStorySource);
    await rm(completion.storyPath);
    await rm(completion.packetPath, { force: true });
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
    `${completions.map((completion) => completion.donePathLabel).join("\n")}\n`,
  );
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sha256(value: string) {
  return createHash("sha256").update(normalizeLineEndings(value)).digest("hex");
}

async function readUtf8(filePath: string) {
  return readFile(filePath, "utf8");
}

function resolveCliPath(filePath: string, baseDir: string) {
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

function toManifestPath(repoRoot: string, filePath: string) {
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

function findRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

await main();
