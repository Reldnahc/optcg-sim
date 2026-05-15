<!-- agent-packet:story-id INF-053A -->
<!-- agent-packet:story-path stories/approved/INF-053A-remove-stale-implementation-model-escalation.yaml -->
<!-- agent-packet:story-sha256 604fe20b6a12a5400a03ca941f0879cd47823d63518aa369d60e4f9b46fd0bdc -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-053A
Epic ID: INF-053
Title: Remove stale implementation model escalation language
Type: refactor
Area: docs
Primary Concern: docs

## Why

Remove stale workflow text that presents `gpt-5.5 medium` as a normal or recommended implementation-worker path when canonical routing defaults to `gpt-5.3-codex medium` with no escalation by default and recorded rationale for any deviation.

## Authoritative Spec References

- 24-story-schema.s025 (Story sizing rules)
- 24-story-schema.s031 (`story_boundary`)
- 24-story-schema.s032 (`allowed_touch_points`)
- 32-codex-agent-integration.s014 (Subagent model routing)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

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

Own only model-routing wording in branch-protection guidance, PR template placeholders, and the focused workflow test assertions. Do not change the canonical role table or any runtime behavior.

## Scope

- remove branch-protection wording that recommends `gpt-5.5 medium` for complex, risky, or integration-heavy implementation stories
- ensure the PR template does not present `gpt-5.5 medium` as a default selectable implementation-worker option
- keep deviation handling through recorded model-routing rationale
- update focused workflow tests to reject stale implementation escalation wording

## Out of Scope

- changing canonical role names, default models, or reasoning levels
- changing implementation-worker, code-review, story-review, or parent-orchestrator routing semantics
- changing GitHub workflow behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- .github/branch-protection.md
- .github/pull_request_template.md
- tests/github/review-workflow.test.mjs

## Constraints

- stay inside the listed touch points
- do not alter product/runtime behavior
- preserve the canonical role routing table
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

- branch-protection guidance no longer recommends `gpt-5.5 medium` as a normal implementation-worker escalation path
- PR template implementation-worker placeholder names only the canonical default worker routing
- tests fail if stale `gpt-5.5 medium` default-option wording returns

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
