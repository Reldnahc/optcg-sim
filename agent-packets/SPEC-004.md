<!-- agent-packet:story-id SPEC-004 -->
<!-- agent-packet:story-path stories/approved/SPEC-004-authorize-post-merge-packet-cleanup-bypass.yaml -->
<!-- agent-packet:story-sha256 08f764e6f7886b8b81cbba0de075f57675475438a07b50e176412b0bdf21b7f8 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-004
Epic ID: KICK-001
Title: Authorize post-merge packet cleanup bypass
Type: specification
Area: docs
Primary Concern: tooling

## Why

Add specification authority for a narrow post-merge packet lifecycle cleanup bypass that may push exact packet-completion output to main only after a reviewed PR merges, while defining metadata trust boundaries, no-cleanup-PR policy, and safe branch deletion constraints.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
- 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)
- 32-codex-agent-integration.s008 (Recommended execution flow)
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

### 32-codex-agent-integration.s008 (Recommended execution flow)

1. Before approving a generated or normalized story, run story-review subagents and resolve, explicitly defer, or record their findings.
1. Approval-ready means the exact candidate story has a usable per-story story-review result.
1. Set-level or decomposition-group story review does not satisfy per-story candidate approval review.
1. Each candidate story needs its own usable story-review result before the parent agent presents that exact story for approval.
1. Approve a story.
1. Generate or refresh the checked-in packet for the active story.
1. Treat the story as worker-ready only after the parent reads `AGENTS.md`, the approved story, and the active packet, then runs `pnpm run packets:generate --story <stories/approved/...yaml> --activate` and `pnpm run packets:verify`.
1. Run `node --experimental-strip-types tools/spec_board_sync.ts --story <path> --dry-run --write-preview`, then perform live sync when ready.
1. Verify that the active story packet is present and current before worker assignment, reviewer assignment, or PR handoff.
1. Have a parent Codex agent read the story, packet, and `AGENTS.md`, stay mostly in orchestration mode, and remain the owner of story authority, scope decisions, ambiguity handling, and review handoff.
1. Spawn a worker subagent for the main implementation body of the story whenever delegation is available.
1. Use one implementation worker subagent per active story by default; if more than one worker is needed, split the story first unless write scopes are explicitly disjoint and still reviewable.
1. Allow the parent agent to do only small local glue work such as rebases, tiny integration edits, verification reruns, and PR administration.
1. Follow the subagent model routing policy.
1. Require tests and a short assumptions/blockers note.
1. Link the pull request back to the story issue.
1. Spawn a separate reviewer subagent plus human review before merge. If the user has explicitly approved a parent-story integration branch workflow for a decomposed story group, substory pull requests may merge into the parent integration branch after CI, packet verification, reviewer-subagent review, AI review records, and revision response records pass; human review is then required on the final parent pull request to `main`.
1. After merge, have the parent agent run the packet completion command to move
   the completed story to done history, remove the active packet, and clear or
   replace the active packet manifest before starting the next story. In a
   parent-story integration branch workflow, defer substory completion until the
   parent pull request lands on `main`, then complete all included substories in
   one verified packet-tool operation.

The parent agent must not present stories as approval-ready until the story-review findings are resolved, explicitly deferred, or recorded.
When worker subagents are unavailable, the parent may implement manually but must record an explicit implementation note that worker delegation was unavailable and parent implementation fallback was used.

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

Own only the specification and policy-document authority needed to unblock post-merge packet cleanup automation, plus the checked-in generated follow-up INF story candidates that record the reviewed implementation decomposition. Do not add GitHub Actions, parser code, branch deletion code, cleanup tokens, remote repository settings, packet lifecycle command behavior changes, or implementation workflow code.

## Scope

- add spec wording that ordinary protected-branch changes still require PR review and required checks
- add a narrow exception for one dedicated post-merge packet cleanup actor/workflow to bypass branch protection only for exact packet-completion cleanup commits
- require the cleanup actor/token to be unavailable to arbitrary workflows, human users, broad admin roles, and ordinary development pushes
- require cleanup automation to check out trusted main/default-branch code, not unreviewed PR branch code
- define cleanup metadata as a reviewed cleanup request that is never sufficient authority by itself
- require metadata binding to reviewed PR evidence, trusted checked-in approved story files, packet evidence, merge state, and parent/substory inclusion evidence before cleanup runs
- require fail-closed behavior for absent, malformed, stale, unbound, or ineligible cleanup metadata
- require direct cleanup commits only after packet completion output is proven exact and repo-approved verification passes
- state cleanup PRs must not be opened by this automation
- preserve manual fallback only for operational failure
- add branch deletion safety authority only after successful packet cleanup and only for associated merged, unprotected branches
- update branch-protection policy docs to name the required narrow bypass setting and state when remote settings must be applied outside the repo
- check in the reviewed generated INF-027 parent and child story candidates that split follow-up implementation into spec authority, docs, local validation, PR evidence binding, non-privileged preflight, privileged push, and safe branch cleanup stories

## Out of Scope

- adding the GitHub Actions workflow
- implementing metadata parser or PR evidence binding code
- implementing direct cleanup push code
- implementing branch deletion
- changing `packets:complete` or `packets:complete-many` semantics
- mutating remote GitHub branch-protection settings
- creating cleanup PRs
- broad branch-protection redesign
- allowing arbitrary bot pushes to main
- allowing arbitrary GitHub Actions workflows to bypass branch protection
- approving or implementing the generated INF-027 follow-up stories before SPEC-004 lands

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/23-repo-tooling-and-enforcement.md
- specs/27-spec-driven-story-generation-workflow.md
- specs/32-codex-agent-integration.md
- specs/section-index.json
- specs/spec-manifest.json
- specs/SPEC_VERSION.md
- specs/source-map.md
- specs/source-coverage-matrix.md
- .github/branch-protection.md
- tests/contracts/spec-authority-gates.test.mjs
- tests/github/review-workflow.test.mjs
- stories/generated/INF-027*.yaml
- stories/generated/SPEC-004-authorize-post-merge-packet-cleanup-bypass.yaml
- stories/approved/SPEC-004-authorize-post-merge-packet-cleanup-bypass.yaml
- agent-packets/SPEC-004.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate the packet before implementation
- run `corepack pnpm run packets:verify` before implementation and review handoff
- stay within allowed_touch_points
- parent agent may implement this parent-owned authority edit directly
- open the PR before implementation-review
- run the implementation-review gate after the PR is opened
- do not add workflow code, parser code, branch cleanup code, cleanup credentials, or remote branch-protection changes in this SPEC story
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- update `tests/contracts/spec-authority-gates.test.mjs` to require the cleanup bypass and metadata binding authority wording
- update `tests/github/review-workflow.test.mjs` to require branch-protection documentation for the exact cleanup actor/workflow and ordinary PR gate preservation
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

- specs explicitly preserve human review and required checks for ordinary protected-branch changes
- specs explicitly authorize only a dedicated cleanup actor/workflow to bypass branch protection for exact post-merge packet cleanup output
- specs explicitly prohibit using the bypass for arbitrary workflow, human, admin, implementation, docs, tooling, or development pushes
- specs require trusted main/default-branch checkout before cleanup logic runs
- specs define cleanup metadata as a reviewed request and require binding to reviewed PR evidence and trusted story/packet state before cleanup is eligible
- specs require fail-closed behavior for absent, malformed, stale, unbound, or ineligible metadata
- specs require verification before the direct cleanup push
- specs explicitly say cleanup PRs are not created
- specs and branch-protection docs preserve manual fallback only for operational failure
- specs and branch-protection docs allow safe branch deletion only after packet cleanup succeeds and only for associated merged, unprotected branches
- contract/spec authority tests pin the cleanup bypass, metadata binding, no-cleanup-PR, and branch deletion safety wording
- generated spec metadata is updated
- generated INF-027 follow-up story candidates validate and remain generated, not approved

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
