## Approved Story

- Story ID:
- Approved story file:
- Synced issue, if one exists:

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

- [ ] PR author left exactly one `Post-merge cleanup:` metadata source in the PR body or a durable handoff comment before review handoff.
- [ ] Cleanup metadata uses the exact source shape below: no markdown fence and no `cleanup:` wrapper.
- [ ] Remote `cleanup-metadata-guard` validates cleanup metadata source and shape from the PR body or durable handoff comments; the remote guard does not by itself prove full reviewed-scope binding.
- [ ] Full cleanup metadata handoff preflight was run against the actual current PR body or selected durable handoff comment, fetched changed files, fetched PR head branch, fetched status checks, and reviewed PR evidence, not a copied example or reconstructed local text.
- [ ] Full cleanup metadata handoff preflight binds the fetched changed files, fetched PR head branch, fetched status checks, and reviewed PR evidence before reviewer handoff, human review request, or ready-for-human-review language.
- [ ] `cleanup-metadata-guard` is present and passing before human review is requested.
- [ ] Reviewers confirm this metadata matches the reviewed story scope before merge.
- [ ] The human-controlled merge to `main` authorizes the cleanup metadata snapshot; the workflow computes the metadata source ref for audit.
- [ ] Equivalent fallback review, if used because merge actor evidence is unavailable, confirms the cleanup metadata source was reviewed before fallback approval.
- [ ] Manual edits beyond pure packet-completion output still use the normal PR and reviewer path.
- [ ] Automation-created cleanup pull requests are not created.

Single-story PRs: use only when no approved parent story changed in the PR.

<!-- prettier-ignore-start -->
Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/<STORY-ID>-<slug>.yaml
  branches:
    - <head-branch>

Parent PRs list one or more child story paths: use parent mode for the parent integration PR, including one-child parent PRs. The normal parent/substory workflow uses only the parent integration branch; substory branch cleanup is exceptional and must be tied to legacy or explicitly approved exceptional branch evidence.

Post-merge cleanup:
  mode: parent
  stories:
    - stories/approved/<CHILD-STORY>.yaml
  branches:
    - <parent-integration-branch>

Exceptional or legacy substory branch cleanup only: add a reviewed non-head substory branch entry only when the parent handoff includes explicit evidence for that exceptional branch.

Post-merge cleanup:
  mode: parent
  stories:
    - stories/approved/<CHILD-STORY>.yaml
  branches:
    - <parent-integration-branch>
    - <optional-substory-branch>
<!-- prettier-ignore-end -->

## Review

- Parent story-review artifact:
- Child story-review artifacts:
  - <child story path>: <artifact/status>
- All parent/child story-review rows approval-ready or blocker recorded:
- Packet activation happened after this gate:
- [ ] Role-based handoff evidence is present when applicable: role packet extraction output for each assigned post-approval role (`implementation`, `code-review`), or a recorded extraction-failure fallback note.
- [ ] AI review completed before human review request, or equivalent human review fallback recorded because no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed
- [ ] Separate reviewer subagent run completed before human review request, or equivalent human review fallback recorded because no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed
- [ ] Implementation-worker self-review or parent-coordinator self-review was not used as the review gate
- [ ] Parent agent stayed within tiny orchestration glue while worker subagent(s) handled the approved story implementation body; documentation-only approved stories still used implementation-worker ownership unless the approved story explicitly authorized parent ownership
- [ ] Reviewer subagent output came from a different agent than the implementing worker, or equivalent human review fallback was recorded
- Worker subagent reference(s):
- Parent/orchestrator model: `gpt-5.5`
- Implementation worker model and reasoning: `<gpt-5.3-codex medium>`
- Reviewer model and reasoning: `gpt-5.4 high`
- Model-routing deviations and rationale:
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

- Included substory commit evidence:
- [ ] Each included substory commit has story path, commit SHA, AI review record, revision response, and verification evidence recorded in this parent PR body or durable handoff comment
- [ ] Full-story integration reviewer-subagent review is posted on this parent PR
- [ ] Parent PR revision response is posted after full-story integration review
- [ ] Parent PR body or handoff comment is updated to completed-gate language before human review is requested
- [ ] Current parent PR CI result:
- [ ] Current parent branch `pnpm verify` result:
- [ ] Human review is explicitly required before merge to `main`
- [ ] Post-merge lifecycle cleanup plan is recorded: `pnpm run packets:complete-many ...`
- [ ] Post-merge cleanup metadata lists every substory that automation must complete after merge to `main`
- [ ] Active packet state is explained if non-empty: `agent-packets/active.json` is only the current or most recent substory handoff pointer until post-merge cleanup, not the list of unfinished substories

Pure post-merge packet-completion cleanup commits that contain only the exact file changes produced by `pnpm run packets:complete --story <stories/approved/...yaml>` or `pnpm run packets:complete-many` with one or more child `--story <stories/approved/...yaml>` arguments do not use this pull-request review artifact path. For validated parent-mode cleanup, exact packet-completion command output may also include command-owned bound parent story closeout from the cleanup plan. If cleanup includes any manual edit beyond that command output, use the normal PR checklist above.

## Assumptions and Risks

- Assumptions:
- Risks:
