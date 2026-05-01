## Approved Story

- Story ID:
- Story file:

## Spec Refs

- Cited sections:

## Scope Check

- [ ] The patch stays inside the approved story boundary and allowed touch points.
- [ ] No uncited behavior was introduced.
- [ ] Adjacent concerns were not silently absorbed.

## Tests Run

- [ ] `pnpm verify`
- [ ] Story-specific tests:

## Review

- [ ] AI review completed before human review request, or equivalent human review fallback recorded because no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed
- [ ] Separate reviewer subagent run completed before human review request, or equivalent human review fallback recorded because no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed
- [ ] Implementation-worker self-review or parent-coordinator self-review was not used as the review gate
- [ ] Parent agent stayed within small local glue and orchestration while worker subagent(s) handled the main implementation body
- [ ] Reviewer subagent output came from a different agent than the implementing worker, or equivalent human review fallback was recorded
- Worker subagent reference(s):
- Parent-agent orchestration note:
- Review path used: `<reviewer subagent | native PR review artifact | equivalent human review fallback>`
- Reviewer subagent reference or review surface:
- Reviewer mode:
- Review timeout budget: 60 minutes
- AI review record, if reviewer subagent review was used (native PR artifact link or AI review comment link):
- Equivalent human review fallback comment, if no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed:
- Revision response comment, if reviewer subagent review was used:
- Human merge-gate review record (approval link or equivalent human review step reference):
- [ ] The required review artifact is present on this PR. When the separate reviewer-subagent output does not already live on the PR, the AI review comment copies the findings and verdict from that separate reviewer-subagent output. When a reviewer subagent surface already posts a durable PR artifact, that native PR artifact itself serves as the AI review record. If the fallback path was used, the fallback review comment explains why no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed
- [ ] Blocking AI review findings resolved or explicitly carried as blockers with disposition, or the fallback review comment records any remaining blockers
- [ ] Human review requested after the AI review record or fallback review comment was posted
- [ ] Human merge-gate review record is present before merge
- [ ] Follow-up ambiguities or blockers documented if review uncovered them

## Assumptions and Risks

- Assumptions:
- Risks:
