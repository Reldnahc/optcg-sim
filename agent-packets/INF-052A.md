<!-- agent-packet:story-id INF-052A -->
<!-- agent-packet:story-path stories/approved/INF-052A-clarify-session-orchestrator-implementation-boundary.yaml -->
<!-- agent-packet:story-sha256 4e23cbbb6b3eece4890978ff57385dc7d700696606a488f3eda8411b48f718aa -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-052A
Epic ID: INF-052
Title: Clarify Session Orchestrator implementation boundary
Type: refactor
Area: docs
Primary Concern: docs

## Why

Update workflow authority so Session Orchestrators never author the main implementation body of an approved story, even as a fallback, while preserving their ability to make tiny orchestration, integration, and review-response edits between worker and reviewer handoffs.

## Authoritative Spec References

- 24-story-schema.s016 (`spec_refs`)
- 24-story-schema.s025 (Story sizing rules)
- 24-story-schema.s031 (`story_boundary`)
- 24-story-schema.s032 (`allowed_touch_points`)
- 27-spec-driven-story-generation-workflow.s008 (Approval rules)
- 27-spec-driven-story-generation-workflow.s009 (Agent packet generation)
- 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)
- 32-codex-agent-integration.s008 (Recommended execution flow)
- 32-codex-agent-integration.s010 (Review flow)
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

### 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)

Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready.

Required behavior:

- approval-ready means the parent story and every child story have usable story-review evidence,
- a parent with exactly one child is valid and still uses the parent/substory flow,
- every parent story and every substory must be reviewed; parent-level review does not satisfy child-story review, and one child-story review does not satisfy any sibling child,
- use a story-review agent separate from any implementation worker or implementation patch reviewer,
- story-review agent uses gpt-5.5 with high reasoning,
- story-review findings must be fixed, explicitly deferred, or recorded before presentation,
- do not present a story as approval-ready when no usable story-review agent run exists; present it as unreviewed and blocked on story review instead,
- story-review agents evaluate story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy,
- story-review agents do not review implementation patches; implementation patch review remains a separate gate.

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
1. Link the pull request back to the story issue.
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

Use a separate reviewer subagent as a fast first-pass reviewer for scope creep, missing tests, and obvious contract drift, but do not treat a passing agent review as authoritative proof of correctness. Human review still owns final acceptance for gameplay correctness and policy-sensitive areas.

Story-review agents are separate from implementation reviewer subagents. Story-review agents review generated or normalized story authority, decomposition, scope, non-scope, dependencies, allowed touch points, acceptance criteria, required tests, and ambiguity policy before human story approval. Implementation reviewer subagents review patches after implementation.

### 32-codex-agent-integration.s014 (Subagent model routing)

Use the complete role routing table:

| Role                 | Default model   | Reasoning | Escalation      |
| -------------------- | --------------- | --------- | --------------- |
| Session Orchestrator | `gpt-5.5`       | `high`    | none            |
| story-review         | `gpt-5.5`       | `high`    | none            |
| implementation       | `gpt-5.3-codex` | `medium`  | none by default |
| code-review          | `gpt-5.4`       | `high`    | none            |

Code-review agents must not silently default to `gpt-5.5` with `high` reasoning.

The parent/orchestrator model is gpt-5.5.
Story-review agent model is gpt-5.5 with high reasoning.
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

Own only Codex workflow authority, repo workflow docs, PR/review wording, and focused workflow tests that define the Session Orchestrator implementation boundary. Do not alter product/runtime behavior, packet lifecycle mechanics, cleanup metadata syntax, or role routing beyond this boundary.

## Scope

- update canonical Codex workflow authority so Session Orchestrators never implement approved story bodies directly
- remove or replace fallback wording that permits parent implementation when worker subagents are unavailable
- define allowed Session Orchestrator edits as tiny orchestration glue, PR administration, packet or metadata corrections, merge/rebase glue, verification reruns, and narrowly scoped reviewer-requested integration touchups
- require implementation workers to own story implementation code and tests
- preserve Session Orchestrator ownership of child activation, packet freshness, implementation assignment, review assignment, PR evidence, cleanup metadata validation, human-review handoff, merge readiness, and post-merge cleanup confirmation
- update review and PR wording so parent-owned authority edits remain reviewable but are not confused with story-body implementation
- add focused workflow tests that fail if docs or specs reintroduce parent implementation fallback or describe Session Orchestrators as story implementers

## Out of Scope

- changing gameplay, engine, card, server, client, replay, persistence, security, or UI behavior
- changing packet parser or packet renderer behavior unless a focused test proves current output contradicts the clarified boundary
- changing role model names or model routing except wording needed to describe the boundary
- removing implementation-worker or code-review roles
- weakening reviewer-subagent review, cleanup metadata validation, human review, or merge gates
- changing cleanup metadata parser syntax or post-merge packet completion behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- AGENTS.md
- docs/workflow/story-execution.md
- docs/workflow/review-gate.md
- docs/workflow/parent-integration-branches.md
- docs/workflow/reporting-and-github-sync.md
- docs/code-standard.md
- specs/32-codex-agent-integration.md
- specs/spec-manifest.json
- specs/section-index.json
- .github/pull_request_template.md
- .github/branch-protection.md
- .github/review-comments/ai-review.md
- .github/review-comments/ai-review-revision-response.md
- .github/review-comments/equivalent-human-review-fallback.md
- tests/github/review-workflow.test.mjs
- stories/generated/INF-052*.yaml
- stories/approved/INF-052*.yaml
- agent-packets/INF-052A.md
- agent-packets/active.json

## Constraints

- Session Orchestrator may create and activate the story and manage handoffs, but must delegate the story implementation body to an implementation worker
- implementation handoff must include explicit file ownership and test ownership
- code-review handoff must include role packet extraction output and current PR context
- do not broaden into unrelated workflow cleanup
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

- focused workflow documentation test covering Session Orchestrator no-story-implementation wording
- focused workflow documentation test rejecting parent implementation fallback wording
- focused PR/review wording test covering tiny parent-owned edits and worker-owned story implementation
- run `corepack pnpm exec vitest run tests/github/review-workflow.test.mjs`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run packets:generate --story stories/approved/INF-052A-clarify-session-orchestrator-implementation-boundary.yaml --activate`
- run `corepack pnpm run packets:verify`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- canonical spec and workflow docs state that Session Orchestrators must not author approved story implementation bodies
- no checked-in workflow authority says parent agents may manually implement a story when worker subagents are unavailable
- allowed Session Orchestrator edits are explicitly limited to tiny orchestration, integration, verification, PR, packet/metadata, and reviewer-response glue between handoffs
- implementation workers remain responsible for story implementation code and tests
- PR/review guidance still allows small parent-owned out-of-band orchestration/metadata/template/reviewer-response corrections with separate reviewer-subagent review, while documentation-only approved stories still require implementation-worker ownership unless the approved story explicitly authorizes parent ownership
- workflow tests cover the no-parent-story-implementation rule and the allowed tiny-edit boundary

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
