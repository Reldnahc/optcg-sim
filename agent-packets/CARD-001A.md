<!-- agent-packet:story-id CARD-001A -->
<!-- agent-packet:story-path stories/approved/CARD-001A-cards-package-skeleton-poneglyph-fixtures.yaml -->
<!-- agent-packet:story-sha256 bced2dd81c0ee3a9b39f877d3d4afc495f1b6e91506ac55be0221244b64699af -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-001A
Epic ID: CARD-001
Title: Add cards package skeleton and Poneglyph fixtures
Type: implementation
Area: cards
Primary Concern: contract

## Why

Create the @optcg/cards workspace package with strict TypeScript wiring, package exports, baseline tests, and checked-in Poneglyph-shaped card-detail fixtures for adapter development.

## Authoritative Spec References

- 09-card-data-and-support-policy.s004 (Package responsibility: `@optcg/cards`)
- 09-card-data-and-support-policy.s025 (Poneglyph fixture-backed implementation tests)
- 14-glossary.s018 (Poneglyph terms)
- 15-implementation-kickoff.s015 (Spec-driven backlog and agent delivery)
- 19-poneglyph-api-contract.s003 (Source fixtures in this package)
- 19-poneglyph-api-contract.s010 (Zod schema policy)
- 16-typescript-interface-draft.s011 (Poneglyph raw and normalized interfaces)
- 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)
- 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)
- 23-repo-tooling-and-enforcement.s003 (Canonical toolchain)
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

### 15-implementation-kickoff.s015 (Spec-driven backlog and agent delivery)

Before parallel feature implementation begins, the repo should adopt the planning contract defined in:

- [`24-story-schema.md`](24-story-schema.md)
- [`25-story-template.md`](25-story-template.md)
- [`26-agent-packet-template.md`](26-agent-packet-template.md)
- [`27-spec-driven-story-generation-workflow.md`](27-spec-driven-story-generation-workflow.md)

Required kickoff outcome:

1. spec sections are mapped into candidate epics and stories,
2. approved implementation stories exist in a canonical schema,
3. each assigned story is converted into a constrained agent packet,
4. implementation/review agents are instructed to escalate ambiguity instead of inventing behavior,
5. completed work cites the spec sections it implemented.

The spec is the authority. Stories and agent packets are delivery artifacts derived from that authority. If a story packet conflicts with the cited spec, the cited spec wins and the packet must be corrected.

The first post-foundation platform backlog should also reserve explicit stories for:

- queue-backed `ranked` and `unranked` session entry,
- custom lobby creation/join flows with optional password support,
- format registry and `formatId` enforcement,
- ranked ladder identity, simple Elo updates, and disconnect discipline persistence.

### 19-poneglyph-api-contract.s003 (Source fixtures in this package)

```text
fixtures/poneglyph/openapi.optcg-api-0.1.0.json
fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json
fixtures/poneglyph/cards/OP05-091.rebecca.json
```

These fixtures should be used for contract tests and early implementation tests before live HTTP is wired in.

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

### 17-first-card-fixtures.s007 (Real Poneglyph-backed fixtures added in v3)

Use these two real card payloads immediately because they test the card-data adapter and effect DSL more effectively than pure fake cards.

| Card                             | Fixture path                                                   | Why it is included early                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OP01-060` Donquixote Doflamingo | `fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json` | Tests variant index `0`, source-attached DON!! condition, paid attack trigger, public reveal, optional effect-play rested, and FAQ-driven face-down return. |
| `OP05-091` Rebecca               | `fixtures/poneglyph/cards/OP05-091.rebecca.json`               | Tests nullable variant fields, `[Blocker]`, trash-to-hand, then hand-to-field sequence, `other than [Rebecca]`, and FAQ-confirmed same-card play.           |

These do not replace the 20-card coverage set. They anchor it to actual Poneglyph payloads so the adapter, effect DSL, and tests evolve together.

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

### 23-repo-tooling-and-enforcement.s003 (Canonical toolchain)

Use the following baseline unless `SPEC_VERSION.md` is superseded by a later approved version:

- package manager: `pnpm`
- runtime target: Node.js LTS
- language: TypeScript with strict mode
- unit/integration test runner: Vitest
- linting: ESLint with type-aware rules
- formatting: Prettier
- schema/API validation: JSON Schema validation for effect DSL fixtures
- SQL verification: migration or schema validation in CI before merge
- git hooks: Husky or equivalent hook runner
- changed-file staging checks: lint-staged or equivalent
- monorepo task runner: pnpm workspaces alone or Turbo; if Turbo is added later it must not weaken any required checks
- coverage output: V8/Istanbul-compatible coverage reports

If a replacement tool is used later, it must provide equivalent or stronger enforcement.

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

Own package skeleton, build/test wiring, and static fixture placement only. Do not add live HTTP behavior, normalization behavior, overlays, manifests, cache adapters, or engine-core imports in this story.

## Scope

- create `packages/cards`
- add package-level `package.json`, `tsconfig.json`, exports, and baseline source/test files
- wire package typecheck/test coverage into existing root verification without weakening existing lanes
- add checked-in Poneglyph OpenAPI fixture at `fixtures/poneglyph/openapi.optcg-api-0.1.0.json`
- add checked-in Poneglyph-shaped card-detail response fixtures under `fixtures/poneglyph/cards/` for `OP01-060` and `OP05-091`
- keep fixtures local and deterministic with no live Poneglyph dependency

## Out of Scope

- live Poneglyph API client
- response schema validation beyond any minimal fixture smoke needed for package wiring
- normalization into ResolvedCard
- overlays, support registries, manifests, deck validation, or caches
- engine-core imports from @optcg/cards
- server, client, database, Redis, or UI integration

## Allowed Touch Points

<!-- prettier-ignore -->
- package.json
- packages/cards/**
- fixtures/poneglyph/**
- tests/contracts/**
- stories/generated/CARD-001A-cards-package-skeleton-poneglyph-fixtures.yaml
- stories/approved/CARD-001A-cards-package-skeleton-poneglyph-fixtures.yaml
- agent-packets/CARD-001A.md
- agent-packets/active.json

## Constraints

- use TDD for package smoke and fixture presence tests
- keep engine-core free of @optcg/cards imports
- do not add live network calls
- keep TypeScript strictness unchanged
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- package-level smoke test proving @optcg/cards exports load
- fixture presence test for OP01-060 and OP05-091 card-detail JSON
- OpenAPI fixture parse test proving `/v1/cards/{card_number}`, `/v1/cards/batch`, `/v1/search`, `/v1/cards/{card_number}/text`, and `/v1/formats` endpoints exist
- root `corepack pnpm run typecheck`
- root `corepack pnpm test -- packages/cards`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- the @optcg/cards workspace package exists with strict TypeScript package config
- package exports are named and usable from package-local tests
- root typecheck and test lanes include the cards package
- OP01-060 and OP05-091 Poneglyph-shaped fixtures are checked in under `fixtures/poneglyph/cards/`
- OpenAPI fixture is checked in and package-local fixture tests confirm expected Poneglyph endpoints exist for PON-001
- tests do not require live Poneglyph

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
