<!-- agent-packet:story-id SPEC-005 -->
<!-- agent-packet:story-path stories/approved/SPEC-005-authorize-cleanup-scoped-post-merge-verification.yaml -->
<!-- agent-packet:story-sha256 a11542cdeea6f7f9f63b5429a9a9059350fe75a665463fc664feb3f7689bccb4 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-005
Epic ID: KICK-001
Title: Authorize cleanup-scoped post-merge verification
Type: specification
Area: docs
Primary Concern: tooling

## Why

Update the specification authority for exact post-merge packet cleanup so the direct cleanup workflow may run cleanup-scoped lifecycle verification instead of full repo verification after a reviewed PR has already merged.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)
- 26-agent-packet-template.s005 (Packet construction rules)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
- 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)
- 32-codex-agent-integration.s010 (Review flow)
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

Exact packet-completion cleanup may use cleanup-scoped lifecycle verification
instead of full repo verification before the direct cleanup push. Cleanup-scoped
lifecycle verification must prove metadata binding, packet-completion output,
story lifecycle state, active packet state, and committed story metadata remain
valid. Normal main-branch CI remains the broad post-cleanup safety net after
the cleanup commit is pushed. Cleanup that includes any manual edit beyond
packet-completion output still requires full repo verification and the normal
reviewer-subagent path before push or merge.

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
- treat the exact file changes produced by that completion operation as generated lifecycle cleanup that needs cleanup-scoped lifecycle verification but does not need separate reviewer-subagent review unless any manual edits are added,
- Cleanup-scoped lifecycle verification must prove packet completion output, story lifecycle state, active packet state, and committed story metadata remain valid,
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

A commit that contains only the exact file changes produced by the packet completion command is a generated lifecycle cleanup and does not need a separate reviewer-subagent pass; exact packet-completion cleanup may use cleanup-scoped lifecycle verification instead of full repo verification before the direct cleanup push. Cleanup-scoped lifecycle verification must prove metadata binding, packet-completion output, story lifecycle state, active packet state, and committed story metadata remain valid; cleanup that includes any manual edit beyond packet-completion output still requires full repo verification and the normal reviewer-subagent path before push or merge. This includes edits to packet files, `agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or story files.

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
and cleanup-scoped lifecycle verification passes. Normal main-branch CI remains
the broad post-cleanup safety net after the cleanup commit is pushed. The
automation must not open a cleanup
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

### 32-codex-agent-integration.s010 (Review flow)

Use a separate reviewer subagent as a fast first-pass reviewer for scope creep, missing tests, and obvious contract drift, but do not treat a passing agent review as authoritative proof of correctness. Human review still owns final acceptance for gameplay correctness and policy-sensitive areas.

Story-review agents are separate from implementation reviewer subagents. Story-review agents review generated or normalized story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy before human story approval. Implementation reviewer subagents review patches after implementation.

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
command and cleanup-scoped lifecycle verification passes; exact
packet-completion cleanup may use cleanup-scoped lifecycle verification instead
of full repo verification before the direct cleanup push. Cleanup-scoped
lifecycle verification must prove metadata binding, packet-completion output,
story lifecycle state, active packet state, and committed story metadata remain
valid; cleanup that includes any manual edit beyond packet-completion output
still requires full repo verification and the normal reviewer-subagent path
before push or merge; this includes edits to packet files,
`agent-packets/active.json`, tooling, tests, fixtures, specs, workflow docs, or
story files.

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
and cleanup-scoped lifecycle verification passes. Normal main-branch CI remains
the broad post-cleanup safety net after the cleanup commit is pushed. The
automation must not open a cleanup
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

Own only the specification, policy documentation, and authority tests for narrowing verification on exact generated post-merge packet cleanup commits. Do not change GitHub Actions, cleanup tooling, packet lifecycle code, branch deletion behavior, cleanup metadata parsing, or implementation workflow code.

## Scope

- replace existing authority that requires full repo verification before exact generated post-merge packet cleanup pushes
- authorize cleanup-scoped lifecycle verification only for exact packet-completion output after a reviewed PR has merged
- define cleanup-scoped lifecycle verification as checks that prove metadata binding, packet completion output, story lifecycle state, active packet state, and committed story metadata remain valid
- preserve full repo verification before ordinary PR handoff, human review, non-cleanup protected-branch changes, and any cleanup containing manual edits beyond packet-completion output
- preserve trusted default-branch checkout, dedicated cleanup actor, cleanup metadata binding, fail-closed validation, no-cleanup-PR policy, and safe branch deletion constraints
- update branch-protection and workflow docs to distinguish exact generated cleanup from manual cleanup edits
- add or update authority tests so future workflow stories cannot remove the cleanup-scoped/full-verification distinction silently

## Out of Scope

- changing `.github/workflows/post-merge-packet-cleanup.yml`
- changing cleanup validator, executor, bound plan, or packet lifecycle tooling
- changing cleanup metadata syntax or evidence requirements
- changing branch deletion logic
- changing cleanup actor/token permissions
- changing PR CI, story-review, reviewer-subagent review, human review, or pre-merge verification gates
- implementing a cleanup-scoped command
- changing engine, cards, CLI, server, client, replay, database, gameplay, or UI behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/23-repo-tooling-and-enforcement.md
- specs/26-agent-packet-template.md
- specs/27-spec-driven-story-generation-workflow.md
- specs/32-codex-agent-integration.md
- specs/section-index.json
- specs/spec-manifest.json
- specs/source-map.md
- specs/source-coverage-matrix.md
- specs/SPEC_VERSION.md
- .github/branch-protection.md
- docs/workflow/story-execution.md
- docs/workflow/parent-integration-branches.md
- tests/contracts/spec-authority-gates.test.mjs
- tests/contracts/agent-packet-contract.test.mjs
- tests/github/review-workflow.test.mjs
- stories/generated/SPEC-005-authorize-cleanup-scoped-post-merge-verification.yaml
- stories/approved/SPEC-005-authorize-cleanup-scoped-post-merge-verification.yaml
- agent-packets/SPEC-005.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate the SPEC-005 packet before implementation
- run `corepack pnpm run packets:verify` before implementation and review handoff
- stay within allowed_touch_points
- parent agent may implement this parent-owned authority edit directly
- open the PR before implementation-review
- run the implementation-review gate after the PR is opened
- do not change workflow code, cleanup tooling code, packet lifecycle code, cleanup credentials, or remote branch-protection settings in this SPEC story
- create a separate follow-up INF story after SPEC-005 lands to implement the workflow/tooling change
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- update `tests/contracts/spec-authority-gates.test.mjs` to pin cleanup-scoped verification authority and manual-cleanup full-verification requirements
- update `tests/contracts/agent-packet-contract.test.mjs` to pin packet-template cleanup verification language
- update `tests/github/review-workflow.test.mjs` to pin workflow documentation language for exact generated cleanup versus manual cleanup edits
- run `corepack pnpm run specs:generate-metadata`
- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm run test:contracts`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run typecheck`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- specs explicitly allow exact generated post-merge packet cleanup to use cleanup-scoped lifecycle verification instead of full repo verification
- specs define cleanup-scoped lifecycle verification tightly enough for a later implementation story to wire it without weakening cleanup safety
- specs and docs still require full repo verification for ordinary PR handoff and any cleanup with manual edits beyond packet-completion output
- specs and docs preserve the dedicated cleanup actor, trusted checkout, metadata binding, fail-closed cleanup validation, no-cleanup-PR policy, and safe branch deletion constraints from SPEC-004
- branch-protection docs distinguish broad CI on the cleanup push from pre-push cleanup-scoped lifecycle checks
- authority tests fail if exact cleanup is again required to run full repo verification before push
- authority tests fail if manual cleanup edits are allowed without full verification and normal review
- generated spec metadata is updated

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
