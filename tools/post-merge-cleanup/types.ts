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
  branches: string[];
  localOnly: true;
  mode: CleanupMode;
  notAuthorizingUntil: "INF-027C-reviewed-pr-evidence-and-merge-state-binding";
  statement: string;
  stories: CleanupStoryValidation[];
};
