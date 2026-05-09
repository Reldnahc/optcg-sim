<!-- agent-packet:story-id CARD-001E -->
<!-- agent-packet:story-path stories/approved/CARD-001E-manifest-builder-deck-validation.yaml -->
<!-- agent-packet:story-sha256 5becb48c0c331c883cd1737e222bec13a9758d190aa3dd5765088f133ca74ae6 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-001E
Epic ID: CARD-001
Title: Add manifest builder and deck validation
Type: implementation
Area: cards
Primary Concern: contract

## Why

Build MatchCardManifest values from resolved cards, overlays, and effect definitions, and add a deck/loadout validation helper that fails closed for unsupported non-vanilla cards outside dev or sandbox policy.

## Authoritative Spec References

- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)
- 15-implementation-kickoff.s015 (Spec-driven backlog and agent delivery)
- 19-poneglyph-api-contract.s007 (Normalized card shape)
- 19-poneglyph-api-contract.s011 (Adapter API)
- 19-poneglyph-api-contract.s012 (Match creation behavior)
- 19-poneglyph-api-contract.s013 (Poneglyph update behavior)
- 16-typescript-interface-draft.s010 (Hashing rules)
- 16-typescript-interface-draft.s011 (Poneglyph raw and normalized interfaces)
- 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

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

### 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)

Every supported card stores a hash of its Poneglyph printed text.

When the Poneglyph text changes:

1. Mark the card implementation as stale.
2. Fail CI if a stale card remains marked `tested` without review.
3. Prevent ranked use if the changed text affects card behavior.
4. Require a reviewer to update the source hash after verifying the DSL/custom handler.

This catches errata, typo fixes that affect parsing, and Poneglyph schema/text changes.

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

### 19-poneglyph-api-contract.s013 (Poneglyph update behavior)

When a resolved card's `behaviorHash` differs from the overlay record:

| Mode              | Behavior                                                                         |
| ----------------- | -------------------------------------------------------------------------------- |
| Dev sandbox       | Allow with stale warning.                                                        |
| Casual            | Reject unless card is marked reviewed for this hash or mode permits stale cards. |
| Ranked/tournament | Reject until implementation record is reviewed and updated.                      |

This is especially important for FAQ-driven cards like `OP01-060`, where a FAQ answer determines hidden-information handling after a revealed card is not played.

### 16-typescript-interface-draft.s010 (Hashing rules)

State hash input includes canonical `GameState` only:

- Include hidden zones server-side.
- Include RNG state.
- Include pending decision.
- Include effect queue.
- Include card manifest versions.
- Sort object keys.
- Preserve array order.
- Exclude UI-only data, WebSocket connection state, timestamps that do not affect gameplay, and logs not part of canonical state.

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

Own manifest construction, version/hash helpers, and package-local deck validation only. Do not integrate with match server, platform APIs, persistence, UI, or engine-core fetching behavior.

## Scope

- build MatchCardManifest from resolved cards, overlays, and effect definitions
- add manifest hash and version helpers
- ensure manifest hash inputs are deterministic and exclude timestamps that do not affect gameplay
- add deck/loadout validation helper using resolved cards and manifest support data
- reject unknown card IDs
- reject unsupported non-vanilla cards outside dev or sandbox policy
- reject unreleased, stale behavior-hash, format-illegal, invalid-variant, and simulator-banned entries according to current metadata contracts
- enforce base-card copy limits from Poneglyph legality data where current fixture metadata provides those limits
- allow supported vanilla-confirmed cards according to current card metadata contracts

## Out of Scope

- match-server integration
- platform API endpoints
- Postgres writes
- deck builder UI
- client search UI
- queue, lobby, or matchmaking behavior
- changing engine-core to fetch cards directly
- changing gameplay semantics

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/**
- tests/contracts/**
- stories/generated/CARD-001E-manifest-builder-deck-validation.yaml
- stories/approved/CARD-001E-manifest-builder-deck-validation.yaml
- agent-packets/CARD-001E.md
- agent-packets/active.json

## Constraints

- engine-core must continue consuming only MatchCardManifest/resolved card data
- missing or unsupported non-vanilla implementations must fail closed
- do not add server, client, database, or UI integration
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- manifest builder unit test for deterministic manifest hash
- manifest builder test for version helper output
- manifest builder test for effectDefinitions inclusion
- deck validation test for unknown card ID
- deck validation test for unsupported non-vanilla rejection outside dev/sandbox
- deck validation test for unreleased or format-illegal card rejection
- deck validation test for stale behavior-hash or simulator-banned rejection
- deck validation test for invalid variant and base-card copy-limit rejection
- deck validation test for valid supported fixture deck
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- manifest builder produces a MatchCardManifest-compatible object with versions, effect definitions, resolved cards, and deterministic manifestHash
- manifest hash changes when gameplay-relevant card support or effect definition inputs change
- deck validation rejects unknown card IDs
- deck validation rejects unsupported non-vanilla cards outside dev or sandbox policy
- deck validation rejects unreleased, format-illegal, simulator-banned, stale behavior-hash, invalid-variant, and over-copy-limit entries when the current contracts provide the relevant inputs
- deck validation reports resolved cards and version metadata on success

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
