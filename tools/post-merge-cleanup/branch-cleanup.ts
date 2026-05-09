export type BranchCleanupStatus = "allowed" | "failed" | "rejected" | "skipped";

export type BranchCleanupDecision = {
  branch: string;
  reason: string;
  status: BranchCleanupStatus;
};

export type BranchCleanupState = {
  aheadByDefault: number;
  associatedWithCleanup?: boolean;
  deletionError?: string;
  name: string;
  protected: boolean;
};

export function evaluateBranchCleanup(options: {
  branchStates: BranchCleanupState[];
  defaultBranch: string;
  mergedPrHeadBranch: string;
  packetCleanupSucceeded: boolean;
  requestedBranches: string[];
}): BranchCleanupDecision[] {
  const stateByName = new Map(
    options.branchStates.map((state) => [state.name, state]),
  );

  return options.requestedBranches.map((branch) => {
    if (!options.packetCleanupSucceeded) {
      return decision(branch, "skipped", "packet cleanup did not succeed");
    }
    if (!isSafeBranchName(branch)) {
      return decision(branch, "rejected", "malformed branch name");
    }
    if (isReservedBranch(branch, options.defaultBranch)) {
      return decision(branch, "rejected", "reserved branch name");
    }
    if (isReleaseBranch(branch)) {
      return decision(
        branch,
        "rejected",
        "release branches are protected from cleanup",
      );
    }

    const state = stateByName.get(branch);
    if (!state) {
      return decision(branch, "rejected", "branch does not exist");
    }
    if (state.protected) {
      return decision(branch, "rejected", "branch is protected");
    }
    if (
      branch !== options.mergedPrHeadBranch &&
      state.associatedWithCleanup !== true
    ) {
      return decision(
        branch,
        "rejected",
        "branch is not associated with the merged PR or listed parent cleanup",
      );
    }
    if (state.aheadByDefault !== 0) {
      return decision(
        branch,
        "rejected",
        `branch is not fully merged into ${options.defaultBranch}`,
      );
    }
    if (state.deletionError) {
      return decision(
        branch,
        "failed",
        `deletion failed: ${state.deletionError}`,
      );
    }
    return decision(
      branch,
      "allowed",
      "branch is listed, unprotected, associated, and fully merged",
    );
  });
}

export function renderBranchCleanupLog(decisions: BranchCleanupDecision[]) {
  return decisions
    .map(
      (decision) =>
        `[${decision.status}] ${decision.branch} - ${decision.reason}`,
    )
    .join("\n");
}

function decision(
  branch: string,
  status: BranchCleanupStatus,
  reason: string,
): BranchCleanupDecision {
  return {
    branch,
    reason,
    status,
  };
}

function isReservedBranch(branch: string, defaultBranch: string) {
  return branch === defaultBranch || branch === "main" || branch === "master";
}

function isReleaseBranch(branch: string) {
  return branch === "release" || branch.startsWith("release/");
}

function isSafeBranchName(branch: string) {
  return (
    /^[A-Za-z0-9._/-]+$/.test(branch) &&
    !branch.startsWith("/") &&
    !branch.endsWith("/") &&
    !branch.includes("..") &&
    !branch.includes("//")
  );
}
