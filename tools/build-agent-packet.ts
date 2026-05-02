import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type StoryData = {
  spec_version: string;
  spec_package_name: string;
  story_schema_version: string;
  id: string;
  epic_id: string;
  title: string;
  type: string;
  area: string;
  primary_concern: string;
  priority: string;
  status: string;
  summary: string;
  story_boundary: string;
  allowed_touch_points: string[];
  spec_refs: string[];
  scope: string[];
  non_scope: string[];
  dependencies: string[];
  acceptance_criteria: string[];
  required_tests: string[];
  repo_rules: string[];
  ambiguity_policy: string;
};

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

    throw new Error(
      "Usage:\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts generate --story <path> [--output <path>] [--manifest <path>] [--activate]\n" +
        "  node --experimental-strip-types tools/build-agent-packet.ts verify-active [--manifest <path>]",
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

    manifest.activeStories = upsertManifestEntry(
      manifest.activeStories,
      nextEntry,
    );

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
    lines.push("");
    lines.push(section.body);

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

  for (let index = 0; index < lines.length; index += 1) {
    const line = readRequiredLine(lines, index, "reading spec lines");
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

    while (endIndex < lines.length) {
      const currentLine = readRequiredLine(
        lines,
        endIndex,
        "scanning spec section body",
      );

      if (currentLine.startsWith("<!-- SECTION_REF:")) {
        break;
      }

      if (isHeadingForNextSection(lines, endIndex)) {
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

  if (currentLine === undefined || !/^#{1,6}\s+/.test(currentLine)) {
    return false;
  }

  let cursor = index + 1;

  while (cursor < lines.length && isBlankLine(lines[cursor])) {
    cursor += 1;
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

function parseStoryYaml(source: string): StoryData {
  const result = new Map<string, string | string[]>();
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];

    if (line === undefined) {
      throw new Error("Unexpected end of story file.");
    }

    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }

    const keyMatch = line.match(/^([a-z_]+):(?:\s(.*))?$/i);

    if (!keyMatch) {
      throw new Error(`Unable to parse story line: ${line}`);
    }

    const [, key, rawValue = ""] = keyMatch;

    if (key === undefined || key === "") {
      throw new Error(`Unable to parse story key from line: ${line}`);
    }

    if (rawValue === "" && isListLine(lines[index + 1])) {
      const items: string[] = [];
      index += 1;

      while (index < lines.length && isListLine(lines[index])) {
        const itemLine = readRequiredLine(
          lines,
          index,
          "reading story list item",
        );
        items.push(parseListValue(itemLine));
        index += 1;
      }

      result.set(key, items);
      continue;
    }

    if (isInlineEmptyArray(rawValue)) {
      result.set(key, []);
      index += 1;
      continue;
    }

    const blockScalarStyle = parseBlockScalarStyle(rawValue);

    if (blockScalarStyle) {
      const blockLines: string[] = [];
      index += 1;

      while (index < lines.length && isIndentedBlock(lines[index])) {
        const blockLine = readRequiredLine(lines, index, "reading story block");
        blockLines.push(blockLine.slice(2));
        index += 1;
      }

      result.set(key, foldBlockScalar(blockLines, blockScalarStyle));
      continue;
    }

    result.set(key, parseScalarValue(rawValue));
    index += 1;
  }

  return {
    acceptance_criteria: expectStringArray(result, "acceptance_criteria"),
    allowed_touch_points: expectStringArray(result, "allowed_touch_points"),
    ambiguity_policy: expectString(result, "ambiguity_policy"),
    area: expectString(result, "area"),
    dependencies: expectStringArray(result, "dependencies"),
    epic_id: expectString(result, "epic_id"),
    id: expectString(result, "id"),
    non_scope: expectStringArray(result, "non_scope"),
    primary_concern: expectString(result, "primary_concern"),
    priority: expectString(result, "priority"),
    repo_rules: expectStringArray(result, "repo_rules"),
    required_tests: expectStringArray(result, "required_tests"),
    scope: expectStringArray(result, "scope"),
    spec_package_name: expectString(result, "spec_package_name"),
    spec_refs: expectStringArray(result, "spec_refs"),
    spec_version: expectString(result, "spec_version"),
    status: expectString(result, "status"),
    story_boundary: expectString(result, "story_boundary"),
    story_schema_version: expectString(result, "story_schema_version"),
    summary: expectString(result, "summary"),
    title: expectString(result, "title"),
    type: expectString(result, "type"),
  };
}

function isListLine(line: string | undefined) {
  return typeof line === "string" && /^ {2}- /.test(line);
}

function isIndentedBlock(line: string | undefined) {
  return (
    typeof line === "string" && (line.startsWith("  ") || line.trim() === "")
  );
}

function isBlankLine(line: string | undefined) {
  return line?.trim() === "";
}

function parseListValue(line: string) {
  return parseScalarValue(line.replace(/^ {2}- /, ""));
}

function parseScalarValue(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function isInlineEmptyArray(value: string) {
  return value.trim() === "[]";
}

function parseBlockScalarStyle(value: string) {
  const match = value.trim().match(/^([>|])[-+]?$/);
  return match?.[1] ?? null;
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

function foldBlockScalar(lines: string[], style: string) {
  if (style === "|") {
    return trimTrailingBlankLines(lines).join("\n").trim();
  }

  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" ").trim());
        currentParagraph = [];
      }
      continue;
    }

    currentParagraph.push(line.trim());
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" ").trim());
  }

  return paragraphs.join("\n\n");
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function normalizePacketContent(packetSource: string) {
  return normalizeLineEndings(packetSource);
}

function expectString(map: Map<string, string | string[]>, key: string) {
  const value = map.get(key);

  if (typeof value !== "string") {
    throw new Error(`Missing string field ${key} in story file.`);
  }

  return value;
}

function expectStringArray(map: Map<string, string | string[]>, key: string) {
  const value = map.get(key);

  if (!Array.isArray(value)) {
    throw new Error(`Missing list field ${key} in story file.`);
  }

  return value;
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

function upsertManifestEntry(
  entries: ActiveStoryEntry[],
  nextEntry: ActiveStoryEntry,
) {
  const filtered = entries.filter(
    (entry) => entry.storyId !== nextEntry.storyId,
  );
  filtered.push(nextEntry);
  filtered.sort((left, right) => left.storyId.localeCompare(right.storyId));
  return filtered;
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

function requireOption(options: Map<string, string>, key: string) {
  const value = options.get(key);

  if (!value) {
    throw new Error(`Missing required option ${key}`);
  }

  return value;
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
