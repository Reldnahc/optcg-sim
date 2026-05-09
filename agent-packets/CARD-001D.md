<!-- agent-packet:story-id CARD-001D -->
<!-- agent-packet:story-path stories/approved/CARD-001D-simulator-overlay-support-merge.yaml -->
<!-- agent-packet:story-sha256 a61ee5ef25309768064d1f99a0c9329798a3fe91b7fea7d09b21dfd6b101fb7c -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-001D
Epic ID: CARD-001
Title: Add simulator overlay merge
Type: implementation
Area: cards
Primary Concern: contract

## Why

Add package-local simulator overlay loading and merge behavior so gameplay implementation authority is supplied by explicit local overlay records rather than inferred from Poneglyph printed metadata.

## Authoritative Spec References

- 09-card-data-and-support-policy.s003 (Data ownership model)
- 09-card-data-and-support-policy.s009 (Simulator overlay shape)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 14-glossary.s018 (Poneglyph terms)
- 19-poneglyph-api-contract.s012 (Match creation behavior)
- 19-poneglyph-api-contract.s013 (Poneglyph update behavior)
- 16-typescript-interface-draft.s011 (Poneglyph raw and normalized interfaces)
- 17-first-card-fixtures.s008 (Updated first fixture slice)
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

### 09-card-data-and-support-policy.s009 (Simulator overlay shape)

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

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own overlay schema, loading, and merge behavior only. Do not build manifests, deck validation, caches, live clients, server APIs, or new effect primitives in this story.

## Scope

- add simulator overlay schema or typed loader for overlay records keyed by card ID
- merge overlays onto normalized cards to produce support records
- make overlay own `support`, `effectDefinitionId`, `customHandlerIds`, `rulingNotes`, `banlist`, and `simulatorTags`
- make the `support` record own status, tested flag, rulesVersion, cardDataVersion, sourceTextHash, behaviorHash, and notes
- record an ambiguity or explicit deferral for errata override behavior if current contracts do not support it
- fail closed when overlay support metadata is malformed or references a different card ID
- preserve unsupported defaults for cards without implementation overlays

## Out of Scope

- MatchCardManifest construction
- deck/loadout validation
- cache adapters
- generating effects from card text
- implementing new effect primitives
- changing engine-core behavior
- server, client, database, Redis, or UI integration

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/**
- tests/contracts/**
- stories/generated/CARD-001D-simulator-overlay-support-merge.yaml
- stories/approved/CARD-001D-simulator-overlay-support-merge.yaml
- agent-packets/CARD-001D.md
- agent-packets/active.json

## Constraints

- simulator overlay remains gameplay implementation authority
- do not infer implemented support from Poneglyph printed metadata
- fail closed on malformed support records
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- overlay merge test for support status and effectDefinitionId
- overlay merge test for sourceTextHash and behaviorHash support metadata
- overlay merge test for customHandlerIds and tested/version metadata
- overlay merge test for banlist/simulator status and notes
- malformed or mismatched overlay failure test
- unsupported-default test for missing overlay
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- overlay merge supplies exact ResolvedCardOverlay and CardImplementationRecord fields without reading gameplay authority from Poneglyph text
- overlay merge preserves behaviorHash as required support metadata
- unsupported cards remain unsupported unless overlay explicitly marks support
- malformed overlay records fail closed
- errata override behavior is implemented only where current contracts support it; otherwise an ambiguity or explicit deferral is recorded instead of inventing fields

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
