<!-- agent-packet:story-id CARD-025B -->
<!-- agent-packet:story-path stories/approved/CARD-025B-primitive-evidence-inventory-migration.yaml -->
<!-- agent-packet:story-sha256 849d1a844910d1f2caa32e20daa35aa7d58dccdca3874787437ddaa9ac398f4a -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-025B
Epic ID: CARD-025
Title: Primitive evidence inventory migration
Type: implementation
Area: cards
Primary Concern: rules

## Why

Migrate generated-support evidence inventory, parser certification metadata, and runtime capability lookup from parser-rule-as-authority toward reusable primitive-boundary evidence. Parser rule IDs may remain as trace/debug data only where needed for compatibility, but they must not be the sole support authority for current generated-support implementations.

## Authoritative Spec References

- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 05-effect-dsl-reference.s006 (Conditions)
- 05-effect-dsl-reference.s007 (Costs)
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

### 05-effect-dsl-reference.s006 (Conditions)

```ts
type Condition =
  | { type: "donCount"; target?: Target; min: number }
  | { type: "yourTurn" }
  | { type: "opponentTurn" }
  | { type: "lifeCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "fieldCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | { type: "handCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "trashCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | {
      type: "leaderColorCount";
      player: PlayerRef;
      op: Comparator;
      value: number;
    }
  | { type: "hasCardInZone"; zone: Zone; player: PlayerRef; filter: CardFilter }
  | { type: "attackTarget"; targetType: "leader" | "character" | "any" }
  | { type: "cardState"; target: Target; state: "active" | "rested" }
  | { type: "sourceStillInZone" }
  | { type: "eventPayload"; path: string; op: Comparator; value: unknown }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition }
  | { type: "custom"; check: string };

type Comparator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
type PlayerRef =
  | "self"
  | "opponent"
  | "turnPlayer"
  | "nonTurnPlayer"
  | "owner"
  | "controller";
```

`leaderColorCount` is a public Leader metadata condition. It reads only the
player's Leader colors from the match manifest or resolved card snapshot, uses a
canonical `PlayerRef` and `Comparator`, and its `value` is a non-negative safe
integer. Printed "multicolored" Leader conditions map to
`{ type: "leaderColorCount", player: "self", op: "gte", value: 2 }`.

Leader type and Leader attribute conditions do not introduce `leaderType` or
`leaderAttribute` predicates. Represent them through the public Leader Area with
`hasCardInZone` and `CardFilter`, for example
`{ type: "hasCardInZone", zone: "leaderArea", player: "self", filter: { categories: ["leader"], typesAny: ["Straw Hat Crew"] } }`
or
`{ type: "hasCardInZone", zone: "leaderArea", player: "self", filter: { categories: ["leader"], attributesAny: ["slash"] } }`.
The schema-supported fixture subset admits only this public Leader-zone metadata
form and does not authorize private-zone metadata queries.

Condition, duration, and restriction primitives outside the schema-supported fixture subset remain planned layers. They are contract-defined by this reference, but they are not fixture-authorable until the schema coverage policy lists them as supported.

For public DON-on-field count authorability, use existing `fieldCount` with a
DON filter (`filter.categories` containing `"don"`), canonical comparator, and
non-negative threshold. In this DON filter form, schema fixtures support
`player: "self"` and `player: "opponent"` only, and reject free-text shortcuts.
This is contract/schema authorability evidence only and does not by itself imply
runtime executable support, parser certification, generated support, or card
playability.

### 05-effect-dsl-reference.s007 (Costs)

```ts
type Cost =
  | { type: "restDon"; count: number; chooser?: PlayerRef }
  | { type: "returnDon"; count: number; chooser?: PlayerRef }
  | { type: "restSelf" }
  | {
      type: "trashFromHand";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "trashSelf" }
  | { type: "discard"; count: number; filter?: CardFilter; chooser: PlayerRef }
  | { type: "sequence"; costs: Cost[] }
  | { type: "custom"; action: string };

type OptionalTrashFromHandCost = {
  type: "trashFromHand";
  count: number;
  filter?: CardFilter;
  chooser: PlayerRef;
  optional: true;
};

type ScopedOptionalFieldTrashCostFilter = {
  categories: ["character"];
  typesAny: [string, ...string[]];
};

type ScopedOptionalFieldTrashCost = {
  type: "trashFromField";
  count: number;
  filter: ScopedOptionalFieldTrashCostFilter;
  chooser: "self";
  optional: true;
};

type OptionalChooseOneTrashCostAlternative =
  | OptionalTrashFromHandCost
  | ScopedOptionalFieldTrashCost;

type OptionalChooseOneTrashCost = {
  type: "chooseOne";
  options: [
    OptionalChooseOneTrashCostAlternative,
    ...OptionalChooseOneTrashCostAlternative[],
  ];
  optional: true;
};

type OptionalCost =
  | { type: "restDon"; count: number; chooser?: PlayerRef; optional: true }
  | { type: "returnDon"; count: number; chooser?: PlayerRef; optional: true }
  | { type: "restSelf"; optional: true }
  | OptionalTrashFromHandCost
  | OptionalChooseOneTrashCost
  | { type: "sequence"; costs: Cost[]; optional: true };
```

If paying a cost requires choosing cards or DON!!, the runtime creates a `PayCostDecision`.
Cost primitives outside the schema-supported fixture subset remain planned layers.
Scoped optional choose-one trash costs are authorable only through
`{ type: "payCost"; cost: OptionalCost }` sequence segments and only for the
listed optional trash alternatives. This schema/type authorability does not make
broad `Cost.chooseOne`, non-optional `Cost.trashFromField`, parser support,
runtime payment behavior, generated support, or playability available. Optional
cost behavior must remain separate from optional activation and optional effect
clauses as defined by `04-effect-runtime.s011`.

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

Own only generated-support evidence model, inventory lookup, certification evaluation, runtime capability coverage lookup, and tests needed to make primitive evidence the authority boundary. Do not change natural-language parser coverage, engine runtime behavior, shared schema, real-card fixtures, manifests, source hashes, behavior hashes, or overlays.

## Scope

- introduce or normalize primitive evidence IDs for current generated-support boundaries
- ensure evidence inventory can represent wrapper, marker, cost, condition, target, filter, cardinality, duration, visibility, source-policy, body, and composition evidence independently
- ensure runtime capability coverage can be evaluated from primitive evidence IDs without depending on exact parser rule IDs
- keep parser rule IDs available as trace/debug output where existing reports need them, but not as the only support authority
- make parser certification blockers report the missing primitive evidence boundary rather than only an exact parser-rule sample
- migrate existing generated-support inventory entries so each supported current implementation has primitive component evidence
- preserve existing supported generated-support decisions when later children feed equivalent primitive evidence

## Out of Scope

- natural-language parser changes
- evaluator/probe/report final formatting changes outside evidence/certification data needed for this child
- engine runtime behavior
- shared schema changes
- real-card fixture or manifest work

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/generated-support-types.ts
- packages/cards/src/generated-support-types.test.ts
- packages/cards/src/generated-support-index.ts
- packages/cards/src/generated-support-index.test.ts
- packages/cards/src/support-evaluator.ts
- packages/cards/src/support-evaluator.test.ts
- packages/cards/src/generated-support-runtime-capability-coverage.ts
- packages/cards/src/generated-support-capability-coverage.test.ts
- packages/cards/src/generated-support-component-identity.test.ts
- packages/cards/src/runtime-capability-matrix.ts
- packages/cards/src/runtime-capability-matrix.test.ts
- packages/cards/src/support-evaluator-parser-certification.test.ts
- packages/cards/src/external-deck-construction-rule.ts
- packages/cards/src/external-deck-construction-rule.test.ts
- packages/cards/src/*evidence.ts
- packages/cards/src/*evidence.test.ts
- stories/generated/CARD-025-card-layer-spec010-migration-parent.yaml
- stories/generated/CARD-025B-primitive-evidence-inventory-migration.yaml
- stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml
- stories/approved/CARD-025B-primitive-evidence-inventory-migration.yaml
- agent-packets/CARD-025B.md
- agent-packets/active.json

## Constraints

- generate and activate the CARD-025B packet before implementation
- stay within allowed_touch_points
- do not broaden parser coverage in this child
- preserve compatibility data only where it is not support authority
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

- story-review for CARD-025B before approval handoff
- component evidence identity tests proving primitive IDs are present for current generated-support entries
- runtime capability coverage tests proving lookup by primitive evidence IDs
- parser certification blocker tests for missing wrapper/body/composition primitive evidence
- negative test proving a legacy exact parser rule without primitive evidence cannot authorize generated support
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

- primitive evidence IDs, not exact parser rule IDs, can drive runtime capability coverage for current generated-support entries
- parser certification blockers name missing primitive boundaries
- generated-support component evidence inventory no longer treats exact full-line parser rule IDs as the only authority for current supported implementations
- exact parser rule IDs remain permitted only as trace/debug compatibility data or while a later child has not yet migrated the corresponding parser emission
- tests fail if component evidence lookup falls back to whole parser-rule authorization with no primitive evidence

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
