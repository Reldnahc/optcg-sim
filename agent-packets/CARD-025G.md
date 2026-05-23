<!-- agent-packet:story-id CARD-025G -->
<!-- agent-packet:story-path stories/approved/CARD-025G-generated-support-evaluator-proof-compatibility.yaml -->
<!-- agent-packet:story-sha256 5aa40e2088c7aaafea83581d16da3f8215f8219105ae979f6a93889e3e6bd730 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-025G
Epic ID: CARD-025
Title: Generated-support evaluator proof compatibility
Type: implementation
Area: cards
Primary Concern: verification

## Why

Align generated-support evaluator, support-probe, reports, proof certificates, and compatibility tests with the migrated primitive-boundary card-layer authority. Current supported generated-support paths must still pass, but reports must prove support through primitive evidence rather than exact parser-rule, full-line, or card-specific authority.

## Authoritative Spec References

- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
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

### 09-card-data-and-support-policy.s010 (Card implementation record)

```ts
type CardSupportStatus =
  | "vanilla-confirmed"
  | "implemented-dsl"
  | "implemented-custom"
  | "unsupported"
  | "banned-in-simulator";

interface CardImplementationRecord {
  cardId: CardId; // Poneglyph base card ID
  status: CardSupportStatus;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  generatedSupportId?: string;
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string; // hash of Poneglyph printed text used for review drift
  notes?: string;
}
```

A card with printed effect text but no implementation must be marked `unsupported`, not omitted. For common templates, implementation may come from a generated support index entry instead of a manual per-card overlay when the complete parse, parser certification, and runtime capability checks all pass.

### 09-card-data-and-support-policy.s011 (Support policy by mode)

| Status                |              Dev sandbox | Unranked / custom |                         Ranked |
| --------------------- | -----------------------: | ----------------: | -----------------------------: |
| `vanilla-confirmed`   |                  Allowed |           Allowed |                        Allowed |
| `implemented-dsl`     |                  Allowed |           Allowed |                        Allowed |
| `implemented-custom`  |                  Allowed | Allowed if tested | Allowed if tested and reviewed |
| `unsupported`         |     Allowed with warning |          Rejected |                       Rejected |
| `banned-in-simulator` | Rejected unless override |          Rejected |                       Rejected |

Missing overlay records should fail closed in public modes. A non-vanilla Poneglyph card without support metadata is treated as `unsupported`.

### 09-card-data-and-support-policy.s012 (Deck validation)

Deck validation resolves and validates against Poneglyph IDs, Poneglyph legality records, and simulator support metadata. Poneglyph is the canonical external source for format/card legality inputs such as legal status, bans, and copy limits; the simulator may only layer unsupported-card policy or platform-specific constraints on top.

Generated support index output is simulator support metadata. Deck validation may treat a generated record as `implemented-dsl` or `implemented-custom` only when the record has complete parse evidence, current source/behavior hashes, certified parser-rule evidence, and a runtime capability matrix result proving every component is supported.

```ts
interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationError[];
  warnings: DeckValidationWarning[];
  resolvedCards: ResolvedDeckCard[];
  versions: {
    cardDataVersion: string;
    effectDefinitionsVersion: string;
    overlayVersion: string;
    banlistVersion: string;
  };
}
```

Validation checks:

- Leader count and leader identity.
- Main deck size.
- DON!! deck size.
- Leader/color restrictions.
- Per-card copy limits by Poneglyph base `cardId`.
- Official format restrictions.
- Simulator-specific bans.
- Unsupported-card status.
- Variant IDs resolve to valid Poneglyph variants for the base card.

### 09-card-data-and-support-policy.s013 (Match-time card manifest)

At match creation, snapshot resolved card data versions and implementation data. Replays use this manifest instead of live Poneglyph data. The implementation contract is `MatchCardManifest` in `contracts/canonical-types.ts`.

```ts
interface MatchCardManifest {
  manifestHash: string;
  source: "poneglyph" | "poneglyph-fixture" | "manual-test";
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  cards: Record<CardId, ResolvedCard>;
  createdAt: string;
}
```

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

Own only cards-layer evaluator, probe, report, proof-certificate, and final compatibility tests for the CARD-025 migration. Do not add new parser grammar, engine runtime behavior, shared schema, real-card fixtures, manifests, source hashes, behavior hashes, overlays, or real-card promotion.

## Scope

- make evaluator decisions require primitive parser certification evidence, primitive runtime capability evidence, and composition evidence for current supported generated-support paths
- make support-probe and generated-support reports display primitive evidence and missing primitive blockers clearly
- make proof-certificate output display primitive evidence and missing primitive blockers clearly
- preserve parser rule IDs as trace/debug output only when useful; proof authority must identify primitive evidence boundaries
- add synthetic compatibility matrix coverage proving current supported generated-support families remain supported through primitive evidence
- add negative compatibility coverage proving missing wrapper, body, condition, cost, target/filter, source-policy, runtime capability, or composition evidence fails closed
- require the CARD-025A test-only migration debt inventory to be empty for production generated-support authorization paths after CARD-025G lands
- close out the original `migrationDebtInventory` in `packages/cards/src/card-support-authority-shape.test.ts`; do not satisfy this by adding a parallel empty inventory
- where CARD-025A detector rows still match production parser/component source, either remove the underlying forbidden authority shape or narrow the detector/allowance only when the source is proven to be syntax recognition, diagnostics, or non-authoritative trace text rather than support authorization
- de-shape existing parser authorization for current supported generated-support families by replacing exact wrapper-body, exact full-line, story-named, and sample-specific numeric gates with reusable primitive parsers and primitive evidence lookup; preserve the current supported families and do not add unrelated wording families
- limit de-shaping to production authorization shapes already represented by the current CARD-025A inventory rows, or code directly required to route those rows to existing primitive evidence; do not introduce new primitive families, new capability IDs, or new parser certification families
- if a current generated-support family already has generic runtime and parser-certification evidence but stale parser-rule or runtime-capability identifiers still encode a single sample count, update the cards-layer evidence identifier to the existing count-parameterized primitive boundary rather than retaining a sample-count branch; this is limited to renaming cards-layer support metadata for the same runtime primitive and does not authorize new engine behavior or unrelated parser families
- update adjacent legacy generated-support unit test expectations when they assert the renamed cards-layer parser-rule or capability evidence identifiers; do not update real-card fixtures, representative fixture manifests, source hashes, behavior hashes, overlays, or external card-list behavior
- parameterize existing supported primitives when the runtime capability and parser certification evidence already support the primitive family, including wrapper tokens, target/cardinality text, saved-reference consumer text, keyword tokens, source-suffix text, and numeric count/value thresholds
- prove no acceptance test depends on real card IDs, real-card fixture promotion, external card lists, or exact full printed text

## Out of Scope

- new unrelated parser grammar or generated-support coverage outside the current supported generated-support families being de-shaped for CARD-025A debt closeout
- engine runtime or shared schema changes
- source hash, behavior hash, overlay, support manifest, cards-produced manifest, or real-card fixture changes
- changing CLI card lookup semantics except report/proof text needed for primitive evidence

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/card-support-authority-migration-debt.test.ts
- packages/cards/src/*authority*.test.ts
- packages/cards/src/card014f-support.test.ts
- packages/cards/src/certified-card-text-parser.ts
- packages/cards/src/certified-card-text-parser.test.ts
- packages/cards/src/composed-parser-builder.ts
- packages/cards/src/composed-parser-builder.test.ts
- packages/cards/src/conditional-parser-components.ts
- packages/cards/src/don-minus-draw-components.ts
- packages/cards/src/generated-support-index.ts
- packages/cards/src/generated-support-index.test.ts
- packages/cards/src/generated-support-parser-certification-catalog.ts
- packages/cards/src/generated-support-types.ts
- packages/cards/src/generated-support-types.test.ts
- packages/cards/src/on-play-field-effect-parser.ts
- packages/cards/src/optional-trash-cost-ko-components.ts
- packages/cards/src/runtime-capability-matrix.ts
- packages/cards/src/runtime-capability-matrix.test.ts
- packages/cards/src/standalone-keyword-parser.ts
- packages/cards/src/start-of-game-stage-play-components.ts
- packages/cards/src/support-evaluator.ts
- packages/cards/src/support-evaluator.test.ts
- packages/cards/src/support-evaluator-parser-certification.test.ts
- packages/cards/src/support-probe.ts
- packages/cards/src/support-probe.test.ts
- packages/cards/src/top-n-search-components.ts
- packages/cards/src/support-probe-proof-certificate.test.ts
- packages/cards/src/support-probe-diagnostics.test.ts
- packages/cards/src/generated-support-report.ts
- packages/cards/src/generated-support-report.test.ts
- packages/cards/src/generated-support-proof-certificate.test.ts
- packages/cards/src/generated-support-diagnostics.test.ts
- packages/cards/src/generated-support-report-diagnostics.test.ts
- packages/cards/src/generated-support-capability-coverage.test.ts
- packages/cards/src/generated-support-component-identity.test.ts
- stories/generated/CARD-025-card-layer-spec010-migration-parent.yaml
- stories/generated/CARD-025G-generated-support-evaluator-proof-compatibility.yaml
- stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml
- stories/approved/CARD-025G-generated-support-evaluator-proof-compatibility.yaml
- agent-packets/CARD-025G.md
- agent-packets/active.json

## Constraints

- generate and activate the CARD-025G packet before implementation
- stay within allowed_touch_points
- do not add new parser, runtime, schema, fixture, or manifest behavior
- fail closed when a current support row cannot prove primitive evidence through the default production path
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

- story-review for CARD-025G before approval handoff
- generated-support evaluator matrix test covering current supported migrated families with synthetic inputs
- support-probe tests proving primitive evidence is visible for at least one representative row from each migrated concern
- generated-support report tests proving primitive evidence is visible for at least one representative row from each migrated concern
- proof-certificate tests proving primitive evidence is visible for at least one representative row from each migrated concern
- negative tests for missing wrapper, body, condition, cost, target/filter, source-policy, runtime capability, and composition primitive evidence
- migration debt inventory closeout test proving the original CARD-025A `migrationDebtInventory` is empty and no production generated-support authorization debt remains from CARD-025A
- anti-regression tests or detector self-tests proving remaining exact wrapper tokens, parser syntax fragments, and diagnostic story references are not treated as support authorization authority
- synthetic variation tests proving de-shaped current-family parser support does not depend on exact full-line samples, story-coded parser ownership labels, or sample-specific numeric branches
- regression tests proving de-shaped parser authorization preserves existing supported generated-support outputs for the current supported families and still fails closed for unrelated wording families
- anti-shape tests proving evaluator/proof/report code does not authorize support by exact full-line text, card IDs, external lists, parser-rule-only evidence, or full-definition-size gates
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

- evaluator support decisions are primitive-boundary based after CARD-025 migration
- evaluator output, support-probe output, generated-support report output, and proof certificates identify primitive parser certification evidence, runtime capability evidence, and composition evidence
- current supported generated-support families remain compatible through synthetic matrix coverage
- missing primitive evidence produces narrow fail-closed blockers
- parser rule IDs no longer serve as the only support authority in evaluator/proof/report code
- CARD-025A migration debt inventory contains no remaining production generated-support authorization debt
- tests fail if support authority comes from exact full-line text, real card IDs, external card lists, or full-definition-size authorization

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
