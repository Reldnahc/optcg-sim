<!-- agent-packet:story-id CARD-004 -->
<!-- agent-packet:story-path stories/approved/CARD-004-real-card-fixture-integration-tests.yaml -->
<!-- agent-packet:story-sha256 2eeba944ef349d476050917e044e89b33a8bfd1feaae5eb4ffc98d9803416ef1 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-004
Epic ID: CARD-004
Title: Add real card fixture integration tests
Type: implementation
Area: cards
Primary Concern: verification

## Why

Add a small reviewed set of real Poneglyph card-detail fixtures and hermetic tests proving the existing @optcg/cards validation, normalization, overlay, manifest, deck/loadout validation, and effect DSL execution surfaces work against real checked-in card payloads rather than synthetic-only data.

## Authoritative Spec References

- 04-effect-runtime.s005 (Card implementation support)
- 05-effect-dsl-reference.s001 (Effect DSL Reference)
- 05-effect-dsl-reference.s002 (Purpose)
- 05-effect-dsl-reference.s003 (Top-level definition)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s019 (Example: On Play draw 1)
- 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)
- 09-card-data-and-support-policy.s004 (Package responsibility: `@optcg/cards`)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s019 (Failure behavior)
- 09-card-data-and-support-policy.s022 (Security checklist)
- 09-card-data-and-support-policy.s023 (Concrete Poneglyph API contract)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 09-card-data-and-support-policy.s025 (Poneglyph fixture-backed implementation tests)
- 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)
- 17-first-card-fixtures.s008 (Updated first fixture slice)
- 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)
- 19-poneglyph-api-contract.s002 (Purpose)
- 19-poneglyph-api-contract.s003 (Source fixtures in this package)
- 19-poneglyph-api-contract.s007 (Normalized card shape)
- 19-poneglyph-api-contract.s010 (Zod schema policy)
- 19-poneglyph-api-contract.s011 (Adapter API)
- 19-poneglyph-api-contract.s012 (Match creation behavior)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

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

### 05-effect-dsl-reference.s001 (Effect DSL Reference)

Effect definitions are keyed by **Poneglyph base card ID**. Poneglyph supplies the printed card text and metadata; the simulator DSL supplies executable rule behavior. The DSL should store a source-text hash so a Poneglyph text change can trigger implementation review.

### 05-effect-dsl-reference.s002 (Purpose)

The effect DSL is a serializable card-effect definition language. It should cover most cards through composable primitives and route unusual cards to tested custom handlers.

**v6 contract:** [`contracts/effect-dsl.schema.json`](contracts/effect-dsl.schema.json) is the canonical validation schema for JSON fixtures, and [`contracts/canonical-types.ts`](contracts/canonical-types.ts) is the canonical TypeScript contract. Markdown snippets below are explanatory.

Definitions live in the repo for Phase 1 so they can be reviewed, diffed, tested, and versioned.

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

### 05-effect-dsl-reference.s019 (Example: On Play draw 1)

```json
{
  "cardId": "OP01-015",
  "implementationStatus": "implemented-dsl",
  "effects": [
    {
      "id": "OP01-015:auto-on-play-1",
      "category": "auto",
      "trigger": { "type": "onPlay" },
      "optional": false,
      "oncePerTurn": false,
      "sourcePresencePolicy": "mustRemainInSameZone",
      "effect": { "type": "draw", "count": 1, "player": "self" }
    }
  ],
  "metadata": {
    "sourceTextHash": "sha256:...",
    "rulesVersion": "2026-01-16",
    "effectDefinitionsVersion": "0.1.0",
    "tested": true
  }
}
```

### 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)

The original effect-system plan defined three authoring phases:

1. Manual DSL definitions written by developers.
2. Custom TypeScript handlers for cards that cannot be expressed in DSL.
3. Generated DSL candidates from Poneglyph printed card text, always requiring human review before merge.

Generated definitions must never be deployed blindly. The pipeline may read Poneglyph card text and produce a candidate `EffectDefinition`, but a reviewer must verify the card against official text/rulings, update tests, and approve the source-text hash.

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

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own real checked-in Poneglyph-shaped fixture coverage and tests for the existing cards package adapter path and current engine effect DSL runtime path. Do not broaden into full catalog sync, live-network CI, new DSL primitives, custom handlers, server/client integration, or production gameplay support changes.

## Scope

- use OP01-060 and OP05-091 as existing real Poneglyph adapter/hash fixtures at their current checked-in paths
- add EB01-023 as the explicit simple real DSL fixture only if the captured validated Poneglyph payload has the exact `[On Play] Draw 1 card.` behavior; otherwise stop and record an ambiguity or blocker instead of inventing the payload or effect text
- use the CARD-003 fixture capture helper or equivalent reviewed checked-in payloads to add deterministic Poneglyph card-detail fixtures
- keep fixture capture as a maintainer/local step only; committed tests must use checked-in fixtures and must not call live Poneglyph
- add package-local tests that validate every newly added real fixture through the existing Poneglyph detail validator
- add package-local tests that normalize the real fixtures and assert key behavior-sensitive fields are preserved in the repo's resolved card metadata shape
- add package-local tests that merge simulator overlays with the real fixtures without granting unsupported gameplay support accidentally
- add package-local tests that build a MatchCardManifest from the real fixtures and assert manifest cards do not contain raw Poneglyph payloads
- include EB01-023 in a real checked-in card fixture with a reviewed effectDefinitionId and EffectDefinition using the existing On Play draw-1 DSL shape
- add tests proving the EB01-023 real-card manifest support metadata links support.effectDefinitionId to the included effect definition registry entry
- add root or engine integration coverage that passes the cards-produced plain manifest data into engine-core without importing @optcg/cards from engine-core
- add engine effect-runtime coverage that queues and executes EB01-023's no-choice On Play draw DSL effect through the existing runtime path using only plain manifest/effect definition data
- add deck/loadout validation coverage using real fixtures, including fail-closed rejection for unsupported non-vanilla cards outside the allowed dev or sandbox policy
- update representative fixture metadata or fixture helper surfaces only as needed for these real-card tests
- document any selected real card IDs and why each is included when that rationale is not obvious from the test name

## Out of Scope

- full released-card catalog coverage
- scheduled, CI, or required live Poneglyph fetches
- live Redis, Postgres, server, client, UI, or deck-builder integration
- changing engine-core to import @optcg/cards or live card-data surfaces
- implementing new DSL primitives, custom handlers, or gameplay semantics
- changing production card support status except for checked-in fixture/test overlay data that explicitly points EB01-023 to the reviewed existing On Play draw-1 DSL definition
- automatic effect generation from printed text
- broad replay fixture rewrite

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/real-card-fixtures.ts
- packages/cards/src/real-card-fixtures.test.ts
- packages/cards/src/representative-fixtures.ts
- packages/cards/src/index.ts
- packages/engine-core/src/real-card-dsl-runtime.test.ts
- fixtures/poneglyph/cards/EB01-023.edward-weevil.json
- fixtures/cards/real-card-dsl-match-card-manifest.json
- fixtures/effect-dsl/valid/eb01-023-on-play-draw-1.json
- tests/integration/real-card-dsl-manifest-smoke.test.mjs
- docs/workflow/card-fixture-capture.md
- stories/generated/CARD-004-real-card-fixture-integration-tests.yaml
- stories/approved/CARD-004-real-card-fixture-integration-tests.yaml
- agent-packets/CARD-004.md
- agent-packets/active.json

## Constraints

- do not require live Poneglyph or live Redis in tests or CI
- keep Poneglyph data as printed/display metadata authority only
- keep simulator overlay as gameplay implementation authority
- real-card DSL tests must use reviewed checked-in EffectDefinition data and existing runtime primitives only
- keep engine-core free of @optcg/cards, live Poneglyph, Redis, Postgres, server, client, and UI imports
- fail closed on fixture schema, support-status, effect-definition linkage, DSL execution, or deck-validation ambiguity
- do not weaken TypeScript strictness
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- package-local schema validation test for each newly added real Poneglyph fixture
- package-local normalization/hash regression test using the real fixtures
- package-local overlay merge test using the real fixtures
- package-local MatchCardManifest build test using the real fixtures
- package-local or root integration test proving EB01-023 support.effectDefinitionId resolves to the manifest effect definition registry entry
- engine-core test that loads plain checked-in manifest/effect definition data and executes EB01-023's no-choice On Play draw DSL effect through the existing effect runtime
- package-local deck/loadout validation rejection test for unsupported non-vanilla real fixture cards
- package-local assertion that manifest cards built from real fixtures do not contain raw Poneglyph payloads
- package-boundary assertion that engine-core real-card DSL tests do not import @optcg/cards, Poneglyph HTTP, Redis, Postgres, server, client, or UI code
- root `corepack pnpm test -- packages/cards`
- root or package command covering the engine-core real-card DSL runtime test
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- a small reviewed set of additional real Poneglyph card-detail fixtures is checked in under fixtures/poneglyph/cards
- every added real fixture passes existing Poneglyph detail schema validation in hermetic tests
- real fixture normalization tests assert card identity, category/type, colors, attributes, printed text, variants, legality, sourceTextHash, and behaviorHash behavior where present in the payload
- real fixture overlay/manifest tests prove simulator overlay remains gameplay implementation authority and unsupported cards remain unsupported
- EB01-023 is either captured as a validated real fixture with exact `[On Play] Draw 1 card.` behavior and wired to the reviewed On Play draw-1 DSL definition, or the story stops with a recorded blocker explaining why the live/captured payload cannot support that test honestly
- the real fixture-backed manifest includes the EB01-023 reviewed DSL effect definition wired through support.effectDefinitionId and the manifest effect definition registry
- engine effect-runtime tests execute EB01-023's no-choice On Play draw DSL effect from plain manifest/effect definition data without @optcg/cards imports in engine-core
- real fixture deck/loadout tests fail closed for unsupported non-vanilla cards outside the allowed dev or sandbox policy
- no test requires live Poneglyph, live Redis, server, client, Postgres, or browser code
- engine-core package boundaries remain unchanged; engine-core consumes only plain manifest/resolved-card data

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
