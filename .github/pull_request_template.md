## Approved Story

- Story ID:
- Story file:

## Spec Refs

- Cited sections:

## Scope Check

- [ ] The patch stays inside the approved story boundary and allowed touch points.
- [ ] No uncited behavior was introduced.
- [ ] Adjacent concerns were not silently absorbed.
- [ ] File responsibility checked: guarded source, test, tool, or contract files at 800+ effective lines are explained here or have a follow-up split/refactor story.

## Tests Run

- [ ] `pnpm verify`
- [ ] Story-specific tests:

## Post-Merge Cleanup

Cleanup metadata is a reviewed request, not standalone authority.

- [ ] Reviewers confirm this metadata matches the reviewed story scope before merge.
- [ ] Confirm the exact cleanup metadata source ref before merge. Compute it before human review with `corepack pnpm cleanup:validate-dry-run -- --print-source-ref --metadata-source-kind pr-body --metadata-source-id <source-id> --metadata-source-file <file>` or `--metadata-source-kind handoff-comment --metadata-source-id <comment-id>`.
- [ ] The human merge-gate approval or equivalent fallback review names the exact `pr-body:<source-id>:<sha256>` or `handoff-comment:<comment-id>:<sha256>` ref for the metadata source being reviewed.
- [ ] Manual edits beyond pure packet-completion output still use the normal PR and reviewer path.
- [ ] Automation-created cleanup pull requests are not created.

Single-story PRs:

```yaml
Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/<STORY-ID>-<slug>.yaml
  branches:
    - <head-branch>
```

Parent PRs:

```yaml
Post-merge cleanup:
  mode: parent
  stories:
    - stories/approved/<CHILD-A>.yaml
    - stories/approved/<CHILD-B>.yaml
  branches:
    - <parent-integration-branch>
    - <optional-substory-branch>
```

## Review

- [ ] AI review completed before human review request, or equivalent human review fallback recorded because no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed
- [ ] Separate reviewer subagent run completed before human review request, or equivalent human review fallback recorded because no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed
- [ ] Implementation-worker self-review or parent-coordinator self-review was not used as the review gate
- [ ] Parent agent stayed within small local glue and orchestration while worker subagent(s) handled the main implementation body, or this was a parent-owned documentation-only authority edit
- [ ] Reviewer subagent output came from a different agent than the implementing worker, or equivalent human review fallback was recorded
- Worker subagent reference(s) or `none: parent-owned authority edit`:
- Parent/orchestrator model: `gpt-5.5`
- Implementation worker model and reasoning: `<gpt-5.3-codex medium | gpt-5.5 medium | none: parent-owned authority edit>`
- Reviewer model and reasoning: `gpt-5.4 high`
- Model-routing deviations:
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

## Parent Integration PRs

Use this section only when the PR merges a parent integration branch into `main`.

- Included substory PRs:
- [ ] Each included substory PR has CI, `pnpm verify`, AI review record, and revision response recorded on its PR
- [ ] Full-story integration reviewer-subagent review is posted on this parent PR
- [ ] Parent PR revision response is posted after full-story integration review
- [ ] Parent PR body or handoff comment is updated to completed-gate language before human review is requested
- [ ] Current parent PR CI result:
- [ ] Current parent branch `pnpm verify` result:
- [ ] Human review is explicitly required before merge to `main`
- [ ] Post-merge lifecycle cleanup plan is recorded: `pnpm run packets:complete-many ...`
- [ ] Post-merge cleanup metadata lists every substory that automation must complete after merge to `main`
- [ ] Active packet state is explained if non-empty: `agent-packets/active.json` is only the current or most recent substory handoff pointer until post-merge cleanup, not the list of unfinished substories

Pure post-merge packet-completion cleanup commits that contain only the exact file changes produced by `pnpm run packets:complete --story <stories/approved/...yaml>` or `pnpm run packets:complete-many --story <stories/approved/...yaml> --story <stories/approved/...yaml>` do not use this pull-request review artifact path. If cleanup includes any manual edit beyond that command output, use the normal PR checklist above.

## Assumptions and Risks

- Assumptions:
- Risks:
