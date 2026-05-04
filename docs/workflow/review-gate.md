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
15. request human review only after the AI review record or explicit equivalent-human-review fallback record exists, and after the revision response comment is up to date when a separate reviewer subagent run was used
16. require human review before merge for gameplay, policy-sensitive, or architecture-sensitive changes unless the PR is a substory PR targeting an approved parent integration branch; in that case, human review is deferred to the parent PR
17. if review finds multi-concern drift, split the story or narrow the patch before merge

The separate reviewer subagent run is a repo-level first-pass gate before human review. It does not replace the merge-gate requirement for a durable review record or equivalent human review step.

Passing AI review does not replace human review.

For parent-story integration branch work, passing AI review permits the parent agent to merge a substory PR into the parent integration branch only after CI, packet verification, AI review records, and revision response records are complete. It does not permit merging the parent integration branch to `main` without human review.

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
