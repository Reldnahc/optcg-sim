<!-- agent-packet:story-id INF-027D -->
<!-- agent-packet:story-path stories/approved/INF-027D-add-non-privileged-post-merge-cleanup-preflight-workflow.yaml -->
<!-- agent-packet:story-sha256 305e32b36c51797f8834a2108f79cea61a7629dce672abbfe0ba78af7159f3bb -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-027D
Epic ID: KICK-001
Title: Add non-privileged post-merge cleanup preflight workflow
Type: tooling
Area: infra
Primary Concern: tooling

## Why

Add the post-merge GitHub Actions workflow shell that runs after PRs merge to main, checks out trusted main/default-branch code, reads cleanup metadata, performs fail-closed validation and evidence binding, and reports results without any direct push or branch-protection bypass token.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)
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

Own non-privileged workflow wiring and preflight reporting only. Do not run packet completion, push cleanup commits, delete branches, or use the cleanup bypass actor/token in this story.

## Scope

- add workflow triggered by `pull_request` closed events for PRs merged into main/default branch
- ensure workflow checks out trusted main/default branch code rather than unreviewed PR branch code
- read cleanup metadata from the reviewed source defined by SPEC-004 and INF-027C
- run metadata parsing, eligibility validation, and PR evidence binding in preflight mode
- emit a validated bound-cleanup plan artifact for privileged cleanup consumption
- define the bound-cleanup plan artifact as GitHub Actions artifact `bound-cleanup-plan.json` with schema version `post-merge-cleanup-plan.v1`
- define the bound-cleanup plan top-level shape as `schemaVersion`, `status`, `generatedAt`, `mergedPullRequest`, `metadataSource`, `reviewEvidenceSource`, `stories`, `branches`, `packetCommand`, `verificationCommand`, and `inputsHash`
- require valid bound-cleanup plans to use `status: valid`; failed preflight emits no plan artifact
- define a stale plan as any plan whose merge SHA, story hash, packet hash, metadata source hash, reviewed evidence source hash, schema version, or inputs hash does not match trusted main/default-branch state at privileged cleanup time
- define a malformed plan as any plan with missing required fields, unknown schema version, `status` other than `valid`, invalid story paths, invalid hashes, duplicate story IDs, or unexpected top-level fields
- fail closed for absent, malformed, unbound, or ineligible cleanup metadata
- report clear success/failure logs or comments
- prove no write-capable cleanup token is available to this preflight story's workflow path

## Out of Scope

- packet completion command execution
- git diff validation after packet completion
- direct pushes to main
- branch-protection bypass token use
- branch deletion
- cleanup PR creation
- remote branch-protection mutation

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
- stories/generated/INF-027D-*.yaml
- stories/approved/INF-027D-*.yaml
- agent-packets/INF-027D.md
- agent-packets/active.json

## Constraints

- do not run packet completion in this story
- do not use write-capable cleanup credentials in this story
- do not delete branches in this story
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- GitHub workflow structure test for trigger and merged-main guard
- GitHub workflow structure test for trusted checkout
- GitHub workflow structure test proving no cleanup bypass token is referenced
- preflight failure tests for absent, malformed, and unbound metadata
- preflight artifact test proving `bound-cleanup-plan.json` is produced only after all validation and evidence-binding gates pass
- preflight artifact schema tests for schema version, `status: valid`, required top-level fields, and unexpected top-level field rejection
- preflight failure test proving failed preflight emits no bound-cleanup plan artifact
- docs/test coverage proving no cleanup PR creation in preflight

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- workflow trigger is limited to merged PRs targeting main/default branch
- workflow permissions are read-only or comment-only as needed for preflight reporting
- workflow checks out main/default branch code rather than PR branch code
- workflow fails closed before cleanup execution when metadata is absent, malformed, or not bound to reviewed PR evidence
- workflow writes `bound-cleanup-plan.json` only after metadata parsing, eligibility validation, and PR evidence binding all pass
- bound-cleanup plan artifact uses schema version `post-merge-cleanup-plan.v1` and `status: valid`
- bound-cleanup plan artifact contains the required top-level fields and no unexpected top-level fields
- failed preflight emits no bound-cleanup plan artifact
- workflow does not run packet completion commands
- workflow does not reference the privileged cleanup actor/token
- workflow never opens cleanup PRs

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
