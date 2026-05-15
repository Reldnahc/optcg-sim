<!-- agent-packet:story-id INF-053H -->
<!-- agent-packet:story-path stories/approved/INF-053H-normalize-default-branch-wording.yaml -->
<!-- agent-packet:story-sha256 b2b746b6a14d6e3dec0259c0d015a60172e1a4ec3797d7bc0cc872830659d997 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-053H
Epic ID: INF-053
Title: Normalize default-branch wording
Type: refactor
Area: docs
Primary Concern: docs

## Why

Normalize stale main/master wording so repository workflow guidance is centered on the default branch and `main`, with `master` retained only as compatibility wording if current policy still needs it.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
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

### 32-codex-agent-integration.s013 (Merge gate recommendation)

A Codex-authored patch should not be merged unless:

- the linked story is still `approved`,
- the patch satisfies the listed acceptance criteria,
- required tests are present and passing,
- no uncited behavior is introduced,
- the review record includes either a reviewer-subagent artifact or an equivalent human review step.
- protected or default-branch PRs have human review before merge.

After merge, the story should no longer remain approved or active. The parent agent
should use the packet completion command to move it to `stories/done/` with
`status: done`, remove the active packet, and ensure `agent-packets/active.json`
contains no completed story.

For an explicitly approved parent-story integration branch workflow, the normal
path uses one parent integration branch and no substory pull requests. Reviewed
substory commits land on the parent integration branch before the substory is
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
future-tense review language: included substory story path + commit SHA + AI review record + revision response + verification evidence, full-story reviewer-subagent
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
only for associated merged, unprotected story or substory branches. Substory
branch cleanup is exceptional and limited to legacy or explicitly approved
non-normal branches that are listed in reviewed cleanup evidence.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only default-branch/main/master wording in branch protection guidance, CI workflow triggers, and focused workflow tests. Do not change CI triggers unless the story explicitly decides to remove master compatibility.

## Scope

- normalize branch-protection wording around default branch and `main`
- document `master` as compatibility-only if retained by current policy
- update tests to preserve the chosen wording
- leave CI triggers unchanged unless the story explicitly removes master compatibility

## Out of Scope

- changing required status check names
- broad branch-protection redesign
- changing workflow triggers without explicit evidence and tests

## Allowed Touch Points

<!-- prettier-ignore -->
- .github/branch-protection.md
- .github/workflows/ci.yml
- tests/github/review-workflow.test.mjs

## Constraints

- do not change CI triggers unless the implementation note explicitly justifies removing master compatibility
- preserve existing required check names
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

### Code Standard

Follow [`docs/code-standard.md`](docs/code-standard.md). Non-negotiables:

- stay inside the approved story boundary
- preserve package boundaries
- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors
- prefer named exports and precise types
- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard
- split by reason-to-change, not by line count
- do not over-split into tiny files or generic dumping grounds
- keep engine-core pure and hidden-info safe
- prove engine behavior with synthetic/unit/regression tests
- keep real-card fixture tests separate from engine behavior requirements
- preserve deterministic event ordering and state hashes
- record ambiguity instead of inventing behavior

## Required Tests

- run `corepack pnpm run test -- tests/github/review-workflow.test.mjs`
- run `corepack pnpm verify`, or record why unavailable

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- branch-protection guidance centers default-branch/main policy
- any retained master wording is explicitly compatibility-only
- tests cover the selected main/master wording decision

## Post-Approval Role Sections

### implementation

Responsibilities
- implement only the approved story using packet authority order
- follow strict TypeScript, lint, and verification requirements
- report ambiguity instead of inventing uncited behavior

Forbidden Actions
- do not broaden scope beyond the approved story boundary or allowed_touch_points
- do not add packet extraction behavior unless the approved story explicitly owns it
- do not implement story-author/story-review handoff mechanics

Required Inputs
- active packet content with authoritative spec references
- approved story scope, non-scope, and acceptance criteria
- allowed_touch_points and required test list

Required Outputs
- scoped code and test changes within approved touch points
- verification command results with pass/fail status
- assumptions and blockers note

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

### code-review

Responsibilities
- review correctness, scope fit, and required-test coverage
- verify no forbidden role sections or lifecycle changes were introduced
- confirm canonical packet behavior remains enforceable

Forbidden Actions
- do not author new feature scope outside the reviewed patch
- do not bypass required tests, packet verification, or CI gate evidence
- do not approve scope drift that violates story boundary

Required Inputs
- proposed patch limited to approved touch points
- active packet, approved story, and cited spec references
- verification and test evidence for required commands

Required Outputs
- review findings prioritized by correctness and scope compliance
- clear disposition for findings (fix/defer/block) with rationale
- review closure recommendation for Session Orchestrator handoff

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

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

<!-- prettier-ignore-end -->
