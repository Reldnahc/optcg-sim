<!-- agent-packet:story-id CARD-005 -->
<!-- agent-packet:story-path stories/approved/CARD-005-populate-real-effect-shape-fixtures.yaml -->
<!-- agent-packet:story-sha256 07974314c22940aca332047708faa8843272e1c09d8b677ad3d26fb0d964d65d -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-005
Epic ID: CARD-005
Title: Populate distinct real effect-shape fixtures
Type: implementation
Area: cards
Primary Concern: verification

## Why

Add a curated corpus of roughly 50 additional real Poneglyph card-detail fixtures whose printed effects are intentionally different from the currently implemented EB01-023 no-choice draw fixture, so upcoming effect stories have reviewed real payloads to map against without pretending unsupported gameplay is implemented.

## Authoritative Spec References

- 09-card-data-and-support-policy.s003 (Data ownership model)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s019 (Failure behavior)
- 09-card-data-and-support-policy.s022 (Security checklist)
- 09-card-data-and-support-policy.s023 (Concrete Poneglyph API contract)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 09-card-data-and-support-policy.s025 (Poneglyph fixture-backed implementation tests)
- 17-first-card-fixtures.s003 (Fixture policy)
- 17-first-card-fixtures.s004 (Recommended 20-card coverage set)
- 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)
- 17-first-card-fixtures.s008 (Updated first fixture slice)
- 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)
- 19-poneglyph-api-contract.s002 (Purpose)
- 19-poneglyph-api-contract.s003 (Source fixtures in this package)
- 19-poneglyph-api-contract.s004 (Endpoint responsibility matrix)
- 19-poneglyph-api-contract.s005 (Do not use search results for match manifests)
- 19-poneglyph-api-contract.s007 (Normalized card shape)
- 19-poneglyph-api-contract.s010 (Zod schema policy)
- 19-poneglyph-api-contract.s011 (Adapter API)
- 19-poneglyph-api-contract.s012 (Match creation behavior)
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
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string; // hash of Poneglyph printed text used for review drift
  notes?: string;
}
```

A card with printed effect text but no implementation must be marked `unsupported`, not omitted.

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

### 09-card-data-and-support-policy.s019 (Failure behavior)

If Poneglyph is unavailable:

| Situation                                         | Behavior                                                     |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Deck builder display card not cached              | Show degraded/error state; retry.                            |
| Unranked/custom match start with all cards cached | Start normally from cache.                                   |
| Match start requires uncached card                | Fail to start with clear error.                              |
| Ranked queue                                      | Reject deck if all cards cannot be resolved and validated.   |
| In-progress match                                 | Continue from match snapshot; never refetch rules mid-match. |

Poneglyph downtime should not affect matches already created because card data was resolved and snapshotted at match creation.

### 09-card-data-and-support-policy.s022 (Security checklist)

- Server never trusts card metadata from client.
- Poneglyph response is schema-validated before cache write.
- Overlay merge is versioned.
- Match snapshots resolved cards before play starts.
- Unsupported cards are rejected in public modes.
- Variant IDs are cosmetic and never affect rules.
- Poneglyph text hash changes trigger implementation review.
- Replays store versions and manifest hashes.

### 09-card-data-and-support-policy.s023 (Concrete Poneglyph API contract)

The provided OpenAPI document is captured in [`fixtures/poneglyph/openapi.optcg-api-0.1.0.json`](fixtures/poneglyph/openapi.optcg-api-0.1.0.json). The exact adapter contract is now split into [`19-poneglyph-api-contract.md`](19-poneglyph-api-contract.md).

Key implementation rules from the API contract:

- Use `GET /v1/cards/{card_number}` or `POST /v1/cards/batch` for match/deck resolution.
- Batch requests accept at most 60 `card_numbers`, so deck resolution must chunk unique IDs.
- Do not use `/v1/search` results as authoritative card details. Search variants can be filtered by query predicates and the result shape lacks some fields needed for implementation review.
- Treat `legality` as an input to format validation, not as the only authority. Merge it with simulator support status and banlist overlays.
- Keep `official_faq` and variant `errata` in implementation review data because they can change effect behavior.

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

### 17-first-card-fixtures.s003 (Fixture policy)

- Use real-looking Poneglyph base IDs if testing with actual card data, or clearly prefixed fixture IDs if avoiding real cards.
- Each non-vanilla fixture has an implementation record.
- Each fixture has at least one test.
- The pool should be small enough that every interaction is understood.

### 17-first-card-fixtures.s004 (Recommended 20-card coverage set)

| Slot | Fixture purpose                  | Mechanics covered                                          |
| ---: | -------------------------------- | ---------------------------------------------------------- |
|    1 | Vanilla Leader                   | Setup, life, attacks, leader damage.                       |
|    2 | Vanilla Character 2-cost         | Basic play, cost payment, summoning sickness.              |
|    3 | Vanilla Character high power     | Character battle and K.O.                                  |
|    4 | Vanilla Stage                    | Stage play and stage replacement.                          |
|    5 | Character with counter value     | Counter step, hand trash, temporary battle power.          |
|    6 | `[Blocker]` Character            | Block window, blocker rests, target redirection.           |
|    7 | `[Rush]` Character               | Can attack turn played.                                    |
|    8 | `[Rush: Character]` Character    | Can attack rested Characters but not Leader on play turn.  |
|    9 | `[Double Attack]` Character      | Multiple damage points and damage deferral.                |
|   10 | `[Banish]` Character             | Replacement of life-to-hand/trigger path.                  |
|   11 | `[On Play] Draw 1`               | Auto trigger, draw event, rule processing.                 |
|   12 | `[When Attacking]` Draw/discard  | Attack trigger, sequence effect, private discard decision. |
|   13 | `[On K.O.]` Draw 1               | Source leaves field, resolves from trash/last known info.  |
|   14 | `[Trigger]` Life effect          | Reveal from life, no-zone resolution, trash after trigger. |
|   15 | `[Counter]` Event + power        | Counter event cost/trash/effect.                           |
|   16 | `[Main]` Event K.O. low-cost     | Main event play, target selection, K.O. effect.            |
|   17 | Permanent +1000 during your turn | Computed continuous effect, no state mutation.             |
|   18 | Search/look top cards            | Hidden-information private choice and reveal policy.       |
|   19 | Protection/replacement effect    | Replacement priority and one-use-per-process rule.         |
|   20 | Custom-handler card              | Escape hatch, handler registry, handler tests.             |

### 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)

Use these two real card payloads immediately because they test the card-data adapter and effect DSL more effectively than pure fake cards.

| Card                             | Fixture path                                                   | Why it is included early                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OP01-060` Donquixote Doflamingo | `fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json` | Tests variant index `0`, source-attached DON!! condition, paid attack trigger, public reveal, optional effect-play rested, and FAQ-driven face-down return. |
| `OP05-091` Rebecca               | `fixtures/poneglyph/cards/OP05-091.rebecca.json`               | Tests nullable variant fields, `[Blocker]`, trash-to-hand, then hand-to-field sequence, `other than [Rebecca]`, and FAQ-confirmed same-card play.           |

These do not replace the 20-card coverage set. They anchor it to actual Poneglyph payloads so the adapter, effect DSL, and tests evolve together.

### 17-first-card-fixtures.s008 (Updated first fixture slice)

For the first implementation sprint, use this tighter subset:

```text
1. FX-LEADER-VANILLA      - fake vanilla leader for minimal combat
2. FX-CHAR-VANILLA        - fake vanilla character for play/K.O.
3. FX-BLOCKER             - fake blocker if Rebecca is not yet loaded
4. FX-ONPLAY-DRAW         - simple on-play draw primitive
5. OP01-060               - real Doflamingo fixture, implemented after transient reveal primitives
6. OP05-091               - real Rebecca fixture, implemented after sequence-local selections
```

The fake cards keep the CLI loop simple. The real cards prove that the Poneglyph adapter and DSL are not drifting away from actual card payloads.

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

### 19-poneglyph-api-contract.s002 (Purpose)

This document tightens the `@optcg/cards` implementation against the provided Poneglyph OpenAPI contract and real card payload examples. The original simulator plan says Poneglyph is the source of truth for printed card text, stats, images, variants, and metadata. This document makes that actionable without giving Poneglyph gameplay authority.

The engine never calls Poneglyph during effect resolution. `@optcg/cards` resolves Poneglyph data, validates it, normalizes it, merges simulator overlays, and produces a match-time manifest.

### 19-poneglyph-api-contract.s003 (Source fixtures in this package)

```text
fixtures/poneglyph/openapi.optcg-api-0.1.0.json
fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json
fixtures/poneglyph/cards/OP05-091.rebecca.json
```

These fixtures should be used for contract tests and early implementation tests before live HTTP is wired in.

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

### 19-poneglyph-api-contract.s012 (Match creation behavior)

1. Collect unique base card IDs from both leaders, main decks, and DON!! decks.
2. Resolve through batch endpoint in chunks of 60.
3. Validate and normalize each returned card.
4. Fail if any requested card appears in `missing`.
5. Merge simulator overlays.
6. Reject unsupported, stale, unreleased, or format-illegal cards according to mode.
7. Snapshot the full match manifest, including hash/version fields.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Each package must expose consistent task names where applicable:

- `build`
- `typecheck`
- `lint`
- `test`
- `test:watch`
- `coverage`

Integration-heavy packages may additionally expose:

- `test:integration`
- `test:replay`
- `test:contracts`
- `test:hidden-info`

At the root, the workspace must provide:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm verify
```

`pnpm verify` is the canonical local pre-push command and must run the same core checks as the main merge CI pipeline.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

The repo must define a root `tsconfig.base.json` and package-level `tsconfig.json` files extending it.

Required compiler settings for implementation packages:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "noEmitOnError": true
  }
}
```

Strongly preferred unless a package-specific exception is justified in writing:

- `verbatimModuleSyntax`
- `importsNotUsedAsValues = error`
- `noUnusedLocals`
- `noUnusedParameters`

The repo must not rely on broad TypeScript escape hatches. The following require explicit justification in code review and should be lint-restricted where possible:

- `any`
- non-null assertion (`!`)
- `@ts-ignore`
- `@ts-nocheck`
- unchecked type assertions across trust boundaries

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only real fixture population and fail-closed tests for distinct printed effect shapes. Do not add new effect primitives, custom handlers, gameplay support, full catalog sync, live-network CI, server/client integration, or engine runtime execution for unsupported cards.

## Scope

- use the Poneglyph search endpoint only as a local maintainer discovery step to find a curated set of roughly 50 explicit candidate card IDs with printed effect shapes different from EB01-023's `[On Play] Draw 1 card.`
- prefer fixture candidates that spread across upcoming already-discussed effect families such as target K.O., Counter Event, Trigger, search/reveal, optional choice, once-per-turn, permanent modifier, replacement, multi-damage, Blocker, Rush, Double Attack, Banish, activate-main, on-K.O., when-attacking, and stage/event behavior, but do not implement those behaviors in this story
- record the selected card IDs, printed effect text, and inclusion rationale in tests or implementation notes before adding fixture metadata
- capture selected explicit card IDs with the CARD-003 fixture capture helper or equivalent reviewed deterministic checked-in Poneglyph detail payloads
- validate every newly added real fixture through the existing Poneglyph detail validator in hermetic tests
- update the real-card fixture helper and checked-in manifest fixture so the new cards are present as real Poneglyph-backed cards with `unsupported` simulator support
- add tests proving the new cards remain unsupported, have no effectDefinitionId/customHandlerIds, are not added to the manifest effect definition registry, and are rejected outside dev/sandbox policy
- add normalization/hash tests that preserve each new card's identity, category/type, colors, attributes, printed text, sourceTextHash, and behaviorHash behavior
- keep engine-core consuming only plain existing manifests and never @optcg/cards or live Poneglyph
- if search/capture is unavailable or candidate text is ambiguous, record a blocker or ambiguity instead of inventing card text or adding unsupported fixtures without reviewed source payloads

## Out of Scope

- full released-card catalog coverage
- scheduled, CI, or required live Poneglyph fetches
- implementing Poneglyph search as production package API
- automatic effect generation from printed text
- adding or changing effect definitions for the new fixtures
- new DSL primitives, custom handlers, optional effects, once-per-turn, replacement effects, search/reveal, Counter Events, Trigger effects, permanent modifiers, multi-damage, or new gameplay semantics
- changing engine-core to import @optcg/cards, Poneglyph HTTP, Redis, Postgres, server, client, or UI code
- server, client, API, WebSocket, database, deck-builder, or UI integration
- marking ambiguous or unsupported real cards as gameplay-supported

## Allowed Touch Points

<!-- prettier-ignore -->
- fixtures/poneglyph/cards/*.json
- fixtures/cards/real-card-dsl-match-card-manifest.json
- packages/cards/src/real-card-fixtures.ts
- packages/cards/src/real-card-fixtures.test.ts
- docs/workflow/card-fixture-capture.md
- stories/ambiguities/*.md
- stories/generated/CARD-005-populate-real-effect-shape-fixtures.yaml
- stories/approved/CARD-005-populate-real-effect-shape-fixtures.yaml
- agent-packets/CARD-005.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- use TDD by adding or extending failing fixture/manifest tests before changing fixture support code
- use live Poneglyph only as an explicit local capture/discovery step; never make tests or CI call live Poneglyph
- keep Poneglyph data as printed/display metadata authority only
- keep simulator overlay as gameplay implementation authority
- do not add effect definitions or engine runtime execution for the new unsupported fixtures
- fail closed on fixture schema, printed-text, support-status, manifest, or deck-validation ambiguity
- do not weaken TypeScript strictness
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- package-local schema validation test for each newly added real Poneglyph fixture
- package-local selected-card rationale assertion covering each new fixture ID and printed effect family
- package-local corpus coverage assertion proving the selected fixtures span multiple printed effect families rather than repeating the existing draw-only support shape
- package-local normalization/hash regression test using the new real fixtures
- package-local overlay/manifest test proving each new real card remains unsupported with no effectDefinitionId or customHandlerIds
- package-local assertion that manifest cards built from real fixtures do not contain raw Poneglyph payloads
- package-local deck/loadout validation rejection test for the new unsupported non-vanilla fixture cards
- package-local assertion that manifest effect definitions are not broadened for the new unsupported fixtures
- root `corepack pnpm test -- packages/cards`
- `corepack pnpm run packets:verify`
- full `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- a curated corpus of roughly 50 additional real Poneglyph card-detail fixtures with distinct printed effect shapes is checked in under `fixtures/poneglyph/cards`
- each added fixture has selected ID, printed effect text, and inclusion rationale recorded in tests or implementation notes
- every added fixture passes existing Poneglyph detail schema validation in hermetic tests
- real fixture normalization/hash tests cover the new cards' identity, category/type, colors, attributes, printed text, sourceTextHash, and behaviorHash behavior
- the real-card manifest fixture includes the new cards as `unsupported` and does not link them to effectDefinitionId or customHandlerIds
- manifest effect definitions remain limited to already implemented fixture support; the new unsupported fixtures do not add registry entries
- deck/loadout validation rejects the new unsupported non-vanilla cards outside allowed dev/sandbox policy
- no test requires live Poneglyph, live Redis, server, client, Postgres, or browser code
- if live Poneglyph search/capture is unavailable or candidate text is ambiguous, the story records the blocker instead of adding invented fixtures

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
