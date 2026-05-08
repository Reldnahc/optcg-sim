import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type * as PacketParser from "./agent-packet-parser.js";
import type { StoryData } from "./agent-packet-parser.js";

type PacketParserModule = typeof PacketParser;

const { parseOptionMap, parseStoryYaml, requireOption }: PacketParserModule =
  createRequire(import.meta.url)(
    "./agent-packet-parser.ts",
  ) as PacketParserModule;

type SpecSection = {
  body: string;
  filePath: string;
  heading: string;
  ref: string;
};

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

const REQUIRED_PACKET_HEADINGS = [
  "## Story",
  "## Why",
  "## Authoritative Spec References",
  "## Relevant Spec Excerpts",
  "## Story Boundary",
  "## Scope",
  "## Out of Scope",
  "## Allowed Touch Points",
  "## Constraints",
  "## Required Tests",
  "## Expected Output",
  "## Acceptance Criteria",
  "## Ambiguity Rule",
  "## Agent Instruction Footer",
] as const;

const DEFAULT_EXPECTED_OUTPUT = [
  "code changes",
  "tests",
  "brief implementation note",
  "explicit assumptions list",
];

const AGENT_FOOTER = [
  "You are implementing a constrained story in an existing codebase.",
  "The cited specification is authoritative.",
  "Do not invent behavior not supported by the cited spec.",
  "Stay within scope.",
  "Stay within the approved story boundary and allowed touch points.",
  "Follow repo tooling and code standard requirements.",
  "Include tests for the listed acceptance criteria.",
  "If the spec is ambiguous, report the ambiguity instead of guessing.",
];

const PACKET_META_PREFIX = "<!-- agent-packet:";
const APPROVED_STORIES_DIR = "stories/approved";
const AGENT_PACKETS_DIR = "agent-packets";

type SupplementalConstraint = {
  appliesToStory: (story: StoryData) => boolean;
  constraint: string;
  excerpt: string;
  ref: string;
};

const SUPPLEMENTAL_CONSTRAINTS: SupplementalConstraint[] = [
  {
    appliesToStory: isToolingRelevantStory,
    ref: "23-repo-tooling-and-enforcement.s005",
    constraint:
      "use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`",
    excerpt:
      "Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.",
  },
  {
    appliesToStory: isToolingRelevantStory,
    ref: "23-repo-tooling-and-enforcement.s006",
    constraint:
      "TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification",
    excerpt:
      "Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.",
  },
  {
    appliesToStory: isToolingRelevantStory,
    ref: "23-repo-tooling-and-enforcement.s016",
    constraint:
      "ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale",
    excerpt:
      "Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.",
  },
  {
    appliesToStory: (story) =>
      touchesAnyPrefix(story.allowed_touch_points, ["packages/engine-core/"]),
    ref: "23-repo-tooling-and-enforcement.s008",
    constraint:
      "`@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients",
    excerpt:
      "Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.",
  },
  {
    appliesToStory: (story) =>
      touchesAnyPrefix(story.allowed_touch_points, [
        "packages/client/",
        "packages/server/",
        "packages/view-engine/",
        "packages/replay/",
      ]),
    ref: "23-repo-tooling-and-enforcement.s008",
    constraint:
      "`@optcg/client` must not import server-only packages, replay validation must not depend on client rendering code, and hidden-state test helpers must not enter client production bundles",
    excerpt:
      "Boundary enforcement also blocks client imports of server-only packages, replay validation dependencies on client rendering code, and hidden-state test helpers in client production bundles.",
  },
  {
    appliesToStory: (story) =>
      touchesAnyPrefix(story.allowed_touch_points, [
        "packages/engine-core/",
        "packages/client/",
        "packages/view-engine/",
      ]),
    ref: "15-implementation-kickoff.s012",
    constraint:
      "The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls",
    excerpt:
      "Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.",
  },
];

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

async function buildPacket(input: {
  repoRoot: string;
  story: StoryData;
  storyPath: string;
  storySource: string;
}) {
  const relevantSupplementalConstraints = getRelevantSupplementalConstraints(
    input.story,
  );
  const storySections = await loadSpecSections(
    input.repoRoot,
    input.story.spec_refs,
  );
  const supplementalSections = await loadSpecSections(
    input.repoRoot,
    uniqueSupplementalRefs(
      input.story.spec_refs,
      relevantSupplementalConstraints,
    ),
  );
  const allSections = dedupeSectionsByRef([
    ...storySections,
    ...supplementalSections,
  ]);
  const sectionByRef = new Map(
    allSections.map((section) => [section.ref, section]),
  );
  const storySha256 = sha256(input.storySource);
  const storyPathLabel = toManifestPath(input.repoRoot, input.storyPath);
  const relevantExcerpts = [
    ...storySections,
    ...buildSupplementalExcerptSections(
      sectionByRef,
      relevantSupplementalConstraints,
    ),
  ];
  const constraints = [
    ...input.story.repo_rules,
    ...relevantSupplementalConstraints.map(
      (constraint) => constraint.constraint,
    ),
  ];

  return [
    `<!-- agent-packet:story-id ${input.story.id} -->`,
    `<!-- agent-packet:story-path ${storyPathLabel} -->`,
    `<!-- agent-packet:story-sha256 ${storySha256} -->`,
    "",
    "# Story Packet",
    "",
    "## Story",
    "",
    `Spec Version: ${input.story.spec_version}`,
    `Story Schema Version: ${input.story.story_schema_version}`,
    `ID: ${input.story.id}`,
    `Epic ID: ${input.story.epic_id}`,
    `Title: ${input.story.title}`,
    `Type: ${input.story.type}`,
    `Area: ${input.story.area}`,
    `Primary Concern: ${input.story.primary_concern}`,
    "",
    "## Why",
    "",
    input.story.summary,
    "",
    "## Authoritative Spec References",
    "",
    ...allSections.map((section) => `- ${section.ref} (${section.heading})`),
    "",
    "## Relevant Spec Excerpts",
    "",
    ...renderSpecExcerpts(relevantExcerpts),
    "",
    "## Story Boundary",
    "",
    input.story.story_boundary,
    "",
    "## Scope",
    "",
    ...renderBulletList(input.story.scope),
    "",
    "## Out of Scope",
    "",
    ...renderBulletList(input.story.non_scope),
    "",
    "## Allowed Touch Points",
    "",
    "<!-- prettier-ignore -->",
    ...renderBulletList(input.story.allowed_touch_points),
    "",
    "## Constraints",
    "",
    ...renderBulletList(constraints),
    "",
    "## Required Tests",
    "",
    ...renderBulletList(input.story.required_tests),
    "",
    "## Expected Output",
    "",
    ...renderBulletList(DEFAULT_EXPECTED_OUTPUT),
    "",
    "## Acceptance Criteria",
    "",
    ...renderBulletList(input.story.acceptance_criteria),
    "",
    "## Ambiguity Rule",
    "",
    renderAmbiguityRule(input.story.ambiguity_policy),
    "",
    "## Agent Instruction Footer",
    "",
    "```text",
    ...AGENT_FOOTER,
    "```",
    "",
  ].join("\n");
}

function buildSupplementalExcerptSections(
  sectionByRef: Map<string, SpecSection>,
  relevantConstraints: SupplementalConstraint[],
): SpecSection[] {
  return relevantConstraints.map((constraint) => {
    const section = sectionByRef.get(constraint.ref);

    if (!section) {
      throw new Error(
        `Unable to load supplemental spec section ${constraint.ref}.`,
      );
    }

    return {
      ...section,
      body: constraint.excerpt,
    };
  });
}

function renderSpecExcerpts(sections: SpecSection[]) {
  const lines: string[] = [];

  for (const [index, section] of sections.entries()) {
    lines.push(`### ${section.ref} (${section.heading})`);
    if (section.body !== "") {
      lines.push("");
      lines.push(section.body);
    }

    if (index < sections.length - 1) {
      lines.push("");
    }
  }

  return lines;
}

function renderBulletList(values: string[]) {
  return values.map((value) => `- ${value}`);
}

function uniqueSupplementalRefs(
  existingRefs: string[],
  relevantConstraints: SupplementalConstraint[],
) {
  const existing = new Set(existingRefs.map(normalizeSpecRef));
  return relevantConstraints
    .map((constraint) => constraint.ref)
    .filter(
      (ref, index, refs) => !existing.has(ref) && refs.indexOf(ref) === index,
    );
}

function getRelevantSupplementalConstraints(story: StoryData) {
  return SUPPLEMENTAL_CONSTRAINTS.filter((constraint) =>
    constraint.appliesToStory(story),
  );
}

function dedupeSectionsByRef(sections: SpecSection[]) {
  const seen = new Set<string>();
  return sections.filter((section) => {
    if (seen.has(section.ref)) {
      return false;
    }

    seen.add(section.ref);
    return true;
  });
}

function renderAmbiguityRule(ambiguityPolicy: string) {
  if (ambiguityPolicy === "implement_if_clearly_implied") {
    return [
      "Policy: implement_if_clearly_implied",
      "",
      "If the story or cited specification is ambiguous, implement only the behavior that is clearly implied by the cited text. Otherwise, report the ambiguity and stop at the narrowest safe point.",
    ].join("\n");
  }

  return [
    `Policy: ${ambiguityPolicy}`,
    "",
    "If the story or cited specification is ambiguous, do not invent behavior. Report the ambiguity and stop at the narrowest safe point.",
  ].join("\n");
}

async function loadSpecSections(repoRoot: string, specRefs: string[]) {
  const docMap = await buildSpecDocMap(repoRoot);
  const sections: SpecSection[] = [];

  for (const specRef of specRefs) {
    const ref = normalizeSpecRef(specRef);
    const docId = ref.split(".s")[0];

    if (docId === undefined || docId === "") {
      throw new Error(`Unable to derive spec document id from ${ref}.`);
    }

    const filePath = docMap.get(docId);

    if (!filePath) {
      throw new Error(`Unable to resolve spec document for ${ref}.`);
    }

    const section = await readSpecSection(filePath, ref);

    if (!section) {
      throw new Error(`Unable to find spec section ${ref} in ${filePath}.`);
    }

    sections.push(section);
  }

  return sections;
}

async function buildSpecDocMap(repoRoot: string) {
  const specsDir = path.join(repoRoot, "specs");
  const docMap = new Map<string, string>();

  for (const filePath of await listMarkdownFilesRecursive(specsDir)) {
    const source = await readUtf8(filePath);
    const match = source.match(/^doc_id:\s*"([^"]+)"/m);

    const docId = match?.[1];

    if (docId !== undefined && docId !== "") {
      docMap.set(docId, filePath);
    }
  }

  return docMap;
}

async function readSpecSection(filePath: string, ref: string) {
  const source = await readUtf8(filePath);
  const lines = source.split(/\r?\n/);
  let currentHeading = path.basename(filePath);
  let inCodeFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = readRequiredLine(lines, index, "reading spec lines");
    if (isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      continue;
    }
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);

    if (headingMatch) {
      const heading = headingMatch[1];

      if (heading === undefined || heading.trim() === "") {
        throw new Error(`Unable to parse heading in ${filePath}.`);
      }

      currentHeading = heading.trim();
      continue;
    }

    if (line !== `<!-- SECTION_REF: ${ref} -->`) {
      continue;
    }

    let startIndex = index + 1;

    while (startIndex < lines.length && isBlankLine(lines[startIndex])) {
      startIndex += 1;
    }

    if (lines[startIndex]?.startsWith("Section Ref:")) {
      startIndex += 1;
    }

    while (startIndex < lines.length && isBlankLine(lines[startIndex])) {
      startIndex += 1;
    }

    let endIndex = startIndex;
    let inSectionCodeFence = false;

    while (endIndex < lines.length) {
      const currentLine = readRequiredLine(
        lines,
        endIndex,
        "scanning spec section body",
      );

      if (isCodeFenceLine(currentLine)) {
        inSectionCodeFence = !inSectionCodeFence;
        endIndex += 1;
        continue;
      }

      if (!inSectionCodeFence && currentLine.startsWith("<!-- SECTION_REF:")) {
        break;
      }

      if (!inSectionCodeFence && isHeadingForNextSection(lines, endIndex)) {
        break;
      }

      endIndex += 1;
    }

    const body = trimTrailingBlankLines(lines.slice(startIndex, endIndex))
      .join("\n")
      .trim();

    return {
      body,
      filePath,
      heading: currentHeading,
      ref,
    };
  }

  return null;
}

function isHeadingForNextSection(lines: string[], index: number) {
  const currentLine = lines[index];

  if (
    currentLine === undefined ||
    isCodeFenceLine(currentLine) ||
    !/^#{1,6}\s+/.test(currentLine)
  ) {
    return false;
  }

  let cursor = index + 1;
  let inCodeFence = false;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line !== undefined && isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      cursor += 1;
      continue;
    }
    if (!inCodeFence && !isBlankLine(line)) {
      break;
    }
    cursor += 1;
  }

  if (inCodeFence) {
    return false;
  }

  return lines[cursor]?.startsWith("<!-- SECTION_REF:") ?? false;
}

function trimTrailingBlankLines(lines: string[]) {
  const copy = [...lines];

  while (copy.length > 0) {
    const lastLine = copy[copy.length - 1];

    if (lastLine === undefined || lastLine.trim() !== "") {
      break;
    }

    copy.pop();
  }

  return copy;
}

function isBlankLine(line: string | undefined) {
  return line?.trim() === "";
}

function isCodeFenceLine(line: string) {
  return /^\s*(```|~~~)/.test(line);
}

function normalizeSpecRef(specRef: string) {
  const trimmed = specRef.trim();
  const match = trimmed.match(/^([A-Za-z0-9-]+\.s\d+)(?:\s+\(.+\))?$/);
  return match?.[1] ?? trimmed;
}

function readRequiredLine(
  lines: string[],
  index: number,
  context: string,
): string {
  const line = lines[index];

  if (line === undefined) {
    throw new Error(`Unexpected end of file while ${context}.`);
  }

  return line;
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function normalizePacketContent(packetSource: string) {
  return normalizeLineEndings(packetSource);
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

async function listMarkdownFilesRecursive(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const filePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...(await listMarkdownFilesRecursive(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      filePaths.push(entryPath);
    }
  }

  return filePaths.sort((left, right) => left.localeCompare(right));
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

function isToolingRelevantStory(story: StoryData) {
  return (
    story.primary_concern === "tooling" ||
    story.area === "infra" ||
    touchesAnyPrefix(story.allowed_touch_points, [
      "tools/",
      "tests/",
      "agent-packets/",
      "package.json",
      "pnpm-lock.yaml",
    ])
  );
}

function touchesAnyPrefix(allowedTouchPoints: string[], prefixes: string[]) {
  return allowedTouchPoints.some((touchPoint) =>
    prefixes.some(
      (prefix) => touchPoint === prefix || touchPoint.startsWith(prefix),
    ),
  );
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
