<!-- agent-packet:story-id INF-053D -->
<!-- agent-packet:story-path stories/approved/INF-053D-align-packet-role-and-planning-authority.yaml -->
<!-- agent-packet:story-sha256 9281646fd72500172d1cf35c6fb9fa3a2993575cfb4c5b18b03d56352487365e -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-053D
Epic ID: INF-053
Title: Align packet role wording and planning authority order
Type: refactor
Area: docs
Primary Concern: docs

## Why

Remove stale packet role wording and align planning authority prose with the current execution authority order so packet and story-generation specs do not imply obsolete roles or conflicting authority layers.

## Authoritative Spec References

- 26-agent-packet-template.s001 (Agent Packet Template)
- 26-agent-packet-template.s002 (Core rule)
- 26-agent-packet-template.s005 (Packet construction rules)
- 26-agent-packet-template.s007 (Recommended review-agent footer)
- 27-spec-driven-story-generation-workflow.s002 (Workflow summary)
- 27-spec-driven-story-generation-workflow.s003 (Authority order)
- 32-codex-agent-integration.s004 (Authority order for Codex tasks)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 26-agent-packet-template.s001 (Agent Packet Template)

This document defines the standard packet format used to assign one approved
story to an implementation, story-review, or code-review agent.

The purpose of a packet is to reduce interpretation overhead. Agents should not be expected to rediscover requirements from the entire specification when a constrained story already exists.

### 26-agent-packet-template.s002 (Core rule)

The packet is derived from the specification and approved story. It is not a new authority. If the packet conflicts with the cited specification, the specification wins.

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
- Cleanup-scoped lifecycle verification must prove metadata binding, packet completion output, story lifecycle state, active packet state, and committed story metadata remain valid,
- split the story before packet generation if the packet would otherwise need multiple unrelated concerns to be implemented together.

### 26-agent-packet-template.s007 (Recommended review-agent footer)

For story-review or code-review agents, add:

```text
Compare the implementation against the approved story and cited specification.
Flag uncited behavior, scope creep, missing tests, visibility leaks, determinism risks,
package-boundary violations, and changes outside the allowed touch points except direct
supporting tests, fixtures, snapshots, or docs for the same concern.
Do not treat passing tests as proof if the behavior contradicts the specification.
```

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

The repo may automate some or all of these steps, but it must preserve the
applicable authority order for each artifact and execution phase.

### 27-spec-driven-story-generation-workflow.s003 (Authority order)

For story planning, packet construction, and generated reports before an
execution handoff:

1. specification documents,
2. approved story,
3. agent packet,
4. generated summaries or reports.

For Codex or implementation execution, use the execution authority order from
`32-codex-agent-integration.s004` and `AGENTS.md`:

1. cited specification sections,
2. approved story file,
3. generated agent packet,
4. checked-in repo instructions in `AGENTS.md`,
5. linked workflow procedure documents under `docs/workflow/`,
6. local code reality,
7. proposed patch.

If a lower layer conflicts with a higher layer, the higher layer wins.

### 32-codex-agent-integration.s004 (Authority order for Codex tasks)

For Codex execution:

1. cited specification sections,
2. approved story file,
3. generated agent packet,
4. checked-in repo instructions in `AGENTS.md`,
5. linked workflow procedure documents under `docs/workflow/`,
6. local code reality,
7. proposed patch.

If a lower layer conflicts with a higher one, the higher layer wins.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only packet-role wording, planning authority-order wording, and focused spec authority tests. Do not change packet renderer behavior unless tests prove current output contradicts the clarified authority.

## Scope

- remove or map `verification agent` wording to the current assignable roles of story-review, implementation, and code-review
- scope the older short authority order in spec 27 to planning/report artifacts or align it with the current execution authority order
- update focused contract tests so obsolete role/authority wording cannot return silently

## Out of Scope

- changing role packet extraction behavior
- adding new assignable roles
- changing story approval or packet completion semantics

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/26-agent-packet-template.md
- specs/27-spec-driven-story-generation-workflow.md
- tests/contracts/spec-authority-gates.test.mjs

## Constraints

- stay inside the listed touch points
- do not introduce new role names
- preserve stable SECTION_REF citations
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

- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm run test:contracts`
- run `corepack pnpm verify`, or record why unavailable

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- spec 26 no longer names an obsolete assignable verification-agent role without mapping it to current role semantics
- spec 27 authority-order wording no longer conflicts with AGENTS/spec 32 execution authority
- contract tests cover role wording and authority-order consistency

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
