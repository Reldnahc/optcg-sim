import assert from "node:assert/strict";
import { test } from "vitest";

import {
  evaluateBranchCleanup,
  renderBranchCleanupLog,
} from "../../tools/post-merge-cleanup/branch-cleanup.ts";

test("branch cleanup skips all requests when packet cleanup failed", () => {
  const decisions = evaluateBranchCleanup({
    branchStates: [branchState("story/inf-027f-safe-merged-branch-cleanup")],
    defaultBranch: "main",
    mergedPrHeadBranch: "story/inf-027f-safe-merged-branch-cleanup",
    packetCleanupSucceeded: false,
    requestedBranches: ["story/inf-027f-safe-merged-branch-cleanup"],
  });

  assert.deepEqual(decisions, [
    {
      branch: "story/inf-027f-safe-merged-branch-cleanup",
      reason: "packet cleanup did not succeed",
      status: "skipped",
    },
  ]);
});

test("branch cleanup rejects protected, reserved, unrelated, malformed, and unmerged branches", () => {
  const decisions = evaluateBranchCleanup({
    branchStates: [
      branchState("story/valid", { aheadByDefault: 2 }),
      branchState("story/protected", { protected: true }),
      branchState("story/unrelated"),
    ],
    defaultBranch: "main",
    mergedPrHeadBranch: "story/valid",
    packetCleanupSucceeded: true,
    requestedBranches: [
      "main",
      "master",
      "release/2026.05",
      "feature with spaces",
      "story/protected",
      "story/unrelated",
      "story/missing",
      "story/valid",
    ],
  });

  assert.deepEqual(decisions, [
    {
      branch: "main",
      reason: "reserved branch name",
      status: "rejected",
    },
    {
      branch: "master",
      reason: "reserved branch name",
      status: "rejected",
    },
    {
      branch: "release/2026.05",
      reason: "release branches are protected from cleanup",
      status: "rejected",
    },
    {
      branch: "feature with spaces",
      reason: "malformed branch name",
      status: "rejected",
    },
    {
      branch: "story/protected",
      reason: "branch is protected",
      status: "rejected",
    },
    {
      branch: "story/unrelated",
      reason:
        "branch is not associated with the merged PR or listed parent cleanup",
      status: "rejected",
    },
    {
      branch: "story/missing",
      reason: "branch does not exist",
      status: "rejected",
    },
    {
      branch: "story/valid",
      reason: "branch is not fully merged into main",
      status: "rejected",
    },
  ]);
});

test("branch cleanup allows merged PR head, parent integration, and listed merged substories", () => {
  const decisions = evaluateBranchCleanup({
    branchStates: [
      branchState("story/inf-027-parent"),
      branchState("story/inf-027a-substory", { associatedWithCleanup: true }),
      branchState("story/inf-027b-substory", { associatedWithCleanup: true }),
    ],
    defaultBranch: "main",
    mergedPrHeadBranch: "story/inf-027-parent",
    packetCleanupSucceeded: true,
    requestedBranches: [
      "story/inf-027-parent",
      "story/inf-027a-substory",
      "story/inf-027b-substory",
    ],
  });

  assert.deepEqual(decisions, [
    {
      branch: "story/inf-027-parent",
      reason: "branch is listed, unprotected, associated, and fully merged",
      status: "allowed",
    },
    {
      branch: "story/inf-027a-substory",
      reason: "branch is listed, unprotected, associated, and fully merged",
      status: "allowed",
    },
    {
      branch: "story/inf-027b-substory",
      reason: "branch is listed, unprotected, associated, and fully merged",
      status: "allowed",
    },
  ]);
});

test("branch cleanup records deletion failures without changing packet cleanup state", () => {
  const decisions = evaluateBranchCleanup({
    branchStates: [
      branchState("story/ok"),
      branchState("story/fails", {
        associatedWithCleanup: true,
        deletionError: "permission denied",
      }),
    ],
    defaultBranch: "main",
    mergedPrHeadBranch: "story/ok",
    packetCleanupSucceeded: true,
    requestedBranches: ["story/ok", "story/fails"],
  });

  assert.deepEqual(decisions, [
    {
      branch: "story/ok",
      reason: "branch is listed, unprotected, associated, and fully merged",
      status: "allowed",
    },
    {
      branch: "story/fails",
      reason: "deletion failed: permission denied",
      status: "failed",
    },
  ]);
});

test("branch cleanup dry-run log explains all decision classes", () => {
  const log = renderBranchCleanupLog([
    { branch: "story/ok", reason: "safe", status: "allowed" },
    {
      branch: "story/skip",
      reason: "packet cleanup did not succeed",
      status: "skipped",
    },
    { branch: "main", reason: "reserved branch name", status: "rejected" },
    {
      branch: "story/fail",
      reason: "deletion failed: permission denied",
      status: "failed",
    },
  ]);

  assert.match(log, /\[allowed\] story\/ok - safe/);
  assert.match(log, /\[skipped\] story\/skip - packet cleanup did not succeed/);
  assert.match(log, /\[rejected\] main - reserved branch name/);
  assert.match(
    log,
    /\[failed\] story\/fail - deletion failed: permission denied/,
  );
});

function branchState(branch, overrides = {}) {
  return {
    aheadByDefault: 0,
    name: branch,
    protected: false,
    ...overrides,
  };
}
