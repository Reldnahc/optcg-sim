<!-- agent-packet:story-id SPEC-008A -->
<!-- agent-packet:story-path stories/approved/SPEC-008A-story-workflow-layering-rule.yaml -->
<!-- agent-packet:story-sha256 6d57cafe90a7df7fdaaf7f807d82b9a2d4a673a9b32e16e5e9380c454fa5ed64 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-008A
Epic ID: SPEC-008
Title: Story and workflow layering rule
Type: specification
Area: docs
Primary Concern: docs

## Why

Update workflow/spec story-generation guidance to explicitly support layered parent series for broad capabilities that cross contracts, engine runtime, and card generated-support concerns.

## Authoritative Spec References

- 04-effect-runtime.s005 (Card implementation support)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 24-story-schema.s003 (Story categories)
- 24-story-schema.s012 (`area`)
- 24-story-schema.s025 (Story sizing rules)
- 24-story-schema.s030 (`primary_concern`)
- 27-spec-driven-story-generation-workflow.s004 (Story generation inputs)
- 27-spec-driven-story-generation-workflow.s005 (Story generation outputs)
- 27-spec-driven-story-generation-workflow.s017 (Pre-presentation story-review gate)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 04-effect-runtime.s005 (Card implementation support)

Effects load only from supported implementation records.

```ts
type CardSupportStatus =
  | "vanilla-confirmed"
  | "implemented-dsl"
  | "implemented-custom"
  | "unsupported"
  | "banned-in-simulator";
```

A missing effect definition for a non-vanilla card is an error in normal play. Only dev/sandbox modes may allow unsupported cards.

For generated support, the runtime must expose or consume a capability matrix that describes which keyword bodies, DSL primitives, trigger timings, decision types, replacement processes, visibility modes, target shapes, costs, and custom handlers are currently executable. A generated card support record may be considered playable only when the card has a complete parse and every parsed component is covered by that current runtime capability matrix.

Multiple parsed effects from one card compose into one generated `EffectDefinition` for that card. If any component is unparsed, ambiguous, stale, unsupported, or missing capability evidence, the entire generated support record fails closed for normal play instead of partially enabling the card.

Generated composed runtime shapes must fail closed for normal play when the runtime cannot represent the whole composed execution as a supported resumable frame. Unsupported composed shapes include sequence connectors, saved-result references, optionality boundaries, costs, targets, visibility requirements, or pending-decision continuations that the runtime capability matrix does not cover.

### 09-card-data-and-support-policy.s016 (Generated support from complete parse)

Common-template card support is generated from complete parsing plus runtime capability checks. It must not depend on a manual per-card allowlist or a manual card-to-mechanic map for templates that parser certification already covers.

CARD parser/generated-support stories consume completed contract/schema plus runtime-capability evidence before parser certification or generated-support linkage may enable normal-mode support. Contract/schema completion alone is not playable support.

Complete parse means every gameplay-relevant part of a card is parsed: printed effect text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement effects, optionality, once-per-turn limits, source-presence rules, and official rulings or errata that affect behavior. Non-gameplay display fields such as images and flavor-like presentation do not need DSL parse evidence, but any field that can affect behavior must be represented or explicitly proven irrelevant.

A runtime capability matrix records which generated components the current engine can execute. It must cover at least keyword bodies, DSL primitives, trigger timings, decision/response types, costs, target/selection shapes, movement operations, replacement processes, continuous modifiers, visibility modes, event/hash requirements, and custom handlers. The matrix is versioned with effect/runtime support evidence and must be updated when runtime capabilities expand or contract.

The generated support index maps Poneglyph card IDs and source hashes to generated `EffectDefinition` IDs, parser-rule versions, parser evidence, runtime capability results, support status, and review state. Multiple parsed effects for one card compose into one generated `EffectDefinition` for that card. If every parsed component is supported by the current runtime capability matrix and parser-rule certification allows automatic support, the generated support index may mark the card playable in the appropriate modes.

Partial support reporting is allowed and encouraged for progress tracking. It may report parsed components, unparsed spans, ambiguous parse classes, missing runtime capabilities, stale hashes, and unsupported custom-handler needs. Partial support does not make a card playable in normal modes, and partial support or effect coverage progress never enables normal play.

Generated support fails closed. If any component is unparsed, ambiguous, stale, unsupported, missing capability evidence, missing parser certification, or affected by Bandai/Poneglyph wording drift, the card is rejected for normal play until parser/support evidence is updated. New parser rules, ambiguous parse classes, custom handlers, and wording or ruling ambiguity require review before they can certify support.

### 24-story-schema.s003 (Story categories)

Each story should declare exactly one primary `type`:

- `design`
- `implementation`
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

These values may be extended later, but the meaning must remain stable for automation.

### 24-story-schema.s012 (`area`)

Primary ownership area. This helps routing to the correct agent and validating package boundaries.

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

### 24-story-schema.s030 (`primary_concern`)

Identifies the main reason the story exists. Initial expected values are:

- `contract`
- `rules`
- `view`
- `protocol`
- `persistence`
- `tooling`
- `ui`
- `cli`
- `docs`
- `verification`

A story should declare exactly one value. Tests, fixtures, snapshots, and docs needed to prove that same concern do not count as a second concern.

### 27-spec-driven-story-generation-workflow.s004 (Story generation inputs)

At minimum, story generation should read:

- relevant spec markdown files,
- implementation-tightening notes,
- repo tooling requirements,
- code standards and architecture constraints,
- any contract files required by the section being converted.
- for platform and competitive stories, the game-type and format policy docs (`29-...` and `30-...`).

Story generation should prefer exact section references instead of vague file-level citations whenever practical.

### 27-spec-driven-story-generation-workflow.s005 (Story generation outputs)

The generation step should produce:

- one or more epics for broad gameplay or platform capabilities,
- candidate child stories sliced by concern inside those epics,
- candidate stories in the schema defined by [`24-story-schema.md`](24-story-schema.md),
- flagged ambiguities when the spec is not decisive,
- optional dependency suggestions.

Broad composed-effect or card-support initiatives may use layered parent story sets
when one capability crosses review concerns. Layered parent story sets may split
the initiative into contracts/schema, engine/runtime, and
cards/parser/generated-support parent sets while preserving the parent/substory
workflow for each set. Implementation stories still keep one primary concern and
one primary area. TYP-prefixed contract/schema implementation stories use
`area: contracts`, not `area: types`, even when story validation retains legacy
`types` compatibility. CARD stories may depend on completed TYP and ENG parent
series but must not hide runtime work; reusable engine behavior belongs in ENG
stories before card-specific generated-support or parser linkage work proceeds.
Already-generated downstream TYP, ENG, and CARD implementation story sets must
be revised or regenerated after the layered rules land before approval handoff.

Generated stories are not approved automatically unless the project explicitly adopts an automated approval rule. The default assumption is human approval.

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

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only workflow/spec documentation, generated spec metadata, and narrow authority tests for the layered parent-series rule. Do not change story tooling behavior unless a tiny doc-authority test requires metadata updates.

## Scope

- add an explicit layered-parent-series pattern for broad capabilities crossing contracts, engine, and card support
- state that broad card-support initiatives may split into contracts/schema, engine/runtime, and cards/parser/generated-support parent sets
- state that implementation stories should keep one primary concern and one primary area
- create workflow authority that TYP-prefixed contract/schema implementation stories use `area: contracts`, not `area: types`, even while the story schema still permits legacy `types` area values
- clarify that CARD stories may depend on completed TYP/ENG parent series but must not hide runtime work
- record that already-generated downstream TYP/ENG/CARD implementation story sets must be revised or regenerated after SPEC-008 authority lands before approval handoff
- preserve existing parent/substory workflow, story-review planning, active packet, and packet lifecycle rules
- update generated spec metadata

## Out of Scope

- changing story schema validation behavior
- implementing TYP, ENG, or CARD stories
- rewriting already-generated downstream TYP, ENG, or CARD implementation story sets in this story
- runtime behavior, schema behavior, parser behavior, generated-support behavior, or gameplay implementation

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/27-spec-driven-story-generation-workflow.md
- docs/workflow/story-execution.md
- specs/source-coverage-matrix.md
- specs/section-index.json
- specs/spec-manifest.json
- specs/SPEC_VERSION.md
- tests/contracts/spec-authority-gates.test.mjs
- stories/generated/SPEC-008*.yaml
- stories/approved/SPEC-008*.yaml
- agent-packets/SPEC-008A.md
- agent-packets/active.json

## Constraints

- do not broaden this story into implementation-story rewriting
- do not approve downstream generated TYP/ENG/CARD implementation story sets until they are aligned to the landed layered workflow authority
- preserve story-review planning as the authority for reviewer assignment shape
- fail closed on workflow ambiguity
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

- update `tests/contracts/spec-authority-gates.test.mjs` to pin the layered-parent-series rule, TYP contracts-area rule, CARD runtime-boundary rule, and downstream-regeneration-before-approval rule
- run `corepack pnpm run specs:generate-metadata`
- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm run test:contracts`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- workflow docs explicitly authorize layered parent story sets for broad composed-effect/card-support initiatives
- workflow docs keep the one-primary-concern and one-primary-area rule for implementation stories
- workflow docs explicitly say TYP-prefixed contract/schema implementation stories use `area: contracts`, not `area: types`
- workflow docs explicitly prohibit CARD stories from hiding runtime work
- workflow docs explicitly require downstream generated implementation story sets to be revised or regenerated after new layered rules land before approval handoff
- existing parent/substory and packet lifecycle rules remain intact

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
