<!-- agent-packet:story-id SUP-002G -->
<!-- agent-packet:story-path stories/approved/SUP-002G-top-n-filtered-search-card-components.yaml -->
<!-- agent-packet:story-sha256 755eb0634d5c3017d9b1699715ac80a0109ca7b49604367c56d577a4ec6c2c4f -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SUP-002G
Epic ID: SUP-002
Title: Top-N search card components
Type: implementation
Area: cards
Primary Concern: rules

## Why

Parse and promote reusable cards-layer support for top-N deck searches with composed color/type/name-exclusion filters or unfiltered any-card selection, add-to-hand selection, reveal semantics, and bottom-of-deck remainder placement.

## Authoritative Spec References

- 01-system-architecture.s023 (Poneglyph-centered card-data topology)
- 04-effect-runtime.s004 (Stable effect identity)
- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s007 (Source presence policy)
- 05-effect-dsl-reference.s003 (Top-level definition)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s006 (Conditions)
- 05-effect-dsl-reference.s014 (Search request)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
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

### 05-effect-dsl-reference.s014 (Search request)

```ts
interface SearchRequest {
  zone: "deck" | "trash" | "life";
  player: PlayerRef;
  lookCount?: number;
  filter: CardFilter;
  min: number;
  max: number;
  destination: Zone;
  revealTo: Visibility;
  remainingCards?: {
    destination: Zone;
    position: "top" | "bottom";
    order: "ownerChoice" | "random";
  };
  shuffleAfter?: boolean;
}
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

Cards-layer story only. Contract/schema prerequisites must already be implemented by SUP-002I and runtime prerequisites must already be implemented by SUP-002D. Do not add new engine runtime behavior, shared contract/schema changes, real-card fixture promotion, source hashes, behavior hashes, overlays, or card-specific branches.

## Scope

- define parser primitives separately before composing them: `[On Play]` trigger wrapper, top-N deck look, reveal-vs-non-reveal selected-card visibility, up-to-one cardinality, optional color filter, optional `{TYPE}` type filter, optional `other than [Name]` exclusion, add-to-hand destination, bottom remainder owner-choice placement, DON-minus cost wrapper, and trailing hand-trash effect
- parse `[On Play] Look at N cards from the top of your deck; reveal up to 1 <filter> card and add it to your hand. Then, place the rest at the bottom of your deck in any order.`
- parse `[On Play] DON!! −N: Look at M cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash K card(s) from your hand.`
- support composed filter primitives for color, named type in braces, and `other than [Name]` name exclusion
- support valid filtered-search subsets by composing whichever filter primitives are present, including `{TYPE} type card`, `<COLOR> {TYPE} type card`, `{TYPE} type card other than [Name]`, and `<COLOR> {TYPE} type card other than [Name]`
- support an unfiltered any-card search primitive for text that says `add up to 1 card to your hand` without a filter phrase
- emit reusable SearchRequest data with self deck, lookCount, min zero, max one, hand destination, selected-card visibility from printed wording, and bottom remainder order
- compose DON-minus cost, top-N non-reveal any-card search, bottom remainder ordering, and trailing hand-trash through existing reusable sequence/component families rather than exact full-line handling
- vary look count, DON-minus count, trailing trash count, color, type name, and excluded card name in tests to prevent exact sentence matching
- add runtime capability matrix evidence that cites SUP-002D capability groups

## Out of Scope

- engine runtime behavior or shared contract/schema changes
- real-card fixture capture, source hash updates, behavior hash updates, overlays, supported-card manifests, or cards-produced manifests
- exact card IDs, exact full-card text, external card lists, or one-off full-effect branches
- search-and-play, search from trash/life, shuffle-after-search, trash remainder, top remainder, multi-destination search, arbitrary filter grammar, or unsupported search timing families
- new DON-minus cost runtime behavior; this story may only consume existing reusable DON-minus cost wrapper and runtime capability evidence
- new hand-trash runtime behavior; this story may only consume existing reusable hand-trash effect/cost and generic sequence capability evidence
- exact branches for `[On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.` or any representative line as a whole string

## Allowed Touch Points

<!-- prettier-ignore -->
- stories/generated/SUP-002G-top-n-filtered-search-card-components.yaml
- stories/approved/SUP-002G-top-n-filtered-search-card-components.yaml
- agent-packets/SUP-002G.md
- agent-packets/active.json
- packages/cards/src/certified-card-text-parser.ts
- packages/cards/src/certified-card-text-parser.test.ts
- packages/cards/src/composed-parser-builder.ts
- packages/cards/src/composed-parser-builder.test.ts
- packages/cards/src/top-n-search-components.ts
- packages/cards/src/top-n-search-components.test.ts
- packages/cards/src/top-n-search-evidence.ts
- packages/cards/src/top-n-search-generated-support.test.ts
- packages/cards/src/sup-002-generated-support-line-regression.test.ts
- packages/cards/src/generated-support-index.ts
- packages/cards/src/generated-support-index.test.ts
- packages/cards/src/generated-support-report.test.ts
- packages/cards/src/generated-support-types.ts
- packages/cards/src/generated-support-types.test.ts
- packages/cards/src/runtime-capability-matrix.ts
- packages/cards/src/runtime-capability-matrix.test.ts
- packages/cards/src/support-evaluator.ts
- packages/cards/src/support-evaluator-parser-certification.test.ts
- packages/cards/src/support-evaluator.test.ts
- packages/cards/src/support-probe.test.ts

## Constraints

- implement only SUP-002G while its packet is active
- do not activate or implement SUP-002G until SUP-002I contract/schema evidence and SUP-002D runtime capability evidence have landed as reviewed prerequisite evidence on the active parent integration branch
- stop and split if implementation requires new engine runtime behavior
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

- cards parser primitive-boundary tests for top-N deck look, reveal/non-reveal visibility, max-one cardinality, add-to-hand destination, and bottom remainder placement independent of any single full representative sentence
- cards parser/generated-support matrix for filtered top-N search with bottom remainder covering type-only, color-plus-type, type-plus-name-exclusion, and color-plus-type-plus-name-exclusion
- representative regression for `[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.`
- test varying look count, color, type name, and excluded name without collapsing those filter primitives into one required sentence shape
- real-schema generated-support regression for each supported top-N search matrix row
- support-evaluator or support-probe regression for representative filtered-search and DON-minus/search/trailing-trash lines proving the production/default path has no missing parser-certification blockers
- cards parser/generated-support test for `[On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.` through reusable DON-minus, search, bottom remainder, and hand-trash composition
- parser composition test proving the DON-minus wrapper, non-reveal any-card search, bottom remainder placement, and trailing hand-trash effect are separate reusable components and not one full-line branch
- variant full-composition test changing DON-minus count, look count, and trash count without changing parser-rule family or adding full-line branches
- fail-closed generated-support test when parser-rule certification evidence is absent or stale for any scoped primitive or composition component
- fail-closed tests for unsupported remainder destinations, unsupported filter words, and missing reveal/add-to-hand body pieces
- fail-closed tests for non-reveal search with unsupported destination, unsupported remainder placement, unsupported extra filter words, and unsupported trailing effect text
- runtime capability matrix test for SUP-002D capability evidence
- regression test for any existing search-reveal generated-support rows
- `corepack pnpm --filter @optcg/cards test`
- `corepack pnpm run stories:validate`
- `corepack pnpm run packets:verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- parser/generator support is generic over look count, color, type name, and excluded card name while selection remains max one
- parser/generator implementation must not require color, type, and name exclusion to appear together; filter primitives are optional and compose into CardFilter independently
- a parser that accepts `<COLOR> {TYPE} type card other than [Name]` but rejects `{TYPE} type card` fails this story
- generated-support tests that assert `status: supported` must validate the produced Effect DSL with the real schema validator
- parser/generator implementation must expose or test primitive boundaries for trigger, top-N deck look, reveal/non-reveal visibility, cardinality, filter, add-to-hand destination, bottom remainder placement, DON-minus cost, and trailing hand-trash; full-line success plus value variation is not sufficient evidence
- generated-support promotion requires current parser-rule certification evidence for each scoped primitive and for the filtered-search and DON-minus/search/trailing-trash compositions; absent or stale certification evidence must fail closed even when DSL schema validation and runtime capability checks pass
- the production/default generated-support path must supply that current parser-rule certification evidence; this story fails if only lower-level tests with manually injected certification evidence pass while `evaluateGeneratedSupportPlayability` or support-probe reports missing parser certification for the same top-N search shapes
- parser/generator support is generic over non-reveal any-card search look count, DON-minus count, and trailing trash count while selection remains max one
- generated support fails closed when search window, filter, selection destination, or remainder placement is only partially parsed
- generated support for non-reveal search does not infer public reveal from look/search/add-to-hand text and does not leak selected or unselected looked-card identity to the opponent
- the full DON-minus/search/trailing-trash representative line is supported only by composing reusable primitive parser outputs and existing capability gates; if implementation cannot compose those components without new runtime or contract work, stop and split that generic composition gap instead of hardcoding the line
- runtime capability evidence is required before final playable/generated-support decision can pass
- no production code checks exact full effect text, card IDs, or the representative sample as a whole string

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
