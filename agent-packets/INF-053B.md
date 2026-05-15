<!-- agent-packet:story-id INF-053B -->
<!-- agent-packet:story-path stories/approved/INF-053B-require-human-review-and-story-link-wording.yaml -->
<!-- agent-packet:story-sha256 213121f0f7ef26dfac8b67fd8d0f707f1624582bd77f0b32e0a5142017d55e62 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-053B
Epic ID: INF-053
Title: Require human merge-gate review and fix story link wording
Type: refactor
Area: docs
Primary Concern: docs

## Why

Make protected/default-branch human review mandatory before merge and replace stale issue-link wording with approved-story-file linkage plus synced issue linkage when a synced issue exists.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
- 31-github-board-and-story-ops.s002 (Core rule)
- 31-github-board-and-story-ops.s004 (Story-to-GitHub field mapping)
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

Exact packet-completion cleanup may use cleanup-scoped lifecycle verification
instead of full repo verification before the direct cleanup push. Cleanup-scoped
lifecycle verification must prove metadata binding, packet-completion output,
story lifecycle state, active packet state, and committed story metadata remain
valid. Normal main-branch CI remains the broad post-cleanup safety net after
the cleanup commit is pushed. Cleanup that includes any manual edit beyond
packet-completion output still requires full repo verification and the normal
reviewer-subagent path before push or merge.

### 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)

A story should not be marked done unless:

- code behavior matches the cited spec,
- required tests are present and pass,
- repo verification passes,
- the patch stays within the approved story boundary and allowed touch points or the story is updated and re-approved first,
- no prohibited scope creep is introduced,
- any new ambiguity is surfaced explicitly.

After a story is marked done, it should not remain under `stories/approved/`, should not retain an active packet, and should not remain listed in `agent-packets/active.json`. The parent agent owns this cleanup because story state and packet authority are orchestration concerns, not worker or reviewer subagent concerns. Repos should provide a single command for normal single-story completion and a multi-story command for parent-story integration cleanup so story movement, packet removal, and manifest cleanup cannot drift independently. Multi-story cleanup tooling must fail closed when manifest or packet evidence for any listed story is missing or stale.

For parent-story integration branches, substories may remain approved after their reviewed substory commits land on the parent integration branch because the authoritative merge to `main` has not happened yet. This exception is valid only when the parent story set uses parent-level human review, every substory commit has CI, reviewer-subagent review evidence, AI review record, revision response record, and verification evidence bound to the exact commit, and the final parent PR receives full-story integration review plus human review before merge to `main`.

During that parent-branch window, `agent-packets/active.json` remains a single-story handoff pointer for the currently active or most recently active substory packet. It should not be read as the inventory of unfinished substories. Substories merged only into the parent integration branch stay approved and keep their packet files until the parent PR lands on `main`, even when they no longer appear in `active.json`.

Before human review is requested on a parent PR, the PR body or a handoff comment should be updated from future-tense review language to completed-gate evidence: included substory story path + commit SHA + AI review record + revision response + verification evidence, full-story AI review record, revision response, CI result, repo verification result, remaining human-review requirement, and the post-merge `packets:complete-many` cleanup plan.

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

### 31-github-board-and-story-ops.s002 (Core rule)

The approved story file remains the authoritative delivery artifact below the specification. A GitHub issue or project card is a synchronized projection of that story, not a replacement authority.

The reference repo workflow uses `tools/spec_board_sync.ts` to produce or update that projection and stores sync metadata under `stories/.sync/`.

If the board card, issue body, labels, or project fields drift from the approved story file, the approved story file wins and the board item must be corrected by rerunning sync or editing the story first.

### 31-github-board-and-story-ops.s004 (Story-to-GitHub field mapping)

| Story field            | GitHub destination                             | Notes                                                                |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `id`                   | issue title prefix and `Story ID` field        | Example: `[ENG-012] Implement mulligan waiting-state clock behavior` |
| `epic_id`              | parent issue link and optional `Epic ID` field | Use the same value across all stories in one capability thread       |
| `title`                | issue title/body                               | Keep title identical to story                                        |
| `summary`              | issue body                                     | Keep first paragraph short                                           |
| `type`                 | label and optional `Type` field                | Example labels: `type:implementation`, `type:ambiguity`              |
| `area`                 | label and optional `Area` field                | Example labels: `area:engine`, `area:server`                         |
| `primary_concern`      | label and optional `Primary Concern` field     | Example labels: `concern:rules`, `concern:protocol`                  |
| `priority`             | single-select project field or label           | Prefer a project field when available                                |
| `status`               | project `Status` field                         | Source-of-truth for execution state on board                         |
| `story_boundary`       | dedicated issue section                        | Keep the stopping point visible to implementers and reviewers        |
| `spec_refs`            | dedicated issue section                        | Preserve stable `SECTION_REF` citations                              |
| `allowed_touch_points` | dedicated issue section and sync metadata      | Future automation hook for story-to-PR drift detection               |
| `dependencies`         | issue dependencies and/or body section         | Prefer native issue dependencies where available                     |
| `acceptance_criteria`  | markdown checklist                             | Keep each criterion individually reviewable                          |
| `required_tests`       | body section and review checklist              | Required for implementation stories                                  |
| `ambiguity_policy`     | body section and agent packet                  | Must survive export unchanged                                        |

### 32-codex-agent-integration.s008 (Recommended execution flow)

1. Before approving a generated or normalized parent story set, run story-review subagents for the parent story and every child story, then resolve, explicitly defer, or record their findings.
1. Approval-ready means the parent story and every child story have usable story-review evidence.
1. A parent with exactly one child is valid and still uses the parent/substory flow.
1. Parent-level review does not satisfy child-story review, and one child-story review does not satisfy any sibling child.
1. Approve a parent story set.
1. Generate or refresh the checked-in packet for the active story.
1. Treat the story as worker-ready only after the parent reads `AGENTS.md`, the approved story, and the active packet, then runs `pnpm run packets:generate --story <stories/approved/...yaml> --activate` and `pnpm run packets:verify`.
1. Run `node --experimental-strip-types tools/spec_board_sync.ts --story <path> --dry-run --write-preview`, then perform live sync when ready.
1. Verify that the active story packet is present and current before worker assignment, reviewer assignment, or PR handoff.
1. Have a parent Codex agent read the story, packet, and `AGENTS.md`, stay mostly in orchestration mode, and remain the owner of story authority, scope decisions, ambiguity handling, and review handoff.
1. Delegate every approved story implementation body to an implementation worker subagent.
1. Use one implementation worker subagent per active story by default; if more than one worker is needed, split the story first unless write scopes are explicitly disjoint and still reviewable.
1. Allow the parent agent to do only tiny orchestration glue such as rebases, tiny integration edits, verification reruns, PR administration, packet/metadata corrections, and narrowly scoped reviewer-response integration touchups.
1. Follow the subagent model routing policy.
1. Require tests and a short assumptions/blockers note.
1. Link the pull request to the approved story file and, when one exists, the synced issue.
1. Spawn a separate reviewer subagent plus human review before merge. In the parent-story integration branch workflow, reviewed substory commits may land on the parent integration branch after CI, packet verification, reviewer-subagent review evidence, AI review records, revision response records, and verification evidence are bound to the exact commit; human review is then required on the final parent pull request to `main`.
1. After merge, have the parent agent run the packet completion command to move
   the completed story to done history, remove the active packet, and clear or
   replace the active packet manifest before starting the next story. In a
   parent-story integration branch workflow, defer substory completion until the
   parent pull request lands on `main`, then complete all included substories in
   one verified packet-tool operation.

The parent agent must not present stories as approval-ready until the story-review findings are resolved, explicitly deferred, or recorded.
The parent agent must not author an approved story implementation body, including when worker subagent surfaces are unavailable. Escalate and block instead of using parent implementation fallback.

### 32-codex-agent-integration.s010 (Review flow)

Use a separate reviewer subagent as a fast first-pass reviewer for scope creep, missing tests, and obvious contract drift, but do not treat a passing agent review as authoritative proof of correctness. Human review is required before protected or default-branch PRs merge. Gameplay correctness, policy-sensitive areas, and architecture-sensitive changes are higher-risk review focus, not the only cases needing human review.

Story-review agents are separate from implementation reviewer subagents. Story-review agents review generated or normalized story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy before human story approval. Implementation reviewer subagents review patches after implementation.

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
only for associated merged, unprotected story or substory branches.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only human merge-gate and story-link wording in review guidance, Codex integration spec, PR template, and workflow tests. Do not change cleanup metadata syntax, branch protection settings, or product behavior.

## Scope

- state that protected/default-branch PRs require human review before merge
- clarify that gameplay, policy-sensitive, and architecture-sensitive changes are higher-risk review focus, not the only human-review cases
- replace stale pull-request link wording with approved story file linkage and synced issue linkage when an issue exists
- update workflow tests for mandatory human review and story-link wording

## Out of Scope

- changing GitHub branch protection automation
- changing cleanup metadata parser behavior
- removing AI review or reviewer-subagent review

## Allowed Touch Points

<!-- prettier-ignore -->
- docs/workflow/review-gate.md
- specs/32-codex-agent-integration.md
- .github/pull_request_template.md
- tests/github/review-workflow.test.mjs

## Constraints

- stay inside the listed touch points
- do not weaken reviewer-subagent review, cleanup metadata validation, or human review
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
- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm verify`, or record why unavailable

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- review guidance requires human review before protected/default-branch merge
- higher-risk categories are described as review focus rather than the only human-review cases
- Codex integration spec says PRs link the approved story file and synced issue when one exists
- PR template and tests align with the new story-link wording

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
