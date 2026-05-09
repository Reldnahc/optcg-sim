export type CleanupMode = "single" | "parent";

export type CleanupMetadata = {
  branches: string[];
  mode: CleanupMode;
  stories: string[];
};

export type CleanupStoryValidation = {
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

export type CleanupMetadataSourceKind = "pr-body" | "handoff-comment";

export type CleanupMetadataSourceEvidence = {
  contentSha256: string;
  durable?: boolean;
  kind: CleanupMetadataSourceKind;
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
