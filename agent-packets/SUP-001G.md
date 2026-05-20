<!-- agent-packet:story-id SUP-001G -->
<!-- agent-packet:story-path stories/approved/SUP-001G-don-minus-conditional-power-generated-support-promotion.yaml -->
<!-- agent-packet:story-sha256 1d9686eb2ef9516a045d7f1d6673a43667c76c75f3978b23a09b35c3c82a5205 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SUP-001G
Epic ID: SUP-001
Title: DON-minus conditional power generated-support promotion
Type: implementation
Area: cards
Primary Concern: rules

## Why

Complete the SUP-001 card-layer chain by promoting fully recognized DON-minus On Play draw and conditional When Attacking opponent-Character power modifier components into certified generated support after required contract, parser, and runtime prerequisites exist. This story is the card-layer bridge that turns reusable parser components into a schema-valid, capability-gated generated EffectDefinition without hardcoding any real card.

## Authoritative Spec References

- 01-system-architecture.s023 (Poneglyph-centered card-data topology)
- 02-engine-mechanics.s027 (Impossible actions)
- 02-engine-mechanics.s029 (Negative power)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s004 (Stable effect identity)
- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s011 (Conditions and costs)
- 05-effect-dsl-reference.s003 (Top-level definition)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s006 (Conditions)
- 05-effect-dsl-reference.s012 (Effects)
- 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 09-card-data-and-support-policy.s018 (Effect coverage report)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 11-testing-quality.s020 (Poneglyph/card-data tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 01-system-architecture.s023 (Poneglyph-centered card-data topology)

Poneglyph is external display/metadata truth. The simulator is gameplay truth.

```text
Poneglyph API
  -> @optcg/cards fetches and validates with Zod
  -> Redis read-through cache stores validated Poneglyph metadata
  -> certified parser rules may generate complete parsed effect definitions
  -> runtime capability matrix gates generated support status
  -> simulator overlay adds reviewed custom behavior, rulings, banlist status, and explicit overrides
  -> match server snapshots resolved cards at match creation
  -> engine consumes the match card manifest and effect registry
```

Important boundaries:

- The match server never trusts Poneglyph data supplied by the client.
- The client may fetch Poneglyph data for images/search/display only.
- The server validates every Poneglyph response before use.
- Simulator overlays are keyed by Poneglyph card ID.
- Common-template support is generated from complete parse plus runtime capability checks, not from a manual per-card allowlist or manual card-to-mechanic map.
- Generated support records are fail-closed: any unparsed, ambiguous, stale, unsupported, or capability-missing component keeps the card unsupported in normal play.
- Poneglyph variant indexes/generated variant keys are cosmetic and stored in deck data, not rule state.

### 02-engine-mechanics.s027 (Impossible actions)

If a required part of an effect is impossible, skip that impossible part unless the effect block says it requires all parts. Default policy is do as much as possible.

### 02-engine-mechanics.s029 (Negative power)

Power may be negative. Negative power does not automatically remove a card.

### 02-engine-mechanics.s036 (DON!! card mechanics)

- Each DON!! attached to a Leader or Character grants +1000 power during the controller's turn only.
- During Main Phase, a player may give any number of active DON!! from cost area to their Leader or Characters.
- An attached DON!! card has `state: "attached"`; it is neither active nor rested while attached.
- When a card with attached DON!! leaves the field, all attached DON!! return to the owner's cost area rested.
- During Refresh Phase, all attached DON!! return to cost area rested, then the player's Leader, Characters, Stage, and DON!! in cost area become active.
- A `DON!! -X` cost may return the paying player's DON!! from cost area, attached to their Leader, or attached to their Characters unless the card text narrows the source. The paying player chooses the DON!! sources. If there are fewer than X eligible DON!! cards, the cost cannot be paid and the activation is illegal or declined before use is consumed.

### 03-game-state-events-decisions.s020 (State hashing)

Replays and recovery need state hashes.

```ts
interface StateHashInput {
  state: GameState;
  includeHidden: boolean;
  normalizeTransientIds: boolean;
}
```

Use canonical JSON serialization:

- Stable object-key ordering.
- Stable array ordering.
- Exclude timestamps unless explicitly part of replay logic.
- Include hidden data for authoritative replay hashes.
- Use separate public-view hash for client sync if useful.

### 04-effect-runtime.s004 (Stable effect identity)

Every effect block has a stable ID. Never key `[Once Per Turn]` by array index.

```ts
interface EffectBlock {
  id: string; // e.g. "OP01-001:auto-1" or "OP01-040:activate-main-1"
  trigger: Trigger;
  category: EffectCategory;
  condition?: Condition;
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}
```

The `id` should remain stable across definition edits unless the effect's identity truly changes.

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

### 04-effect-runtime.s011 (Conditions and costs)

Before resolving an effect block:

1. Check source presence policy.
2. Re-check condition if the effect requires condition-on-resolution.
3. Check `[Once Per Turn]` usage by `source.instanceId + effectBlock.id + turn`.
4. If activation requires cost, create a `PayCostDecision` when choices are required.
5. Pay cost atomically and emit `costPaid` events.
6. Mark once-per-turn usage only after legal commitment: activation conditions passed, required activation-time targets selected, costs paid, and optional activation accepted. Declined optional effects and failed costs do not consume use; legally committed effects that later fizzle do consume use.

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

### 05-effect-dsl-reference.s003 (Top-level definition)

```ts
interface EffectDefinition {
  cardId: CardId;
  implementationStatus: CardSupportStatus;
  effects: EffectBlock[];
  metadata: EffectDefinitionMetadata;
}

interface EffectDefinitionMetadata {
  sourceTextHash: string;
  rulesVersion: string;
  effectDefinitionsVersion: string;
  tested: boolean;
  reviewer?: string;
  notes?: string;
}
```

### 05-effect-dsl-reference.s004 (Effect block)

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

Own only cards-layer generated-support composition, parser-rule evidence, runtime-capability gating, support-probe/report output, and synthetic proof tests for the full two-line composition shape. Do not add engine runtime behavior, shared contract/schema authority, real-card fixtures, source hash changes, behavior hash changes, overlays, support manifest edits, cards-produced manifest regeneration, or card-specific branches.

## Scope

- promote only fully supported line-separated parses whose DON-minus cost, On Play draw body, DON field-count condition, When Attacking wrapper, up-to-one opponent Character target, and this-turn power modifier components are all recognized by reusable SUP-001 primitives
- compose line-separated generated support for representative text such as `[On Play] DON!! -1: Draw 1 card.` and `[When Attacking] If you have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters -1000 power during this turn.`
- preserve each line as an independent supported EffectBlock inside one generated EffectDefinition
- require parser-rule certification, component evidence, schema validation, runtime capability evidence, support metadata, review state, tested state, source integrity, and behavior hash gates for generated support
- prove ASCII minus and Unicode minus handling through synthetic tests without making production code depend on exact full printed sample text
- keep generated support fail-closed when either line is unsupported or when line-separated composition cannot bind both supported blocks
- preserve fail-closed partial diagnostics when any cost, body, condition, target, power modifier, duration, schema, runtime capability, metadata, review, tested-state, source-integrity, behavior-hash, or line composition gate is missing
- keep real cards and any adjacent-card list outside story text, tests, implementation logic, and support proof authority

## Out of Scope

- engine runtime behavior
- shared contracts/schema/type changes
- real card IDs, real-card fixture capture, source hash updates, behavior hash updates, overlays, support manifest edits, or cards-produced manifest regeneration
- production branches for exact full card text, exact full effect lines, one real card, one external card list, or sample-specific sentence templates
- support for unsupported DON zones, unsupported private conditions, unsupported target shapes, unsupported durations, unsupported power/cost modifiers, or broad natural-language inference

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/**
- stories/generated/SUP-001*.yaml
- stories/approved/SUP-001*.yaml
- agent-packets/SUP-001G.md
- agent-packets/active.json

## Constraints

- generate and activate the SUP-001G packet before implementation
- do not activate SUP-001G until SUP-001D and SUP-001F have merged as reviewed evidence
- stay within allowed touch points
- do not add engine runtime behavior or shared contract/schema authority
- do not edit real-card fixtures, overlays, source hashes, behavior hashes, support manifests, or cards-produced manifests
- fail closed on any parser, schema, runtime capability, source integrity, metadata, review, test, or wording ambiguity that could accidentally mark unsupported text playable
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

- story-review for SUP-001G before approval handoff
- synthetic generated-support-index test proving complete support for both lines when all gates pass
- synthetic support-probe/report certificate test proving every gate reports passed for the complete case
- synthetic test proving at least one non-sample threshold or non-sample power value uses the same generated-support path
- tests proving ASCII and Unicode minus variants reach the same structured support path
- negative tests for malformed cost, unsupported condition, unsupported target, unsupported power value, unsupported duration, missing schema bridge, missing runtime capability, stale source hash, stale behavior hash, missing metadata, missing review, and missing tested-state gates
- regression tests proving existing draw, return-DON, CARD-014 modifyPower, CARD-020 diagnostics, and CARD-021 generated-support behavior remains compatible
- production-code search or lint-style assertion proving no real-card ID branch, full-card text branch, external-card-list branch, or sample-specific sentence template exists in production cards code outside test/story text
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

- a synthetic two-line source text combining DON-minus On Play draw and conditional When Attacking opponent power modifier produces complete generated support when all gates pass
- the generated EffectDefinition contains both effect blocks without losing cost, condition, trigger, source presence, target, power modifier, parser evidence, or capability evidence
- parser-rule certification, component evidence IDs, runtime capability IDs, schema validation, support metadata, review metadata, tested state, source integrity, and behavior hash gates all report as passed for the synthetic complete case
- the same parser/composer path supports at least one non-sample threshold or non-sample power value without a value-specific or card-specific branch
- malformed cost, unsupported condition, unsupported target, unsupported power value, unsupported duration, missing schema bridge, missing runtime capability, stale source hash, stale behavior hash, missing metadata, missing review, and missing tested-state cases remain non-playable with narrow diagnostics
- existing generated support for draw, return-DON play-selected, CARD-014 power modifiers, CARD-020 diagnostics, and CARD-021 line-separated composition remains compatible
- no production code or tests depend on a real card ID, exact full printed card text, human-held adjacent-card list, or one-off full-sentence implementation branch

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
