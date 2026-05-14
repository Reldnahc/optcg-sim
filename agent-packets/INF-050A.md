<!-- agent-packet:story-id INF-050A -->
<!-- agent-packet:story-path stories/approved/INF-050A-reject-single-mode-parent-cleanup-mismatch.yaml -->
<!-- agent-packet:story-sha256 3e89b2b167bf7a7086e19e0ecd119d7694ed4e6d4b4d1ee18816cd3c2bbcea13 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-050A
Epic ID: INF-050
Title: Reject single-mode cleanup when parent stories changed
Type: tooling
Area: infra
Primary Concern: tooling

## Why

Prevent single-mode post-merge cleanup metadata from passing when the reviewed PR also changed an approved parent story outside the listed cleanup story, because that shape can complete only the child story and leave the parent stale in `stories/approved/`.

## Authoritative Spec References

- 24-story-schema.s004 (Required fields)
- 24-story-schema.s016 (`spec_refs`)
- 24-story-schema.s025 (Story sizing rules)
- 27-spec-driven-story-generation-workflow.s002 (Workflow summary)
- 27-spec-driven-story-generation-workflow.s008 (Approval rules)
- 27-spec-driven-story-generation-workflow.s009 (Agent packet generation)
- 27-spec-driven-story-generation-workflow.s012 (Minimum viable process)
- 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)
- 32-codex-agent-integration.s013 (Merge gate recommendation)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 24-story-schema.s004 (Required fields)

Every approved story must define all of the following fields:

- `spec_version`
- `spec_package_name`
- `story_schema_version`
- `id`
- `epic_id`
- `title`
- `type`
- `area`
- `primary_concern`
- `priority`
- `status`
- `summary`
- `story_boundary`
- `allowed_touch_points`
- `spec_refs`
- `scope`
- `non_scope`
- `dependencies`
- `acceptance_criteria`
- `required_tests`
- `repo_rules`
- `ambiguity_policy`

Optional fields may exist, but approved stories must not omit required fields.
Approved stories with `area: cards` and `type: implementation` must also define
`card_source_integrity` and `engine_capability_preflight` before approval.

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

### 27-spec-driven-story-generation-workflow.s002 (Workflow summary)

The required planning flow is:

1. specification documents,
2. candidate story generation,
3. story normalization,
4. pre-presentation story-review gate,
5. story approval,
6. agent packet construction,
7. implementation or review agent execution,
8. validation against the approved story and cited spec.

The repo may automate some or all of these steps, but it must preserve the same authority order.

### 27-spec-driven-story-generation-workflow.s008 (Approval rules)

A story may move from `generated` to `approved` only if:

- the pre-presentation story-review gate has run and material findings are fixed, explicitly deferred, or recorded,
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

### 27-spec-driven-story-generation-workflow.s012 (Minimum viable process)

1. use an agent or script to generate candidate epics and concern-sliced stories from spec sections,
2. run the pre-presentation story-review gate using `corepack pnpm run stories:review-plan -- --parent <stories/generated/...yaml>` or `corepack pnpm run stories:review-plan -- --parent <stories/approved/...yaml>`,
3. review and approve the decomposition and the stories,
4. export approved stories to GitHub issues or draft issues as needed using `tools/spec_board_sync.ts`,
5. build or refresh the checked-in packet for the active story,
6. assign the active-story packet to agents only after worker-ready checks pass,
7. implement or review the story from the packet,
8. validate the resulting patch against the story and spec,
9. after merge to `main`, run the packet completion command to move the completed story to `stories/done/`, mark it `done`, remove its active packet, and clear or replace the active-story manifest before the next story starts. For an explicitly approved parent-story integration branch workflow, reviewed substory commits may land on the parent integration branch first; defer completion until the parent PR lands on `main`, then complete all included substories with the multi-story packet completion command.

### 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)

Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.

Required behavior:

- before story-review assignment, run `corepack pnpm run stories:review-plan -- --parent <stories/generated/...yaml>` or `corepack pnpm run stories:review-plan -- --parent <stories/approved/...yaml>`,
- do not manually choose among single-story, set-level, per-story, or parent/substory story-review paths,
- spawn exactly the review assignments returned by the tool,
- approval-ready means the parent story set has a usable tool-selected story-review result,
- a parent with exactly one child is valid and still uses the parent/substory flow,
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
future-tense review plan: included substory story path + commit SHA + AI review record + revision response + verification evidence, full-story reviewer-subagent
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

Own only the cleanup metadata scope guard, post-merge cleanup planning fail-closed check, focused contract coverage for the PR #351 failure shape, narrow workflow wording, and the known ENG-053 stale parent closeout. Do not change cleanup metadata syntax, parent-mode cleanup semantics, packet completion output semantics, review gates, branch deletion, or product code.

## Scope

- add a focused regression test that reproduces the PR #351 cleanup failure shape: single-mode metadata listing the child story while reviewed changed files also include a non-listed approved parent story path
- update cleanup handoff validation so single-mode metadata rejects changed approved parent story paths outside the listed cleanup story set
- update trusted post-merge cleanup planning so the same evidence shape fails closed if pre-merge validation did not block it
- preserve valid single-story cleanup when no parent story path changed
- preserve valid parent-mode cleanup with exactly one child and its parent binding evidence
- update narrow workflow/template wording so parent/substory PRs with one child are directed to parent-mode cleanup metadata, not single-mode cleanup metadata
- close the known stale ENG-053 parent story by moving it from approved to done and setting status to done

## Out of Scope

- changing cleanup metadata parser syntax
- changing cleanup metadata guard trigger behavior beyond this scope-binding rejection
- changing human review, AI review, revision response, or merge gate requirements
- changing packet completion command output semantics
- changing branch deletion policy
- changing story schema validation beyond the stale parent lifecycle being closed
- changing gameplay, engine, cards, server, client, replay, database, security, or UI behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- .github/pull_request_template.md
- AGENTS.md
- docs/workflow/story-execution.md
- docs/workflow/review-gate.md
- tools/post-merge-cleanup/metadata.ts
- tools/post-merge-cleanup/validator.ts
- tests/contracts/post-merge-cleanup-contract.test.mjs
- tests/contracts/post-merge-cleanup-parent-contract.test.mjs
- tests/contracts/post-merge-cleanup-preflight-contract.test.mjs
- stories/generated/INF-050A-reject-single-mode-parent-cleanup-mismatch.yaml
- stories/approved/INF-050A-reject-single-mode-parent-cleanup-mismatch.yaml
- stories/approved/ENG-053-split-effect-runtime-primitives-parent.yaml
- stories/done/ENG-053-split-effect-runtime-primitives-parent.yaml
- agent-packets/INF-050A.md
- agent-packets/active.json

## Constraints

- use TDD and verify the new single-mode parent cleanup tests fail for the current implementation before editing cleanup code
- keep cleanup metadata a reviewed request bound to reviewed PR evidence
- do not weaken parent cleanup mismatch, stale-evidence, packetized-parent, already-done-parent, or missing-human-review failures
- keep the patch limited to cleanup validator behavior, focused tests, narrow workflow wording, and ENG-053 parent lifecycle closeout
- use `corepack pnpm`, not plain `pnpm`, when running repo commands in this environment
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

- add failing regressions in `tests/contracts/post-merge-cleanup-preflight-contract.test.mjs` and `tests/contracts/post-merge-cleanup-contract.test.mjs` before changing cleanup code
- focused `corepack pnpm exec vitest run tests/contracts/post-merge-cleanup-preflight-contract.test.mjs tests/contracts/post-merge-cleanup-contract.test.mjs tests/contracts/post-merge-cleanup-parent-contract.test.mjs`
- `corepack pnpm run packets:verify`
- `corepack pnpm run stories:validate`
- full `corepack pnpm run verify` if feasible

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- cleanup metadata handoff preflight rejects single-mode cleanup when changed files include an approved parent story path that is not listed in cleanup metadata
- post-merge cleanup planning rejects the same single-mode parent-story mismatch before producing packet completion commands
- existing parent-mode cleanup tests still pass, including the one-child parent case from INF-048
- existing single-story cleanup without changed parent story paths remains accepted
- the ENG-053 parent story no longer remains approved after its only child is done
- no cleanup metadata syntax, review gate, branch deletion, product runtime, DTO, hidden-info, replay, or protocol behavior changes are included

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
