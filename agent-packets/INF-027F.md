<!-- agent-packet:story-id INF-027F -->
<!-- agent-packet:story-path stories/approved/INF-027F-add-safe-merged-branch-cleanup.yaml -->
<!-- agent-packet:story-sha256 73eed63660ad0054bfb5f46df4f3ed2c754ec657c4e42109c56f86afdd98715c -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-027F
Epic ID: KICK-001
Title: Add safe merged branch cleanup
Type: tooling
Area: infra
Primary Concern: tooling

## Why

Add safe deletion of merged story/substory branches after packet lifecycle cleanup succeeds, with strict guards for protected, unmerged, unrelated, and malformed branch requests.

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

Own branch cleanup after successful packet lifecycle cleanup only. Do not add final closeout documentation sweeps, cleanup PR creation, packet lifecycle command changes, or broad branch-protection redesign in this story.

## Scope

- parse branch names from validated and PR-bound cleanup metadata
- skip branch deletion if packet cleanup fails
- reject deletion of `main`, `master`, release branches, protected branches, unmerged branches, and unrelated branches
- delete the merged PR head branch only when associated with the merged PR
- for parent cleanup, delete parent integration branch only after parent PR merge and lifecycle cleanup success
- delete optional substory branches only when metadata lists them and they are already merged as required by policy
- support dry-run/log output explaining allowed, skipped, rejected, and failed branch cleanup decisions
- leave clear log/comment if branch deletion fails after successful packet cleanup without rolling back packet cleanup

## Out of Scope

- final closeout documentation consistency sweeps
- deleting unmerged branches
- deleting protected branches
- cleanup of arbitrary old branches
- cleanup PR creation
- packet lifecycle command changes
- GitHub board or issue automation
- broad branch-protection redesign

## Allowed Touch Points

<!-- prettier-ignore -->
- .github/workflows/post-merge-packet-cleanup.yml
- package.json
- tools/post-merge-cleanup.ts
- tools/post-merge-cleanup/**
- tools/tsconfig.json
- tests/github/**
- tests/contracts/**
- tests/fixtures/post-merge-cleanup/**
- stories/generated/INF-027F-*.yaml
- stories/approved/INF-027F-*.yaml
- agent-packets/INF-027F.md
- agent-packets/active.json

## Constraints

- use the repo-approved GitHub integration surface for branch deletion
- deletion must be opt-in through cleanup metadata and safety validation
- fail safe if branch association or merge state cannot be established
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- branch cleanup test for cleanup-failure skip
- branch cleanup tests for `main`, `master`, release branch pattern, API-reported protected branch, unrelated branch, and unmerged branch rejection
- branch cleanup dry-run/log tests for allowed, skipped, rejected, and failed deletion decisions
- branch cleanup test for valid merged story branch deletion request
- branch cleanup test for valid parent integration branch deletion request after parent cleanup succeeds
- branch cleanup test for valid listed merged substory branch deletion request after parent cleanup succeeds
- branch cleanup test proving deletion failure after packet cleanup is reported without rollback
- workflow test proving branch deletion runs only after packet cleanup and verification gates

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- branch cleanup does not run when packet cleanup fails
- `main`, `master`, release branch patterns, API-reported protected branches, unrelated branches, and unmerged branches are never deleted
- dry-run output explains every allowed, skipped, rejected, and failed branch cleanup decision
- successful packet cleanup can be followed by safe deletion of the merged PR branch
- successful parent packet cleanup can be followed by safe deletion of the parent integration branch
- successful parent packet cleanup can be followed by safe deletion of listed, already-merged substory branches
- branch deletion failure after packet cleanup is reported without rolling back packet cleanup

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
