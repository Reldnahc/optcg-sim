<!-- agent-packet:story-id CARD-021D -->
<!-- agent-packet:story-path stories/approved/CARD-021D-continuous-condition-composition-diagnostics.yaml -->
<!-- agent-packet:story-sha256 cbef5b554c5ff66f88f4f42ef72f263bac175ccab60e86a5879247d47c1ed5bf -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-021D
Epic ID: CARD-021
Title: Continuous condition composition diagnostics
Type: implementation
Area: cards
Primary Concern: verification

## Why

Compose the CARD-021 condition, keyword-grant, and protection text components with existing line-separated On K.O. draw evidence in synthetic parser/probe proof cases while preserving fail-closed generated-support gates.

## Authoritative Spec References

- 01-system-architecture.s023 (Poneglyph-centered card-data topology)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 04-effect-runtime.s004 (Stable effect identity)
- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s013 (Replacement effects)
- 05-effect-dsl-reference.s003 (Top-level definition)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s006 (Conditions)
- 05-effect-dsl-reference.s009 (Card filters)
- 05-effect-dsl-reference.s016 (Replacement triggers)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 09-card-data-and-support-policy.s018 (Effect coverage report)
- 09-card-data-and-support-policy.s022 (Security checklist)
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

### 03-game-state-events-decisions.s023 (Error handling inside the engine)

Engine errors are classified.

```ts
type EngineError =
  | { type: "illegalAction"; reason: string }
  | { type: "invalidDecisionResponse"; reason: string }
  | { type: "invariantViolation"; invariant: string; details: unknown }
  | { type: "unsupportedCard"; cardId: CardId; status: CardSupportStatus }
  | { type: "effectRuntimeError"; effectId: string; details: unknown }
  | { type: "loopDetected"; signature: LoopSignature };
```

Illegal player actions are rejected and logged. Invariant violations and effect runtime errors freeze or recover the match according to the recovery policy.

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

### 04-effect-runtime.s013 (Replacement effects)

Replacement effects intercept replaceable processes.

```ts
interface ReplacementProcess {
  id: string;
  type: ReplaceableProcessType;
  source?: CardRef;
  target?: CardRef;
  payload: unknown;
  causedBy: CausalityRef;
  usedReplacementIds: string[];
}
```

Processing order:

1. Replacements generated by the card/process being replaced, if applicable.
2. Turn player's applicable replacements in chosen order.
3. Non-turn player's applicable replacements in chosen order.

A replacement cannot apply twice to the same replacement process. If a replacement cannot actually perform its replacement, it does not apply.

```ts
function executeReplaceableProcess(
  state: GameState,
  process: ReplacementProcess,
): EngineStepResult {
  let current = process;
  let currentState = state;

  while (true) {
    const replacements = findApplicableReplacements(currentState, current)
      .filter((r) => !current.usedReplacementIds.includes(r.id))
      .filter((r) => canApplyReplacement(r, currentState, current));

    if (replacements.length === 0) {
      return executeUnreplacedProcess(currentState, current);
    }

    const choice = chooseReplacementByPriorityOrDecision(
      currentState,
      replacements,
      current,
    );

    if (choice.pausedForDecision) {
      return choice.result;
    }

    if (!choice.chosen) {
      return executeUnreplacedProcess(currentState, current);
    }

    current = {
      ...transformProcessByReplacement(choice.chosen, currentState, current),
      usedReplacementIds: [...current.usedReplacementIds, choice.chosen.id],
    };

    currentState = emitReplacementApplied(
      currentState,
      choice.chosen,
      current,
    ).state;
  }
}
```

Replacement decisions use `PendingDecision.chooseReplacement`. Optional replacements may be declined; mandatory replacements cannot be declined unless more than one mandatory replacement requires a controller-chosen order. A replacement cannot apply twice to the same `process.id`, even if the process is transformed into a new shape.

Every applied replacement emits `replacementApplied` with the original process ID, selected replacement ID, old process payload hash, and transformed process payload hash. This event is at least `replayOnly` and may be public when the replacement effect is public.

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

### 05-effect-dsl-reference.s009 (Card filters)

```ts
interface CardFilter {
  cardIds?: CardId[];
  names?: string[];
  nameContains?: string;
  nameNot?: string[];
  categories?: CardCategory[];
  colorsAny?: Color[];
  colorsAll?: Color[];
  typesAny?: string[];
  typesAll?: string[];
  attributesAny?: Attribute[];
  attributesAll?: Attribute[];
  cost?: { op: Comparator; value: number } | { min?: number; max?: number };
  power?: { op: Comparator; value: number } | { min?: number; max?: number };
  counter?: { op: Comparator; value: number } | { min?: number; max?: number };
  hasKeywords?: Keyword[];
  lacksKeywords?: Keyword[];
  state?: "active" | "rested" | "attached";
  owner?: PlayerRef;
  controller?: PlayerRef;
  excludeSelf?: boolean;
  custom?: string;
}
```

### 05-effect-dsl-reference.s016 (Replacement triggers)

```ts
type ReplacementTrigger =
  | { type: "wouldBeKOd"; target: Target }
  | { type: "wouldTakeDamage"; target: Target }
  | { type: "wouldBeTrashed"; target: Target }
  | { type: "wouldDraw"; player: PlayerRef }
  | { type: "wouldMoveZone"; from?: Zone; to?: Zone; target: Target }
  | { type: "custom"; event: string };
```

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

### 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)

The Poneglyph adapter emits `ResolvedCard` from `contracts/canonical-types.ts`. Important normalization rules:

- `attribute` values become `attributes: Attribute[]`; never collapse to a singular attribute.
- `color` values become `colors: CardColor[]`; multi-color cards preserve all colors.
- `variants[].index` becomes `variantIndex`.
- `variantKey = `${cardId}:v${variantIndex}``.
- Missing market prices, product set codes, or image URLs are allowed display gaps and must not fail gameplay resolution.
- Search endpoint DTOs are never accepted as manifest card details. Only detail/batch card payloads can become `ResolvedCard`.
- `sourceTextHash` covers printed effect/trigger text used for implementation drift.
- `behaviorHash` covers stats, type line, effect, trigger, official FAQ, errata, and any source field that can alter behavior.

### 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)

Every supported card stores a hash of its Poneglyph printed text and, when generated support is used, a behavior hash or parser-evidence hash for the complete parsed behavior.

When the Poneglyph text changes:

1. Mark the card implementation as stale.
2. Fail CI if a stale card remains marked `tested` without review.
3. Prevent ranked use if the changed text affects card behavior.
4. Require parser/support evidence to be updated before generated support may remain playable.
5. Require a reviewer to update the source hash after verifying any DSL/custom handler or certified parser-rule evidence that remains authoritative.

This catches errata, typo fixes that affect parsing, and Poneglyph schema/text changes.

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

### 09-card-data-and-support-policy.s022 (Security checklist)

- Server never trusts card metadata from client.
- Poneglyph response is schema-validated before cache write.
- Overlay merge is versioned.
- Match snapshots resolved cards before play starts.
- Unsupported cards are rejected in public modes.
- Variant IDs are cosmetic and never affect rules.
- Poneglyph text hash changes trigger implementation review.
- Replays store versions and manifest hashes.

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

Own only cards-side synthetic parser, generated-support, support-probe, and report proof cases for composition of already-reviewed CARD-021 components with existing On K.O. draw support. Do not add engine behavior, shared schema authority, real-card fixtures, source hash changes, behavior hash changes, overlays, support manifest edits, or real-card support promotion.

## Scope

- add synthetic parser/probe/report proof cases that combine a public trash-count condition with a keyword-grant component and a field-removal protection component under one conditional source line
- prove the body conjunction between protection and keyword-grant components is parsed only when boundaries are unambiguous
- prove existing line-separated On K.O. draw support remains independently recognized and retains its existing component evidence
- prove a synthetic two-line text can report recognized first-line continuous components and existing second-line On K.O. draw evidence while final support remains fail-closed if any continuous component gate is missing
- prove complete generated support is produced only if every parser, schema, runtime capability, engine proof/test, metadata, review, tested-state, and source-integrity gate passes
- preserve partial parse behavior and narrow unparsed spans for unsupported residue
- use synthetic source snippets and obvious non-Poneglyph synthetic card IDs only

## Out of Scope

- implementing child CARD-021A, CARD-021B, or CARD-021C primitives inside this composition child
- real card IDs, fixture capture, source hash updates, behavior hash updates, overlays, support manifest edits, or cards-produced manifest regeneration
- human-held adjacent-card list usage in story text, tests, implementation logic, parser branches, source-integrity evidence, or support proof
- production branches for exact full card text, exact full effect lines, one real card, one external card list, or sample-specific sentence templates
- engine runtime behavior
- shared TYP/contracts/schema changes
- broad natural-language inference, unsupported keywords, unsupported protection wording, unsupported conditions, unsupported field-removal processes, or unsupported composition shapes

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/conditional-generated-support-composer.ts
- packages/cards/src/conditional-generated-support-composer.test.ts
- packages/cards/src/composed-parser-builder.ts
- packages/cards/src/composed-parser-builder.test.ts
- packages/cards/src/certified-card-text-parser.ts
- packages/cards/src/certified-card-text-parser.test.ts
- packages/cards/src/generated-support-index.ts
- packages/cards/src/generated-support-index.test.ts
- packages/cards/src/generated-support-report.ts
- packages/cards/src/generated-support-report.test.ts
- packages/cards/src/generated-support-types.ts
- packages/cards/src/generated-support-types.test.ts
- packages/cards/src/runtime-capability-matrix.ts
- packages/cards/src/runtime-capability-matrix.test.ts
- packages/cards/src/support-evaluator.ts
- packages/cards/src/support-evaluator.test.ts
- packages/cards/src/support-probe.ts
- packages/cards/src/support-probe.test.ts
- packages/cards/src/*support*.test.ts
- packages/cards/src/*diagnostic*.ts
- packages/cards/src/*diagnostic*.test.ts
- stories/generated/CARD-021*.yaml
- stories/approved/CARD-021*.yaml
- agent-packets/CARD-021D.md
- agent-packets/active.json

## Constraints

- generate and activate the CARD-021D packet before implementation
- do not activate or hand off CARD-021D until CARD-021A, CARD-021B, and CARD-021C have landed as reviewed commit evidence on the parent branch
- stay within allowed_touch_points
- do not add engine runtime behavior, shared schema authority, fixture support, source hash updates, overlays, or card-specific templates
- fail closed if composition boundaries or generated-support gates are ambiguous
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

- story-review for CARD-021D before approval handoff
- synthetic parser/probe test for condition plus protection plus keyword-grant component recognition
- synthetic parser/probe test for condition plus keyword-grant with at least one non-Blocker allowlisted keyword
- synthetic two-line test combining the continuous conditional line with existing `[On K.O.] Draw 1 card.`
- support-probe/report certificate test proving recognized components and missing gates are reported separately from final playable decision
- missing-gate tests for condition, keyword-grant, protection, schema/runtime bridge, source integrity, metadata, review, and tested-state failures
- regression test proving standalone existing On K.O. draw generated support remains unchanged
- negative tests proving no real card ID, full-card text, adjacent-card list, or exact sample sentence is required for parser success
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm --filter @optcg/cards test`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- synthetic composition proof cases recognize trash-count condition, keyword-grant, protection, and On K.O. draw components without real card IDs
- support-probe/report output distinguishes recognized components, missing gates, and final playable decision
- existing On K.O. draw support remains supported when tested independently
- a two-line synthetic composition remains unsupported when any continuous component gate is missing, while still reporting recognized components
- if every gate is truthfully present, complete support must be produced through reusable component evidence rather than one exact full-line branch
- no production code or tests depend on real card IDs, exact full card text, or the human-held adjacent-card list

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
