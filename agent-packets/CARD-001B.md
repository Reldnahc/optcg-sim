<!-- agent-packet:story-id CARD-001B -->
<!-- agent-packet:story-path stories/approved/CARD-001B-poneglyph-client-response-validation.yaml -->
<!-- agent-packet:story-sha256 24033f623d67d1cad7331051f65350f110266260167286984a8f908c621d5729 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-001B
Epic ID: CARD-001
Title: Add Poneglyph client and response validation
Type: implementation
Area: cards
Primary Concern: contract

## Why

Add typed Poneglyph card-detail response validation and a package-local API client that fails closed on malformed responses while remaining fully testable without live Poneglyph.

## Authoritative Spec References

- 09-card-data-and-support-policy.s004 (Package responsibility: `@optcg/cards`)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s025 (Poneglyph fixture-backed implementation tests)
- 14-glossary.s018 (Poneglyph terms)
- 19-poneglyph-api-contract.s004 (Endpoint responsibility matrix)
- 19-poneglyph-api-contract.s005 (Do not use search results for match manifests)
- 19-poneglyph-api-contract.s006 (Raw Poneglyph detail shape)
- 19-poneglyph-api-contract.s010 (Zod schema policy)
- 19-poneglyph-api-contract.s011 (Adapter API)
- 16-typescript-interface-draft.s011 (Poneglyph raw and normalized interfaces)
- 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)
- 23-repo-tooling-and-enforcement.s010 (Test tooling requirements)
- 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 09-card-data-and-support-policy.s004 (Package responsibility: `@optcg/cards`)

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

### 09-card-data-and-support-policy.s025 (Poneglyph fixture-backed implementation tests)

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

### 14-glossary.s018 (Poneglyph terms)

- **Poneglyph API** - external card-data service at `api.poneglyph.one`, used for printed card metadata, images, variants, and text.
- **Poneglyph base card ID** - canonical card identifier used in decks, engine state, effect definitions, and database rows.
- **Poneglyph variant index / variant key** - cosmetic alternate-art selector. Poneglyph payloads expose `variants[].index`; the simulator generates keys like `OP01-060:v0`. It affects display only and never changes gameplay.
- **Simulator overlay** - local data keyed by Poneglyph card ID that provides effect definitions, custom handlers, support status, rulings, and banlist data.

### 19-poneglyph-api-contract.s004 (Endpoint responsibility matrix)

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

### 19-poneglyph-api-contract.s005 (Do not use search results for match manifests)

`/v1/search` returns card items with matching variants and pagination metadata. The OpenAPI description says `collapse=card` returns one item per matching card with `variants[]` filtered to matching prints, while `collapse=variant` returns one item per matching print. Search data is therefore a UI/search result shape, not a canonical card-detail shape.

Match creation must use `/v1/cards/{card_number}` or `/v1/cards/batch`, not `/v1/search`.

### 19-poneglyph-api-contract.s006 (Raw Poneglyph detail shape)

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

### 19-poneglyph-api-contract.s010 (Zod schema policy)

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

### 19-poneglyph-api-contract.s011 (Adapter API)

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

### 23-repo-tooling-and-enforcement.s010 (Test tooling requirements)

The repo must support the following test lanes:

1. package unit tests,
2. engine interaction tests,
3. invariant/property or fuzz-style tests where applicable,
4. replay determinism tests,
5. hidden-information leakage tests,
6. contract/schema validation tests,
7. smoke integration tests for server protocol behavior.

At minimum, the root verification pipeline must include:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts   # if defined at root via recursive filtering
```

Before public alpha or ranked play, CI must also include replay and hidden-information test lanes.

### 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)

The repo must validate the canonical contract files and fixtures automatically.

Required checks:

- `contracts/canonical-types.ts` compiles under `contracts/tsconfig.json`
- effect DSL fixtures validate against `contracts/effect-dsl.schema.json`
- card fixture normalization tests run against real supplied fixture payloads
- replay fixtures remain loadable and hash-stable
- schema/DDL files parse successfully in CI

A change to DSL shape, card manifests, or replay structure is incomplete unless fixtures are updated in the same change.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own schema validation and the package-local fetch client only. Do not add normalization, overlays, manifests, deck validation, caches, server API integration, or live-network tests in this story.

## Scope

- add Zod-backed typed runtime validation for Poneglyph card-detail responses
- reject search-result or otherwise non-detail DTOs as manifest/card-detail sources
- validate OP01-060 and OP05-091 fixtures
- add a Poneglyph API client with injected fetch implementation
- fail closed on non-2xx responses, invalid JSON, malformed response shape, and missing requested IDs
- add batch resolver chunking for unique card IDs with request batches of at most 60 IDs
- preserve caller-requested card ID order while failing if any requested ID is missing from batch resolution

## Out of Scope

- normalization into ResolvedCard
- sourceTextHash or behaviorHash computation
- overlays or simulator support registry
- MatchCardManifest construction
- cache adapters
- live Poneglyph tests
- server, client, database, Redis, or UI integration

## Allowed Touch Points

<!-- prettier-ignore -->
- package.json
- pnpm-lock.yaml
- packages/cards/**
- tests/contracts/**
- stories/generated/CARD-001B-poneglyph-client-response-validation.yaml
- stories/approved/CARD-001B-poneglyph-client-response-validation.yaml
- agent-packets/CARD-001B.md
- agent-packets/active.json

## Constraints

- no tests may call live Poneglyph
- if live Poneglyph response shape is ambiguous, keep fetch behind validated fixtures and record the ambiguity
- do not add runtime authority outside packages/cards
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- validator accepts the checked-in OP01-060 and OP05-091 fixtures
- validator rejects malformed card-detail and search-result-like payloads
- client test for non-2xx response failure
- client test for invalid JSON or malformed response failure
- client or resolver test for missing requested ID failure
- client or resolver test for request chunking into groups of at most 60 IDs
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- OP01-060 and OP05-091 fixtures pass card-detail validation
- malformed and search-result-shaped payloads fail validation with clear errors
- client tests use injected fetch fakes and never require live Poneglyph
- response validation happens before any client result is returned to callers
- missing requested card IDs fail closed
- batch resolution chunks requests into groups of at most 60 IDs

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
