# Branch Protection Baseline

Apply these settings to `main` and `master` once the repository is connected in GitHub.

## Pull Request Reviews

- Require a pull request before merging.
- Require review from Code Owners.
- Require at least one approval.
- Dismiss stale pull request approvals when new commits are pushed.
- Require conversation resolution before merge.

## Required Status Checks

Require the following checks before merge:

- `quality`
- `test`
- `contracts`
- `coverage`

These names must stay aligned with `.github/workflows/ci.yml`.

## Push Restrictions

- Do not allow direct pushes to protected branches.
- Allow force pushes only if there is an explicit emergency process outside normal development.

## Review Record

- Pull requests should link the approved story file.
- Pull requests should include `pnpm verify` evidence.
- Parent agents should remain mostly orchestration and small local glue while worker subagents handle the main implementation body when delegation is available.
- Pull requests should complete AI review before human review is requested when reviewer subagent review is available.
- Pull requests should complete a separate reviewer subagent run before human review is requested when a reviewer-subagent surface is available.
- The default review path is a spawned reviewer subagent against the PR base branch.
- The review workflow should allow up to 60 minutes for the reviewer subagent run while it is actively running. Deterministic failures such as unavailable reviewer subagent execution, immediate spawn failure, or immediate runtime failure count as failed immediately.
- Implementation-worker self-review and parent-coordinator self-review do not satisfy the reviewer gate.
- Reviewer subagent output must come from a different agent than the implementing worker.
- When no usable reviewer-subagent run remains for the patch after the available reviewer-subagent surfaces were found unavailable, timed out, or failed, pull requests should record an equivalent human review step instead of silently skipping the review gate.
- When a reviewer subagent surface already posts a durable pull-request artifact, that native review output should serve as the AI review record without requiring a duplicate transcription comment.
- When the separate reviewer-subagent output does not already live on the pull request, pull requests should post an AI review comment with findings and verdict copied from the separate reviewer-subagent output.
- When reviewer subagent review is used, pull requests should post a revision response comment that records follow-up commits and unresolved dispositions.
- When reviewer subagent review is used, pull requests should record the actual worker and reviewer identities or references in the AI review record before human approval.
- When the equivalent human-review fallback is used, pull requests should record the fallback metadata in the fallback review comment before human approval by using `.github/review-comments/equivalent-human-review-fallback.md`.
- Pull requests should record the human merge-gate review as either an approval link or an equivalent human review step reference before merge.

GitHub branch protection does not enforce PR comment content directly. Until additional automation exists, reviewers and owners must reject review handoff when the required review artifacts are missing: an AI review record plus revision response comment for reviewer-subagent-reviewed PRs, or the fallback review comment for PRs using the equivalent human-review fallback because reviewer-subagent review was unavailable, timed out, or failed.
