import { createRequire } from "node:module";

import type * as PacketLifecycle from "../agent-packet-lifecycle.js";
import type {
  CleanupEvidenceInput,
  CleanupHumanReviewEvidence,
  CleanupMetadata,
  CleanupMetadataSourceEvidence,
  CleanupMode,
  CleanupStoryBindingEvidence,
} from "./types.js";

const METADATA_HEADER = "Post-merge cleanup:";
const { sha256 }: typeof PacketLifecycle = createRequire(import.meta.url)(
  "../agent-packet-lifecycle.ts",
) as typeof PacketLifecycle;

export function parseCleanupMetadataBlock(prBody: string): CleanupMetadata {
  const sections = findMetadataSections(prBody);

  if (sections.length !== 1) {
    throw new Error(
      sections.length === 0
        ? "Missing Post-merge cleanup metadata block."
        : "Ambiguous Post-merge cleanup metadata block; expected exactly one.",
    );
  }

  return parseCleanupMetadataLines(sections[0] ?? []);
}

export function parseCleanupMetadataLines(lines: string[]): CleanupMetadata {
  let mode: CleanupMode | null = null;
  const stories: string[] = [];
  const branches: string[] = [];
  let activeList: "stories" | "branches" | null = null;
  let sawStories = false;
  let sawBranches = false;

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    const modeMatch = line.match(/^ {2}mode:\s*(single|parent)\s*$/);

    if (modeMatch?.[1]) {
      if (mode !== null) {
        throw new Error("Malformed cleanup metadata: duplicate mode.");
      }

      mode = modeMatch[1] as CleanupMode;
      activeList = null;
      continue;
    }

    if (line === "  stories:") {
      if (sawStories) {
        throw new Error(
          "Malformed cleanup metadata: duplicate stories section.",
        );
      }
      sawStories = true;
      activeList = "stories";
      continue;
    }

    if (line === "  branches:") {
      if (sawBranches) {
        throw new Error(
          "Malformed cleanup metadata: duplicate branches section.",
        );
      }
      sawBranches = true;
      activeList = "branches";
      continue;
    }

    const itemMatch = line.match(/^ {4}-\s+(.+)\s*$/);

    if (itemMatch?.[1]) {
      if (activeList === "stories") {
        stories.push(itemMatch[1].trim());
        continue;
      }

      if (activeList === "branches") {
        branches.push(itemMatch[1].trim());
        continue;
      }
    }

    throw new Error(`Malformed cleanup metadata line: ${line}`);
  }

  if (mode === null) {
    throw new Error("Malformed cleanup metadata: missing mode.");
  }

  if (stories.length === 0) {
    throw new Error(
      "Malformed cleanup metadata: at least one story is required.",
    );
  }

  return {
    branches,
    mode,
    stories,
  };
}

function findMetadataSections(prBody: string) {
  const lines = prBody.replace(/\r\n/g, "\n").split("\n");
  const sections: string[][] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== METADATA_HEADER) {
      continue;
    }

    const sectionLines: string[] = [];
    let offset = index + 1;

    while (offset < lines.length) {
      const line = lines[offset] ?? "";

      if (line.startsWith("  ") || line.trim() === "") {
        sectionLines.push(line);
        offset += 1;
        continue;
      }

      break;
    }

    sections.push(sectionLines);
  }

  return sections;
}

export type WorkflowPullRequestInput = {
  baseRef: string;
  body: string;
  createdAt: string;
  headRef: string;
  mergeCommitSha: string;
  merged: boolean;
  mergedAt: string;
  number: number;
  updatedAt: string;
};

export type WorkflowReviewInput = {
  body: string;
  id: number | string;
  state: string;
  submittedAt: string;
  userType: string;
};

export type WorkflowIssueCommentInput = {
  authorAssociation?: string;
  body: string;
  createdAt: string;
  id: number | string;
  updatedAt: string;
  userType: string;
};

export type WorkflowChangedFileInput = {
  filename: string;
};

export type WorkflowCleanupEvidenceInput = {
  changedFiles: WorkflowChangedFileInput[];
  defaultBranch: string;
  eventSenderUserType?: string;
  issueComments: WorkflowIssueCommentInput[];
  pullRequest: WorkflowPullRequestInput;
  reviews: WorkflowReviewInput[];
};

export type WorkflowCleanupMetadataGuardInput = {
  allowedBranches?: string[];
  changedFiles?: WorkflowChangedFileInput[];
  issueComments: WorkflowIssueCommentInput[];
  pullRequest: Pick<WorkflowPullRequestInput, "body" | "number" | "updatedAt"> &
    Partial<Pick<WorkflowPullRequestInput, "headRef">>;
  statusChecks?: WorkflowStatusCheckInput[];
};

export type WorkflowStatusCheckInput = {
  bucket?: string;
  conclusion?: string;
  name: string;
  state?: string;
  status?: string;
};

export type WorkflowCleanupMetadataGuardResult = {
  cleanupMetadataGuardStatus?: WorkflowStatusCheckInput;
  humanReviewReady?: boolean;
  metadata: CleanupMetadata;
  metadataSource: CleanupMetadataSourceEvidence;
  metadataSourceRef: string;
  parentLifecycle?: NonNullable<CleanupEvidenceInput["parentLifecycle"]>;
};

type MetadataSourceCandidate = {
  body: string;
  metadata: CleanupMetadata;
  source: CleanupMetadataSourceEvidence;
  sourceRef: string;
};

export function buildWorkflowCleanupEvidence(
  input: WorkflowCleanupEvidenceInput,
): CleanupEvidenceInput {
  const candidates = buildMetadataSourceCandidates(input, {
    prBodyUpdatedAt: input.pullRequest.mergedAt,
  });
  const reviewEvidence = buildReviewEvidence(input, candidates);

  if (candidates.length === 0) {
    throw new Error("No cleanup metadata sources were found.");
  }
  if (candidates.length > 1) {
    throw new Error("Ambiguous cleanup metadata sources were found.");
  }

  const selected = candidates[0];
  if (!selected) {
    throw new Error("No cleanup metadata sources were found.");
  }
  const requiredReview = findLatestHumanGateReview(
    reviewEvidence,
    input.pullRequest.mergedAt,
  );
  if (!requiredReview) {
    throw new Error("Missing human merge-gate cleanup approval.");
  }
  if (
    Date.parse(selected.source.updatedAt) >
    Date.parse(input.pullRequest.mergedAt)
  ) {
    throw new Error("Cleanup metadata source changed after merge.");
  }
  if (
    requiredReview.decision !== "merged" &&
    Date.parse(selected.source.updatedAt) >
      Date.parse(requiredReview.submittedAt)
  ) {
    throw new Error("Cleanup metadata source changed after fallback review.");
  }

  const stories = buildStoryBindings(selected.metadata.stories);
  const evidence: CleanupEvidenceInput = {
    baseBranch: input.pullRequest.baseRef,
    changedFiles: input.changedFiles.map((file) => file.filename),
    defaultBranch: input.defaultBranch,
    mergeSha: input.pullRequest.mergeCommitSha,
    merged: input.pullRequest.merged,
    mergedAt: normalizeInstant(input.pullRequest.mergedAt),
    metadataSource: selected.source,
    metadataSourceRef: selected.sourceRef,
    prNumber: input.pullRequest.number,
    reviews: reviewEvidence,
    stories,
  };

  if (selected.metadata.mode === "parent") {
    evidence.parentLifecycle = buildParentLifecycle({
      evidenceSources: buildSelectedLifecycleEvidenceSources(selected),
      requiredReviewSubmittedAt: requiredReview.submittedAt,
      storyBindings: stories,
    });
  }

  return evidence;
}

export function validateWorkflowCleanupMetadataGuard(
  input: WorkflowCleanupMetadataGuardInput,
  options: { requireCleanupMetadataGuardStatus?: boolean } = {},
): WorkflowCleanupMetadataGuardResult {
  const candidates = buildMetadataSourceCandidates(input, {
    reportMalformed: true,
  });

  if (candidates.length === 0) {
    throw new Error(
      "Missing Post-merge cleanup metadata source. Add exactly one Post-merge cleanup block to the PR body or a durable handoff comment.",
    );
  }
  if (candidates.length > 1) {
    throw new Error("Ambiguous cleanup metadata sources were found.");
  }

  const selected = candidates[0];
  if (!selected) {
    throw new Error("Missing Post-merge cleanup metadata source.");
  }

  const result: WorkflowCleanupMetadataGuardResult = {
    metadata: selected.metadata,
    metadataSource: selected.source,
    metadataSourceRef: selected.sourceRef,
  };

  if (options.requireCleanupMetadataGuardStatus) {
    requireCleanupMetadataScopeBinding(selected.metadata, input);
    const cleanupMetadataGuardStatus = requirePassingCleanupMetadataGuardStatus(
      input.statusChecks,
    );
    result.cleanupMetadataGuardStatus = cleanupMetadataGuardStatus;
    result.humanReviewReady = true;
  }

  if (selected.metadata.mode === "parent") {
    result.parentLifecycle = buildParentLifecycle({
      evidenceSources: buildSelectedLifecycleEvidenceSources(selected),
      requiredReviewSubmittedAt: null,
      storyBindings: buildStoryBindings(selected.metadata.stories),
    });
  }

  return result;
}

function requireCleanupMetadataScopeBinding(
  metadata: CleanupMetadata,
  input: WorkflowCleanupMetadataGuardInput,
) {
  if (input.changedFiles === undefined) {
    throw new Error(
      "Cleanup handoff requires fetched changed files to bind metadata to reviewed PR scope.",
    );
  }
  if (
    input.pullRequest.headRef === undefined ||
    input.pullRequest.headRef === ""
  ) {
    throw new Error(
      "Cleanup handoff requires fetched PR head branch to bind metadata to reviewed PR scope.",
    );
  }

  const changedFiles = new Set(input.changedFiles.map((file) => file.filename));
  for (const storyPath of metadata.stories) {
    if (!changedFiles.has(storyPath)) {
      throw new Error(
        `Cleanup metadata story ${storyPath} is outside reviewed PR changed files.`,
      );
    }
  }

  const allowedBranches = new Set([
    input.pullRequest.headRef,
    ...(input.allowedBranches ?? []),
  ]);
  for (const branch of metadata.branches) {
    if (!allowedBranches.has(branch)) {
      throw new Error(
        `Cleanup metadata branch ${branch} is outside reviewed PR head branch scope.`,
      );
    }
  }
}

function requirePassingCleanupMetadataGuardStatus(
  statusChecks: WorkflowStatusCheckInput[] | undefined,
): WorkflowStatusCheckInput {
  if (statusChecks === undefined) {
    throw new Error(
      "Cleanup handoff requires fetched cleanup-metadata-guard status checks.",
    );
  }

  const matching = statusChecks.filter(
    (check) => check.name === "cleanup-metadata-guard",
  );
  if (matching.length === 0) {
    throw new Error(
      "Missing cleanup-metadata-guard status check for human-review-ready handoff.",
    );
  }

  const passing = matching.find(isPassingStatusCheck);
  if (passing === undefined) {
    throw new Error(
      "cleanup-metadata-guard status check must be passing before human-review-ready handoff.",
    );
  }

  return passing;
}

function isPassingStatusCheck(check: WorkflowStatusCheckInput): boolean {
  return (
    check.bucket?.toLowerCase() === "pass" ||
    check.state?.toUpperCase() === "SUCCESS" ||
    check.conclusion?.toLowerCase() === "success" ||
    (check.status?.toLowerCase() === "completed" &&
      check.conclusion?.toLowerCase() === "success")
  );
}

function buildMetadataSourceCandidates(
  input: WorkflowCleanupMetadataGuardInput,
  options: { prBodyUpdatedAt?: string; reportMalformed?: boolean } = {},
) {
  const candidates: MetadataSourceCandidate[] = [];
  addCandidate(candidates, {
    body: input.pullRequest.body,
    durable: undefined,
    kind: "pr-body",
    reportMalformed: options.reportMalformed ?? false,
    sourceId: `pr-${String(input.pullRequest.number)}-body`,
    updatedAt: options.prBodyUpdatedAt ?? input.pullRequest.updatedAt,
  });

  for (const comment of input.issueComments) {
    if (!isExactMetadataSource(comment.body)) {
      continue;
    }
    if (!isTrustedHandoffCommentAuthor(comment)) {
      continue;
    }
    addCandidate(candidates, {
      body: comment.body,
      durable: true,
      kind: "handoff-comment",
      reportMalformed: options.reportMalformed ?? false,
      sourceId: String(comment.id),
      updatedAt: comment.updatedAt,
    });
  }

  return candidates;
}

function addCandidate(
  candidates: MetadataSourceCandidate[],
  options: {
    body: string;
    durable: boolean | undefined;
    kind: "pr-body" | "handoff-comment";
    reportMalformed: boolean;
    sourceId: string;
    updatedAt: string;
  },
) {
  if (options.body.trim() === "") {
    return;
  }
  let metadata: CleanupMetadata;
  try {
    metadata = parseCleanupMetadataBlock(options.body);
  } catch (error) {
    if (options.reportMalformed && hasMetadataHeader(options.body)) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Malformed cleanup metadata source ${options.kind}:${options.sourceId}: ${message}`,
      );
    }
    return;
  }
  const contentSha256 = sha256(options.body);
  const source: CleanupMetadataSourceEvidence = {
    contentSha256,
    kind: options.kind,
    sourceId: options.sourceId,
    updatedAt: normalizeInstant(options.updatedAt),
  };
  if (options.durable !== undefined) {
    source.durable = options.durable;
  }
  candidates.push({
    body: options.body,
    metadata,
    source,
    sourceRef: `${options.kind}:${options.sourceId}:${contentSha256}`,
  });
}

function buildReviewEvidence(
  input: WorkflowCleanupEvidenceInput,
  candidates: MetadataSourceCandidate[],
) {
  const reviewEvidence: CleanupHumanReviewEvidence[] = [
    {
      decision: "merged",
      id: `merge-actor-${String(input.pullRequest.number)}`,
      isMergeGate: input.pullRequest.merged,
      reviewerKind: input.eventSenderUserType === "Bot" ? "bot" : "human",
      sourceRefs: [],
      submittedAt: normalizeInstant(input.pullRequest.mergedAt),
    },
    ...input.reviews.map(
      (review): CleanupHumanReviewEvidence => ({
        decision:
          review.state === "APPROVED" ? "approved" : review.state.toLowerCase(),
        id: String(review.id),
        isMergeGate: review.state === "APPROVED",
        reviewerKind: review.userType === "Bot" ? "bot" : "human",
        sourceRefs: sourceRefsInBody(review.body, candidates),
        submittedAt: normalizeInstant(review.submittedAt),
      }),
    ),
  ];

  for (const comment of input.issueComments) {
    if (!comment.body.includes("## Equivalent Human Review Fallback")) {
      continue;
    }
    if (!hasStrictFallbackCleanupApproval(comment.body)) {
      continue;
    }
    reviewEvidence.push({
      decision: "fallback-approved",
      id: `fallback-comment-${String(comment.id)}`,
      isMergeGate: true,
      reviewerKind: "human",
      sourceRefs: sourceRefsInBody(comment.body, candidates),
      submittedAt: normalizeInstant(comment.updatedAt),
    });
  }

  return reviewEvidence;
}

function sourceRefsInBody(body: string, candidates: MetadataSourceCandidate[]) {
  return candidates
    .filter((candidate) => body.includes(candidate.sourceRef))
    .map((candidate) => candidate.sourceRef);
}

function findLatestHumanGateReview(
  reviews: CleanupHumanReviewEvidence[],
  mergedAt: string,
) {
  const mergedAtMs = Date.parse(mergedAt);
  return reviews
    .filter(
      (review) =>
        review.reviewerKind === "human" &&
        review.isMergeGate &&
        (review.decision === "fallback-approved" ||
          review.decision === "merged") &&
        Date.parse(review.submittedAt) <= mergedAtMs,
    )
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))
    .at(-1);
}

function buildStoryBindings(storyPaths: string[]) {
  return storyPaths.map((storyPath) => {
    const storyId = storyIdFromPath(storyPath);
    return {
      packetPath: `agent-packets/${storyId}.md`,
      storyId,
      storyPath,
    };
  });
}

function buildSelectedLifecycleEvidenceSources(
  selected: MetadataSourceCandidate,
) {
  return [
    {
      body: selected.body,
      updatedAt: selected.source.updatedAt,
    },
  ];
}

function hasStrictFallbackCleanupApproval(body: string) {
  return (
    /^- Fallback human reviewer:\s*\S.+$/m.test(body) &&
    /^- Cleanup metadata source reviewed before fallback approval:\s*\S.+$/m.test(
      body,
    )
  );
}

function buildParentLifecycle(options: {
  evidenceSources: Array<{ body: string; updatedAt: string }>;
  requiredReviewSubmittedAt: string | null;
  storyBindings: CleanupStoryBindingEvidence[];
}) {
  const parentIntegrationReview = findParentLifecycleScalar(
    options.evidenceSources,
    /^Parent integration AI review record:\s*(\S+)\s*$/m,
  );
  if (!parentIntegrationReview) {
    throw new Error("Missing parent integration AI review record.");
  }
  const parentRevisionResponse = findParentLifecycleScalar(
    options.evidenceSources,
    /^Parent revision response:\s*(\S+)\s*$/m,
  );
  if (!parentRevisionResponse) {
    throw new Error("Missing parent revision response.");
  }
  const substoryReviewByPath = parseSubstoryReviewRecords(
    options.evidenceSources,
  );
  const lifecycleUpdatedAtValues = [
    parentIntegrationReview.updatedAt,
    parentRevisionResponse.updatedAt,
  ];
  const includedStories = options.storyBindings.map((story) => {
    const review = substoryReviewByPath.get(story.storyPath);
    if (!review) {
      throw new Error(
        `Missing durable substory commit review evidence for ${story.storyPath}.`,
      );
    }
    lifecycleUpdatedAtValues.push(review.updatedAt);
    return {
      ...story,
      substoryAiReviewRecordId: review.recordId,
      substoryCommitSha: review.commitSha,
      substoryRevisionResponseId: review.revisionResponseId,
      substoryVerificationEvidence: review.verificationEvidence,
    };
  });
  const cleanupPlanRecordedAt = latestInstant(lifecycleUpdatedAtValues);
  if (
    options.requiredReviewSubmittedAt !== null &&
    Date.parse(cleanupPlanRecordedAt) >
      Date.parse(options.requiredReviewSubmittedAt)
  ) {
    throw new Error(
      "Parent lifecycle evidence changed after required review point.",
    );
  }

  return {
    cleanupPlanRecordedAt,
    includedStories,
    parentIntegrationReviewRecordId: parentIntegrationReview.value,
    parentRevisionResponseId: parentRevisionResponse.value,
  };
}

function parseSubstoryReviewRecords(
  evidenceSources: Array<{ body: string; updatedAt: string }>,
) {
  const records = new Map<
    string,
    {
      commitSha: string;
      recordId: string;
      revisionResponseId: string;
      updatedAt: string;
      verificationEvidence: string;
    }
  >();
  const pattern =
    /^Substory commit evidence:\s*\n {2}story:\s*(stories\/approved\/[^\s]+\.yaml)\s*\n {2}commit:\s*([0-9a-f]{40})\s*\n {2}ai_review_record:\s*(\S+)\s*\n {2}revision_response:\s*(\S+)\s*\n {2}verification:\s*(\S+)\s*$/gim;
  for (const source of evidenceSources) {
    for (const match of source.body.matchAll(pattern)) {
      const storyPath = match[1];
      const commitSha = match[2]?.toLowerCase();
      const recordId = match[3];
      const revisionResponseId = match[4];
      const verificationEvidence = match[5];
      if (
        !storyPath ||
        !commitSha ||
        !recordId ||
        !revisionResponseId ||
        !verificationEvidence
      ) {
        continue;
      }
      const updatedAt = normalizeInstant(source.updatedAt);
      const previous = records.get(storyPath);
      if (previous) {
        throw new Error(
          `Duplicate durable substory commit evidence for ${storyPath}.`,
        );
      }
      records.set(storyPath, {
        commitSha,
        recordId,
        revisionResponseId,
        updatedAt,
        verificationEvidence,
      });
    }
  }
  return records;
}

function findParentLifecycleScalar(
  evidenceSources: Array<{ body: string; updatedAt: string }>,
  pattern: RegExp,
) {
  let latest: { updatedAt: string; value: string } | null = null;
  for (const source of evidenceSources) {
    const match = source.body.match(pattern);
    const value = match?.[1];
    if (!value) {
      continue;
    }
    const updatedAt = normalizeInstant(source.updatedAt);
    if (latest && Date.parse(latest.updatedAt) >= Date.parse(updatedAt)) {
      continue;
    }
    latest = { updatedAt, value };
  }
  return latest;
}

function latestInstant(values: string[]) {
  return new Date(
    Math.max(...values.map((value) => Date.parse(value))),
  ).toISOString();
}

function storyIdFromPath(storyPath: string) {
  const match = storyPath.match(
    /^stories\/approved\/([A-Z][A-Z0-9]*-\d{3}[A-Z]?)-[^/]+\.yaml$/,
  );
  const storyId = match?.[1];
  if (!storyId) {
    throw new Error(`Cannot derive story id from cleanup path: ${storyPath}.`);
  }
  return storyId;
}

function isExactMetadataSource(source: string) {
  return source.trimStart().startsWith(METADATA_HEADER);
}

function isTrustedHandoffCommentAuthor(comment: WorkflowIssueCommentInput) {
  return (
    comment.authorAssociation === undefined ||
    ["COLLABORATOR", "CONTRIBUTOR", "MEMBER", "OWNER"].includes(
      comment.authorAssociation,
    )
  );
}

function hasMetadataHeader(source: string) {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .some((line) => line.trim() === METADATA_HEADER);
}

function normalizeInstant(value: string) {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new Error(`Invalid GitHub timestamp: ${value}.`);
  }
  return new Date(millis).toISOString();
}
