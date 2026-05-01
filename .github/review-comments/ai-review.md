## AI Review Record

- Story ID:
- Story file:
- Parent-agent orchestration note:
- Worker subagent reference(s):
- Reviewer path: <reviewer subagent | native PR review artifact>
- Review provenance: <separate reviewer subagent run | not implementation-worker or parent-coordinator self-review>
- Reviewer subagent reference or review surface:
- Review scope:
- Reviewer mode:
- Review timeout budget: 60 minutes
- Review prompt or mode:
- Files reviewed:
- Findings:
- Verdict:
- Required follow-up before human review:
- Human merge-gate review record (approval link or equivalent human review step reference):

Use this comment for the first-pass AI review record on reviewer-subagent-reviewed PRs. Human review should not be requested until this comment exists and any blocking findings are addressed or explicitly dispositioned in the revision response comment. Implementation-worker self-review does not satisfy this gate. Parent-coordinator self-review does not satisfy this gate either. The review must come from a separate reviewer subagent run that is different from the implementing worker.

If the separate reviewer subagent output does not already live on the pull request, copy the findings and verdict from that separate reviewer subagent output into this comment, then post it on the GitHub pull request before human review is requested.
If the reviewer subagent surface already posted a durable pull-request artifact, use that native PR artifact itself as the AI review record and do not require a duplicate AI review comment.
When the workflow falls back to an equivalent human review because no usable reviewer subagent run remains after the available reviewer subagent surfaces were found unavailable, timed out, or failed, do not require this comment; record the fallback review comment instead.
