<!-- agent-packet:story-id SPEC-010A -->
<!-- agent-packet:story-path stories/approved/SPEC-010A-entry-point-terminology-wrapper-authority.yaml -->
<!-- agent-packet:story-sha256 48018308c5391130aa2d81b8c8400609c17f4e8537e4243e96a6d80bd1bcf858 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-010A
Epic ID: SPEC-010
Title: Entry-point terminology and wrapper authority
Type: specification
Area: docs
Primary Concern: docs

## Why

Clarify effect-system terminology so wrappers, timing windows, activation markers, source-presence policy, and effect bodies remain separate concepts in generated-support and runtime-capability authority.

## Authoritative Spec References

- 02-engine-mechanics.s024 (Effect categories)
- 02-engine-mechanics.s025 (Keyword behavior)
- 04-effect-runtime.s003 (Effect categories)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s011 (Conditions and costs)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s005 (Triggers)
- 05-effect-dsl-reference.s012 (Effects)
- 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 14-glossary.s008 (Effect block)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 02-engine-mechanics.s024 (Effect categories)

Every effect is classified as one of:

| Category    | Behavior                                             |
| ----------- | ---------------------------------------------------- |
| Auto        | Queued when an event satisfies its trigger.          |
| Activate    | Player chooses to activate during a legal window.    |
| Permanent   | Contributes modifiers/restrictions to computed view. |
| Replacement | Intercepts a replaceable process before it occurs.   |

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

### 02-engine-mechanics.s025 (Keyword behavior)

| Keyword         | Engine behavior                                                      |
| --------------- | -------------------------------------------------------------------- |
| Rush            | Character may attack the turn it was played.                         |
| Rush: Character | Character may attack Characters, not Leader, the turn it was played. |
| Double Attack   | Leader damage count is 2.                                            |
| Banish          | Damaged life card is trashed; no normal trigger/hand path.           |
| Blocker         | During Block Step, can rest to redirect attack.                      |
| Unblockable     | Skips opponent blocker window.                                       |
| Activate: Main  | Legal only during controller's Main Phase outside battle.            |
| Main            | Event usable during controller's Main Phase.                         |
| Counter         | Event usable during opponent's Counter Step.                         |
| Once Per Turn   | Tracked by stable effect ID and card instance per turn.              |
| DON!! xX        | Condition is attached DON!! count greater than or equal to X.        |

[Activate: Main], [Main], [Counter], and [Once Per Turn] are entry-point or marker wrappers, not keyword body primitives. [Blocker], [Banish], [Rush], [Rush: Character], and [Double Attack] remain keyword body behavior.

### 04-effect-runtime.s003 (Effect categories)

| Category    | Runtime behavior                                           |
| ----------- | ---------------------------------------------------------- |
| Auto        | Detected from `EngineEvent`s and queued.                   |
| Activate    | Exposed through legal actions during valid timing windows. |
| Permanent   | Contributes continuous modifiers to computed view.         |
| Replacement | Intercepts replaceable processes before atomic mutation.   |

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

### 04-effect-runtime.s007 (Source presence policy)

A simple "cancel if source moved" rule is not enough. Zone-transition triggers such as `[On K.O.]` must activate on field and resolve after the card moves to trash.

```ts
type SourcePresencePolicy =
  | "mustRemainInSameZone"
  | "resolveFromDestinationZone"
  | "resolveFromLastKnownInformation"
  | "noSourceRequired";
```

Recommended defaults:

| Trigger/effect kind           | Policy                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `[When Attacking]`            | `mustRemainInSameZone`                                                                                |
| `[On Your Opponent's Attack]` | `mustRemainInSameZone`                                                                                |
| `[On Block]`                  | `mustRemainInSameZone`                                                                                |
| `[On K.O.]`                   | `resolveFromDestinationZone` or `resolveFromLastKnownInformation`, depending on ruling/implementation |
| `[Trigger]` from life         | `resolveFromLastKnownInformation` or `noSourceRequired` while in no zone                              |
| Event `[Main]` / `[Counter]`  | `resolveFromDestinationZone` after event is trashed                                                   |
| Global rule-created effect    | `noSourceRequired`                                                                                    |

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

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

### 05-effect-dsl-reference.s004 (Effect block)

Entry-point selectors are wrapper semantics, not effect body primitives. The current DSL field name `trigger` includes entry-point selector values and must not be read as only queued triggered-effect timing.

```ts
interface EffectBlock {
  id: string;
  category: "auto" | "activate" | "permanent" | "replacement";
  trigger: Trigger;
  condition?: Condition;
  conditionTiming?: "activation" | "resolution" | "both";
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}
```

### 05-effect-dsl-reference.s005 (Triggers)

Entry-point selectors are wrapper semantics, not effect body primitives. The current DSL field name `trigger` includes entry-point selector values and must not be read as only queued triggered-effect timing.

```ts
type Trigger =
  | { type: "onPlay" }
  | { type: "whenAttacking" }
  | { type: "onOpponentAttack" }
  | { type: "onBlock" }
  | { type: "onKO" }
  | { type: "endOfYourTurn" }
  | { type: "endOfOpponentTurn" }
  | { type: "trigger" }
  | { type: "donAttach"; count: number }
  | { type: "activateMain" }
  | { type: "main" }
  | { type: "counter" }
  | { type: "permanent" }
  | { type: "replacement"; replacement: ReplacementTrigger }
  | { type: "startOfGame" }
  | { type: "startOfYourTurn" }
  | { type: "startOfOpponentTurn" }
  | { type: "startOfMainPhase" }
  | { type: "endOfBattle" }
  | { type: "custom"; event: string };
```

### 05-effect-dsl-reference.s012 (Effects)

```ts
type Effect =
  // Card movement
  | { type: "draw"; count: number; player: PlayerRef }
  | { type: "drawUpTo"; count: number; player: PlayerRef }
  | { type: "search"; request: SearchRequest }
  | { type: "lookAtTop"; player: PlayerRef; count: number }
  | {
      type: "revealFromZone";
      player: PlayerRef;
      zone: Zone;
      count?: number;
      filter?: CardFilter;
      to: Visibility;
    }
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: Zone | SelectionSetId;
      to: Zone;
      position?: "top" | "bottom";
    }
  | {
      type: "putRemaining";
      zone: Zone;
      position: "top" | "bottom";
      order: "ownerChoice" | "chooserChoice" | "random";
    }
  | { type: "shuffleDeck"; player: PlayerRef }
  | {
      type: "bounce";
      target: Target;
      destination: "hand" | "deckTop" | "deckBottom";
    }
  | { type: "trash"; target: Target }
  | { type: "ko"; target: Target }
  | {
      type: "play";
      source: Zone;
      player: PlayerRef;
      filter: CardFilter;
      costModifier?: number;
    }
  | {
      type: "trashFromHand";
      player: PlayerRef;
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "payCost"; cost: OptionalCost }

  // Power/cost modification
  | { type: "modifyPower"; target: Target; value: number; duration: Duration }
  | { type: "setPowerToZero"; target: Target; duration: Duration }
  | { type: "setBasePower"; target: Target; value: number; duration: Duration }
  | {
      type: "modifyCost";
      filter: CardFilter;
      value: number;
      duration: Duration;
      player: PlayerRef;
    }
  | { type: "setBaseCost"; target: Target; value: number; duration: Duration }

  // State and keywords
  | { type: "rest"; target: Target }
  | { type: "activate"; target: Target }
  | {
      type: "giveKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }
  | {
      type: "removeKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }

  // DON!!
  | { type: "addDon"; count: number; player: PlayerRef }
  | { type: "attachDon"; target: Target; count: number; player: PlayerRef }
  | { type: "returnDon"; count: number; player: PlayerRef }

  // Life and damage
  | {
      type: "addLife";
      count: number;
      player: PlayerRef;
      source: "deck" | "hand" | "trash";
      faceUp?: boolean;
    }
  | { type: "damage"; target: "leader"; player: PlayerRef; count: number }

  // Restrictions/protections
  | { type: "invalidateEffects"; target: Target; duration: Duration }
  | { type: "protectFromKO"; target: Target; duration: Duration }
  | { type: "cannotAttack"; target: Target; duration: Duration }
  | { type: "cannotBlock"; target: Target; duration: Duration }
  | { type: "cannotBeAttacked"; target: Target; duration: Duration }
  | {
      type: "cannotBeBlockedBy";
      target: Target;
      filter: CardFilter;
      duration: Duration;
    }

  // Composition
  | { type: "sequence"; effects: SequencedEffect[] }
  | {
      type: "choice";
      chooser: PlayerRef;
      options: EffectOption[];
      min: number;
      max: number;
    }
  | { type: "conditional"; if: Condition; then: Effect; else?: Effect }
  | {
      type: "forEachMatch";
      zone: Zone;
      player: PlayerRef;
      filter: CardFilter;
      effect: Effect;
    }
  | { type: "repeat"; count: number; effect: Effect }

  // Replacement/custom
  | { type: "replacement"; when: ReplacementTrigger; instead: Effect }
  | { type: "custom"; handler: string };
```

Cardinality fields such as `min` and `max` use the exact-N and up-to-N semantics from `03-game-state-events-decisions.s017`. `drawUpTo` is a planned `chooseQuantity`-backed primitive: it must pause through a `chooseQuantity` pending decision, validate the selected whole integer against public min/max bounds, and draw only the chosen amount when a future runtime story makes it executable.

`drawUpTo` short-deck resolution is do-as-much-as-possible. If the chosen quantity is greater than the number of cards remaining in that player's deck, the runtime must draw every remaining card and emit draw and card-movement events only for cards actually drawn. The next rule-processing checkpoint detects deck-out under `02-engine-mechanics.s035`; the effect does not fail closed before drawing the remaining cards solely because the chosen quantity exceeded the remaining deck size.

Event `seq` values for partial-deck drawUpTo resolution must remain strictly increasing by append order, as required by `03-game-state-events-decisions.s005`. The resolved decision increments `state.seq` once under `03-game-state-events-decisions.s022`; individual draw events do not each advance `state.seq`. State hashes at the replay checkpoints include the post-draw empty deck. Golden replay coverage for drawUpTo short-deck cases must pin the final state hash.

Duration and restriction effects such as `cannotAttack`, `cannotBlock`, `cannotBeAttacked`, `cannotBeBlockedBy`, `invalidateEffects`, and `protectFromKO` remain planned unless the schema coverage policy lists them as schema-supported and the runtime capability matrix proves the active engine can enforce the restriction for the full duration.

Synthetic terminology example:

- wrapper: `[Activate: Main]` activation wrapper
- category: `activate`
- source-presence policy: `mustRemainInSameZone`
- markers: `[Once Per Turn]`
- body primitive: `{ type: "ko", target: ... }`

### 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)

The effect-system plan supports three authoring paths:

1. Manual DSL definitions written by developers.
2. Custom TypeScript handlers for cards that cannot be expressed in DSL.
3. Generated DSL from Poneglyph printed card text when certified parser rules produce a complete parse and runtime capability checks pass.

Support ladder:

1. `contract-defined`: a primitive or behavior is described by the Markdown spec or canonical TypeScript contract.
2. `schema-authorable`: `contracts/effect-dsl.schema.json` can validate JSON fixtures for that primitive.
3. `runtime-executable`: the current runtime capability matrix proves the engine can execute the primitive, including decisions, visibility, replay, failure policy, and pause/resume behavior.
4. `parser-certified`: reviewed parser rules produce a complete parse for the relevant printed text shape.
5. `generated-support playable`: a generated support record may enable normal play only when the parse is complete and every parsed component has current runtime capability evidence.

Schema authorability alone is insufficient for generated-support playable status. Generated support requires runtime capability evidence and complete parser support; schema validation only proves a JSON shape can be authored.

This section is a terminology-only clarification and does not define generated-support evidence factorization rules; support-evidence factorization remains in SPEC-010B.

Generated definitions must never be deployed blindly. A new parser rule, ambiguous parse class, custom handler binding, or wording/ruling ambiguity requires review before it can certify support. Once a parser rule is certified, matching complete-parse cards may be generated without a manual per-card allowlist or manual card-to-mechanic map for that common template.

A complete parse covers all gameplay-relevant printed text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement or optionality semantics, and ruling/errata inputs that affect behavior. Multiple parsed effects compose into one generated `EffectDefinition`. Partial parse output may be reported for coverage progress, but it must not make the card playable in normal modes.

Bandai or Poneglyph wording drift must invalidate the affected parse/hash evidence or downgrade support until parser and support evidence are updated. If any parsed component is unparsed, ambiguous, stale, unsupported, or missing runtime capability evidence, the generated definition fails closed instead of partially enabling the card.

```ts
interface EffectDefinitionMetadata {
  cardId: CardId; // Poneglyph base card ID
  source: "poneglyph";
  sourceTextHash: string;
  generatedBy?: "manual" | "rule-parser" | "llm-assisted";
  reviewedBy?: string;
  reviewedAt?: string;
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

This section is a terminology-only clarification and does not define generated-support evidence factorization rules; support-evidence factorization remains in SPEC-010B.

### 14-glossary.s008 (Effect block)

One distinct effect on a card, identified by a stable `effectId`.

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only specification terminology, examples, generated spec metadata, and narrow authority tests for entry-point and wrapper semantics. Do not change canonical TypeScript contracts, effect DSL schema, engine runtime behavior, parser behavior, generated-support metadata, or card support.

## Scope

- clarify that the current DSL `EffectBlock.trigger` field carries event-trigger selector values and entry-point, continuous, and replacement selector values, not only queued triggered-effect timing
- distinguish effect categories (`auto`, `activate`, `permanent`, `replacement`) from entry-point selectors and from effect body primitives
- split or clarify the current keyword behavior wording so `[Activate: Main]`, `[Main]`, `[Counter]`, and `[Once Per Turn]` are not treated as keyword body behavior in the same sense as `[Blocker]`, `[Banish]`, `[Rush]`, `[Rush: Character]`, or `[Double Attack]`
- define wrapper or entry-point adapter responsibility as timing, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics
- state terminology-only boundaries that wrapper or entry-point adapter semantics are a different concept from effect body primitive semantics, leaving support-evidence factorization rules to SPEC-010B
- include synthetic terminology examples that identify wrapper or entry point, category, source-presence policy, markers, and body as separate named concepts without defining generated-support evidence requirements
- add or update authority tests that pin the entry-point terminology and wrapper/body separation wording
- update generated spec metadata

## Out of Scope

- renaming canonical `Trigger` or `EffectBlock.trigger` contract fields
- TypeScript contract changes or effect DSL schema changes
- runtime support for additional entry points, legal-action paths, source policies, or effect bodies
- parser certification, generated-support admission, support reports, fixtures, overlays, or real-card promotion
- changing official gameplay semantics for any keyword, timing window, or once-per-turn rule

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/02-engine-mechanics.md
- specs/04-effect-runtime.md
- specs/05-effect-dsl-reference.md
- specs/09-card-data-and-support-policy.md
- specs/14-glossary.md
- specs/source-coverage-matrix.md
- specs/section-index.json
- specs/spec-manifest.json
- specs/SPEC_VERSION.md
- tests/contracts/spec-authority-gates.test.mjs
- stories/generated/SPEC-010A-entry-point-terminology-wrapper-authority.yaml
- stories/approved/SPEC-010A-entry-point-terminology-wrapper-authority.yaml
- agent-packets/SPEC-010A.md
- agent-packets/active.json

## Constraints

- do not change runtime, schema, parser, generated-support, or card behavior in this story
- preserve fail-closed generated-support policy
- fail closed on gameplay, hidden-information, replay, or source-presence ambiguity
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

- update `tests/contracts/spec-authority-gates.test.mjs` to require wording for entry-point selector semantics, wrapper/body separation, and non-keyword marker clarification
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

- specs explicitly say the current DSL `trigger` field includes entry-point selectors and must not be read as only queued trigger timing
- specs explicitly separate entry-point/wrapper adapter responsibilities from reusable effect body primitive semantics
- specs no longer present `[Activate: Main]`, `[Main]`, `[Counter]`, or `[Once Per Turn]` as keyword body behavior equivalent to supported keyword bodies
- synthetic terminology examples show wrapper, category, markers, source-presence policy, and body as separate concepts without defining generated-support evidence factorization rules
- authority tests pin the clarified terminology and examples

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
