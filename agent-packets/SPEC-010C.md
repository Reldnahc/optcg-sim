<!-- agent-packet:story-id SPEC-010C -->
<!-- agent-packet:story-path stories/approved/SPEC-010C-generated-support-testing-story-template-alignment.yaml -->
<!-- agent-packet:story-sha256 0a2a81bc0574a1f579ca7bd516c18af476de862610817144616834a95476a195 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-010C
Epic ID: SPEC-010
Title: Generated-support testing and story-template alignment
Type: specification
Area: docs
Primary Concern: verification

## Why

Align testing, code-standard, workflow, and CARD story preflight wording with modular generated-support evidence so future stories cannot pass review with exact full-line or wrapper-body support shapes.

## Authoritative Spec References

- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s005 (Unit tests per card)
- 11-testing-quality.s020 (Poneglyph/card-data tests)
- 25-story-template.s014 (CARD implementation preflights)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 09-card-data-and-support-policy.s016 (Generated support from complete parse)

Common-template card support is generated from complete parsing plus runtime capability checks. It must not depend on a manual per-card allowlist or a manual card-to-mechanic map for templates that parser certification already covers.

CARD parser/generated-support stories consume completed contract/schema plus runtime-capability evidence before parser certification or generated-support linkage may enable normal-mode support. Contract/schema completion alone is not playable support.

Complete parse means every gameplay-relevant part of a card is parsed: printed effect text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement effects, optionality, once-per-turn limits, source-presence rules, and official rulings or errata that affect behavior. Non-gameplay display fields such as images and flavor-like presentation do not need DSL parse evidence, but any field that can affect behavior must be represented or explicitly proven irrelevant.

A runtime capability matrix records which generated components the current engine can execute. It must cover at least keyword bodies, DSL primitives, trigger timings, decision/response types, costs, target/selection shapes, movement operations, replacement processes, continuous modifiers, visibility modes, event/hash requirements, and custom handlers. The matrix is versioned with effect/runtime support evidence and must be updated when runtime capabilities expand or contract.

The generated support index maps Poneglyph card IDs and source hashes to generated `EffectDefinition` IDs, parser-rule versions, parser evidence, runtime capability results, support status, and review state. Multiple parsed effects for one card compose into one generated `EffectDefinition` for that card. If every parsed component is supported by the current runtime capability matrix and parser-rule certification allows automatic support, the generated support index may mark the card playable in the appropriate modes.

Partial support reporting is allowed and encouraged for progress tracking. It may report parsed components, unparsed spans, ambiguous parse classes, missing runtime capabilities, stale hashes, and unsupported custom-handler needs. Partial support does not make a card playable in normal modes, and partial support or effect coverage progress never enables normal play.

Generated support fails closed. If any component is unparsed, ambiguous, stale, unsupported, missing capability evidence, missing parser certification, or affected by Bandai/Poneglyph wording drift, the card is rejected for normal play until parser/support evidence is updated. New parser rules, ambiguous parse classes, custom handlers, and wording or ruling ambiguity require review before they can certify support.

Generated-support evidence factorization is primitive-boundary authority, not exact wrapper-body or sample-shaped authority. Parser certification and runtime capability evidence must expose reusable boundaries for wrapper or entry point, markers, conditions, costs, body effects, targets, filters, cardinality, durations, visibility, source-presence policy, and composition when present. Composition evidence may be required for supported combined shapes, but composition evidence cannot replace missing wrapper, body, cost, target, condition, duration, source policy, decision, or visibility evidence.

The entry-point terminology note in `05-effect-dsl-reference.s022` remains terminology-only; this section is normative generated-support evidence factorization authority.

### 11-testing-quality.s004 (Unit tests per DSL primitive)

Every primitive has tests independent of specific cards:

- `draw`
- `ko`
- `trash`
- `bounce`
- `search`
- `lookAtTop`
- `modifyPower`
- `modifyCost`
- `giveKeyword`
- `replacement`
- `damage`
- `addLife`
- `attachDon`
- `returnDon`
- `choice`
- `conditional`
- `sequence`

Primitive tests should assert events, state, decisions, and visibility where applicable.

For generated-support parser/certification stories, primitive-boundary parser tests
must prove wrapper or entry-point handling, markers, conditions, costs, effect
body behavior, targets or filters, cardinality, durations, source-presence
policy, and decision/visibility behavior when applicable. Do not treat exact
full-line matches, wrapper-body-only matches, or sample-shaped outputs as
primitive-boundary proof.

Authority tests must assert generated-support factorization wording per cited section. Each required section is asserted independently; one section cannot satisfy another section's required wording.

### 11-testing-quality.s005 (Unit tests per card)

Every implemented non-vanilla card gets a test file.

```text
tests/cards/
  OP01-001.test.ts
  OP01-015.test.ts
  OP01-040.test.ts
```

Minimum assertions:

- Effect appears in legal actions or trigger queue at correct timing.
- Required costs are enforced.
- Optional effects can be declined.
- Legal targets are correct.
- Effect resolves correctly.
- Edge cases: no targets, insufficient cost, source moved, once-per-turn used.
- Expected events are emitted.

This per-card requirement applies to implemented non-vanilla cards and does not
reintroduce a manual per-card allowlist requirement for complete-parse
common-template generated support. Generated-support stories must still include
representative synthetic proof tests for reusable primitive/composition support,
runtime capability matrix coverage checks, generated-support decision/reporting
path checks, at least one positive modular example, and at least one negative
anti-shape regression proving non-modular exact full-line, wrapper-body-only, or
sample-shaped paths are rejected. When a generated-support story claims
cross-entry-point reuse, it must include at least one regression proving the
supported reusable body works under more than one supported entry point.

### 11-testing-quality.s020 (Poneglyph/card-data tests)

Add card-data tests once `@optcg/cards` exists:

```text
CD-001 Poneglyph response validates against Zod schema
CD-002 invalid Poneglyph shape fails before Redis cache write
CD-003 Redis cache key includes cardDataVersion and overlay/effect version
CD-004 overlay merge adds support status and effect definition IDs
CD-005 Poneglyph source text hash drift marks implementation stale
CD-006 unsupported non-vanilla Poneglyph card cannot enter ranked deck
CD-007 variant indexes/generated variant keys are accepted only when valid for the base card
CD-008 client display data cannot alter server-resolved match manifest
CD-009 generated support index accepts only complete-parse cards whose every parsed component is covered by the runtime capability matrix
CD-010 partial, ambiguous, stale, unparsed, unsupported, or capability-missing generated support reports do not make cards playable in normal modes
CD-011 certified parser-rule fixtures auto-support matching complete-parse common-template cards without a manual per-card allowlist
```

These tests prevent the card-data layer from becoming an implicit rules authority.

### 25-story-template.s014 (CARD implementation preflights)

Approved stories with `area: cards` and `type: implementation` must include
`card_source_integrity` and `engine_capability_preflight` before approval.

Use `card_source_integrity` to record target card IDs, the fixture capture
command or reviewed checked-in fixture provenance, behavior-sensitive printed
fields, required fixture assertions, and manifest regeneration requirements.
Behavior-sensitive printed fields include card type, color, cost, power,
counter, types, effect, trigger, and release or set metadata when freshness
matters.
If the story does not enable or change real-card gameplay support, this field
must say why source integrity is not applicable.

Use `engine_capability_preflight` to record parsed effect shape decomposition
across wrapper or entry point, markers, condition, cost, effect body, target,
filter, cardinality, duration, source-presence policy, decision/visibility
needs, and composition evidence when applicable; required runtime capabilities;
which capabilities are already supported; which reusable capabilities are
missing; and prerequisite ENG stories for missing behavior.
Reusable engine gaps block CARD implementation until they are done or split into
explicit prerequisite ENG stories.
If the story is pure card-data infrastructure and does not implement or enable
gameplay behavior, this field must say why runtime capability preflight is not
applicable.

Copy-ready CARD implementation example:

```yaml
card_source_integrity:
  - target card OP10-045 must be captured with `corepack pnpm --filter @optcg/cards capture:fixture -- --card OP10-045 --dry-run`
  - fixture assertions must pin card_type Character, color Blue, cost 4, power 6000, counter null, types Dressrosa and Beautiful Pirates, and exact effect text
  - cards-produced manifest must be regenerated when fixture or generated support evidence changes
engine_capability_preflight:
  - parsed effect shape decomposition is wrapper `[When Attacking]`, marker `[Once Per Turn]`, condition none, cost none, body `draw 2 then trash 1 from hand`, target/filter/cardinality as required by `trash-from-hand` decision, duration none, source-presence policy applies, decision/visibility needs include chooser-only hand visibility and public draw/trash events, and composition evidence covers sequence continuation
  - required runtime capabilities are when-attacking trigger queueing, once-per-turn tracking, draw, trash-from-hand decision, sequence continuation, and source-presence policy
  - missing reusable runtime capabilities must be split into prerequisite ENG stories before CARD implementation starts
```

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only specification/workflow wording, generated spec metadata, and narrow authority tests for generated-support test and story-template requirements. Do not change implementation code, runtime behavior, parser behavior, generated-support metadata, contracts, schema, fixtures, or card support.

## Scope

- clarify generated-support testing expectations for common-template parser support versus explicit manual/custom card support
- reconcile the requirement that implemented non-vanilla cards receive card-focused tests with the generated-support rule that certified complete-parse common templates do not require a manual per-card allowlist
- require generated-support CARD stories to include parser primitive-boundary tests, runtime capability matrix tests, generated-support decision/reporting-path tests, and representative synthetic proof tests for each modular primitive/composition they enable
- require at least one regression test per generated-support story that proves a supported reusable body works under more than one supported entry point when the story claims cross-entry-point reuse
- require at least one negative regression test per generated-support story that rejects a near-miss exact full-line, wrapper-body-only, or sample-shaped implementation path when the story touches parser/generator support
- update CARD implementation preflight wording so parsed effect shape must be decomposed into wrapper or entry point, markers, condition, cost, effect body, target, filter, cardinality, duration, source-presence policy, decision/visibility needs, and composition evidence as applicable
- update code-standard, story-execution, and review-gate wording only as needed to align with the stricter spec authority and avoid contradicting generated common-template support
- require reviewer-workflow wording to inspect primitive-decomposition evidence in CARD preflights and generated-support review, not only a single parsed-line shape
- add or update authority tests that pin the testing and story-template requirements
- update generated spec metadata

## Out of Scope

- implementation code changes
- runtime capability matrix changes
- parser, generated-support, support-probe, cards-produced manifest, fixture, overlay, source hash, or behavior hash changes
- approving or implementing any CARD story
- removing fail-closed support policy, review gates, source integrity requirements, or real-card fixture provenance requirements

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/09-card-data-and-support-policy.md
- specs/11-testing-quality.md
- specs/25-story-template.md
- specs/source-coverage-matrix.md
- specs/section-index.json
- specs/spec-manifest.json
- specs/SPEC_VERSION.md
- docs/code-standard.md
- docs/workflow/story-execution.md
- docs/workflow/review-gate.md
- tests/contracts/spec-authority-gates.test.mjs
- stories/generated/SPEC-010C-generated-support-testing-story-template-alignment.yaml
- stories/approved/SPEC-010C-generated-support-testing-story-template-alignment.yaml
- agent-packets/SPEC-010C.md
- agent-packets/active.json

## Constraints

- do not change runtime, schema, parser, generated-support, support-probe, or card behavior in this story
- preserve story-review and implementation code-review gates
- preserve generated-support fail-closed policy
- fail closed on testing, workflow, or card-support authority ambiguity
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

- update `tests/contracts/spec-authority-gates.test.mjs` to require generated-support testing requirements, CARD preflight primitive-decomposition wording, and workflow/code-standard alignment wording
- run `corepack pnpm run specs:generate-metadata`
- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm run test:contracts`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- specs distinguish manual/custom explicit card tests from generated common-template representative proof tests without weakening either requirement
- generated-support testing requirements explicitly cover primitive-boundary parser tests, capability matrix tests, generated-support decision/reporting-path tests, positive modular examples, and negative non-modular evidence examples
- CARD implementation preflight wording requires primitive decomposition rather than a single printed-line shape
- code-standard, story-execution, and review-gate wording no longer conflict with the generated common-template support path and require review of primitive-decomposition evidence where applicable
- authority tests pin the revised testing and story-template requirements

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
