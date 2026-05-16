<!-- agent-packet:story-id INF-055A -->
<!-- agent-packet:story-path stories/approved/INF-055A-enforce-distinct-story-review-assignments.yaml -->
<!-- agent-packet:story-sha256 7c2a9abd0549dc4a87e6674699d11a407e785888d372784df548988d8ac57468 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-055A
Epic ID: INF-055
Title: Enforce distinct per-story approval review assignments
Type: tooling
Area: docs
Primary Concern: docs

## Why

Close the Story Approval Review Gate loophole by requiring a distinct story-review assignment and artifact for each parent and child story, and align story-review model routing to gpt-5.4 high.

## Authoritative Spec References

- 24-story-schema.s016 (`spec_refs`)
- 24-story-schema.s025 (Story sizing rules)
- 24-story-schema.s031 (`story_boundary`)
- 24-story-schema.s032 (`allowed_touch_points`)
- 27-spec-driven-story-generation-workflow.s008 (Approval rules)
- 27-spec-driven-story-generation-workflow.s009 (Agent packet generation)
- 27-spec-driven-story-generation-workflow.s015 (Recommended completion checks for story-driven implementation)
- 27-spec-driven-story-generation-workflow.s017 (Story Approval Review Gate)
- 32-codex-agent-integration.s008 (Recommended execution flow)
- 32-codex-agent-integration.s010 (Review flow)
- 32-codex-agent-integration.s013 (Merge gate recommendation)
- 32-codex-agent-integration.s014 (Subagent model routing)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 24-story-schema.s016 (`spec_refs`)

List of exact spec section references that authorize the story. These references are mandatory. In v6, `spec_refs` should use stable `SECTION_REF` identifiers such as `07-match-server-protocol.s010 (Timers)` instead of renderer-specific heading anchors. The story must not ask the agent to invent uncited behavior.

### 24-story-schema.s025 (Story sizing rules)

Approved stories should usually fit within a single reviewable pull request. The primary sizing rule is concern boundary, not raw diff size. Broad gameplay or platform capabilities should become epics. The approved stories inside an epic should be sliced by one primary concern at a time.

A story is too large if it:

- combines multiple primary concerns such as contract plus rules, rules plus protocol, or protocol plus UI in one assignment,
- changes multiple systems with different review concerns,
- requires the agent to choose architecture rather than implement it,
- cannot state acceptance criteria in a few bullets,
- cannot be validated by a targeted set of tests,
- cannot be reverted independently without backing out unrelated work,
- needs repeated "and also" scope clauses to explain what it does.

Warning signals may still justify a split, but they are secondary to concern boundaries:

- unusually large diffs,
- creation or expansion of large multi-purpose files,
- acceptance criteria that read like an end-to-end milestone instead of one reviewable concern.

Tests, fixtures, snapshots, and docs that directly prove the same concern do not count as a second concern by themselves.

### 24-story-schema.s031 (`story_boundary`)

One or two sentences describing what the story owns and where it must stop. This field exists because `non_scope` alone often becomes a loose list; the boundary statement should make the intended stopping point obvious to authors, implementers, and reviewers.

### 24-story-schema.s032 (`allowed_touch_points`)

List of packages, directories, modules, or other implementation surfaces the story is expected to modify. This is both a review aid and a future automation hook for detecting scope creep between the approved story and the resulting patch.

### 27-spec-driven-story-generation-workflow.s008 (Approval rules)

A story may move from `generated` to `approved` only if:

- the Story Approval Review Gate has run and material findings are fixed, explicitly deferred, or recorded,
- for parent story sets, approval cannot proceed unless the parent story and every child story have separate story-review evidence,
- required schema fields are present,
- spec references are valid,
- the epic/story decomposition is coherent,
- scope and non-scope are explicit,
- `primary_concern` is singular,
- `story_boundary` makes the stop point obvious,
- `allowed_touch_points` are narrow enough to review,
- required tests exist,
- dependencies are reasonable,
- ambiguity policy is acceptable for the risk category.

### 27-spec-driven-story-generation-workflow.s009 (Agent packet generation)

Once a story is selected to become active, generate or refresh a checked-in packet using [`26-agent-packet-template.md`](26-agent-packet-template.md).

Packet generation should gather:

- the approved story,
- the approved story's `primary_concern`, `story_boundary`, and `allowed_touch_points`,
- relevant spec excerpts,
- applicable repo rules,
- applicable architecture/code constraints,
- any directly related contract snippets needed for the task.

The packet should be minimal but sufficient. Overloading agents with the full spec is discouraged unless the task genuinely requires it. If packet construction reveals that one assignment still spans multiple concerns, return the story to normalization instead of padding the packet.

Approved stories may remain packetless while they are dormant backlog items. Once a story becomes active for implementation, reviewer assignment, or PR handoff, the repo should require a current checked-in packet and fail verification when that packet is missing or stale relative to the approved story.

For implementation worker handoff, treat a story as worker-ready only after the parent has read `AGENTS.md`, the approved story, and the current active packet, then run `pnpm run packets:generate --story <stories/approved/...yaml> --activate` plus `pnpm run packets:verify` successfully.

The active-story manifest should represent the current implementation or review handoff target only. A manifest with no active story is valid between stories, but a manifest with multiple active stories should fail verification because it makes ownership and review scope ambiguous.

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

### 27-spec-driven-story-generation-workflow.s017 (Story Approval Review Gate)

Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.

Story Approval Review Gate: before any parent story set is approved, packetized, activated, or handed to implementation, there must be one story-review artifact for the parent story and one story-review artifact for every child story. Parent story-review does not satisfy child story-review. Child story-review does not satisfy sibling story-review. Each required row must have a distinct story-review assignment identity and a distinct durable artifact identity for that row. One story-review assignment, one reviewer run, one matrix, or one durable artifact covering multiple stories satisfies at most one required row. Batch story-review can be supplemental context only and cannot be the approval-gate evidence for multiple rows. If any row is missing, pending, unknown, or not reconstructable from durable evidence: STOP.

Required behavior:

- approval-ready means the parent story and every child story have usable story-review evidence,
- a parent with exactly one child is valid and still uses the parent/substory flow,
- every parent story and every substory must be reviewed; parent-level review does not satisfy child-story review, and one child-story review does not satisfy any sibling child,
- use a story-review agent separate from any implementation worker or implementation patch reviewer,
- story-review agent uses gpt-5.4 with high reasoning,
- story-review findings must be fixed, explicitly deferred, or recorded before presentation,
- do not present a story as approval-ready when no usable story-review agent run exists; present it as unreviewed and blocked on story review instead,
- story-review agents evaluate story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy,
- story-review agents do not review implementation patches; implementation patch review remains a separate gate.

### 32-codex-agent-integration.s008 (Recommended execution flow)

1. Story Approval Review Gate: before any parent story set is approved, packetized, activated, or handed to implementation, there must be one story-review artifact for the parent story and one story-review artifact for every child story. Parent story-review does not satisfy child story-review. Child story-review does not satisfy sibling story-review. Each required row must have a distinct story-review assignment identity and a distinct durable artifact identity for that row. One story-review assignment, one reviewer run, one matrix, or one durable artifact covering multiple stories satisfies at most one required row. Batch story-review can be supplemental context only and cannot be the approval-gate evidence for multiple rows. If any row is missing, pending, unknown, or not reconstructable from durable evidence: STOP.
1. Before approving a generated or normalized parent story set, run story-review subagents for the parent story and every child story, then resolve, explicitly defer, or record their findings. Approval cannot proceed unless the parent story and every child story have separate story-review evidence.
1. Approval-ready means the parent story and every child story have usable story-review evidence.
1. A parent with exactly one child is valid and still uses the parent/substory flow.
1. Parent-level review does not satisfy child-story review, and one child-story review does not satisfy any sibling child.
1. Approve a parent story set only after the Story Approval Review Gate is satisfied.
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

### 32-codex-agent-integration.s014 (Subagent model routing)

Use the complete role routing table:

| Role                 | Default model   | Reasoning | Escalation      |
| -------------------- | --------------- | --------- | --------------- |
| Session Orchestrator | `gpt-5.5`       | `high`    | none            |
| story-review         | `gpt-5.4`       | `high`    | none            |
| implementation       | `gpt-5.3-codex` | `medium`  | none by default |
| code-review          | `gpt-5.4`       | `high`    | none            |

Code-review agents must not silently default to `gpt-5.5` with `high` reasoning.

The parent/orchestrator model is gpt-5.5.
Story-review agent model is gpt-5.4 with high reasoning.
Reviewer subagent model is gpt-5.4 with high reasoning.
Implementation worker subagents default to gpt-5.3-codex with medium reasoning.

Recorded rationale for any model-routing deviation is required in the pull-request review trail and implementation note.
Any model-routing deviation must be recorded in the pull-request review trail and implementation note.

Documentation-only approved stories still require implementation-worker ownership unless the approved story explicitly authorizes parent ownership. Parent direct edits are limited to small out-of-band orchestration/metadata/template/reviewer-response corrections outside an approved story implementation body. Parent-owned direct edits still require separate reviewer subagent review, tests when applicable, and full verification before PR handoff.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only workflow authority wording, PR template evidence wording, and focused workflow tests for the Story Approval Review Gate assignment identity and story-review routing. Do not change runtime/product behavior, cleanup automation, packet lifecycle mechanics, story schema, implementation-worker routing, or code-review routing.

## Scope

- update the Story Approval Review Gate invariant so parent story sets require one distinct story-review assignment and one distinct durable artifact per story
- define that a single story-review assignment, one reviewer run, one matrix, or one artifact covering multiple stories satisfies at most one required story-review row
- require the parent story row and every child story row to have unique assignment/artifact identity before approval, packetization, activation, implementation handoff, and parent PR handoff
- require the parent/substory matrix to include assignment identity and artifact identity fields that are unique per story row
- clarify that batch review may be supplemental context but is not the approval gate evidence for more than one story
- align story-review role routing to `gpt-5.4` with `high` reasoning in workflow docs and specs
- update the PR template so parent and child story-review evidence asks for distinct assignment and artifact references
- update focused workflow tests so the gate fails if distinct assignment/artifact wording disappears or if model routing regresses to gpt-5.5 high for story-review

## Out of Scope

- runtime, gameplay, engine, card, server, client, replay, database, UI, or product behavior
- cleanup metadata parser behavior or post-merge cleanup automation
- story schema changes or new mutable story-review status files
- implementation-worker or code-review model-routing changes
- packet lifecycle tooling mechanics beyond approval-gate wording and packet evidence fields
- broad workflow rewrites outside Story Approval Review Gate assignment identity and story-review routing

## Allowed Touch Points

<!-- prettier-ignore -->
- AGENTS.md
- docs/workflow/story-execution.md
- docs/workflow/parent-integration-branches.md
- docs/workflow/review-gate.md
- specs/27-spec-driven-story-generation-workflow.md
- specs/32-codex-agent-integration.md
- .github/pull_request_template.md
- tests/github/review-workflow.test.mjs
- specs/section-index.json
- stories/generated/INF-055A-enforce-distinct-story-review-assignments.yaml
- stories/approved/INF-055A-enforce-distinct-story-review-assignments.yaml
- agent-packets/INF-055A.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- INF-055 parent and INF-055A child story reviews must be separate assignments using `gpt-5.4` with `high` reasoning
- use the normal child packet, implementation-worker, code-review, PR, AI review, revision response, and human-review workflow after story approval
- implementation handoff must include explicit file ownership and test ownership
- keep wording concise and chronological
- do not broaden into unrelated workflow cleanup
- use corepack pnpm for repo commands
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

- corepack pnpm run specs:generate-metadata
- corepack pnpm run specs:verify-metadata
- corepack pnpm exec vitest run tests/github/review-workflow.test.mjs
- corepack pnpm run packets:verify
- corepack pnpm verify

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- AGENTS.md and workflow docs say the Story Approval Review Gate requires distinct story-review assignment identity and distinct artifact identity for the parent and every child story
- docs clearly say one story-review assignment, one reviewer run, one matrix, or one artifact covering multiple stories satisfies at most one required parent/child story-review row
- docs clearly say batch story-review can be supplemental context but cannot satisfy the approval gate for multiple stories
- parent/substory matrix guidance requires unique assignment and artifact identity per story row
- parent-integration workflow requires distinct per-story story-review assignment/artifact evidence before child activation and final parent PR handoff
- review-gate guidance says PR review, AI review, implementation code-review, full-story integration review, human review, and batched story-review do not substitute for distinct per-story Story Approval Review Gate assignments
- specs 27 and 32 align with the distinct assignment/artifact rule
- story-review routing is documented as `gpt-5.4` with `high` reasoning
- PR template asks for parent and child story-review assignment/artifact references explicitly
- tests fail if wording allows one story-review assignment/artifact to satisfy multiple parent/child rows
- tests fail if story-review model routing regresses to `gpt-5.5 high`

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
