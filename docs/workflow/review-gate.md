# Review Gate Procedure

This document is mandatory workflow guidance linked from `AGENTS.md`. It contains the detailed PR review, AI review, fallback review, revision response, and human review rules.

## Review Workflow

Code review is required. Use this flow unless a higher-authority story or packet says otherwise:

1. keep the patch inside one approved story
2. run `pnpm verify` and the story's required tests
3. Open the pull request before the first reviewer-subagent run; do not wait until all AI review is complete to create the PR
4. prefer the native GitHub connector for PR creation, PR reads, comments, review threads, and merge operations; use `gh` CLI only as a fallback when the native connector is unavailable or fails, and record the fallback reason in the PR trail
5. before assigning a reviewer subagent, fetch the current PR description, changed files, issue comments, review comments, review threads, and check status, then include the relevant unresolved PR context in the reviewer handoff
6. run a separate reviewer subagent for scope creep, missing tests, contract drift, and correctness risk when subagent review is available for the patch
7. give the reviewer-subagent run up to 60 minutes while it is actively running; deterministic failures such as unavailable subagent surface, immediate spawn failure, or immediate runtime failure count as failed immediately and do not require waiting out the timeout budget
8. self-review by the implementation worker or the parent implementation coordinator does not satisfy the reviewer gate
9. post each reviewer-subagent result to the pull request as soon as that review run completes; do not batch AI review findings only at final handoff
10. if reviewer-subagent output does not already live on the pull request, copy the findings and verdict from that separate reviewer subagent output into an AI review comment immediately after the run
11. if the reviewer subagent surface already posted a durable pull-request artifact, treat that native PR artifact as the AI review record and do not require a duplicate transcription comment
12. before assigning any revision worker or re-reviewer, fetch the current PR comments, review comments, review threads, and checks, then include unresolved findings and prior dispositions in the handoff
13. if no usable reviewer subagent run remains for the patch after the available reviewer-subagent surfaces were found unavailable, timed out, or failed, record an equivalent human-review fallback explicitly rather than silently skipping the review gate
14. fix the material findings or post a revision response comment that records the disposition of each unresolved item
15. run the cleanup metadata handoff preflight against the actual current PR body or selected durable handoff comment, fetched changed files, and fetched PR head branch, not a copied example or reconstructed local text; use `node --experimental-strip-types tools/post-merge-cleanup.ts -- --validate-cleanup-handoff-json-file <handoff.json> --require-cleanup-guard-status` when fetched PR metadata and check status are available
16. request human review only after the AI review record or explicit equivalent-human-review fallback record exists, after the revision response comment is up to date when a separate reviewer subagent run was used, after reviewers confirm any post-merge cleanup metadata matches the reviewed story scope, and after `cleanup-metadata-guard` is present and passing before human review is requested
17. require human review before protected or default-branch PRs merge; gameplay, policy-sensitive, and architecture-sensitive changes are higher-risk review focus, not the only cases needing human review; for approved parent integration workflows, human review is deferred to the final parent PR to `main` while substory commit evidence is recorded on that parent PR or durable handoff comment
18. if review finds multi-concern drift, split the story or narrow the patch before merge
19. for parent/substory workflows, confirm the story-set review-status matrix is reconstructed from durable artifacts before PR opening or PR handoff; fail closed when the parent-story review is unknown or pending, or when any child-story review is missing, unknown, or pending

Role handoff requirements:

- code-review handoff must include code-review role packet extraction output and the current PR context.
- Session Orchestrator PR handoff must include the current PR body or durable handoff comment, changed files, head branch, review records, revision response state, check status, cleanup-metadata-guard status, and human-review readiness context.
- manual packet trimming is not the normal path.
- if role packet extraction fails, record the extraction failure and the manual fallback in the PR trail before human review request.

The separate reviewer subagent run is a repo-level first-pass gate before human review. It does not replace the merge-gate requirement for a durable review record or equivalent human review step.

Passing AI review does not replace human review. Human review is required before protected or default-branch PRs merge.

For CARD implementation story review, story reviewers must inspect the
substance of `card_source_integrity` and `engine_capability_preflight`, not only
their presence. Flag a CARD implementation story before approval when:

- source integrity does not identify target card IDs and fixture provenance,
- source integrity omits behavior-sensitive printed fields that affect gameplay
  or deck validation,
- source integrity relies on fake helper payloads as real-card support evidence,
- engine capability preflight does not list the parsed effect shape,
- engine capability preflight does not split required runtime capabilities into
  supported and missing groups,
- missing reusable engine behavior is not represented as prerequisite ENG
  stories or an explicit blocker.

Cleanup metadata is a reviewed request, not standalone authority. PR authors must leave exactly one `Post-merge cleanup:` metadata source in the PR body or a durable handoff comment before PR handoff, reviewer handoff, or human review request. The exact source shape uses `Post-merge cleanup:` followed by indented `mode`, `stories`, and optional `branches`; do not wrap it in a markdown fence and do not add a `cleanup:` wrapper. Handoff validation must use the actual current PR body or selected durable handoff comment, fetched changed files, and fetched PR head branch, not a copied example or reconstructed local text. The remote `cleanup-metadata-guard` check must be present and passing before human review is requested. Reviewers confirm the metadata matches the reviewed story scope before merge; automation must bind cleanup metadata to reviewed PR evidence and trusted checked-in story and packet state before any direct cleanup commit. The human-controlled merge to `main` authorizes the cleanup metadata snapshot at merge time, and the computed metadata source ref is audit evidence rather than a manual approval field. If merge actor evidence is unavailable and an equivalent human-review fallback is used, the fallback record must confirm the cleanup metadata source was reviewed before fallback approval.

For parent-story integration branch work, passing AI review permits the parent agent to record a reviewed substory commit on the parent integration branch only after CI, packet verification, AI review record, revision response, and verification evidence are complete for that exact commit. It does not permit merging the parent integration branch to `main` without human review.

## Required Review Records

When a separate reviewer subagent run is used, the PR review record must contain:

- an AI review record: either a native PR artifact from the reviewer subagent surface, or an AI review comment with findings and verdict when the separate review output does not already live on the pull request
- a revision response comment that tracks the follow-up commits and dispositions

The PR review record is also the durable coordination surface for agents. Parent agents must keep it current during the work, not reconstruct it only at final handoff. Worker and reviewer subagents are not assumed to see PR comments automatically; the parent agent must fetch and pass the relevant unresolved PR context into their prompts.

When the equivalent human-review fallback is used, the PR review record must contain a fallback review comment based on `.github/review-comments/equivalent-human-review-fallback.md` so the failed or unavailable reviewer-subagent attempts, the fallback human reviewer, the findings, and the merge-gate record are durable on the pull request.

When the AI review record is a copied comment rather than a native reviewer-subagent artifact, that comment must state:

- that the review came from a separate reviewer subagent rather than implementation-agent self-review
- the exact review path and reviewer-subagent identity or mode used
- the 60-minute timeout budget for the reviewer-subagent review step
- the findings and verdict copied from that separate reviewer-subagent run and posted on the GitHub pull request

Implementation-worker self-review and parent-coordinator self-review do not satisfy the reviewer gate. Reviewer subagent output must come from a different agent than the implementing worker.
