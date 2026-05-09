<!-- agent-packet:story-id INF-027G -->
<!-- agent-packet:story-path stories/approved/INF-027G-close-cleanup-automation-docs-and-tests.yaml -->
<!-- agent-packet:story-sha256 a22f01a6422411dfc5540906b02c5e4c3b1c8dcddadc826e33d65b7116d60b41 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-027G
Epic ID: KICK-001
Title: Close cleanup automation docs and tests
Type: tooling
Area: infra
Primary Concern: verification

## Why

Close the post-merge cleanup automation series with integration tests and documentation consistency checks proving workflow wiring, metadata contract, narrow bypass, manual fallback, and no automation-created cleanup PR policy.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)
- 26-agent-packet-template.s005 (Packet construction rules)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
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

Own final closeout verification and documentation consistency only. Do not add new parser behavior, PR evidence binding behavior, privileged push behavior, or branch deletion behavior beyond gaps found inside this story boundary; split if tests reveal missing behavior owned by earlier stories.

## Scope

- verify package scripts and tools expose cleanup validation behavior through already-implemented commands
- verify workflow trigger, permissions, checkout behavior, fail-closed preflight, privileged push ordering, verification, final diff revalidation, and branch deletion ordering
- verify PR template contains required cleanup metadata fields and reviewer responsibility language
- verify parent integration docs no longer require humans to manually run cleanup when automation succeeds
- verify docs explicitly say automation-created cleanup PRs are not created
- verify docs preserve the normal PR and reviewer path for manual edits beyond pure packet-completion output
- verify branch-protection docs document the required narrow bypass actor/workflow/token
- verify ordinary branch protection remains required for normal PRs

## Out of Scope

- new parser behavior beyond test-discovered gaps
- new PR evidence binding behavior beyond test-discovered gaps
- new privileged cleanup push behavior beyond test-discovered gaps
- new branch deletion behavior beyond test-discovered gaps
- remote GitHub branch-protection mutation
- cleanup PR creation by automation
- GitHub board or issue automation

## Allowed Touch Points

<!-- prettier-ignore -->
- .github/branch-protection.md
- .github/pull_request_template.md
- .github/workflows/post-merge-packet-cleanup.yml
- docs/workflow/story-execution.md
- docs/workflow/parent-integration-branches.md
- tests/github/**
- tests/contracts/**
- stories/generated/INF-027G-*.yaml
- stories/approved/INF-027G-*.yaml
- agent-packets/INF-027G.md
- agent-packets/active.json

## Constraints

- closeout changes must not widen cleanup bypass, metadata authority, privileged push, or branch deletion scope
- if closeout finds missing behavior outside this story boundary, stop and split instead of absorbing it
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- package script/tool exposure test for cleanup validation
- GitHub workflow test for trigger, permissions, trusted checkout, preflight-before-privileged-push, verification before push, final diff revalidation, branch deletion ordering, and no automation-created cleanup PRs
- PR template cleanup metadata and reviewer responsibility test
- parent integration docs automation test
- workflow docs test proving manual fallback is operational only and manual edits beyond pure packet-completion output use the normal PR/reviewer path
- branch-protection bypass documentation test

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- integration tests cover workflow trigger, trusted checkout, preflight, privileged push, verification-before-push, final diff revalidation, branch deletion ordering, and no automation-created cleanup PRs
- docs and PR template agree on cleanup metadata shape and reviewer responsibility
- branch-protection docs name the exact cleanup actor/workflow/token and preserve normal PR gates
- docs describe automated cleanup as the normal path after successful story or parent PR merge
- docs preserve manual fallback only for operational failure
- docs preserve normal PR and reviewer path for manual edits beyond pure packet-completion command output

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
