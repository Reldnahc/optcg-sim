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
- `hidden-info`
- `contracts`
- `coverage`

These names must stay aligned with `.github/workflows/ci.yml`.

Also require this trusted cleanup metadata guard before merge:

- `cleanup-metadata-guard`

This name must stay aligned with `.github/workflows/cleanup-metadata-guard.yml`.
If remote GitHub rulesets or branch-protection settings cannot be changed from
this repository, add `cleanup-metadata-guard` as a required status check in
GitHub before relying on post-merge packet cleanup automation.

## Push Restrictions

- Do not allow direct pushes to protected branches.
- Allow force pushes only if there is an explicit emergency process outside normal development.
- Ordinary protected-branch changes still require pull requests, Code Owner review, at least one approval, conversation resolution, and required status checks.
- The only post-merge lifecycle bypass is the dedicated GitHub App actor `optcg-packet-cleanup[bot]` running workflow `.github/workflows/post-merge-packet-cleanup.yml` with token `POST_MERGE_PACKET_CLEANUP_TOKEN`, only to push exact packet-completion command output to `main` after a reviewed pull request has merged.
- Cleanup metadata is a reviewed cleanup request, not standalone authority. The cleanup workflow must bind cleanup metadata to reviewed pull-request evidence, merge state, trusted checked-in approved story files, current packet evidence, and parent/substory inclusion evidence.
- The cleanup workflow must fail closed when metadata is absent, malformed, stale, unbound, or ineligible.
- Exact packet-completion cleanup may use cleanup-scoped lifecycle verification before direct push because the reviewed PR already passed human review and required checks.
- Cleanup-scoped lifecycle verification must prove metadata binding, packet-completion output, story lifecycle state, active packet state, and committed story metadata remain valid.
- Normal main-branch CI remains the broad post-cleanup safety net after the cleanup commit is pushed.
- The cleanup workflow must not open cleanup pull requests. Manual fallback is only for operational failure.
- The cleanup workflow may delete branches only after packet lifecycle cleanup succeeds, and only for associated merged, unprotected story or substory branches.
- Do not expose the cleanup token to ordinary development pushes, broad admin roles, human-user development paths, or other workflows.
- If remote GitHub rulesets or branch-protection settings cannot be changed from this repository, apply this exact bypass actor setting in GitHub before enabling the privileged cleanup push.

## Review Record

- Pull requests should link the approved story file.
- Pull requests should include `pnpm verify` evidence.
- Parent agents should remain mostly orchestration and small local glue while worker subagents handle the main implementation body when delegation is available.
- Pull requests should complete AI review before human review is requested when reviewer subagent review is available.
- Pull requests should complete a separate reviewer subagent run before human review is requested when a reviewer-subagent surface is available.
- Parent orchestration runs on gpt-5.5.
- Implementation worker subagents default to gpt-5.3-codex medium.
- Reviewer subagents always use gpt-5.4 high.
- Complex, risky, or integration-heavy implementation stories should escalate to gpt-5.5 medium.
- Parent agents own documentation-only authority edits directly.
- Documentation-only authority edits still require separate reviewer subagent review.
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
- Pure post-merge packet-completion cleanup commits that contain only the exact file changes produced by `pnpm run packets:complete --story <stories/approved/...yaml>` or `pnpm run packets:complete-many` with one or more child `--story <stories/approved/...yaml>` arguments are not pull-request handoffs and do not require reviewer-subagent artifacts. For validated parent-mode cleanup, exact packet-completion command output may also include command-owned bound parent story closeout from the cleanup plan. Exact post-merge packet-completion cleanup may use cleanup-scoped lifecycle verification before direct push because the reviewed PR already passed human review and required checks.
- If a cleanup commit includes any manual edit beyond packet-completion command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, use the normal pull-request and reviewer-subagent path.

GitHub branch protection does not enforce PR comment content directly. Until additional automation exists, reviewers and owners must reject review handoff when the required review artifacts are missing: an AI review record plus revision response comment for reviewer-subagent-reviewed PRs, or the fallback review comment for PRs using the equivalent human-review fallback because reviewer-subagent review was unavailable, timed out, or failed.
