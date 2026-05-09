export type CleanupMode = "single" | "parent";

export type CleanupMetadata = {
  branches: string[];
  mode: CleanupMode;
  stories: string[];
};

export type CleanupStoryValidation = {
  packetSha256: string;
  packetPath: string;
  storyId: string;
  storyPath: string;
  storySha256: string;
};

export type CleanupDryRunPlan = {
  boundStories: CleanupStoryValidation[];
  branches: string[];
  mergeSha: string;
  mergedPrNumber: number;
  mode: CleanupMode;
  statement: string;
  verificationInputs: {
    metadataSource: string;
    requiredReviewId: string;
    requiredReviewSubmittedAt: string;
    trustedBaseBranch: string;
    trustedMainSha: string;
  };
};

export type BoundCleanupPlan = {
  schemaVersion: "post-merge-cleanup-plan.v1";
  status: "valid";
  generatedAt: string;
  mergedPullRequest: {
    baseBranch: string;
    mergeSha: string;
    number: number;
  };
  metadataSource: string;
  reviewEvidenceSource: {
    requiredReviewId: string;
    requiredReviewSubmittedAt: string;
  };
  stories: CleanupStoryValidation[];
  branches: string[];
  packetCommand: {
    args: string[];
    command: "packets:complete" | "packets:complete-many";
  };
  verificationCommand: "corepack pnpm verify";
  inputsHash: string;
};

export type CleanupMetadataSourceEvidence = {
  contentSha256: string;
  durable?: boolean;
  kind: string;
  sourceId: string;
  updatedAt: string;
};

export type CleanupHumanReviewEvidence = {
  decision: string;
  id: string;
  isMergeGate: boolean;
  reviewerKind: "human" | "bot";
  sourceRefs: string[];
  submittedAt: string;
};

export type CleanupStoryBindingEvidence = {
  packetPath: string;
  storyId: string;
  storyPath: string;
  substoryAiReviewRecordId?: string;
  substoryPrNumber?: number;
};

export type CleanupParentLifecycleEvidence = {
  cleanupPlanRecordedAt: string;
  includedStories: CleanupStoryBindingEvidence[];
  parentIntegrationReviewRecordId: string;
  parentRevisionResponseId: string;
};

export type CleanupEvidenceInput = {
  baseBranch: string;
  changedFiles: string[];
  defaultBranch: string;
  mergeSha: string;
  merged: boolean;
  mergedAt: string;
  metadataSource: CleanupMetadataSourceEvidence;
  metadataSourceRef: string;
  prNumber: number;
  reviews: CleanupHumanReviewEvidence[];
  stories: CleanupStoryBindingEvidence[];
  parentLifecycle?: CleanupParentLifecycleEvidence;
};
