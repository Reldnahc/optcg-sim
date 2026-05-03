<!-- agent-packet:story-id TYP-001B -->
<!-- agent-packet:story-path stories/approved/TYP-001B-card-metadata-deck-and-loadout-types.yaml -->
<!-- agent-packet:story-sha256 0169816500a95842d5ddfb754fbbb4cd21f7bfab1c20de4aae63660278774658 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-001B
Epic ID: M1-001
Title: Add card metadata, decklist, and loadout contracts
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Add the shared card metadata, variant, decklist, and account-level loadout types needed before engine fixture cards and later card-data adapters can use the same contract language.

## Authoritative Spec References

- 09-card-data-and-support-policy.s003 (Data ownership model)
- 09-card-data-and-support-policy.s008 (Card variants and alternate art)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 16-typescript-interface-draft.s004 (Card metadata)
- 16-typescript-interface-draft.s011 (Poneglyph raw and normalized interfaces)
- 16-typescript-interface-draft.s013 (Account-level loadouts)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)

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

### 16-typescript-interface-draft.s004 (Card metadata)

```ts
export interface CardMetadata {
  cardId: CardId;
  source: "poneglyph" | "poneglyph-fixture";
  name: string;
  category: "leader" | "character" | "event" | "stage" | "don";
  color: Color[];
  cost?: number;
  life?: number;
  power?: number;
  counter?: number;
  types?: string[];
  attribute?: Attribute;
  text: string;
  variants?: CardVariant[]; // prefer ResolvedCardVariant in @optcg/cards
  sourceTextHash?: string;
}

export interface CardVariant {
  variantKey: VariantKey;
  variantIndex: number;
  imageUrl?: string;
  label?: string;
}
```

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

### 16-typescript-interface-draft.s013 (Account-level loadouts)

```ts
export interface Loadout {
  loadoutId: LoadoutId;
  ownerPlayerId: PlayerId;
  name: string;
  deck: Array<{ cardId: CardId; quantity: number }>;
  donDeckVariantKey?: VariantKey;
  sleevesId?: string;
  playmatId?: string;
  iconId?: string;
  cardVariants?: Record<CardId, VariantKey>;
}
```

Loadouts are account-level saved preferences. Cosmetics are globally unlocked; availability is gated only by whether the referenced image/API asset exists.

### 22-v6-implementation-tightening.s006 (2. TypeScript model)

The old `16-typescript-interface-draft.md` was a draft and referenced undefined symbols. The implementation contract is now `contracts/canonical-types.ts`.

Resolved and normalized items include:

- `Color` -> `CardColor`
- `Attribute`
- `ZoneRef`
- `MatchCardManifest`
- `RngState`
- `EffectQueueEntry`
- `ContinuousEffect`
- `EventVisibility`
- `CardRef`
- `DecisionResponse`
- `Cost`
- `PaymentOption`
- `TargetRequest`
- `CardSelectionRequest`
- `EffectOption`
- `PublicEffectEvent` replacement via filtered `EngineEvent[]`
- `eventLog`/`eventJournal` conflict resolved to `eventJournal`
- `activeBattle`/`battle` conflict resolved to `battle`
- serializable arrays instead of `Set`

The contract compiles with:

```bash
cd contracts
tsc -p tsconfig.json
```

## Story Boundary

Own only card/deck/loadout type exports in `@optcg/types`. Do not implement validation logic, Poneglyph HTTP access, card fixtures, engine setup, or deck builder behavior.

## Scope

- export card category, color, attribute, keyword, match-source, and support-status contract types needed by metadata
- export canonical card references and snapshots: `ZoneRef`, `CardRef`, and `CardSnapshot`
- export canonical card metadata/version/support contracts: `CardVariant`, `CardMetadata`, `RuntimeVersionSet`, `RulingNote`, `CardImplementationRecord`, `BanlistRecord`, and `ResolvedCardOverlay`
- export resolved card metadata and match card manifest interfaces shaped around base Poneglyph card IDs, including canonical `rarity?: string` fields where present
- export canonical Poneglyph and normalized support contracts required by resolved cards and manifests: `PoneglyphLegalityRecord`, `PoneglyphOfficialFaq`, `PoneglyphErrata`, `PoneglyphVariant`, `PoneglyphCardDetail`, `NormalizedErrata`, and `ResolvedCardVariant`
- export canonical deck and loadout contracts: `DecklistEntry`, `ResolvedDeckCard`, `DeckValidationError`, `DeckValidationWarning`, `DeckValidationResult`, and `Loadout`
- represent split variants for the same base card as separate `DecklistEntry` rows with the same `CardId` and different `variantKey` values
- represent omitted `DecklistEntry.variantKey` as the canonical/default variant case
- keep `cardVariants` as a cosmetic/default variant preference and not as the quantity representation
- add package-local type tests for base-card quantity and variant-key shape usage

## Out of Scope

- raw Poneglyph DTOs beyond the canonical shared contract; canonical `Poneglyph*` exports listed in scope are in scope
- Poneglyph normalization functions
- Poneglyph schema validation
- fixture card files
- deck legality validation behavior
- source text or behavior hash computation
- generated deck hash integration
- engine state or setup behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/**

## Constraints

- variants are cosmetic and must not become gameplay identity
- do not invent a `Rarity` or `CardRarity` alias; use the canonical string field where present
- do not add runtime Poneglyph dependencies to `@optcg/types`
- must pass `corepack pnpm run verify`

## Required Tests

- package test proving deck entries and loadouts accept base card IDs plus variant keys
- package test proving the same base `CardId` can appear in multiple deck entries with different `VariantKey` values
- package test proving `DecklistEntry.variantKey` can be omitted for the canonical/default variant case
- package test compiling representative `PoneglyphCardDetail`, `PoneglyphVariant`, and `DeckValidationResult` fixtures
- package test proving resolved card metadata can represent fixture-sourced card data

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- card metadata contracts use base `CardId` for gameplay identity
- deck/loadout contracts can represent split variants without changing base-card quantities
- match manifests can snapshot resolved cards without requiring live card-data access

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
