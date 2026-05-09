import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type * as PacketParser from "../agent-packet-parser.js";
import type * as PacketLifecycle from "../agent-packet-lifecycle.js";
import type {
  CleanupDryRunPlan,
  CleanupEvidenceInput,
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

  return {
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

function validateEvidenceBinding(options: {
  evidence: CleanupEvidenceInput;
  metadata: CleanupMetadata;
  metadataSourceRef: string;
  stories: CleanupStoryValidation[];
  trustedMainSha: string;
}) {
  const { evidence, metadata, metadataSourceRef, stories, trustedMainSha } =
    options;
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

  const humanGateReviews = evidence.reviews
    .filter(
      (review) =>
        review.reviewerKind === "human" &&
        review.isMergeGate &&
        (review.decision === "approved" ||
          review.decision === "fallback-approved"),
    )
    .filter((review) => review.submittedAt <= evidence.mergedAt)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const requiredReview = humanGateReviews.at(-1);
  if (!requiredReview) {
    throw new Error("Missing required human merge-gate review before merge.");
  }

  const sourceRef = evidence.metadataSourceRef;
  const requiredReferencesSource =
    requiredReview.sourceRefs.includes(sourceRef);
  if (!requiredReferencesSource) {
    throw new Error(
      "Required human merge-gate review must reference the exact metadata source.",
    );
  }

  if (evidence.metadataSource.updatedAt > requiredReview.submittedAt) {
    const laterReview = humanGateReviews.find(
      (review) =>
        review.submittedAt >= evidence.metadataSource.updatedAt &&
        review.sourceRefs.includes(sourceRef),
    );
    if (!laterReview) {
      throw new Error(
        "Metadata source changed after required review point without later human merge-gate review of the exact updated source.",
      );
    }
  }

  validateStoryAssociation({ evidence, metadata, stories });
  if (metadata.mode === "parent") {
    validateParentEvidence({ evidence, requiredReview, stories });
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
  requiredReview: CleanupEvidenceInput["reviews"][number];
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
  if (parent.cleanupPlanRecordedAt > options.requiredReview.submittedAt) {
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
