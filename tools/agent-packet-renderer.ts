import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { StoryData } from "./agent-packet-parser.js";

export const REQUIRED_PACKET_HEADINGS = [
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
  "## Post-Approval Role Sections",
  "## Ambiguity Rule",
  "## Agent Instruction Footer",
] as const;

const DEFAULT_EXPECTED_OUTPUT = [
  "code changes",
  "tests",
  "brief implementation note",
  "explicit assumptions list",
];

const CODE_STANDARD_SUBSECTION_LINES = [
  "### Code Standard",
  "",
  "Follow [`docs/code-standard.md`](docs/code-standard.md). Non-negotiables:",
  "",
  "- stay inside the approved story boundary",
  "- preserve package boundaries",
  "- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors",
  "- prefer named exports and precise types",
  "- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard",
  "- split by reason-to-change, not by line count",
  "- do not over-split into tiny files or generic dumping grounds",
  "- keep engine-core pure and hidden-info safe",
  "- prove engine behavior with synthetic/unit/regression tests",
  "- keep real-card fixture tests separate from engine behavior requirements",
  "- preserve deterministic event ordering and state hashes",
  "- record ambiguity instead of inventing behavior",
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

type PostApprovalRoleSection = {
  forbiddenActions: string[];
  checklistHeading: "Handoff Checklist" | "Verification Checklist";
  requiredInputs: string[];
  requiredOutputs: string[];
  responsibilities: string[];
  role: "story-orchestrator" | "implementation" | "code-review" | "pr-gate";
};

const POST_APPROVAL_ROLE_SECTIONS: PostApprovalRoleSection[] = [
  {
    role: "story-orchestrator",
    responsibilities: [
      "own story authority, scope enforcement, ambiguity handling, and role assignment",
      "ensure active packet content is current before implementation or review handoff",
      "handoff only approved post-approval roles for this story",
    ],
    forbiddenActions: [
      "do not perform story-author or story-review pre-approval handoff mechanics",
      "do not introduce packet-agent, cleanup-sync-agent, or revision-agent roles",
      "do not mutate packet lifecycle semantics outside approved story scope",
    ],
    requiredInputs: [
      "approved story file under stories/approved/",
      "active packet file under agent-packets/",
      "AGENTS.md and required workflow docs for the current phase",
    ],
    requiredOutputs: [
      "worker assignment constrained to allowed_touch_points and story boundary",
      "implementation handoff instructions bound to packet authority",
      "verification handoff readiness note",
    ],
    checklistHeading: "Handoff Checklist",
  },
  {
    role: "implementation",
    responsibilities: [
      "implement only the approved story using packet authority order",
      "follow strict TypeScript, lint, and verification requirements",
      "report ambiguity instead of inventing uncited behavior",
    ],
    forbiddenActions: [
      "do not broaden scope beyond the approved story boundary or allowed_touch_points",
      "do not add packet extraction behavior unless the approved story explicitly owns it",
      "do not implement story-author/story-review handoff mechanics",
    ],
    requiredInputs: [
      "active packet content with authoritative spec references",
      "approved story scope, non-scope, and acceptance criteria",
      "allowed_touch_points and required test list",
    ],
    requiredOutputs: [
      "scoped code and test changes within approved touch points",
      "verification command results with pass/fail status",
      "assumptions and blockers note",
    ],
    checklistHeading: "Verification Checklist",
  },
  {
    role: "code-review",
    responsibilities: [
      "review correctness, scope fit, and required-test coverage",
      "verify no forbidden role sections or lifecycle changes were introduced",
      "confirm canonical packet behavior remains enforceable",
    ],
    forbiddenActions: [
      "do not author new feature scope outside the reviewed patch",
      "do not bypass required tests, packet verification, or CI gate evidence",
      "do not approve scope drift that violates story boundary",
    ],
    requiredInputs: [
      "proposed patch limited to approved touch points",
      "active packet, approved story, and cited spec references",
      "verification and test evidence for required commands",
    ],
    requiredOutputs: [
      "review findings prioritized by correctness and scope compliance",
      "clear disposition for findings (fix/defer/block) with rationale",
      "review closure recommendation for pr-gate handoff",
    ],
    checklistHeading: "Verification Checklist",
  },
  {
    role: "pr-gate",
    responsibilities: [
      "own PR gate state, cleanup metadata validation, and human-review handoff",
      "confirm cleanup-metadata-guard presence and passing status before handoff",
      "preserve reviewed packet lifecycle behavior without scope expansion",
    ],
    forbiddenActions: [
      "do not merge without required human review and passing checks",
      "do not change cleanup metadata semantics in implementation patches",
      "do not implement feature code while serving as gate role",
    ],
    requiredInputs: [
      "current PR body or durable handoff comment with cleanup metadata source",
      "fetched changed files, PR head branch, and status checks",
      "review records, revision response, and verification evidence",
    ],
    requiredOutputs: [
      "gate decision with explicit pass/fail blockers",
      "human-review-ready handoff with cleanup metadata validation status",
      "post-merge cleanup or fallback status confirmation",
    ],
    checklistHeading: "Handoff Checklist",
  },
];

type SpecSection = {
  body: string;
  filePath: string;
  heading: string;
  ref: string;
};

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

export async function buildPacket(input: {
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
    "<!-- prettier-ignore-start -->",
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
    ...CODE_STANDARD_SUBSECTION_LINES,
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
    "## Post-Approval Role Sections",
    "",
    ...renderPostApprovalRoleSections(),
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
    "<!-- prettier-ignore-end -->",
    "",
  ].join("\n");
}

export function normalizePacketContent(packetSource: string) {
  return normalizeLineEndings(packetSource);
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

function renderPostApprovalRoleSections() {
  const lines: string[] = [];

  for (const [index, roleSection] of POST_APPROVAL_ROLE_SECTIONS.entries()) {
    lines.push(`### ${roleSection.role}`);
    lines.push("");
    lines.push("Responsibilities");
    lines.push(...renderBulletList(roleSection.responsibilities));
    lines.push("");
    lines.push("Forbidden Actions");
    lines.push(...renderBulletList(roleSection.forbiddenActions));
    lines.push("");
    lines.push("Required Inputs");
    lines.push(...renderBulletList(roleSection.requiredInputs));
    lines.push("");
    lines.push("Required Outputs");
    lines.push(...renderBulletList(roleSection.requiredOutputs));
    lines.push("");
    lines.push(roleSection.checklistHeading);
    lines.push(
      ...renderBulletList([
        "confirm required inputs are present and current",
        "confirm forbidden actions are not introduced",
        "confirm required outputs are produced for handoff",
      ]),
    );

    if (index < POST_APPROVAL_ROLE_SECTIONS.length - 1) {
      lines.push("");
    }
  }

  return lines;
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
