import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type * as PacketParser from "../agent-packet-parser.js";
import type * as PacketLifecycle from "../agent-packet-lifecycle.js";
import type {
  BoundCleanupPlan,
  CleanupDryRunPlan,
  CleanupEvidenceInput,
  CleanupMetadata,
  CleanupParentStoryValidation,
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
const BOUND_CLEANUP_PLAN_SCHEMA_VERSION = "post-merge-cleanup-plan.v1";
const VERIFICATION_COMMAND = "corepack pnpm verify";

export async function buildCleanupDryRunPlan(options: {
  evidence: CleanupEvidenceInput;
  metadata: CleanupMetadata;
  metadataSourceRef: string;
  repoRoot: string;
  trustedMainSha: string;
}): Promise<CleanupDryRunPlan> {
  validateStoryCardinality(options.metadata);
  const stories = await validateStories(
    options.repoRoot,
    options.metadata.stories,
  );
  const requiredReview = validateEvidenceBinding({
    evidence: options.evidence,
    metadata: options.metadata,
    metadataSourceRef: options.metadataSourceRef,
    stories,
    trustedMainSha: options.trustedMainSha,
  });
  const sortedBranches = [...options.metadata.branches].sort((a, b) =>
    a.localeCompare(b),
  );

  const boundParentStory =
    options.metadata.mode === "parent"
      ? await bindParentStory({
          changedFiles: options.evidence.changedFiles,
          repoRoot: options.repoRoot,
          stories,
        })
      : undefined;

  return {
    ...(boundParentStory ? { boundParentStory } : {}),
    boundStories: stories,
    branches: sortedBranches,
    mergeSha: options.evidence.mergeSha,
    mergedPrNumber: options.evidence.prNumber,
    mode: options.metadata.mode,
    statement:
      "Cleanup metadata is bound to reviewed PR evidence, trusted story/packet state, and merge state.",
    verificationInputs: {
      metadataSource: options.evidence.metadataSourceRef,
      requiredReviewId: requiredReview.id,
      requiredReviewSubmittedAt: requiredReview.submittedAt,
      trustedBaseBranch: options.evidence.baseBranch,
      trustedMainSha: options.trustedMainSha,
    },
  };
}

export function buildBoundCleanupPlan(options: {
  generatedAt: string;
  inputsHash: string;
  plan: CleanupDryRunPlan;
}): BoundCleanupPlan {
  parseCanonicalInstantMillis(
    options.generatedAt,
    "bound cleanup plan generatedAt",
  );
  requireHash(options.inputsHash, "bound cleanup plan inputsHash");

  const command =
    options.plan.mode === "single"
      ? {
          args: ["--story", options.plan.boundStories[0]?.storyPath ?? ""],
          command: "packets:complete" as const,
        }
      : {
          args: [
            ...options.plan.boundStories.flatMap((story) => [
              "--story",
              story.storyPath,
            ]),
            "--parent-story",
            options.plan.boundParentStory?.storyPath ?? "",
            "--parent-story-sha256",
            options.plan.boundParentStory?.storySha256 ?? "",
          ],
          command: "packets:complete-many" as const,
        };

  if (command.args.some((arg) => arg.length === 0)) {
    throw new Error(
      "Bound cleanup plan cannot be built with empty packet command args.",
    );
  }

  return {
    branches: [...options.plan.branches],
    generatedAt: options.generatedAt,
    inputsHash: options.inputsHash,
    mergedPullRequest: {
      baseBranch: options.plan.verificationInputs.trustedBaseBranch,
      mergeSha: options.plan.mergeSha,
      number: options.plan.mergedPrNumber,
    },
    metadataSource: {
      contentSha256: readSourceHash(
        options.plan.verificationInputs.metadataSource,
      ),
      ref: options.plan.verificationInputs.metadataSource,
    },
    packetCommand: command,
    reviewEvidenceSource: {
      contentSha256: options.inputsHash,
      requiredReviewId: options.plan.verificationInputs.requiredReviewId,
      requiredReviewSubmittedAt:
        options.plan.verificationInputs.requiredReviewSubmittedAt,
    },
    schemaVersion: BOUND_CLEANUP_PLAN_SCHEMA_VERSION,
    status: "valid",
    ...(options.plan.boundParentStory
      ? { boundParentStory: options.plan.boundParentStory }
      : {}),
    stories: [...options.plan.boundStories],
    verificationCommand: VERIFICATION_COMMAND,
  };
}

export function validateBoundCleanupPlanArtifact(
  value: unknown,
): BoundCleanupPlan {
  const root = requireRecord(value, "bound cleanup plan");
  const expectedKeys = [
    "branches",
    "boundParentStory",
    "generatedAt",
    "inputsHash",
    "mergedPullRequest",
    "metadataSource",
    "packetCommand",
    "reviewEvidenceSource",
    "schemaVersion",
    "status",
    "stories",
    "verificationCommand",
  ];
  rejectUnexpectedKeys(root, expectedKeys, "bound cleanup plan");
  if (root["schemaVersion"] !== BOUND_CLEANUP_PLAN_SCHEMA_VERSION) {
    throw new Error("Malformed bound cleanup plan: unknown schema version.");
  }
  if (root["status"] !== "valid") {
    throw new Error("Malformed bound cleanup plan: status must be valid.");
  }
  requireCanonicalInstant(
    root["generatedAt"],
    "bound cleanup plan generatedAt",
  );
  requireHash(root["inputsHash"], "bound cleanup plan inputsHash");
  const metadataSource = requireRecord(
    root["metadataSource"],
    "bound cleanup plan metadataSource",
  );
  rejectUnexpectedKeys(
    metadataSource,
    ["contentSha256", "ref"],
    "bound cleanup plan metadataSource",
  );
  requireHash(
    metadataSource["contentSha256"],
    "bound cleanup plan metadataSource.contentSha256",
  );
  requireString(metadataSource["ref"], "bound cleanup plan metadataSource.ref");
  requireStringArray(root["branches"], "bound cleanup plan branches");
  if (root["boundParentStory"] !== undefined) {
    validateParentStoryRecord(root["boundParentStory"]);
  }

  const mergedPullRequest = requireRecord(
    root["mergedPullRequest"],
    "bound cleanup plan mergedPullRequest",
  );
  rejectUnexpectedKeys(
    mergedPullRequest,
    ["baseBranch", "mergeSha", "number"],
    "bound cleanup plan mergedPullRequest",
  );
  requireString(
    mergedPullRequest["baseBranch"],
    "bound cleanup plan mergedPullRequest.baseBranch",
  );
  requireString(
    mergedPullRequest["mergeSha"],
    "bound cleanup plan mergedPullRequest.mergeSha",
  );
  requireNumber(
    mergedPullRequest["number"],
    "bound cleanup plan mergedPullRequest.number",
  );

  const reviewEvidenceSource = requireRecord(
    root["reviewEvidenceSource"],
    "bound cleanup plan reviewEvidenceSource",
  );
  rejectUnexpectedKeys(
    reviewEvidenceSource,
    ["contentSha256", "requiredReviewId", "requiredReviewSubmittedAt"],
    "bound cleanup plan reviewEvidenceSource",
  );
  requireHash(
    reviewEvidenceSource["contentSha256"],
    "bound cleanup plan reviewEvidenceSource.contentSha256",
  );
  requireString(
    reviewEvidenceSource["requiredReviewId"],
    "bound cleanup plan reviewEvidenceSource.requiredReviewId",
  );
  requireCanonicalInstant(
    reviewEvidenceSource["requiredReviewSubmittedAt"],
    "bound cleanup plan reviewEvidenceSource.requiredReviewSubmittedAt",
  );

  const packetCommand = requireRecord(
    root["packetCommand"],
    "bound cleanup plan packetCommand",
  );
  rejectUnexpectedKeys(
    packetCommand,
    ["args", "command"],
    "bound cleanup plan packetCommand",
  );
  if (
    packetCommand["command"] !== "packets:complete" &&
    packetCommand["command"] !== "packets:complete-many"
  ) {
    throw new Error("Malformed bound cleanup plan: packet command is invalid.");
  }
  requireStringArray(
    packetCommand["args"],
    "bound cleanup plan packetCommand.args",
  );
  if (root["verificationCommand"] !== VERIFICATION_COMMAND) {
    throw new Error(
      "Malformed bound cleanup plan: verification command is invalid.",
    );
  }

  const storyRecords = requireRecordArray(
    root["stories"],
    "bound cleanup plan stories",
  );
  const seenStoryIds = new Set<string>();
  for (const story of storyRecords) {
    rejectUnexpectedKeys(
      story,
      ["packetPath", "packetSha256", "storyId", "storyPath", "storySha256"],
      "bound cleanup plan stories[]",
    );
    requireString(story["packetPath"], "bound cleanup plan story packetPath");
    requireHash(story["packetSha256"], "bound cleanup plan story packetSha256");
    requireString(story["storyId"], "bound cleanup plan story storyId");
    requireString(story["storyPath"], "bound cleanup plan story storyPath");
    requireHash(story["storySha256"], "bound cleanup plan story storySha256");
    validateCanonicalStoryPath(story["storyPath"]);
    if (seenStoryIds.has(story["storyId"])) {
      throw new Error("Malformed bound cleanup plan: duplicate story id.");
    }
    seenStoryIds.add(story["storyId"]);
  }

  return root as BoundCleanupPlan;
}

function validateParentStoryRecord(value: unknown) {
  const parent = requireRecord(value, "bound cleanup plan boundParentStory");
  rejectUnexpectedKeys(
    parent,
    ["storyId", "storyPath", "storySha256"],
    "bound cleanup plan boundParentStory",
  );
  requireString(parent["storyId"], "bound cleanup plan parent story storyId");
  requireString(
    parent["storyPath"],
    "bound cleanup plan parent story storyPath",
  );
  requireHash(
    parent["storySha256"],
    "bound cleanup plan parent story storySha256",
  );
  validateCanonicalStoryPath(parent["storyPath"]);
}

function validateEvidenceBinding(options: {
  evidence: CleanupEvidenceInput;
  metadata: CleanupMetadata;
  metadataSourceRef: string;
  stories: CleanupStoryValidation[];
  trustedMainSha: string;
}) {
  const { evidence, metadata, metadataSourceRef, stories, trustedMainSha } =
    options;
  validateEvidenceShape(evidence);
  if (!evidence.merged) {
    throw new Error("Merged PR evidence is required.");
  }
  if (evidence.baseBranch !== evidence.defaultBranch) {
    throw new Error("Merged PR target branch must be the default branch.");
  }
  if (evidence.mergeSha !== trustedMainSha) {
    throw new Error(
      "Merged PR SHA must match the trusted checked-out default branch.",
    );
  }
  if (evidence.metadataSourceRef !== buildSourceRef(evidence.metadataSource)) {
    throw new Error("Metadata source reference must match source evidence.");
  }
  if (
    evidence.metadataSource.kind !== "pr-body" &&
    evidence.metadataSource.kind !== "handoff-comment"
  ) {
    throw new Error(
      "Cleanup metadata source must be a PR body or durable handoff comment.",
    );
  }
  if (metadataSourceRef !== evidence.metadataSourceRef) {
    throw new Error(
      "Cleanup metadata must come from the reviewed PR metadata source.",
    );
  }
  if (
    evidence.metadataSource.kind === "handoff-comment" &&
    !evidence.metadataSource.durable
  ) {
    throw new Error("Handoff metadata source must be durable.");
  }
  const mergedAtMs = parseCanonicalInstantMillis(
    evidence.mergedAt,
    "cleanup evidence mergedAt",
  );
  const metadataUpdatedAtMs = parseCanonicalInstantMillis(
    evidence.metadataSource.updatedAt,
    "cleanup evidence metadataSource.updatedAt",
  );

  const humanGateReviews = evidence.reviews
    .filter(
      (review) =>
        review.reviewerKind === "human" &&
        review.isMergeGate &&
        (review.decision === "fallback-approved" ||
          review.decision === "merged"),
    )
    .filter(
      (review) =>
        parseCanonicalInstantMillis(
          review.submittedAt,
          "cleanup evidence review.submittedAt",
        ) <= mergedAtMs,
    )
    .sort(
      (a, b) =>
        parseCanonicalInstantMillis(
          a.submittedAt,
          "cleanup evidence review.submittedAt",
        ) -
        parseCanonicalInstantMillis(
          b.submittedAt,
          "cleanup evidence review.submittedAt",
        ),
    );
  const requiredReview = humanGateReviews.at(-1);
  if (!requiredReview) {
    throw new Error("Missing required human merge-gate review before merge.");
  }
  const requiredReviewSubmittedAtMs = parseCanonicalInstantMillis(
    requiredReview.submittedAt,
    "cleanup evidence review.submittedAt",
  );

  if (metadataUpdatedAtMs > mergedAtMs) {
    throw new Error("Cleanup metadata source changed after merge.");
  }

  if (
    requiredReview.decision !== "merged" &&
    metadataUpdatedAtMs > requiredReviewSubmittedAtMs
  ) {
    throw new Error(
      "Cleanup metadata source changed after fallback human review.",
    );
  }

  validateStoryAssociation({ evidence, metadata, stories });
  if (metadata.mode === "parent") {
    validateParentEvidence({
      evidence,
      requiredReviewSubmittedAtMs,
      stories,
    });
  }
  return requiredReview;
}

function validateStoryAssociation(options: {
  evidence: CleanupEvidenceInput;
  metadata: CleanupMetadata;
  stories: CleanupStoryValidation[];
}) {
  const storyBindingByPath = new Map(
    options.evidence.stories.map((story) => [story.storyPath, story]),
  );
  const changedFiles = new Set(options.evidence.changedFiles);
  for (const story of options.stories) {
    const binding = storyBindingByPath.get(story.storyPath);
    if (!binding) {
      throw new Error(
        `Requested story ${story.storyPath} is not associated with merged PR evidence.`,
      );
    }
    if (binding.storyId !== story.storyId) {
      throw new Error(
        `Requested story ${story.storyPath} does not match PR story id evidence.`,
      );
    }
    if (binding.packetPath !== story.packetPath) {
      throw new Error(
        `Requested story ${story.storyPath} does not match PR packet evidence.`,
      );
    }
    if (
      !changedFiles.has(story.storyPath) ||
      !changedFiles.has(story.packetPath)
    ) {
      throw new Error(
        `Merged PR changed artifacts must include ${story.storyPath} and ${story.packetPath}.`,
      );
    }
  }
}

function validateParentEvidence(options: {
  evidence: CleanupEvidenceInput;
  requiredReviewSubmittedAtMs: number;
  stories: CleanupStoryValidation[];
}) {
  const parent = options.evidence.parentLifecycle;
  if (!parent) {
    throw new Error("Parent cleanup evidence is required for parent mode.");
  }
  if (
    !parent.parentIntegrationReviewRecordId ||
    !parent.parentRevisionResponseId
  ) {
    throw new Error(
      "Parent cleanup evidence is missing integration review or revision response.",
    );
  }
  if (
    parseCanonicalInstantMillis(
      parent.cleanupPlanRecordedAt,
      "cleanup evidence parentLifecycle.cleanupPlanRecordedAt",
    ) > options.requiredReviewSubmittedAtMs
  ) {
    throw new Error(
      "Parent cleanup plan must be recorded before the required human merge-gate review.",
    );
  }
  const byPath = new Map(
    parent.includedStories.map((story) => [story.storyPath, story]),
  );
  for (const story of options.stories) {
    const child = byPath.get(story.storyPath);
    if (!child) {
      throw new Error(
        `Parent evidence missing included-substory entry for ${story.storyPath}.`,
      );
    }
    if (!child.substoryPrNumber || !child.substoryAiReviewRecordId) {
      throw new Error(
        `Parent evidence missing substory PR or AI review record for ${story.storyPath}.`,
      );
    }
    if (
      child.storyId !== story.storyId ||
      child.packetPath !== story.packetPath
    ) {
      throw new Error(
        `Parent evidence included-substory entry does not match trusted story/packet evidence for ${story.storyPath}.`,
      );
    }
  }
}

function buildSourceRef(source: CleanupEvidenceInput["metadataSource"]) {
  return `${source.kind}:${source.sourceId}:${source.contentSha256}`;
}

function readSourceHash(sourceRef: string) {
  const sourceHash = sourceRef.split(":").at(-1) ?? "";
  requireHash(sourceHash, "bound cleanup plan metadataSource.contentSha256");
  return sourceHash;
}

function validateEvidenceShape(evidence: CleanupEvidenceInput) {
  const root = requireRecord(evidence, "cleanup evidence");
  requireNumber(root["prNumber"], "cleanup evidence prNumber");
  requireBoolean(root["merged"], "cleanup evidence merged");
  requireString(root["mergeSha"], "cleanup evidence mergeSha");
  requireCanonicalInstant(root["mergedAt"], "cleanup evidence mergedAt");
  requireString(root["baseBranch"], "cleanup evidence baseBranch");
  requireString(root["defaultBranch"], "cleanup evidence defaultBranch");
  requireString(
    root["metadataSourceRef"],
    "cleanup evidence metadataSourceRef",
  );
  requireStringArray(root["changedFiles"], "cleanup evidence changedFiles");

  const source = requireRecord(
    root["metadataSource"],
    "cleanup evidence metadataSource",
  );
  requireString(
    source["contentSha256"],
    "cleanup evidence metadataSource.contentSha256",
  );
  requireString(source["kind"], "cleanup evidence metadataSource.kind");
  requireString(source["sourceId"], "cleanup evidence metadataSource.sourceId");
  requireCanonicalInstant(
    source["updatedAt"],
    "cleanup evidence metadataSource.updatedAt",
  );
  if (source["durable"] !== undefined) {
    requireBoolean(
      source["durable"],
      "cleanup evidence metadataSource.durable",
    );
  }

  const reviews = requireRecordArray(
    root["reviews"],
    "cleanup evidence reviews",
  );
  for (const review of reviews) {
    requireString(review["decision"], "cleanup evidence review.decision");
    requireString(review["id"], "cleanup evidence review.id");
    requireBoolean(
      review["isMergeGate"],
      "cleanup evidence review.isMergeGate",
    );
    requireString(
      review["reviewerKind"],
      "cleanup evidence review.reviewerKind",
    );
    requireStringArray(
      review["sourceRefs"],
      "cleanup evidence review.sourceRefs",
    );
    requireCanonicalInstant(
      review["submittedAt"],
      "cleanup evidence review.submittedAt",
    );
  }

  validateStoryBindingEvidenceArray(
    root["stories"],
    "cleanup evidence stories",
  );

  if (root["parentLifecycle"] !== undefined) {
    const parent = requireRecord(
      root["parentLifecycle"],
      "cleanup evidence parentLifecycle",
    );
    requireCanonicalInstant(
      parent["cleanupPlanRecordedAt"],
      "cleanup evidence parentLifecycle.cleanupPlanRecordedAt",
    );
    requireString(
      parent["parentIntegrationReviewRecordId"],
      "cleanup evidence parentLifecycle.parentIntegrationReviewRecordId",
    );
    requireString(
      parent["parentRevisionResponseId"],
      "cleanup evidence parentLifecycle.parentRevisionResponseId",
    );
    validateStoryBindingEvidenceArray(
      parent["includedStories"],
      "cleanup evidence parentLifecycle.includedStories",
    );
  }
}

function validateStoryBindingEvidenceArray(value: unknown, label: string) {
  const stories = requireRecordArray(value, label);
  for (const story of stories) {
    requireString(story["packetPath"], `${label} packetPath`);
    requireString(story["storyId"], `${label} storyId`);
    requireString(story["storyPath"], `${label} storyPath`);
    if (story["substoryAiReviewRecordId"] !== undefined) {
      requireString(
        story["substoryAiReviewRecordId"],
        `${label} substoryAiReviewRecordId`,
      );
    }
    if (story["substoryPrNumber"] !== undefined) {
      requireNumber(story["substoryPrNumber"], `${label} substoryPrNumber`);
    }
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Malformed cleanup evidence: ${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireRecordArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Malformed cleanup evidence: ${label} must be an array.`);
  }
  return value.map((entry, index) =>
    requireRecord(entry, `${label}[${String(index)}]`),
  );
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Malformed cleanup evidence: ${label} must be a string.`);
  }
}

function requireCanonicalInstant(value: unknown, label: string) {
  requireString(value, label);
  parseCanonicalInstantMillis(value, label);
}

function parseCanonicalInstantMillis(value: string, label: string) {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    throw new Error(
      `Malformed cleanup evidence: ${label} must be a canonical UTC timestamp.`,
    );
  }
  return millis;
}

function requireStringArray(value: unknown, label: string) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(
      `Malformed cleanup evidence: ${label} must be a string array.`,
    );
  }
}

function requireBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") {
    throw new Error(`Malformed cleanup evidence: ${label} must be a boolean.`);
  }
}

function requireNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Malformed cleanup evidence: ${label} must be an integer.`);
  }
}

function requireHash(value: unknown, label: string) {
  requireString(value, label);
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(
      `Malformed cleanup evidence: ${label} must be a sha256 hash.`,
    );
  }
}

function rejectUnexpectedKeys(
  record: Record<string, unknown>,
  expectedKeys: string[],
  label: string,
) {
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(record)) {
    if (!expected.has(key)) {
      throw new Error(`Malformed ${label}: unexpected top-level field ${key}.`);
    }
  }
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

async function bindParentStory(options: {
  changedFiles: string[];
  repoRoot: string;
  stories: CleanupStoryValidation[];
}): Promise<CleanupParentStoryValidation> {
  const childStoryIds = options.stories
    .map((story) => story.storyId)
    .sort((left, right) => left.localeCompare(right));
  const childStoryPaths = new Set(
    options.stories.map((story) => story.storyPath),
  );
  const candidates = options.changedFiles
    .filter((changedPath) => changedPath.startsWith(APPROVED_PREFIX))
    .filter((changedPath) => !childStoryPaths.has(changedPath));

  if (candidates.length === 0) {
    throw new Error(
      "Parent-mode cleanup requires exactly one changed approved parent story.",
    );
  }

  const matches: CleanupParentStoryValidation[] = [];
  const mismatches: string[] = [];

  for (const candidate of candidates) {
    validateCanonicalStoryPath(candidate);
    const storyPath = path.join(options.repoRoot, ...candidate.split("/"));
    if (!(await fileExists(storyPath))) {
      continue;
    }
    const storySource = await readFile(storyPath, "utf8");
    const story = parseStoryYaml(storySource);

    if (story.status === "done") {
      throw new Error(`Changed parent story ${story.id} is already done.`);
    }
    if (story.status !== "approved") {
      continue;
    }
    const parentPacketPath = path.join(
      options.repoRoot,
      "agent-packets",
      `${story.id}.md`,
    );
    if (await fileExists(parentPacketPath)) {
      throw new Error(
        `Changed parent story ${story.id} must be non-packetized for parent-mode cleanup.`,
      );
    }

    const parentChildStoryIds = readStoryStringList(
      storySource,
      "child_stories",
    ).sort((left, right) => left.localeCompare(right));

    if (!stringArraysEqual(parentChildStoryIds, childStoryIds)) {
      mismatches.push(candidate);
      continue;
    }

    matches.push({
      storyId: story.id,
      storyPath: candidate,
      storySha256: sha256(storySource),
    });
  }

  if (matches.length > 1) {
    throw new Error("Multiple changed approved parent stories match cleanup.");
  }
  if (matches.length === 0) {
    if (mismatches.length > 0) {
      throw new Error(
        "Changed parent story child_stories must exactly match cleanup child story IDs.",
      );
    }
    throw new Error(
      "Parent-mode cleanup requires exactly one changed approved parent story.",
    );
  }

  const match = matches[0];
  if (!match) {
    throw new Error(
      "Parent-mode cleanup requires exactly one changed approved parent story.",
    );
  }
  return match;
}

function readStoryStringList(source: string, key: string) {
  const lines = source.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => line === `${key}:`);
  if (keyIndex < 0) {
    return [];
  }
  const values: string[] = [];
  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === "") {
      continue;
    }
    const match = line.match(/^ {2}- (.+)$/);
    if (!match) {
      break;
    }
    values.push(match[1]?.trim() ?? "");
  }
  return values;
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
    packetSha256: sha256(packetSource),
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

function stringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}
