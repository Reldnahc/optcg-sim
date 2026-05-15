<!-- agent-packet:story-id INF-053G -->
<!-- agent-packet:story-path stories/approved/INF-053G-link-card-fixture-workflow-as-mandatory.yaml -->
<!-- agent-packet:story-sha256 84b22193ff96ecc611e36f97afdd68bba8f7ab4879f248d446bc365b97fe62f7 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-053G
Epic ID: INF-053
Title: Link CARD fixture workflow as mandatory for relevant stories
Type: refactor
Area: docs
Primary Concern: docs

## Why

Add the card fixture capture workflow to mandatory workflow entry points for CARD and card-fixture stories so agents read it when story scope touches real card fixture evidence, overlays, generated support, or source integrity.

## Authoritative Spec References

- 24-story-schema.s033 (`card_source_integrity`)
- 24-story-schema.s034 (`engine_capability_preflight`)
- 32-codex-agent-integration.s006 (Root AGENTS contract)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 24-story-schema.s033 (`card_source_integrity`)

Approved stories with `area: cards` and `type: implementation` use this field to
record real-card data provenance before enabling or changing card support. The
field should identify target card IDs, fixture capture or checked-in fixture
provenance, behavior-sensitive printed fields, required fixture assertions, and
whether a cards-produced manifest must be regenerated. If the story does not
enable or change real-card gameplay support, the field should explicitly say why
source integrity is not applicable. Generated drafts may omit it until approval
review, but approved CARD implementation stories must not.

### 24-story-schema.s034 (`engine_capability_preflight`)

Approved stories with `area: cards` and `type: implementation` use this field to
record the parsed effect shape and reusable runtime capability status before
card support starts. The field should list required engine capabilities, which
are already supported, which are missing, and any prerequisite ENG stories. If
the story is pure card-data infrastructure and does not implement or enable
gameplay behavior, the field should explicitly say why the capability preflight
is not applicable. Generated drafts may omit it until approval review, but
approved CARD implementation stories must not.

### 32-codex-agent-integration.s006 (Root AGENTS contract)

`AGENTS.md` should tell Codex:

- where the spec lives,
- how to find approved stories and packets,
- that section refs are the canonical citation keys,
- that gameplay, visibility, replay, fairness, and persistence ambiguity must fail closed,
- what verification commands to run before claiming completion,
- how to format assumptions, blockers, and implementation notes,
- that GitHub issue and board projection should run through `tools/spec_board_sync.ts` and write metadata to `stories/.sync/`.

The root `AGENTS.md` may stay concise when it links to checked-in workflow
procedure documents. The root file should prioritize the active-story checklist,
authority order, safety rules, and procedure links; detailed review, packet,
lifecycle, and parent-branch procedures may live in focused docs as long as the
root file names them and tests or reviewers preserve the required gates.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only mandatory workflow-entry-point docs and tests for card fixture workflow routing. Do not change fixture capture implementation, generated support behavior, or card data semantics.

## Scope

- add `docs/workflow/card-fixture-capture.md` to mandatory workflow guidance for relevant CARD/card-fixture stories
- state that agents must read it when a story touches fixture capture, CARD source integrity, generated support, overlays, or real-card fixture evidence
- update README and workflow tests to preserve the mandatory link

## Out of Scope

- changing fixture capture commands or fixtures
- changing cards package behavior
- changing engine capability preflight semantics

## Allowed Touch Points

<!-- prettier-ignore -->
- AGENTS.md
- README.md
- docs/workflow/story-execution.md
- tests/github/review-workflow.test.mjs

## Constraints

- stay inside the listed touch points
- do not alter real-card support evidence or generated support behavior
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

- AGENTS/workflow docs identify card fixture capture guidance as mandatory for relevant CARD/card-fixture stories
- README points agents to the card fixture workflow where appropriate
- tests enforce the mandatory workflow link

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
