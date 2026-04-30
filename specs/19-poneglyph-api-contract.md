---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "19-poneglyph-api-contract"
doc_title: "Poneglyph Api Contract"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Poneglyph API Contract and Adapter Spec

<!-- SECTION_REF: 19-poneglyph-api-contract.s001 -->

Section Ref: `19-poneglyph-api-contract.s001`

## Purpose

<!-- SECTION_REF: 19-poneglyph-api-contract.s002 -->

Section Ref: `19-poneglyph-api-contract.s002`

This document tightens the `@optcg/cards` implementation against the provided Poneglyph OpenAPI contract and real card payload examples. The original simulator plan says Poneglyph is the source of truth for printed card text, stats, images, variants, and metadata. This document makes that actionable without giving Poneglyph gameplay authority.

The engine never calls Poneglyph during effect resolution. `@optcg/cards` resolves Poneglyph data, validates it, normalizes it, merges simulator overlays, and produces a match-time manifest.

## Source fixtures in this package

<!-- SECTION_REF: 19-poneglyph-api-contract.s003 -->

Section Ref: `19-poneglyph-api-contract.s003`

```text
fixtures/poneglyph/openapi.optcg-api-0.1.0.json
fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json
fixtures/poneglyph/cards/OP05-091.rebecca.json
```

These fixtures should be used for contract tests and early implementation tests before live HTTP is wired in.

## Endpoint responsibility matrix

<!-- SECTION_REF: 19-poneglyph-api-contract.s004 -->

Section Ref: `19-poneglyph-api-contract.s004`

| Endpoint                                                | Intended use                    |                                  Engine authority? | Notes                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------- | -------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/cards/{card_number}`                           | Single card detail              | Yes, after server validation and manifest snapshot | Use for one-off card resolution. Includes legality, languages, FAQ.                                                                                                                                                       |
| `POST /v1/cards/batch`                                  | Deck/match card resolution      | Yes, after server validation and manifest snapshot | Request `card_numbers` has `minItems: 1` and `maxItems: 60`. Chunk deck resolution accordingly.                                                                                                                           |
| `GET /v1/cards/{card_number}/text`                      | Plain text display/hash support |                        No direct runtime authority | Useful for authoring/review, but detail payload still needs stats, FAQ, legality.                                                                                                                                         |
| `GET /v1/search`                                        | Deck builder/search UI          |                                                 No | Search results are not complete enough for engine use and `variants[]` can be filtered by query predicates.                                                                                                               |
| `GET /v1/cards/autocomplete`                            | UI autocomplete                 |                                                 No | Names only.                                                                                                                                                                                                               |
| `GET /v1/formats` and `GET /v1/formats/{format_name}`   | Format display/validation input |                                           Advisory | Use together with per-card `legality` from Poneglyph detail payloads. Poneglyph is the canonical external source for card legality inputs; simulator policy may only add unsupported-card or platform-local restrictions. |
| `GET /v1/prices/{card_number}`                          | Collection/market display       |                                                 No | Never affects match logic.                                                                                                                                                                                                |
| `GET /v1/products`, `/v1/sets`, `/v1/don`, `/v1/random` | UI/catalog utilities            |                                                 No | Do not use these to build engine state.                                                                                                                                                                                   |

## Do not use search results for match manifests

<!-- SECTION_REF: 19-poneglyph-api-contract.s005 -->

Section Ref: `19-poneglyph-api-contract.s005`

`/v1/search` returns card items with matching variants and pagination metadata. The OpenAPI description says `collapse=card` returns one item per matching card with `variants[]` filtered to matching prints, while `collapse=variant` returns one item per matching print. Search data is therefore a UI/search result shape, not a canonical card-detail shape.

Match creation must use `/v1/cards/{card_number}` or `/v1/cards/batch`, not `/v1/search`.

## Raw Poneglyph detail shape

<!-- SECTION_REF: 19-poneglyph-api-contract.s006 -->

Section Ref: `19-poneglyph-api-contract.s006`

`GET /v1/cards/{card_number}` and batch detail entries share the same important shape:

```ts
interface PoneglyphCardDetail {
  card_number: string;
  name: string;
  language: string;
  set: string;
  set_name: string;
  released_at: string | null;
  released: boolean;
  card_type: string; // "Leader", "Character", "Event", "Stage", "DON!!", etc.
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

interface PoneglyphVariant {
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

interface PoneglyphErrata {
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

interface PoneglyphLegalityRecord {
  status: string;
  banned_at?: string;
  reason?: string;
  max_copies?: number;
  paired_with?: string[];
}

interface PoneglyphOfficialFaq {
  question: string;
  answer: string;
  updated_on: string; // ISO date
}
```

## Normalized card shape

<!-- SECTION_REF: 19-poneglyph-api-contract.s007 -->

Section Ref: `19-poneglyph-api-contract.s007`

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

## Variant normalization

<!-- SECTION_REF: 19-poneglyph-api-contract.s008 -->

Section Ref: `19-poneglyph-api-contract.s008`

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

## Behavior hash vs source-text hash

<!-- SECTION_REF: 19-poneglyph-api-contract.s009 -->

Section Ref: `19-poneglyph-api-contract.s009`

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

## Zod schema policy

<!-- SECTION_REF: 19-poneglyph-api-contract.s010 -->

Section Ref: `19-poneglyph-api-contract.s010`

Runtime validation should be strict about required gameplay fields and tolerant of additive non-breaking fields.

```ts
const PoneglyphOfficialFaqSchema = z.object({
  question: z.string(),
  answer: z.string(),
  updated_on: z.string(),
});

const PoneglyphVariantSchema = z
  .object({
    index: z.number().int(),
    name: z.string().nullable(),
    label: z.string().nullable(),
    artist: z.string().nullable(),
    product: z
      .object({
        id: z.string().nullable(),
        slug: z.string().nullable(),
        name: z.string().nullable(),
        set_code: z.string().nullable(),
        released_at: z.string().nullable(),
      })
      .passthrough(),
    images: z
      .object({
        stock: z
          .object({ full: z.string().nullable(), thumb: z.string().nullable() })
          .passthrough(),
        scan: z
          .object({
            display: z.string().nullable(),
            full: z.string().nullable(),
            thumb: z.string().nullable(),
          })
          .passthrough(),
      })
      .passthrough(),
    errata: z.array(z.unknown()),
    market: z
      .object({
        tcgplayer_url: z.string().nullable(),
        market_price: z.string().nullable(),
        low_price: z.string().nullable(),
        mid_price: z.string().nullable(),
        high_price: z.string().nullable(),
      })
      .passthrough(),
  })
  .passthrough();

const PoneglyphCardDetailSchema = z
  .object({
    card_number: z.string(),
    name: z.string(),
    language: z.string(),
    set: z.string(),
    set_name: z.string(),
    released_at: z.string().nullable(),
    released: z.boolean(),
    card_type: z.string(),
    rarity: z.string().nullable(),
    color: z.array(z.string()),
    cost: z.number().int().nullable(),
    power: z.number().int().nullable(),
    counter: z.number().int().nullable(),
    life: z.number().int().nullable(),
    attribute: z.array(z.string()).nullable(),
    types: z.array(z.string()),
    effect: z.string().nullable(),
    trigger: z.string().nullable(),
    block: z.string().nullable(),
    variants: z.array(PoneglyphVariantSchema),
    legality: z.record(
      z
        .object({
          status: z.string(),
          banned_at: z.string().optional(),
          reason: z.string().optional(),
          max_copies: z.number().int().optional(),
          paired_with: z.array(z.string()).optional(),
        })
        .passthrough(),
    ),
    available_languages: z.array(z.string()),
    official_faq: z.array(PoneglyphOfficialFaqSchema),
  })
  .passthrough();
```

Contract tests should also hash the OpenAPI document and alert maintainers if it changes.

## Adapter API

<!-- SECTION_REF: 19-poneglyph-api-contract.s011 -->

Section Ref: `19-poneglyph-api-contract.s011`

```ts
interface PoneglyphClient {
  getCard(
    cardNumber: CardId,
    options?: { lang?: string },
  ): Promise<PoneglyphCardDetail>;
  getCardsBatch(
    cardNumbers: CardId[],
    options?: { lang?: string },
  ): Promise<{
    data: Record<string, PoneglyphCardDetail>;
    missing: string[];
  }>;
  searchCards(query: PoneglyphSearchQuery): Promise<PoneglyphSearchResult>;
  getPlainText(
    cardNumber: CardId,
    options?: { lang?: string },
  ): Promise<string>;
}

interface CardRepository {
  resolveCard(
    cardId: CardId,
    options?: ResolveCardOptions,
  ): Promise<ResolvedCard>;
  resolveCards(
    cardIds: CardId[],
    options?: ResolveCardOptions,
  ): Promise<ResolvedCard[]>;
  buildMatchManifest(decklists: Decklist[]): Promise<MatchCardManifest>;
}
```

Batch resolution must chunk at 60 card numbers and preserve caller order in the returned manifest.

## Match creation behavior

<!-- SECTION_REF: 19-poneglyph-api-contract.s012 -->

Section Ref: `19-poneglyph-api-contract.s012`

1. Collect unique base card IDs from both leaders, main decks, and DON!! decks.
2. Resolve through batch endpoint in chunks of 60.
3. Validate and normalize each returned card.
4. Fail if any requested card appears in `missing`.
5. Merge simulator overlays.
6. Reject unsupported, stale, unreleased, or format-illegal cards according to mode.
7. Snapshot the full match manifest, including hash/version fields.

## Poneglyph update behavior

<!-- SECTION_REF: 19-poneglyph-api-contract.s013 -->

Section Ref: `19-poneglyph-api-contract.s013`

When a resolved card's `behaviorHash` differs from the overlay record:

| Mode              | Behavior                                                                         |
| ----------------- | -------------------------------------------------------------------------------- |
| Dev sandbox       | Allow with stale warning.                                                        |
| Casual            | Reject unless card is marked reviewed for this hash or mode permits stale cards. |
| Ranked/tournament | Reject until implementation record is reviewed and updated.                      |

This is especially important for FAQ-driven cards like `OP01-060`, where a FAQ answer determines hidden-information handling after a revealed card is not played.
