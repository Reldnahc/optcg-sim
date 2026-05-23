<!-- agent-packet:story-id CARD-025A -->
<!-- agent-packet:story-path stories/approved/CARD-025A-card-support-authority-anti-shape-inventory.yaml -->
<!-- agent-packet:story-sha256 f0fb5e113e4acfb7ef962c85df48e76cc28e395822fc43473bd12e9c37dffa74 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-025A
Epic ID: CARD-025
Title: Card support authority anti-shape inventory
Type: implementation
Area: cards
Primary Concern: verification

## Why

Add cards-layer anti-regression coverage that makes forbidden generated-support authority shapes visible before the CARD-025 migration changes production behavior. Because this child runs before the migration children, it may keep a test-only migration debt inventory for existing violations, but every debt row must name the owning CARD-025 child and no new unauthorized violation may pass. The scan must catch exact full-effect text, exact wrapper-body support gates, story-named production parser ownership, card-specific support branches, external card-list authorization, card-to-mechanic maps, and sample-specific numeric authorization in production generated-support paths.

## Authoritative Spec References

- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 09-card-data-and-support-policy.s018 (Effect coverage report)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 11-testing-quality.s020 (Poneglyph/card-data tests)
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

Parser certification evidence must expose stable primitive boundaries for wrapper or entry point, markers, conditions, costs, body effects, targets, filters, cardinality, durations, visibility, source-presence policy, and composition when present. Runtime capability evidence must prove reusable runtime behavior for the same primitive boundaries plus decision or response semantics when present.

Composition evidence may be required for supported combined shapes, but composition evidence cannot replace missing wrapper, body, cost, target, condition, duration, source policy, decision, or visibility evidence.

Multiple parsed effects from one card compose into one generated `EffectDefinition` for that card. If any component is unparsed, ambiguous, stale, unsupported, or missing capability evidence, the entire generated support record fails closed for normal play instead of partially enabling the card.

Generated composed runtime shapes must fail closed for normal play when the runtime cannot represent the whole composed execution as a supported resumable frame. Unsupported composed shapes include sequence connectors, saved-result references, optionality boundaries, costs, targets, visibility requirements, or pending-decision continuations that the runtime capability matrix does not cover.

### 04-effect-runtime.s011 (Conditions and costs)

Before resolving an effect block:

1. Check source presence policy.
2. Re-check condition if the effect requires condition-on-resolution.
3. Check `[Once Per Turn]` usage by `source.instanceId + effectBlock.id + turn`.
4. If activation requires cost, create a `PayCostDecision` when choices are required.
5. Pay cost atomically and emit `costPaid` events.
6. Mark once-per-turn usage only after legal commitment: activation conditions passed, required activation-time targets selected, costs paid, and optional activation accepted. Declined optional effects and failed costs do not consume use; legally committed effects that later fizzle do consume use.

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

Optionality has three distinct meanings:

- Optional activation asks whether the player commits to resolving the effect block. Declining optional activation means the effect block is not legally committed and once-per-turn usage is not consumed.
- Optional cost asks whether the player pays a non-mandatory cost inside an otherwise committed effect. Declining or failing an optional cost records `paidCost: false` and only skips later instructions whose connector or text depends on that cost being paid.
- Optional effect clause asks whether the player performs a non-mandatory instruction during resolution. Declining an optional effect clause records `playerDeclined: true` for that segment and does not undo prior legally completed segments.

Optional cost clauses inside composed execution are not effect-block activation
costs. They occur after legal commitment to the effect block, inside a
resumable sequence segment. Optional cost accept, decline, and failure do not
consume once-per-turn usage because usage was consumed at legal commitment
before the optional cost clause executes. Accepted optional costs pay cost
atomically and emit the normal cost-payment events. Declined optional costs do
not emit cost-payment events. Failed optional costs emit no public event that
reveals hidden payment candidates or private payment details.

Accepted optional cost records `attempted: true`, `succeeded: true`,
`paidCost: true`, and `playerDeclined: false`; `changedState` records whether
canonical state actually changed. Declined optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: true`. Failed optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: false`. Optional cost accept, decline,
and failure do not consume once-per-turn usage, and dependent connectors use
`paidCost` rather than optional-activation state.
Event `seq` values and `state.seq` advancement remain deterministic for
optional cost accept, decline, and failure. State hashes include the frame
segment result for each branch.

```ts
interface OncePerTurnRecord {
  cardInstanceId: InstanceId;
  effectId: string;
  turnNumber: number;
  usedAtStateSeq: StateSeq;
}
```

### 04-effect-runtime.s012 (Player choices during effect resolution)

Effects pause through `PendingDecision`.

Example target selection flow:

```ts
function executeKoEffect(
  state: GameState,
  effect: KoEffect,
  context: EffectContext,
): EngineResult {
  const candidates = resolveTargetCandidates(state, effect.target, context);

  if (requiresChoice(effect.target)) {
    return pauseForDecision(state, {
      type: "selectTargets",
      playerId: resolveChooser(effect.target, context),
      request: effect.target,
      candidates,
      causedBy: context.causedBy,
    });
  }

  return koTargets(state, candidates.selected, context);
}
```

Decision responses are validated by the engine, not the client.

Composed execution records one segment result for every attempted sequence segment or optional clause. A segment result must record `attempted`, `succeeded`, `changedState`, `selectedCards`, `selectedTargets`, `paidCost`, and `playerDeclined`. `succeeded` means the segment legally performed its required instruction, while `changedState` separately records whether canonical state changed. Legal selection without mutation may still drive connectors such as "if you do" when card text depends on choosing or identifying an object.

Saved-result references may bind selected cards, selected targets, paid costs, or produced objects for later text such as `that Character`. A later segment may use a saved-result reference only while the referenced object remains legal for that later instruction; otherwise the later segment follows its connector and failure policy. Saved references must preserve hidden-information visibility and replay determinism.

A saved field-object reference is the runtime contract for same-frame `selectedTargets` and `producedObjects` consumers in the same effect execution frame. `selectedTargets` production records the public field objects legally selected by a non-mutating `selectTargets` request segment in the segment result and saved-reference ledger; mutating target effects are not standalone selectedTargets producer authority. `producedObjects` records public field objects produced by a supported segment when the runtime story for that producer explicitly authorizes the produced-object family. Saved hand-selection/playSelected references remain separate from saved field-object references and must not be consumed as field-object targets.

Field-object consumers must validate the saved family, `saveResultAs`, optional object index, current zone, player/controller, filter, public visibility, and instruction legality at consumption time. unsupported saved-reference families fail closed. stale objects, gone objects, hidden objects, and illegal objects fail closed. A fail-closed saved field-object reference records the segment as attempted, not succeeded, and not changedState, then follows the active connector and failure policy. Public events, public legal actions, PlayerView, and SpectatorView must not reveal hidden identities, hidden candidates, or the private saved-reference failure reason; replay and private effect logs may retain the failure reason for audit. State hashes include the frame saved-reference ledger, the consumer result, and unchanged public/hidden game state so replay, event order, and connector decisions remain deterministic.

Accepted optional cost records `attempted: true`, `succeeded: true`,
`paidCost: true`, and `playerDeclined: false`. Declined optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: true`. Failed optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: false`. Optional cost accept, decline,
and failure do not consume once-per-turn usage.

Optional cost segment results participate in the serialized effect execution
frame and authoritative state hash. Event `seq` values and `state.seq`
advancement remain deterministic for accepted, declined, and failed optional
cost branches under `03-game-state-events-decisions.s005` and
`03-game-state-events-decisions.s022`: resolving a valid optional-cost decision
advances `state.seq` once, individual internal events do not each advance
`state.seq`, and rejected stale, malformed, wrong-player, or insufficient
payment responses do not resolve the decision. State hashes include the frame
segment result and unchanged game state for decline or failure branches.

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

### 09-card-data-and-support-policy.s018 (Effect coverage report)

Generate this in CI from Poneglyph total cards plus simulator overlay status.

```text
Total cards in Poneglyph:      2347
Vanilla confirmed:              420
DSL implemented:               1530
Custom implemented:              73
Unsupported:                    324
Banned in simulator:              0
Implemented cards tested:      1603 / 1603
Cards with stale text hash:       12
```

Primitive usage report:

```text
draw:              321
ko:                118
search:             94
modifyPower:       402
replacement:        27
custom handler:     73
```

High repeated custom-handler usage suggests the DSL is missing primitives.

Effect coverage and primitive usage reports are progress evidence only. They must not promote partial, stale, ambiguous, unparsed, unsupported, or capability-missing generated support into playable normal-mode support.

### 09-card-data-and-support-policy.s024 (Source hash and behavior hash)

Use both hashes:

```ts
interface CardImplementationRecord {
  cardId: CardId;
  status: CardSupportStatus;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string; // effect + trigger text only
  behaviorHash: string; // stats + type line + effect + trigger + FAQ + errata
  notes?: string;
}
```

`OP01-060` demonstrates why `behaviorHash` matters: the FAQ clarifies that an unplayed revealed card returns to the top of the deck face-down. A change to that FAQ would affect hidden-information behavior even if the printed effect text did not change.

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

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only cards-layer test and local test-helper coverage for support-authority source-shape inventory. Do not change production parser behavior, generated support decisions, runtime capability mappings, real-card fixtures, source hashes, behavior hashes, overlays, support manifests, or cards-produced manifests.

## Scope

- add production-source scans for forbidden cards-layer generated-support authority shapes
- scan current production cards support paths, including parser, evidence, capability, evaluator, support-probe, report, and composition modules
- create a test-only migration debt inventory for existing forbidden shapes discovered by the scan; the inventory must live in test code or test fixtures only, must not be imported by production code, and must not be used as support authority
- require every migration debt row to identify the forbidden shape, production file, reason it violates SPEC-010, and owning CARD-025 child expected to remove it
- detect exact full-line authorization branches in covered cards-layer production modules, not only exact full-effect text branches or wrapper-body samples
- forbid new exact full-effect text branches and exact wrapper-body support gates in production authorization paths unless they are already present in the migration debt inventory
- forbid new exact full-line authorization branches in production authorization paths unless they are already present in the migration debt inventory
- forbid new real card IDs, external card-list authorization, card-to-mechanic maps, and manually reviewed card allowlists in generated-support authorization paths unless they are already present in the migration debt inventory
- forbid new story-named production parser ownership where the story name is the support boundary instead of a reusable primitive domain unless already present in the migration debt inventory
- forbid new sample-specific numeric authorization branches such as only one threshold, power value, count, or look count when the parsed primitive family is numeric unless already present in the migration debt inventory
- allow legitimate exact strings in test files, fixtures, stories, diagnostics, CLI help text, and generic parser token regexes when they are not support authority
- add self-tests for the source-scan regexes so future edits cannot narrow the guards silently

## Out of Scope

- production parser, evaluator, capability, report, or support-probe behavior changes
- renaming parser rule IDs or evidence IDs
- new generated-support support or removal of existing support
- real-card fixture or manifest work

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/*generated-support*.test.ts
- packages/cards/src/*support*.test.ts
- packages/cards/src/*parser*.test.ts
- packages/cards/src/*composition*.test.ts
- packages/cards/src/*diagnostic*.test.ts
- packages/cards/src/*authority*.test.ts
- packages/cards/src/test-*.ts
- stories/generated/CARD-025-card-layer-spec010-migration-parent.yaml
- stories/generated/CARD-025A-card-support-authority-anti-shape-inventory.yaml
- stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml
- stories/approved/CARD-025A-card-support-authority-anti-shape-inventory.yaml
- agent-packets/CARD-025A.md
- agent-packets/active.json

## Constraints

- generate and activate the CARD-025A packet before implementation
- stay within allowed_touch_points
- do not change production behavior in this test-hardening child
- preserve narrow allow cases for tests, fixtures, diagnostics, and generic parser tokenization
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

- story-review for CARD-025A before approval handoff
- anti-shape source scan test covering production cards parser, evidence, capability, evaluator, probe, report, and composition modules, including exact full-line authorization branches
- test-only migration debt inventory test proving every existing debt row has a production path, violation category, and owning CARD-025 child
- test proving production code cannot import the migration debt inventory or use it in generated-support decisions
- regex self-test covering rejected and allowed examples for exact full-line, wrapper-body, card ID, external list, story-named module, and sample-numeric support authority
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm --filter @optcg/cards test`
- run full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- tests fail if production cards generated-support code adds exact full-effect text authorization not listed in the test-only migration debt inventory
- tests fail if production cards generated-support code adds exact full-line authorization not listed in the test-only migration debt inventory
- tests fail if production cards generated-support code adds exact wrapper-body authorization without primitive evidence not listed in the test-only migration debt inventory
- tests fail if production cards generated-support code adds real card IDs, external card lists, card-to-mechanic maps, or manual card allowlists for support authority not listed in the test-only migration debt inventory
- tests fail if production cards generated-support code uses story-named production parser modules as the support boundary after the relevant migration child retires that module shape or when the module is not listed in the migration debt inventory
- tests fail if production cards generated-support code authorizes sample-specific numeric values instead of parsing numeric primitives for supported numeric families, unless the existing row is listed in the migration debt inventory with an owning migration child
- migration debt inventory rows are test-only, cannot be imported by production code, and cannot be used to make generated support pass
- tests allow legitimate nested sequence arity validation, diagnostics, fixture text, and test-only examples

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
