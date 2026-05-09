<!-- agent-packet:story-id CARD-001C -->
<!-- agent-packet:story-path stories/approved/CARD-001C-normalization-variant-hash-helpers.yaml -->
<!-- agent-packet:story-sha256 4333734d20fdbac7a7104db4eca52563a65c3fa70c12fadbae4cc26434b9b44b -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-001C
Epic ID: CARD-001
Title: Add normalization and card hash helpers
Type: implementation
Area: cards
Primary Concern: contract

## Why

Normalize validated Poneglyph card-detail records into the repo's resolved card metadata shape, including variant keys/indexes and stable printed-text and behavior hash inputs.

## Authoritative Spec References

- 09-card-data-and-support-policy.s003 (Data ownership model)
- 09-card-data-and-support-policy.s008 (Card variants and alternate art)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 14-glossary.s018 (Poneglyph terms)
- 19-poneglyph-api-contract.s007 (Normalized card shape)
- 19-poneglyph-api-contract.s008 (Variant normalization)
- 19-poneglyph-api-contract.s009 (Behavior hash vs source-text hash)
- 16-typescript-interface-draft.s011 (Poneglyph raw and normalized interfaces)
- 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 09-card-data-and-support-policy.s003 (Data ownership model)

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

### 09-card-data-and-support-policy.s008 (Card variants and alternate art)

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

Every supported card stores a hash of its Poneglyph printed text.

When the Poneglyph text changes:

1. Mark the card implementation as stale.
2. Fail CI if a stale card remains marked `tested` without review.
3. Prevent ranked use if the changed text affects card behavior.
4. Require a reviewer to update the source hash after verifying the DSL/custom handler.

This catches errata, typo fixes that affect parsing, and Poneglyph schema/text changes.

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

### 14-glossary.s018 (Poneglyph terms)

- **Poneglyph API** - external card-data service at `api.poneglyph.one`, used for printed card metadata, images, variants, and text.
- **Poneglyph base card ID** - canonical card identifier used in decks, engine state, effect definitions, and database rows.
- **Poneglyph variant index / variant key** - cosmetic alternate-art selector. Poneglyph payloads expose `variants[].index`; the simulator generates keys like `OP01-060:v0`. It affects display only and never changes gameplay.
- **Simulator overlay** - local data keyed by Poneglyph card ID that provides effect definitions, custom handlers, support status, rulings, and banlist data.

### 19-poneglyph-api-contract.s007 (Normalized card shape)

`@optcg/cards` should normalize Poneglyph records into an engine-safe `ResolvedCard`. Keep the original payload available for audit/debug, but the engine should read the normalized shape.

A critical rule for deck validation: `ResolvedCard.legality` is populated from Poneglyph and is the canonical external legality record the platform validates against. Queue eligibility, unsupported-card rejection, or platform-specific safety blocks may add stricter checks, but they must not invent a separate base legality source.

```ts
interface ResolvedCard {
  cardId: CardId; // from card_number, e.g. "OP05-091"
  language: string;
  name: string;
  category: CardCategory;
  set: string;
  block?: string;
  released: boolean;
  releasedAt?: string;
  rarity?: string;
  colors: Color[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  attributes: Attribute[];
  types: string[];
  effectText?: string;
  triggerText?: string;
  printedKeywords: Keyword[];
  variants: ResolvedCardVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  officialFaq: PoneglyphOfficialFaq[];
  errata: NormalizedErrata[];
  sourceTextHash: string;
  behaviorHash: string;
  support: CardImplementationRecord;
}
```

### 19-poneglyph-api-contract.s008 (Variant normalization)

The supplied examples expose `variants[].index`, not a dedicated `variant_id`. Therefore persistence should not assume a Poneglyph variant UUID exists.

Use a generated stable key:

```ts
type VariantKey = `${CardId}:v${number}`;

function variantKey(cardNumber: string, variantIndex: number): string {
  return `${cardNumber}:v${variantIndex}`;
}
```

Rules:

- Store `card_id` and `variant_index` for deck choices.
- Optionally store generated `variant_key` as a convenience denormalized field.
- Do not assume variant indexes are positive. `OP01-060` includes variant index `0`.
- Do not assume labels are unique. A card may have multiple `Alternate Art` or `SP` prints.
- Do not assume product fields are complete. The `OP05-091` Regionals print has `product.set_code: null` and `product.released_at: null`.
- Market prices are strings or null. Parse only in price/display services, never in the engine.

### 19-poneglyph-api-contract.s009 (Behavior hash vs source-text hash)

Use two hashes:

```ts
sourceTextHash = sha256(normalized(effect + "\n" + trigger));
behaviorHash = sha256(
  canonicalJson({
    card_number,
    name,
    card_type,
    color,
    cost,
    power,
    counter,
    life,
    attribute,
    types,
    effect,
    trigger,
    official_faq,
    variant_errata_after_text,
  }),
);
```

`sourceTextHash` is useful for effect-authoring drift. `behaviorHash` is better for implementation review because rulings, FAQ answers, errata, stats, and type lines can change behavior even if the printed effect text does not.

### 16-typescript-interface-draft.s011 (Poneglyph raw and normalized interfaces)

The first implementation should include these types in `@optcg/types` or `@optcg/cards` so the adapter, engine manifest, and tests agree on shape.

```ts
export type VariantKey = Brand<string, "VariantKey">; // generated, e.g. OP05-091:v2

export interface PoneglyphCardDetail {
  card_number: string;
  name: string;
  language: string;
  set: string;
  set_name: string;
  released_at: string | null;
  released: boolean;
  card_type: string;
  rarity: string | null;
  color: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string[] | null;
  types: string[];
  effect: string | null;
  trigger: string | null;
  block: string | null;
  variants: PoneglyphVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  available_languages: string[];
  official_faq: PoneglyphOfficialFaq[];
}

export interface PoneglyphVariant {
  index: number;
  name: string | null;
  label: string | null;
  artist: string | null;
  product: {
    id: string | null;
    slug: string | null;
    name: string | null;
    set_code: string | null;
    released_at: string | null;
  };
  images: {
    stock: { full: string | null; thumb: string | null };
    scan: { display: string | null; full: string | null; thumb: string | null };
  };
  errata: PoneglyphErrata[];
  market: {
    tcgplayer_url: string | null;
    market_price: string | null;
    low_price: string | null;
    mid_price: string | null;
    high_price: string | null;
  };
}

export interface PoneglyphErrata {
  date: string;
  label: string | null;
  before_text: string | null;
  after_text: string | null;
  images?: {
    source?: string | null;
    scan?: {
      display: string | null;
      full: string | null;
      thumb: string | null;
    };
  };
}

export interface PoneglyphLegalityRecord {
  status: string;
  banned_at?: string;
  reason?: string;
  max_copies?: number;
  paired_with?: string[];
}

export interface PoneglyphOfficialFaq {
  question: string;
  answer: string;
  updated_on: string;
}

export interface ResolvedCardVariant {
  variantKey: VariantKey;
  variantIndex: number;
  label?: string;
  artist?: string;
  productId?: string;
  productSlug?: string;
  productName?: string;
  productSetCode?: string;
  stockImageFull?: string;
  stockImageThumb?: string;
  scanImageDisplay?: string;
  scanImageFull?: string;
  scanImageThumb?: string;
}

export interface ResolvedCard {
  cardId: CardId;
  language: string;
  name: string;
  category: CardCategory;
  set: string;
  setName: string;
  block?: string;
  released: boolean;
  releasedAt?: string;
  rarity?: string;
  colors: Color[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  attributes: Attribute[];
  types: string[];
  effectText?: string;
  triggerText?: string;
  printedKeywords: Keyword[];
  variants: ResolvedCardVariant[];
  legality: Record<string, PoneglyphLegalityRecord>;
  officialFaq: PoneglyphOfficialFaq[];
  sourceTextHash: string;
  behaviorHash: string;
  support: CardImplementationRecord;
}
```

Replace the earlier `CardVariant.variantId` assumption with `variantKey` and `variantIndex`. The supplied Poneglyph examples expose variant indexes, including index `0`, not a distinct variant ID.

### 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)

```text
PON-001 OpenAPI fixture parses as JSON and exposes /v1/cards/{card_number}, /v1/cards/batch, /v1/search, /v1/cards/{card_number}/text, /v1/formats.
PON-002 Poneglyph detail Zod schema accepts OP01-060 and OP05-091 fixtures.
PON-003 Batch resolver chunks unique card IDs into requests of <=60 IDs.
PON-004 Batch resolver fails match creation if any requested ID is returned in missing.
PON-005 Search result DTO is rejected as a match-manifest source.
PON-006 OP01-060 variant indexes normalize to OP01-060:v0, OP01-060:v1, OP01-060:v2.
PON-007 OP05-091 variant with null product set_code and null market price normalizes without throwing.
PON-008 sourceTextHash changes when effect or trigger text changes.
PON-009 behaviorHash changes when official_faq, errata, stats, type line, effect, or trigger changes.
PON-010 Unreleased cards are rejected in public modes unless explicitly enabled by format policy.
PON-011 variant_index defaults to 0 and generated variant_key is non-null.
PON-012 search result DTO cannot be used to build MatchCardManifest.
PON-013 attributes and colors normalize as arrays.
```

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own normalization of validated printed/display metadata only. Do not add simulator overlay authority, manifest construction, deck validation, caches, live HTTP behavior, or engine-core changes in this story.

## Scope

- normalize Poneglyph card detail into ResolvedCard-compatible printed metadata
- build variant keys as `<cardId>:v<variantIndex>` and preserve variant indexes
- support variant index 0 and nullable Poneglyph variant fields
- normalize attributes and colors as arrays
- compute stable `sourceTextHash` inputs from printed/source card text
- compute stable `behaviorHash` inputs from printed stats, type line, effect, trigger, official FAQ, errata, and other simulator-relevant printed metadata
- keep normalized output deterministic and sorted where object ordering could drift

## Out of Scope

- simulator overlay loading or merge
- support status, effectDefinitionId, customHandlerIds, banlist, or simulator notes
- MatchCardManifest construction
- deck/loadout validation
- cache adapters
- live Poneglyph tests
- engine-core changes

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/**
- tests/contracts/**
- stories/generated/CARD-001C-normalization-variant-hash-helpers.yaml
- stories/approved/CARD-001C-normalization-variant-hash-helpers.yaml
- agent-packets/CARD-001C.md
- agent-packets/active.json

## Constraints

- Poneglyph data remains printed/display metadata authority only
- do not invent gameplay support status from printed text
- keep hash inputs deterministic and documented by tests
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- normalization test for OP01-060 variant keys/indexes
- normalization test for OP05-091 nullable variant fields
- hash tests for source text changes
- hash tests for behavior input changes
- normalization failure test for non-card-detail payloads
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- OP01-060 variant indexes normalize to keys including `OP01-060:v0`
- OP05-091 nullable variant fields normalize without throwing
- sourceTextHash changes when effect or trigger text changes
- behaviorHash changes when official FAQ, errata, stats, type line, effect, or trigger changes
- search-result DTOs cannot be normalized as card-detail sources

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
