---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "09-card-data-and-support-policy"
doc_title: "Card Data And Support Policy"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Card Data, Poneglyph Integration, and Support Policy

<!-- SECTION_REF: 09-card-data-and-support-policy.s001 -->

Section Ref: `09-card-data-and-support-policy.s001`

## Purpose

<!-- SECTION_REF: 09-card-data-and-support-policy.s002 -->

Section Ref: `09-card-data-and-support-policy.s002`

The card-data layer is the bridge between external printed-card metadata and simulator-owned rule implementation data. The original plan made **Poneglyph API (`api.poneglyph.one`) the source of truth for card text, stats, images, variants, and metadata**. This spec keeps that decision explicit and adds a support policy so unsupported effect cards cannot silently behave as vanilla cards.

`@optcg/cards` is a thin typed adapter over Poneglyph plus a simulator overlay. The engine consumes resolved cards from this adapter; it does not call Poneglyph directly during effect resolution.

## Data ownership model

<!-- SECTION_REF: 09-card-data-and-support-policy.s003 -->

Section Ref: `09-card-data-and-support-policy.s003`

| Data                    | Source / authority                                            | Notes                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base card ID            | Poneglyph                                                     | This is the canonical `cardId` used by decks, effects, state, and DB rows.                                                                                                     |
| Printed name            | Poneglyph                                                     | Display and search.                                                                                                                                                            |
| Category                | Poneglyph                                                     | Leader, Character, Event, Stage, DON!!.                                                                                                                                        |
| Color                   | Poneglyph                                                     | Used by deck validation and display.                                                                                                                                           |
| Cost/life/power/counter | Poneglyph                                                     | Engine reads this only after server-side validation.                                                                                                                           |
| Type/attribute          | Poneglyph                                                     | Used by filters and effects.                                                                                                                                                   |
| Printed card text       | Poneglyph                                                     | Used for display, text hashes, effect-authoring pipeline, and human review.                                                                                                    |
| Images and variants     | Poneglyph                                                     | Cosmetic display only. No gameplay authority.                                                                                                                                  |
| Effect DSL definitions  | Simulator overlay                                             | Local JSON/JSONC/YAML keyed by Poneglyph card ID.                                                                                                                              |
| Custom handler IDs      | Simulator overlay                                             | Used only for cards that cannot be represented by DSL.                                                                                                                         |
| Ruling overrides        | Simulator overlay                                             | Local rules/ruling notes keyed by Poneglyph card ID.                                                                                                                           |
| Card support status     | Simulator overlay                                             | Determines if a card can be used in each play mode.                                                                                                                            |
| Banlist / restrictions  | Poneglyph legality data plus simulator overlay/format service | Poneglyph is the source of truth for per-format card legality status and copy-limit inputs; simulator overlays add unsupported-card policy and any platform-local enforcement. |

Leader metadata conditions in the Effect DSL read only public Leader metadata
from this resolved card authority. Leader color count, type, and attribute
checks must not query hidden or private zones, and type/attribute checks use the
existing public Leader Area `hasCardInZone` plus `CardFilter` representation.

## Package responsibility: `@optcg/cards`

<!-- SECTION_REF: 09-card-data-and-support-policy.s004 -->

Section Ref: `09-card-data-and-support-policy.s004`

`@optcg/cards` owns:

- Poneglyph HTTP client for `api.poneglyph.one`.
- Zod validation of every Poneglyph response before it is cached or handed to the server.
- Read-through Redis cache for Poneglyph card data.
- Merge of Poneglyph data with simulator overlays.
- Card variant metadata for deck builder display.
- Text hash generation from Poneglyph printed text.
- Coverage reports comparing total Poneglyph cards against simulator-supported cards.

`@optcg/cards` does **not** own:

- Engine rule execution.
- Full `GameState`.
- Match WebSocket transport.
- Client-only rendering decisions.

## Read-through cache flow

<!-- SECTION_REF: 09-card-data-and-support-policy.s005 -->

Section Ref: `09-card-data-and-support-policy.s005`

The original architecture used a read-through Redis cache rather than a global sync job. That remains the recommended baseline.

```text
server needs card OP01-025
  -> @optcg/cards builds cache key
  -> Redis lookup
      hit  -> validate cached shape/version, return resolved card
      miss -> fetch from Poneglyph
              validate with Zod
              merge simulator overlay
              write Redis with TTL
              return resolved card
```

Default TTL recommendation: 24 hours during normal operation. On new-set release, either flush relevant keys manually or use a short TTL window until the release stabilizes.

Cache key:

```text
card:{cardDataVersion}:{effectDefinitionsVersion}:{overlayVersion}:{cardId}
```

A card-data cache hit only means the Poneglyph metadata is available. It does **not** mean the card is supported by the simulator. Support status is checked separately.

## Why the match server fetches card data

<!-- SECTION_REF: 09-card-data-and-support-policy.s006 -->

Section Ref: `09-card-data-and-support-policy.s006`

The server is authoritative. The client may render card names, images, and text from Poneglyph for convenience, but **client-supplied card data has no gameplay authority**.

At match creation, the server resolves every card ID in both decks through `@optcg/cards`, validates it, merges overlays, and snapshots the resolved manifest for the match. During the match, the engine reads the match snapshot rather than refetching live card data.

This prevents:

- Modified clients changing card stats or text.
- Deck submissions with fake card metadata.
- Mid-match behavior changes if Poneglyph updates text or metadata.
- Inconsistent replays caused by live external data changing.

## Client-side Poneglyph use

<!-- SECTION_REF: 09-card-data-and-support-policy.s007 -->

Section Ref: `09-card-data-and-support-policy.s007`

The browser may fetch Poneglyph directly for display-only purposes:

- Card images.
- Alt-art thumbnails.
- Card-search UI.
- Printed text tooltips.

Display data fetched by the client must never feed `applyAction`, `getLegalActions`, cost calculation, target legality, or effect resolution.

## Card variants and alternate art

<!-- SECTION_REF: 09-card-data-and-support-policy.s008 -->

Section Ref: `09-card-data-and-support-policy.s008`

Poneglyph provides variant and alternate-art metadata. Variants are cosmetic. The provided Poneglyph card payloads identify variants by `variants[].index`; the simulator should generate its own `variant_key` from `(card_id, variant_index)` rather than assuming a standalone external `variant_id`.

Rules:

- Decks store the Poneglyph base `card_id`, a non-null `variant_index` defaulting to `0`, and a generated `variant_key` such as `OP01-060:v0`.
- The engine uses only base `card_id` for gameplay.
- Both players can see chosen variant art during a match.
- A player may split copies of the same base card across different variants.
- Total quantity limits are enforced by base `card_id`, not by `variant_index` or `variant_key`.

Example:

```text
OP01-060:v1 Standard x1
OP01-060:v2 Alternate Art x1
OP01-060:v0 Starter Deck alternate art x2
Total base card OP01-060 = 4
```

The database must allow this with a non-null generated `variant_key` and `UNIQUE(deck_id, card_id, variant_key)`. Do not use nullable `variant_index` in a uniqueness constraint, because PostgreSQL allows multiple `NULL` values. Application validation still enforces total-per-base-card limits.

## Simulator overlay shape

<!-- SECTION_REF: 09-card-data-and-support-policy.s009 -->

Section Ref: `09-card-data-and-support-policy.s009`

```ts
interface ResolvedCardOverlay {
  cardId: CardId; // Poneglyph base card ID
  support: CardImplementationRecord;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  rulingNotes?: RulingNote[];
  banlist?: BanlistRecord[];
  simulatorTags?: string[];
}
```

Overlay files should live in the repo during Phase 1 so changes get PR review, test coverage, and version history.

Suggested layout:

```text
packages/cards/src/overlays/
  support-registry.json
  banlists/standard.json
  rulings/*.json
packages/effects/src/definitions/
  OP01/OP01-001.jsonc
  OP01/OP01-002.jsonc
```

## Card implementation record

<!-- SECTION_REF: 09-card-data-and-support-policy.s010 -->

Section Ref: `09-card-data-and-support-policy.s010`

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

## Support policy by mode

<!-- SECTION_REF: 09-card-data-and-support-policy.s011 -->

Section Ref: `09-card-data-and-support-policy.s011`

| Status                |              Dev sandbox | Unranked / custom |                         Ranked |
| --------------------- | -----------------------: | ----------------: | -----------------------------: |
| `vanilla-confirmed`   |                  Allowed |           Allowed |                        Allowed |
| `implemented-dsl`     |                  Allowed |           Allowed |                        Allowed |
| `implemented-custom`  |                  Allowed | Allowed if tested | Allowed if tested and reviewed |
| `unsupported`         |     Allowed with warning |          Rejected |                       Rejected |
| `banned-in-simulator` | Rejected unless override |          Rejected |                       Rejected |

Missing overlay records should fail closed in public modes. A non-vanilla Poneglyph card without support metadata is treated as `unsupported`.

## Deck validation

<!-- SECTION_REF: 09-card-data-and-support-policy.s012 -->

Section Ref: `09-card-data-and-support-policy.s012`

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

## Match-time card manifest

<!-- SECTION_REF: 09-card-data-and-support-policy.s013 -->

Section Ref: `09-card-data-and-support-policy.s013`

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

### Canonical Poneglyph normalization

<!-- SECTION_REF: 09-card-data-and-support-policy.s014 -->

Section Ref: `09-card-data-and-support-policy.s014`

The Poneglyph adapter emits `ResolvedCard` from `contracts/canonical-types.ts`. Important normalization rules:

- `attribute` values become `attributes: Attribute[]`; never collapse to a singular attribute.
- `color` values become `colors: CardColor[]`; multi-color cards preserve all colors.
- `variants[].index` becomes `variantIndex`.
- `variantKey = `${cardId}:v${variantIndex}``.
- Missing market prices, product set codes, or image URLs are allowed display gaps and must not fail gameplay resolution.
- Search endpoint DTOs are never accepted as manifest card details. Only detail/batch card payloads can become `ResolvedCard`.
- `sourceTextHash` covers printed effect/trigger text used for implementation drift.
- `behaviorHash` covers stats, type line, effect, trigger, official FAQ, errata, and any source field that can alter behavior.

## Poneglyph text hash and stale-card review

<!-- SECTION_REF: 09-card-data-and-support-policy.s015 -->

Section Ref: `09-card-data-and-support-policy.s015`

Every supported card stores a hash of its Poneglyph printed text and, when generated support is used, a behavior hash or parser-evidence hash for the complete parsed behavior.

When the Poneglyph text changes:

1. Mark the card implementation as stale.
2. Fail CI if a stale card remains marked `tested` without review.
3. Prevent ranked use if the changed text affects card behavior.
4. Require parser/support evidence to be updated before generated support may remain playable.
5. Require a reviewer to update the source hash after verifying any DSL/custom handler or certified parser-rule evidence that remains authoritative.

This catches errata, typo fixes that affect parsing, and Poneglyph schema/text changes.

## Generated support from complete parse

<!-- SECTION_REF: 09-card-data-and-support-policy.s016 -->

Section Ref: `09-card-data-and-support-policy.s016`

Common-template card support is generated from complete parsing plus runtime capability checks. It must not depend on a manual per-card allowlist or a manual card-to-mechanic map for templates that parser certification already covers.

CARD parser/generated-support stories consume completed contract/schema plus runtime-capability evidence before parser certification or generated-support linkage may enable normal-mode support. Contract/schema completion alone is not playable support.

Complete parse means every gameplay-relevant part of a card is parsed: printed effect text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement effects, optionality, once-per-turn limits, source-presence rules, and official rulings or errata that affect behavior. Non-gameplay display fields such as images and flavor-like presentation do not need DSL parse evidence, but any field that can affect behavior must be represented or explicitly proven irrelevant.

A runtime capability matrix records which generated components the current engine can execute. It must cover at least keyword bodies, DSL primitives, trigger timings, decision/response types, costs, target/selection shapes, movement operations, replacement processes, continuous modifiers, visibility modes, event/hash requirements, and custom handlers. The matrix is versioned with effect/runtime support evidence and must be updated when runtime capabilities expand or contract.

The generated support index maps Poneglyph card IDs and source hashes to generated `EffectDefinition` IDs, parser-rule versions, parser evidence, runtime capability results, support status, and review state. Multiple parsed effects for one card compose into one generated `EffectDefinition` for that card. If every parsed component is supported by the current runtime capability matrix and parser-rule certification allows automatic support, the generated support index may mark the card playable in the appropriate modes.

Partial support reporting is allowed and encouraged for progress tracking. It may report parsed components, unparsed spans, ambiguous parse classes, missing runtime capabilities, stale hashes, and unsupported custom-handler needs. Partial support does not make a card playable in normal modes, and partial support or effect coverage progress never enables normal play.

Generated support fails closed. If any component is unparsed, ambiguous, stale, unsupported, missing capability evidence, missing parser certification, or affected by Bandai/Poneglyph wording drift, the card is rejected for normal play until parser/support evidence is updated. New parser rules, ambiguous parse classes, custom handlers, and wording or ruling ambiguity require review before they can certify support.

## Card addition flow - assisted Phase 3

<!-- SECTION_REF: 09-card-data-and-support-policy.s017 -->

Section Ref: `09-card-data-and-support-policy.s017`

1. New card appears in Poneglyph.
2. Pipeline fetches Poneglyph printed text and metadata.
3. Generator produces candidate DSL from the text.
4. Generated DSL is flagged for human review.
5. Tests are generated and edited.
6. Reviewer verifies against the real card text and rulings.
7. PR is created, reviewed, tested, and merged.

Generated effect definitions are never auto-deployed blind.

## Effect coverage report

<!-- SECTION_REF: 09-card-data-and-support-policy.s018 -->

Section Ref: `09-card-data-and-support-policy.s018`

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

## Failure behavior

<!-- SECTION_REF: 09-card-data-and-support-policy.s019 -->

Section Ref: `09-card-data-and-support-policy.s019`

If Poneglyph is unavailable:

| Situation                                         | Behavior                                                     |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Deck builder display card not cached              | Show degraded/error state; retry.                            |
| Unranked/custom match start with all cards cached | Start normally from cache.                                   |
| Match start requires uncached card                | Fail to start with clear error.                              |
| Ranked queue                                      | Reject deck if all cards cannot be resolved and validated.   |
| In-progress match                                 | Continue from match snapshot; never refetch rules mid-match. |

Poneglyph downtime should not affect matches already created because card data was resolved and snapshotted at match creation.

## Custom handler governance

<!-- SECTION_REF: 09-card-data-and-support-policy.s020 -->

Section Ref: `09-card-data-and-support-policy.s020`

Every custom handler requires:

- Stable handler ID.
- Handler version.
- Unit tests.
- Interaction tests if timing, replacement, visibility, or hidden zones are involved.
- Replay/golden test if choices or RNG are involved.
- A short note explaining why DSL was insufficient.

## Banlist and simulator ban policy

<!-- SECTION_REF: 09-card-data-and-support-policy.s021 -->

Section Ref: `09-card-data-and-support-policy.s021`

Separate official restrictions from simulator-specific implementation restrictions.

```ts
interface BanlistRecord {
  cardId: CardId; // Poneglyph base card ID
  format: string;
  status:
    | "legal"
    | "banned"
    | "restricted"
    | "leaderLocked"
    | "simulatorBanned";
  maxCopies?: number;
  reason?: string;
  effectiveFrom: string;
}
```

A simulator ban is appropriate when a card is legal in the real game but not yet safely implementable.

## Security checklist

<!-- SECTION_REF: 09-card-data-and-support-policy.s022 -->

Section Ref: `09-card-data-and-support-policy.s022`

- Server never trusts card metadata from client.
- Poneglyph response is schema-validated before cache write.
- Overlay merge is versioned.
- Match snapshots resolved cards before play starts.
- Unsupported cards are rejected in public modes.
- Variant IDs are cosmetic and never affect rules.
- Poneglyph text hash changes trigger implementation review.
- Replays store versions and manifest hashes.

## Concrete Poneglyph API contract

<!-- SECTION_REF: 09-card-data-and-support-policy.s023 -->

Section Ref: `09-card-data-and-support-policy.s023`

The provided OpenAPI document is captured in [`fixtures/poneglyph/openapi.optcg-api-0.1.0.json`](fixtures/poneglyph/openapi.optcg-api-0.1.0.json). The exact adapter contract is now split into [`19-poneglyph-api-contract.md`](19-poneglyph-api-contract.md).

Key implementation rules from the API contract:

- Use `GET /v1/cards/{card_number}` or `POST /v1/cards/batch` for match/deck resolution.
- Batch requests accept at most 60 `card_numbers`, so deck resolution must chunk unique IDs.
- Do not use `/v1/search` results as authoritative card details. Search variants can be filtered by query predicates and the result shape lacks some fields needed for implementation review.
- Treat `legality` as an input to format validation, not as the only authority. Merge it with simulator support status and banlist overlays.
- Keep `official_faq` and variant `errata` in implementation review data because they can change effect behavior.

## Source hash and behavior hash

<!-- SECTION_REF: 09-card-data-and-support-policy.s024 -->

Section Ref: `09-card-data-and-support-policy.s024`

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

## Poneglyph fixture-backed implementation tests

<!-- SECTION_REF: 09-card-data-and-support-policy.s025 -->

Section Ref: `09-card-data-and-support-policy.s025`

Use these local fixtures before live HTTP exists:

```text
fixtures/poneglyph/openapi.optcg-api-0.1.0.json
fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json
fixtures/poneglyph/cards/OP05-091.rebecca.json
```

Required tests:

```text
PON-001 validate OpenAPI fixture parses and expected endpoints exist.
PON-002 validate OP01-060 and OP05-091 detail payloads with Zod.
PON-003 normalize variant indexes into generated variant keys.
PON-004 preserve nullable product and market fields without crashing.
PON-005 compute stable sourceTextHash and behaviorHash.
PON-006 reject missing card IDs from batch resolution.
PON-007 chunk batch resolution into groups of <=60 IDs.
```
