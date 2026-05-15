<!-- agent-packet:story-id INF-053C -->
<!-- agent-packet:story-path stories/approved/INF-053C-reconcile-story-schema-prose-and-status.yaml -->
<!-- agent-packet:story-sha256 47c3a55f23be5822af69df858e812b81bb2f6e253f83d723782fce9419e1725b -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-053C
Epic ID: INF-053
Title: Reconcile story schema prose and lifecycle status
Type: tooling
Area: contracts
Primary Concern: contract

## Why

Reconcile story-schema prose, JSON schema values, committed story evidence, validator behavior, and `in_progress` lifecycle status semantics so automation and documentation no longer disagree.

## Authoritative Spec References

- 24-story-schema.s003 (Story categories)
- 24-story-schema.s014 (`status`)
- 24-story-schema.s026 (Approval rule)
- 24-story-schema.s027 (Machine-readable validation contract)
- 27-spec-driven-story-generation-workflow.s008 (Approval rules)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 24-story-schema.s003 (Story categories)

Each story should declare exactly one primary `type`:

- `design`
- `implementation`
- `specification`
- `verification`
- `refactor`
- `tooling`
- `ambiguity`

Each story should also declare one primary `area`:

- `contracts`
- `engine`
- `cards`
- `server`
- `client`
- `replay`
- `database`
- `infra`
- `docs`
- `security`
- `types`

`specification` is a canonical extension of `type` for stories that update
specification authority rather than implementation artifacts. `types` is retained only as a legacy compatibility `area`; new contract/schema stories should use
`area: contracts` unless a later spec section explicitly changes that routing
rule. These values may be extended later, but the meaning must remain stable for
automation.

### 24-story-schema.s014 (`status`)

Expected committed story-file values:

- `generated`
- `approved`
- `blocked`
- `done`
- `replaced`

`in_progress` is reserved for a future lifecycle mechanism and is not valid in
committed story YAML. No current workflow role sets `status: in_progress`;
active implementation or review handoff state is represented by
`agent-packets/active.json` plus the checked-in active packet while the story
file remains in its approved, blocked, done, generated, or replaced lifecycle
state. Until a future spec defines the setter and transition rules, the JSON
Schema must reject `in_progress`.

### 24-story-schema.s026 (Approval rule)

A generated story is not assignment-ready until it is either:

- manually approved by the project owner, or
- normalized and approved by an explicit review workflow that verifies schema completeness and valid spec references.

Approval should also verify that:

- `epic_id` is present and points at the parent gameplay or platform capability,
- `primary_concern` is singular and coherent,
- `story_boundary` makes the stop point obvious,
- `allowed_touch_points` are narrow enough to review,
- the story does not mix unrelated review concerns simply because they belong to one feature thread.

Only approved stories should be turned into agent packets.

### 24-story-schema.s027 (Machine-readable validation contract)

The machine-readable validation contract for approved story files is [`contracts/story.schema.json`](contracts/story.schema.json). Markdown guidance in this file is explanatory; the JSON Schema is the canonical validation artifact for automation.

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

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only story schema authority and validation behavior for schema-enumerated story values and `in_progress` lifecycle semantics. Do not rewrite unrelated story tooling or migrate existing story data except where required by the chosen schema decision.

## Scope

- compare markdown prose with `contracts/story.schema.json` for `type`, `area`, `primary_concern`, and `status`
- decide from repo evidence whether schema-only values such as `specification`, `types`, and `visibility` are canonical, legacy compatibility, or removable
- align prose, JSON schema, validator behavior, and contract tests with the decision
- define or reserve/disable `status: in_progress`, including who may set it and how it interacts with active packets

## Out of Scope

- broad story lifecycle tooling redesign
- changing packet generation or completion behavior beyond validation needed for this schema contract
- changing gameplay, engine, card, server, client, replay, persistence, security, or UI behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/24-story-schema.md
- contracts/story.schema.json
- tools/validate-stories.ts
- tests/contracts/**

## Constraints

- keep the schema strict and machine-readable
- do not weaken validation to hide contradictions
- fail closed on ambiguity about lifecycle state authority
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

- run `corepack pnpm run stories:validate`
- run `corepack pnpm run contracts`
- run `corepack pnpm verify`, or record why unavailable

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- story-schema markdown no longer omits schema-allowed canonical or compatibility values
- JSON schema and prose agree on whether each extra value is canonical, legacy compatibility, or disallowed
- `in_progress` lifecycle status is explicitly defined, reserved, or disabled in both docs and validation behavior
- contract tests cover the selected schema/status behavior

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
