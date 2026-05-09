<!-- agent-packet:story-id INF-027I -->
<!-- agent-packet:story-path stories/approved/INF-027I-treat-human-merge-as-cleanup-approval.yaml -->
<!-- agent-packet:story-sha256 51be0b4f4fd8a867d53e4d2a6ec8c4a39355149655925a5fabc4e5b4078361f6 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-027I
Epic ID: KICK-001
Title: Treat human merge as cleanup metadata approval
Type: tooling
Area: infra
Primary Concern: tooling

## Why

Remove the manual requirement for human reviewers to paste an exact cleanup metadata source ref into the approval text. The post-merge cleanup workflow should treat the human-controlled merge to main as the merge-gate signal, snapshot and hash the cleanup metadata at merge time, and keep all existing fail-closed packet cleanup validation.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)
- 26-agent-packet-template.s005 (Packet construction rules)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
- 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)
- 32-codex-agent-integration.s013 (Merge gate recommendation)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

## Relevant Spec Excerpts

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

A pull request must not merge unless the main CI pipeline passes.

Minimum required merge gates:

1. install dependencies with locked versions,
2. build/typecheck workspace,
3. lint workspace,
4. run tests,
5. validate contracts and schemas,
6. validate formatting,
7. publish coverage artifact,
8. fail if generated artifacts or snapshots are stale when the repo defines them.

Recommended CI jobs:

- `quality` -> lint, typecheck, format check
- `engine` -> engine unit, interaction, invariant, replay tests
- `contracts` -> canonical types, DSL schema, fixture normalization, SQL/schema validation
- `client-server-smoke` -> protocol smoke tests and filtered-view checks

For protected branches, require at least one human review plus passing CI.

Ordinary protected-branch changes still require a pull request, at least one
human review, and passing required checks. The only allowed packet-lifecycle
exception is a dedicated GitHub App actor `optcg-packet-cleanup[bot]` running
workflow `.github/workflows/post-merge-packet-cleanup.yml` with token
`POST_MERGE_PACKET_CLEANUP_TOKEN`, and that exception exists only to push exact
packet-completion command output to `main` after a reviewed pull request has
merged. The cleanup actor and token must not be available to arbitrary GitHub
Actions workflows, human users, broad admin roles, implementation changes, docs
changes, tooling changes, or ordinary development pushes.

### 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)

Repo tooling is considered defined and implementation-ready when all of the following are true:

- a contributor can clone the repo and run one documented bootstrap command successfully,
- `pnpm verify` exists and fails on real quality violations,
- package boundaries are mechanically enforced,
- contract/schema validation is automated,
- CI and local checks are materially aligned,
- hidden-information regression checks exist,
- merge protection depends on passing CI rather than reviewer memory.

At that point the repo is not just documented; it is enforceable.

### 26-agent-packet-template.s005 (Packet construction rules)

When building a packet from an approved story:

- include only the relevant spec material,
- do not dump the entire spec by default,
- write the packet as a checked-in artifact under `agent-packets/<STORY-ID>.md`,
- include stable metadata for the source story id, story path, and source-story freshness hash so tooling can verify the packet later,
- preserve the `primary_concern`, `story_boundary`, and `allowed_touch_points` exactly,
- preserve exact acceptance criteria from the story,
- preserve non-scope unchanged,
- include the applicable repo rules from [`23-repo-tooling-and-enforcement.md`](23-repo-tooling-and-enforcement.md),
- include code and architecture constraints from the relevant documents,
- include the approved ambiguity policy,
- allow approved stories to sit without packets until they become active, but require a current checked-in packet before implementation assignment, reviewer assignment, or PR handoff,
- keep the active packet manifest to zero or one active story; activating a story replaces the prior active entry rather than accumulating active implementation targets,
- complete stories through one packet-tool operation that moves the story to done history, removes the active packet, and clears the completed story from the active packet manifest,
- treat the exact file changes produced by that completion operation as generated lifecycle cleanup that needs repo verification but does not need separate reviewer-subagent review unless any manual edits are added,
- split the story before packet generation if the packet would otherwise need multiple unrelated concerns to be implemented together.

### 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)

A story should not be marked done unless:

- code behavior matches the cited spec,
- required tests are present and pass,
- repo verification passes,
- the patch stays within the approved story boundary and allowed touch points or the story is updated and re-approved first,
- no prohibited scope creep is introduced,
- any new ambiguity is surfaced explicitly.

After a story is marked done, it should not remain under `stories/approved/`, should not retain an active packet, and should not remain listed in `agent-packets/active.json`. The parent agent owns this cleanup because story state and packet authority are orchestration concerns, not worker or reviewer subagent concerns. Repos should provide a single command for normal single-story completion and a multi-story command for parent-story integration cleanup so story movement, packet removal, and manifest cleanup cannot drift independently. Multi-story cleanup tooling must fail closed when manifest or packet evidence for any listed story is missing or stale.

For parent-story integration branches, substories may remain approved after their substory PRs merge into the parent integration branch because the authoritative merge to `main` has not happened yet. This exception is valid only when the user explicitly approved parent-level human review for the decomposed story group, every substory PR has CI and reviewer-subagent review records, and the final parent PR receives full-story integration review plus human review before merge to `main`.

During that parent-branch window, `agent-packets/active.json` remains a single-story handoff pointer for the currently active or most recently active substory packet. It should not be read as the inventory of unfinished substories. Substories merged only into the parent integration branch stay approved and keep their packet files until the parent PR lands on `main`, even when they no longer appear in `active.json`.

Before human review is requested on a parent PR, the PR body or a handoff comment should be updated from future-tense review plans to completed-gate evidence: included substory PRs, full-story AI review record, revision response, CI result, repo verification result, remaining human-review requirement, and the post-merge `packets:complete-many` cleanup plan.

A commit that contains only the exact file changes produced by the packet completion command is a generated lifecycle cleanup and does not need a separate reviewer-subagent pass. Run the repo verification command before pushing that cleanup. If cleanup requires any manual edit beyond the command output, including edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files, it is no longer pure generated cleanup and should receive the normal reviewer-subagent pass before push or merge.

Post-merge cleanup metadata is a reviewed cleanup request, not standalone
authority to mutate story state. Cleanup automation must bind the requested
cleanup to reviewed pull-request evidence, the merge state, trusted checked-in
approved story files, current packet evidence, and, for parent cleanup, included
substory evidence before packet completion runs. It must fail closed when
cleanup metadata is absent, malformed, stale, unbound to reviewed evidence, or
names a story that is not eligible for completion.

The cleanup workflow must check out trusted `main` or default-branch code, not
unreviewed pull-request branch code. A direct cleanup commit may be pushed only
by the dedicated cleanup actor after packet-completion output is proven exact
and repo-approved verification passes. The automation must not open a cleanup
pull request. Manual fallback is only for operational failure, not the normal
path. Branch deletion may run only after packet lifecycle cleanup succeeds and
only for associated merged, unprotected story or substory branches.

### 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)

Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.

Required behavior:

- approval-ready means the exact candidate story has a usable per-story story-review result,
- set-level or decomposition-group story review does not satisfy per-story candidate approval review,
- each candidate story needs its own usable story-review result before that exact story is presented for approval,
- run a set-level story review before a decomposed story group is presented for human approval,
- run per-story review before each candidate story is presented for approval,
- use a story-review agent separate from any implementation worker or implementation patch reviewer,
- story-review agent uses gpt-5.5 with high reasoning,
- story-review findings must be fixed, explicitly deferred, or recorded before presentation,
- do not present a story as approval-ready when no usable story-review agent run exists; present it as unreviewed and blocked on story review instead,
- story-review agents evaluate story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy,
- story-review agents do not review implementation patches; implementation patch review remains a separate gate.

### 32-codex-agent-integration.s013 (Merge gate recommendation)

A Codex-authored patch should not be merged unless:

- the linked story is still `approved`,
- the patch satisfies the listed acceptance criteria,
- required tests are present and passing,
- no uncited behavior is introduced,
- the review record includes either a reviewer-subagent artifact or an equivalent human review step.

After merge, the story should no longer remain approved or active. The parent agent
should use the packet completion command to move it to `stories/done/` with
`status: done`, remove the active packet, and ensure `agent-packets/active.json`
contains no completed story.

For an explicitly approved parent-story integration branch workflow, substory
pull requests merge into the parent integration branch before the substory is
marked done. Those substories may remain under `stories/approved/` while the
parent integration branch is open, but they must not be marked done until the
parent pull request has merged to `main`. After the parent merge, the parent
agent must use the multi-story packet completion command to move every included
substory to `stories/done/`, remove their packets, and clear any matching active
manifest entry. The multi-story completion command must reject cleanup when
manifest or packet evidence for any listed substory is missing or stale.

While the parent integration branch is open, `agent-packets/active.json` is a
single-story handoff pointer, not a parent-story progress report. It may point to
the current or most recently active substory even after earlier substories have
merged into the parent branch. Those earlier substories remain approved until the
parent PR lands on `main` and the multi-story completion command runs.

Before requesting human review on the parent PR, the parent agent should update
the PR body or post a handoff comment that records completed gates instead of a
future-tense review plan: included substory PRs, full-story reviewer-subagent
record, revision response, CI result, repo verification result, required human
review, and post-merge multi-story cleanup.

Pure packet-completion cleanup does not require reviewer-subagent review when the
commit contains only the exact file changes produced by the packet completion
command and repo verification passes. If cleanup requires any manual edit beyond
that command output, including edits to packet files, `agent-packets/active.json`,
tooling, tests, fixtures, specs, workflow docs, or story files, use the normal
separate reviewer-subagent review path before pushing or merging.

Post-merge cleanup metadata is a reviewed cleanup request, not standalone
authority to mutate story state. Cleanup automation must bind the requested
cleanup to reviewed pull-request evidence, the merge state, trusted checked-in
approved story files, current packet evidence, and, for parent cleanup, included
substory evidence before packet completion runs. It must fail closed when
cleanup metadata is absent, malformed, stale, unbound to reviewed evidence, or
names a story that is not eligible for completion.

The cleanup workflow must check out trusted `main` or default-branch code, not
unreviewed pull-request branch code. A direct cleanup commit may be pushed only
by the dedicated cleanup actor after packet-completion output is proven exact
and repo-approved verification passes. The automation must not open a cleanup
pull request. Manual fallback is only for operational failure, not the normal
path. Branch deletion may run only after packet lifecycle cleanup succeeds and
only for associated merged, unprotected story or substory branches.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only the cleanup metadata approval signal and its tests/docs/workflow wiring. Preserve the existing cleanup metadata parser, story/packet eligibility checks, parent lifecycle evidence checks, direct packet cleanup output validation, branch deletion safety, and no-cleanup-PR policy.

## Scope

- remove docs, PR template, fallback template, workflow, and validator requirements that a human reviewer must paste or name the exact cleanup metadata source ref before merge
- keep computing the metadata source ref internally from the selected PR-body or durable handoff-comment cleanup metadata source
- treat a human merge to the default branch, or an equivalent documented human-review fallback record when merge actor evidence is unavailable, as the human cleanup approval signal
- require the selected cleanup metadata source to be present and unambiguous at merge time, and keep rejecting missing, malformed, stale, or out-of-scope metadata
- keep parent cleanup evidence requirements: parent integration AI review record, parent revision response, and one substory AI review record per included story
- keep binding cleanup metadata to trusted checked-in story files, packet evidence, merge state, and parent/substory inclusion evidence before packet completion
- update parent integration docs so the human review/merge step confirms the cleanup metadata block exists and matches the story scope without requiring a pasted source hash
- update closeout tests so they prove reviewers are not instructed to paste a source ref, while tooling still records the computed source ref for audit/logging

## Out of Scope

- changing `packets:complete` or `packets:complete-many` command semantics
- changing story schema shape
- changing direct cleanup diff validation or deterministic cleanup commit rules
- changing branch deletion policy
- adding cleanup PR creation
- broad branch-protection redesign
- remote GitHub branch-protection mutation
- gameplay, engine, effect runtime, replay, server, client, or UI behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- .github/pull_request_template.md
- .github/review-comments/equivalent-human-review-fallback.md
- .github/workflows/post-merge-packet-cleanup.yml
- docs/workflow/review-gate.md
- docs/workflow/parent-integration-branches.md
- docs/workflow/story-execution.md
- tools/post-merge-cleanup/**
- tools/post-merge-cleanup.ts
- tests/contracts/post-merge-cleanup-*.test.mjs
- tests/github/**
- tests/fixtures/post-merge-cleanup/**
- stories/generated/INF-027I-*.yaml
- stories/approved/INF-027I-*.yaml
- stories/approved/INF-027-post-merge-lifecycle-automation-parent.yaml
- agent-packets/INF-027I.md
- agent-packets/active.json

## Constraints

- do not weaken validator requirements that cleanup metadata is only a request bound to merge state, trusted story files, packet evidence, and parent/substory evidence
- do not treat unmerged pull requests, bot-only merges, or arbitrary issue comments as sufficient cleanup authority
- do not make arbitrary issue comments authoritative; only the PR body or durable handoff comments whose content starts with `Post-merge cleanup:` may be selected as cleanup metadata sources
- do not remove source-ref computation or audit logging; remove only the manual human-paste requirement
- if GitHub event data cannot reliably distinguish a human-controlled merge from bot-only automation, fail closed or keep an explicit equivalent-human-review fallback instead of silently allowing direct cleanup
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- contract test proving cleanup validation accepts a human merged PR evidence record without sourceRefs that name the cleanup metadata source ref
- contract test proving cleanup validation rejects bot-only merge/review evidence for privileged direct cleanup
- contract test proving metadata mutation after merge evidence is still rejected or impossible because the workflow snapshots metadata at merge time
- workflow evidence-builder test proving selected metadata source refs are still computed and logged for audit while human approval sourceRefs are not required
- docs and PR-template tests proving no guidance asks humans to paste or name an exact cleanup metadata source ref
- regression tests proving parent lifecycle evidence and handoff-comment metadata still validate without weakening fail-closed checks
- full `corepack pnpm run packets:verify`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- human reviewers and maintainers are no longer instructed to paste or name an exact cleanup metadata source ref before merge
- workflow evidence still computes and records the selected metadata source ref from the cleanup metadata source at merge time
- cleanup validation accepts human merge-gate evidence for a merged PR without requiring the review body to contain the selected metadata source ref
- cleanup validation still requires a human-controlled merge or equivalent documented human-review fallback before direct packet cleanup can run
- cleanup validation still rejects ambiguous cleanup metadata, metadata outside approved story paths, story ID mismatches, missing packet evidence, stale packet evidence, ineligible stories, missing parent lifecycle evidence, and non-packet cleanup output
- parent cleanup validation still requires parent integration AI review, parent revision response, and all included substory AI review records
- docs, PR template, fallback template, and tests agree that the source ref is an audit/log value, not a manual human approval field
- existing direct cleanup push, no-cleanup-PR, and branch deletion tests remain valid

## Ambiguity Rule

Policy: fail_and_escalate

If the story or cited specification is ambiguous, do not invent behavior. Report the ambiguity and stop at the narrowest safe point.

## Agent Instruction Footer

```text
You are implementing a constrained story in an existing codebase.
The cited specification is authoritative.
Do not invent behavior not supported by the cited spec.
Stay within scope.
Stay within the approved story boundary and allowed touch points.
Follow repo tooling and code standard requirements.
Include tests for the listed acceptance criteria.
If the spec is ambiguous, report the ambiguity instead of guessing.
```
