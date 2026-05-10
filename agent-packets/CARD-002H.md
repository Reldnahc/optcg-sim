<!-- agent-packet:story-id CARD-002H -->
<!-- agent-packet:story-path stories/approved/CARD-002H-harden-card-manifest-adoption-validation.yaml -->
<!-- agent-packet:story-sha256 dedbbff7636e9b890c57b551425132e74d8eeed0bb645d15c3467d85d8a08bb5 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-002H
Epic ID: CARD-002
Title: Harden card manifest adoption validation
Type: implementation
Area: cards
Primary Concern: contract

## Why

Add narrow fail-closed validation around cards-produced manifest adoption so duplicate manifest card IDs, contradictory overlay effect metadata, and banlist behavior cannot be silently misrepresented in downstream fixtures.

## Authoritative Spec References

- 04-effect-runtime.s005 (Card implementation support)
- 09-card-data-and-support-policy.s009 (Simulator overlay shape)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s021 (Banlist and simulator ban policy)
- 09-card-data-and-support-policy.s023 (Concrete Poneglyph API contract)
- 18-acceptance-tests.s011 (v3 Poneglyph adapter acceptance tests)
- 19-poneglyph-api-contract.s010 (Zod schema policy)
- 19-poneglyph-api-contract.s012 (Match creation behavior)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

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

### 09-card-data-and-support-policy.s021 (Banlist and simulator ban policy)

Separate official restrictions from simulator-specific implementation restrictions.

```ts
interface BanlistRecord {
  cardId: CardId; // Poneglyph base card ID
  format: string;
  status:
    | "legal"
    | "banned"
    | "restricted"
    | "leaderLocked"
    | "simulatorBanned";
  maxCopies?: number;
  reason?: string;
  effectiveFrom: string;
}
```

A simulator ban is appropriate when a card is legal in the real game but not yet safely implementable.

### 09-card-data-and-support-policy.s023 (Concrete Poneglyph API contract)

The provided OpenAPI document is captured in [`fixtures/poneglyph/openapi.optcg-api-0.1.0.json`](fixtures/poneglyph/openapi.optcg-api-0.1.0.json). The exact adapter contract is now split into [`19-poneglyph-api-contract.md`](19-poneglyph-api-contract.md).

Key implementation rules from the API contract:

- Use `GET /v1/cards/{card_number}` or `POST /v1/cards/batch` for match/deck resolution.
- Batch requests accept at most 60 `card_numbers`, so deck resolution must chunk unique IDs.
- Do not use `/v1/search` results as authoritative card details. Search variants can be filtered by query predicates and the result shape lacks some fields needed for implementation review.
- Treat `legality` as an input to format validation, not as the only authority. Merge it with simulator support status and banlist overlays.
- Keep `official_faq` and variant `errata` in implementation review data because they can change effect behavior.

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

### 19-poneglyph-api-contract.s012 (Match creation behavior)

1. Collect unique base card IDs from both leaders, main decks, and DON!! decks.
2. Resolve through batch endpoint in chunks of 60.
3. Validate and normalize each returned card.
4. Fail if any requested card appears in `missing`.
5. Merge simulator overlays.
6. Reject unsupported, stale, unreleased, or format-illegal cards according to mode.
7. Snapshot the full match manifest, including hash/version fields.

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

Own only the narrow validation hardening needed by manifest adoption. Do not redesign the CARD-001 adapter foundation, add live Poneglyph behavior, add live Redis behavior, broaden catalog support, or change gameplay semantics.

## Scope

- ensure duplicate card IDs in manifest input fail closed instead of silently overwriting entries
- ensure overlay top-level effectDefinitionId and customHandlerIds cannot disagree with support.effectDefinitionId and support.customHandlerIds
- ensure overlay banlist behavior is enforced by deck or loadout validation where current contracts define the semantics
- if current contracts do not define overlay-banlist semantics narrowly enough, stop and record an ambiguity or blocker before implementation instead of deferring in an implementation note
- add deterministic tests for each adoption hardening behavior
- keep the hardening scoped to existing @optcg/cards APIs unless story-review identifies a narrow adoption blocker

## Out of Scope

- broad adapter redesign
- new Poneglyph schema fields beyond existing validated fixtures
- live Poneglyph or Redis requirements
- engine-core imports from @optcg/cards
- server, client, UI, or database behavior
- new gameplay semantics or effect primitives

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/**
- fixtures/**
- tests/contracts/**
- stories/generated/CARD-002H-harden-card-manifest-adoption-validation.yaml
- stories/approved/CARD-002H-harden-card-manifest-adoption-validation.yaml
- agent-packets/CARD-002H.md
- agent-packets/active.json

## Constraints

- fail closed on validation ambiguity
- do not silently broaden this story into new adapter features
- do not weaken TypeScript strictness
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- package-local duplicate manifest card ID validation test
- package-local overlay effect metadata disagreement validation test
- package-local banlist enforcement validation test where current contracts define overlay-banlist semantics
- no banlist deferral test may merge; undefined overlay-banlist semantics must stop implementation with a recorded ambiguity or blocker
- root `corepack pnpm test -- packages/cards`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- duplicate manifest card IDs fail closed with a clear validation error
- contradictory overlay effect metadata fails closed with a clear validation error
- banlist behavior is enforced by validation where current contracts define the semantics
- if banlist semantics are not currently defined narrowly enough, implementation stops with a recorded ambiguity or blocker instead of merging a deferral
- tests prove the above behaviors without live Poneglyph or Redis

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
