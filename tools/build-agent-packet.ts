import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type * as PacketLifecycle from "./agent-packet-lifecycle.js";
import type * as PacketParser from "./agent-packet-parser.js";

type PacketLifecycleModule = typeof PacketLifecycle;
type PacketParserModule = typeof PacketParser;

const {
  fileExists,
  findRepoRoot,
  resolveCliPath,
  runBuild,
  runComplete,
  runCompleteMany,
  runVerifyActive,
}: PacketLifecycleModule = createRequire(import.meta.url)(
  "./agent-packet-lifecycle.ts",
) as PacketLifecycleModule;

const { parseOptionMap, parseStoryYaml, requireOption }: PacketParserModule =
  createRequire(import.meta.url)(
    "./agent-packet-parser.ts",
  ) as PacketParserModule;
const {
  readMarkdownBullets,
  readMarkdownSection,
  readPacketMetadata,
  readPostApprovalRoleContent,
}: PacketParserModule = createRequire(import.meta.url)(
  "./agent-packet-parser.ts",
) as PacketParserModule;

type BuildOptions = PacketLifecycle.BuildOptions;
type VerifyOptions = PacketLifecycle.VerifyOptions;
type CompleteOptions = PacketLifecycle.CompleteOptions;
type CompleteManyOptions = PacketLifecycle.CompleteManyOptions;
type ExtractRole =
  | "story-orchestrator"
  | "implementation"
  | "code-review"
  | "pr-gate";
type ExtractFormat = "markdown" | "json";

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

    if (command === "extract") {
      await runExtract(parseExtractOptions(args));
      return;
    }

    throw new Error(
      "Usage:\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts generate --story <path> [--output <path>] [--manifest <path>] [--activate]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts verify-active [--manifest <path>]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts complete --story <path> [--manifest <path>]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts complete-many --story <path> --story <path> [--manifest <path>]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts extract --role <story-orchestrator|implementation|code-review|pr-gate> --format <markdown|json> [--manifest <path>]",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function parseExtractOptions(args: string[]) {
  const repoRoot = findRepoRoot();
  const options = parseOptionMap(args);
  const role = requireOption(options, "--role");
  const format = requireOption(options, "--format");

  if (
    role !== "story-orchestrator" &&
    role !== "implementation" &&
    role !== "code-review" &&
    role !== "pr-gate"
  ) {
    throw new Error(
      `Unsupported role ${role}. Extraction supports post-approval roles only.`,
    );
  }

  if (format !== "markdown" && format !== "json") {
    throw new Error(`Unsupported format ${format}. Use markdown or json.`);
  }

  const resolvedFormat: ExtractFormat = format;
  const resolvedRole: ExtractRole = role;

  return {
    format: resolvedFormat,
    manifestPath: resolveCliPath(
      options.get("--manifest") ??
        path.join(repoRoot, "agent-packets", "active.json"),
      process.cwd(),
    ),
    repoRoot,
    role: resolvedRole,
  };
}

async function runExtract(options: {
  format: ExtractFormat;
  manifestPath: string;
  repoRoot: string;
  role: ExtractRole;
}) {
  const activeStory = await readActiveStoryForExtraction({
    manifestPath: options.manifestPath,
    repoRoot: options.repoRoot,
  });
  const packetPath = activeStory.packetPath;
  const storyPath = activeStory.storyPath;
  const packetSource = await readFile(packetPath, "utf8");
  const storySource = await readFile(storyPath, "utf8");
  const story = parseStoryYaml(storySource);
  const currentStorySha256 = sha256(storySource);
  const packetStoryId = readPacketMetadata(packetSource, "story-id");
  const packetStorySha256 = readPacketMetadata(packetSource, "story-sha256");

  if (story.status !== "approved") {
    throw new Error(
      `Active story ${story.id} must still parse as status approved before extraction; found ${story.status}.`,
    );
  }

  if (activeStory.storySha256 !== currentStorySha256) {
    throw new Error("Active story manifest is stale.");
  }

  if (packetStoryId !== story.id || packetStorySha256 !== currentStorySha256) {
    throw new Error("Active story packet is stale.");
  }

  const roleContent = readPostApprovalRoleContent(packetSource, options.role);
  const payload = {
    forbiddenActions: roleContent.forbiddenActions,
    requiredOutputs: roleContent.requiredOutputs,
    responsibilities: roleContent.responsibilities,
    role: options.role,
    sharedAuthoritySummary: buildSharedAuthoritySummary(packetSource),
    story: {
      id: readPacketMetadata(packetSource, "story-id") || story.id,
      path: toPortablePath(path.relative(options.repoRoot, storyPath)),
      title: story.title,
    },
  };

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(renderMarkdownExtraction(payload));
}

function buildSharedAuthoritySummary(packetSource: string) {
  return [
    readMarkdownSection(packetSource, "Story Boundary").replace(/\r?\n/g, " "),
    `Allowed touch points: ${readMarkdownBullets(packetSource, "Allowed Touch Points").join(", ")}`,
    `Acceptance criteria count: ${String(
      readMarkdownBullets(packetSource, "Acceptance Criteria").length,
    )}`,
    `Required tests count: ${String(
      readMarkdownBullets(packetSource, "Required Tests").length,
    )}`,
    readMarkdownSection(packetSource, "Ambiguity Rule")
      .split(/\r?\n/)
      .find((line) => line.startsWith("Policy:")) ??
      "Policy: fail_and_escalate",
  ];
}

function renderMarkdownExtraction(payload: {
  forbiddenActions: string[];
  requiredOutputs: string[];
  responsibilities: string[];
  role: ExtractRole;
  sharedAuthoritySummary: string[];
  story: {
    id: string;
    path: string;
    title: string;
  };
}) {
  const bullets = (values: string[]) => values.map((value) => `- ${value}`);
  return [
    `Role: ${payload.role}`,
    `Story ID: ${payload.story.id}`,
    `Story Title: ${payload.story.title}`,
    `Story Path: ${payload.story.path}`,
    "",
    "## Shared Authority Summary",
    "",
    ...bullets(payload.sharedAuthoritySummary),
    "",
    "## Responsibilities",
    "",
    ...bullets(payload.responsibilities),
    "",
    "## Forbidden Actions",
    "",
    ...bullets(payload.forbiddenActions),
    "",
    "## Required Outputs",
    "",
    ...bullets(payload.requiredOutputs),
    "",
  ].join("\n");
}

async function readActiveStoryForExtraction(options: VerifyOptions) {
  if (!(await fileExists(options.manifestPath))) {
    throw new Error("Active story manifest is required for extraction.");
  }

  const manifestSource = await readFile(options.manifestPath, "utf8");
  const manifest = JSON.parse(manifestSource) as {
    activeStories?: Array<{
      packetPath?: string;
      storyPath?: string;
      storySha256?: string;
    }>;
  };

  if (
    !Array.isArray(manifest.activeStories) ||
    manifest.activeStories.length < 1
  ) {
    throw new Error("Active story manifest does not contain an active story.");
  }

  if (manifest.activeStories.length > 1) {
    throw new Error(
      "Active story manifest must contain at most one active story.",
    );
  }

  const activeStory = manifest.activeStories[0];

  if (
    !activeStory ||
    typeof activeStory.storyPath !== "string" ||
    typeof activeStory.packetPath !== "string" ||
    typeof activeStory.storySha256 !== "string"
  ) {
    throw new Error("Active story manifest entry is malformed.");
  }

  return {
    packetPath: resolveCliPath(activeStory.packetPath, options.repoRoot),
    storyPath: resolveCliPath(activeStory.storyPath, options.repoRoot),
    storySha256: activeStory.storySha256,
  };
}

function sha256(value: string) {
  return createHash("sha256")
    .update(value.replace(/\r\n/g, "\n"))
    .digest("hex");
}

function toPortablePath(filePath: string) {
  return filePath.split(path.sep).join("/");
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
  let parentCleanupPlanFile: string | undefined;
  let parentStoryPath: string | undefined;
  let parentStorySha256: string | undefined;

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

    if (token === "--parent-story") {
      const parentStoryArg = args[index + 1];

      if (!parentStoryArg || parentStoryArg.startsWith("--")) {
        throw new Error("Missing value for --parent-story");
      }

      parentStoryPath = resolveCliPath(parentStoryArg, process.cwd());
      index += 1;
      continue;
    }

    if (token === "--bound-cleanup-plan") {
      const parentCleanupPlanArg = args[index + 1];

      if (!parentCleanupPlanArg || parentCleanupPlanArg.startsWith("--")) {
        throw new Error("Missing value for --bound-cleanup-plan");
      }

      parentCleanupPlanFile = resolveCliPath(
        parentCleanupPlanArg,
        process.cwd(),
      );
      index += 1;
      continue;
    }

    if (token === "--parent-story-sha256") {
      const parentStoryShaArg = args[index + 1];

      if (!parentStoryShaArg || parentStoryShaArg.startsWith("--")) {
        throw new Error("Missing value for --parent-story-sha256");
      }

      parentStorySha256 = parentStoryShaArg;
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
    ...(parentCleanupPlanFile ? { parentCleanupPlanFile } : {}),
    ...(parentStoryPath ? { parentStoryPath } : {}),
    ...(parentStorySha256 ? { parentStorySha256 } : {}),
    repoRoot,
    storyPaths,
  };
}

await main();
