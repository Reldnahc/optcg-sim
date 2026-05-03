<!-- agent-packet:story-id TYP-001A -->
<!-- agent-packet:story-path stories/approved/TYP-001A-branded-identifiers-and-primitives.yaml -->
<!-- agent-packet:story-sha256 2b927cc404e8bd28ace34820836bfe94d5fe79891688d420c8e5ffe7b47c3580 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-001A
Epic ID: M1-001
Title: Add branded identifiers and global scalar primitives
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Replace the placeholder type export with the exact branded ID and global scalar/reference primitives that later type slices, engine state, and card metadata depend on.

## Authoritative Spec References

- 15-implementation-kickoff.s005 (Step 1 - `@optcg/types`)
- 16-typescript-interface-draft.s003 (Branded IDs)
- 16-typescript-interface-draft.s011 (Poneglyph raw and normalized interfaces)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

## Relevant Spec Excerpts

### 15-implementation-kickoff.s005 (Step 1 - `@optcg/types`)

Create shared types with no dependency on server/client packages.

Initial exports:

- Branded IDs: `CardId`, `InstanceId`, `PlayerId`, `MatchId`, `EffectId`.
- `Action` union.
- `PendingDecision` union.
- Public protocol DTOs.
- `PlayerView` and `SpectatorView`.
- Card metadata interfaces shaped around Poneglyph IDs.

### 16-typescript-interface-draft.s003 (Branded IDs)

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

export type CardId = Brand<string, "CardId">; // Poneglyph base card ID
export type VariantId = Brand<string, "VariantId">; // legacy alias; prefer VariantKey generated from Poneglyph variant index
export type LoadoutId = Brand<string, "LoadoutId">;
export type InstanceId = Brand<string, "InstanceId">;
export type PlayerId = Brand<string, "PlayerId">;
export type MatchId = Brand<string, "MatchId">;
export type EffectId = Brand<string, "EffectId">;
export type DecisionId = Brand<string, "DecisionId">;
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

## Story Boundary

Own only `Brand`, branded identifiers, and global scalar/reference primitives that are reused across multiple concern slices. Do not add card metadata, card refs/snapshots, game state, actions, decisions, views, or engine behavior.

## Scope

- add the shared `Brand` utility type
- export canonical branded IDs needed by Milestone 1: `CardId`, `VariantKey`, `LoadoutId`, `InstanceId`, `PlayerId`, `MatchId`, `EffectId`, `DecisionId`, `EngineEventId`, `QueueEntryId`, `TimingWindowId`, `SelectionSetId`, `SelectionId`, and `StateSeq`
- export global scalar/reference primitives used across multiple later slices: `Zone`, `Visibility`, `Comparator`, `PlayerRef`, and `BattleStep`
- remove the placeholder-only export from the package surface
- add package-local compile tests for representative branded assignment behavior

## Out of Scope

- card metadata interfaces
- raw or normalized Poneglyph DTOs
- `CardRef` and `CardSnapshot`
- deck and loadout shapes
- game-state structure
- action and decision unions
- player-view DTOs
- engine-core package creation

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/**
- packages/types/package.json

## Constraints

- TypeScript strictness must remain enabled
- do not use `any`, non-null assertions, or unchecked broad assertions
- do not invent non-canonical aliases such as `QueueId`; use `QueueEntryId` when the queue entry identifier is needed
- narrow brand assertions are allowed only in explicit trust-boundary examples and compile tests
- must pass `corepack pnpm run verify`

## Required Tests

- package test proving branded identifiers can be constructed with narrow brand assertions at explicit trust-boundary examples
- package compile test proving incompatible branded identifiers are rejected with `@ts-expect-error`
- package type test compiling representative global scalar/reference primitive values

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `@optcg/types` exports the branded identifier primitives required by later stories
- the placeholder-only export is no longer the package's meaningful contract
- representative branded IDs are not assignable to each other in compile-time tests

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
