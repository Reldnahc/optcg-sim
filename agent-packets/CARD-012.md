<!-- agent-packet:story-id CARD-012 -->
<!-- agent-packet:story-path stories/approved/CARD-012-blocker-and-empty-effect-generated-support.yaml -->
<!-- agent-packet:story-sha256 f594e8bb33ec1c4da766a75fefc0365487ca55becae33eb6758cef99832f6230 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-012
Epic ID: CARD-012
Title: Blocker and empty-effect generated support enablement
Type: implementation
Area: cards
Primary Concern: rules

## Why

Enable two already-supported generated-support card-data cases: standalone printed `[Blocker]` keyword text, including the standard parenthetical reminder text, and Poneglyph cards whose printed effect is null or empty and normalizes to empty source text. Both cases should become playable support evidence without adding new engine behavior or manually admitting individual cards.

## Authoritative Spec References

- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s045 (Parenthetical explanatory notes)
- 05-effect-dsl-reference.s017 (Type enums)
- 05-effect-dsl-reference.s018 (Example: vanilla confirmed card)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 09-card-data-and-support-policy.s025 (Poneglyph fixture-backed implementation tests)
- 11-testing-quality.s005 (Unit tests per card)
- 11-testing-quality.s016 (Coverage gates)
- 11-testing-quality.s020 (Poneglyph/card-data tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 02-engine-mechanics.s019 (Block Step)

1. Defender may activate one legal `[Blocker]`, unless blocking is prohibited.
2. Blocker rests and becomes the current target.
3. Emit `blockerActivated`.
4. Queue `[On Block]` effects.
5. Resolve the block timing window.
6. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s025 (Keyword behavior)

| Keyword         | Engine behavior                                                      |
| --------------- | -------------------------------------------------------------------- |
| Rush            | Character may attack the turn it was played.                         |
| Rush: Character | Character may attack Characters, not Leader, the turn it was played. |
| Double Attack   | Leader damage count is 2.                                            |
| Banish          | Damaged life card is trashed; no normal trigger/hand path.           |
| Blocker         | During Block Step, can rest to redirect attack.                      |
| Unblockable     | Skips opponent blocker window.                                       |
| Activate: Main  | Legal only during controller's Main Phase outside battle.            |
| Main            | Event usable during controller's Main Phase.                         |
| Counter         | Event usable during opponent's Counter Step.                         |
| Once Per Turn   | Tracked by stable effect ID and card instance per turn.              |
| DON!! xX        | Condition is attached DON!! count greater than or equal to X.        |

### 02-engine-mechanics.s045 (Parenthetical explanatory notes)

Comprehensive Rules 2-8-4, 2-8-4-1, and 2-8-4-2 define parenthetical explanatory notes for keyword effects and other card effects. These explanatory notes provide further explanation or make an effect easier to understand, but they do not influence gameplay.

For engine support gates, support and classification logic may ignore parenthetical explanatory notes when deciding whether remaining printed text requires simulator implementation. This is a classification rule only. It must not be used to parse, execute, generate, or replace gameplay behavior.

Parenthetical explanatory-note handling must not mutate raw Poneglyph text, normalized `ResolvedCard.effectText`, manifest display text, PlayerView card text, `sourceTextHash`, `behaviorHash`, or reviewed printed-text evidence. The simulator overlay, keyword behavior table, effect DSL definitions, custom handlers, rulings, support status, and card-specific tests remain the gameplay implementation authority.

### 05-effect-dsl-reference.s017 (Type enums)

```ts
type Zone =
  | "hand"
  | "deck"
  | "trash"
  | "life"
  | "costArea"
  | "characterArea"
  | "stageArea"
  | "leaderArea"
  | "donDeck"
  | "noZone";

type CardCategory = "leader" | "character" | "event" | "stage" | "don";
type Color = "red" | "green" | "blue" | "purple" | "black" | "yellow";
type Attribute = "slash" | "strike" | "ranged" | "special" | "wisdom";
type Keyword =
  | "rush"
  | "rushCharacter"
  | "doubleAttack"
  | "banish"
  | "blocker"
  | "unblockable";
```

### 05-effect-dsl-reference.s018 (Example: vanilla confirmed card)

```json
{
  "cardId": "OP01-006",
  "implementationStatus": "vanilla-confirmed",
  "effects": [],
  "metadata": {
    "sourceTextHash": "sha256:...",
    "rulesVersion": "2026-01-16",
    "effectDefinitionsVersion": "0.1.0",
    "tested": true
  }
}
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
  generatedSupportId?: string;
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string; // hash of Poneglyph printed text used for review drift
  notes?: string;
}
```

A card with printed effect text but no implementation must be marked `unsupported`, not omitted. For common templates, implementation may come from a generated support index entry instead of a manual per-card overlay when the complete parse, parser certification, and runtime capability checks all pass.

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

Generated support index output is simulator support metadata. Deck validation may treat a generated record as `implemented-dsl` or `implemented-custom` only when the record has complete parse evidence, current source/behavior hashes, certified parser-rule evidence, and a runtime capability matrix result proving every component is supported.

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

### 09-card-data-and-support-policy.s016 (Generated support from complete parse)

Common-template card support is generated from complete parsing plus runtime capability checks. It must not depend on a manual per-card allowlist or a manual card-to-mechanic map for templates that parser certification already covers.

Complete parse means every gameplay-relevant part of a card is parsed: printed effect text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement effects, optionality, once-per-turn limits, source-presence rules, and official rulings or errata that affect behavior. Non-gameplay display fields such as images and flavor-like presentation do not need DSL parse evidence, but any field that can affect behavior must be represented or explicitly proven irrelevant.

A runtime capability matrix records which generated components the current engine can execute. It must cover at least keyword bodies, DSL primitives, trigger timings, decision/response types, costs, target/selection shapes, movement operations, replacement processes, continuous modifiers, visibility modes, event/hash requirements, and custom handlers. The matrix is versioned with effect/runtime support evidence and must be updated when runtime capabilities expand or contract.

The generated support index maps Poneglyph card IDs and source hashes to generated `EffectDefinition` IDs, parser-rule versions, parser evidence, runtime capability results, support status, and review state. Multiple parsed effects for one card compose into one generated `EffectDefinition` for that card. If every parsed component is supported by the current runtime capability matrix and parser-rule certification allows automatic support, the generated support index may mark the card playable in the appropriate modes.

Partial support reporting is allowed and encouraged for progress tracking. It may report parsed components, unparsed spans, ambiguous parse classes, missing runtime capabilities, stale hashes, and unsupported custom-handler needs. Partial support does not make a card playable in normal modes.

Generated support fails closed. If any component is unparsed, ambiguous, stale, unsupported, missing capability evidence, missing parser certification, or affected by Bandai/Poneglyph wording drift, the card is rejected for normal play until parser/support evidence is updated. New parser rules, ambiguous parse classes, custom handlers, and wording or ruling ambiguity require review before they can certify support.

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

### 11-testing-quality.s005 (Unit tests per card)

Every implemented non-vanilla card gets a test file.

```text
tests/cards/
  OP01-001.test.ts
  OP01-015.test.ts
  OP01-040.test.ts
```

Minimum assertions:

- Effect appears in legal actions or trigger queue at correct timing.
- Required costs are enforced.
- Optional effects can be declined.
- Legal targets are correct.
- Effect resolves correctly.
- Edge cases: no targets, insufficient cost, source moved, once-per-turn used.
- Expected events are emitted.

### 11-testing-quality.s016 (Coverage gates)

Suggested early gates:

- 90%+ line coverage in `engine-core` for functions excluding generated card data.
- 100% of implemented non-vanilla cards have at least one test.
- 100% of custom handlers have direct tests.
- 0 stale source text hashes in ranked card pool.
- 0 unsupported cards allowed in ranked validation fixtures.
- 0 queue-eligible ranked formats missing ladder configuration.

### 11-testing-quality.s020 (Poneglyph/card-data tests)

Add card-data tests once `@optcg/cards` exists:

```text
CD-001 Poneglyph response validates against Zod schema
CD-002 invalid Poneglyph shape fails before Redis cache write
CD-003 Redis cache key includes cardDataVersion and overlay/effect version
CD-004 overlay merge adds support status and effect definition IDs
CD-005 Poneglyph source text hash drift marks implementation stale
CD-006 unsupported non-vanilla Poneglyph card cannot enter ranked deck
CD-007 variant indexes/generated variant keys are accepted only when valid for the base card
CD-008 client display data cannot alter server-resolved match manifest
CD-009 generated support index accepts only complete-parse cards whose every parsed component is covered by the runtime capability matrix
CD-010 partial, ambiguous, stale, unparsed, unsupported, or capability-missing generated support reports do not make cards playable in normal modes
CD-011 certified parser-rule fixtures auto-support matching complete-parse common-template cards without a manual per-card allowlist
```

These tests prevent the card-data layer from becoming an implicit rules authority.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only @optcg/cards parser, generated-support evaluator, runtime capability metadata, report/probe rendering, and package-local tests needed to recognize standalone Blocker, EB01-017-shaped Blocker reminder text, and empty effect text using EB01-005 as the named vanilla proof target. Do not implement opponent-turn power modifiers, conditional effects, new combat rules, server Redis loading, broad fixture-corpus refreshes, unrelated fixture-only manifest regeneration, or per-card manual support records.

## Scope

- certify standalone `[Blocker]` as generated-supportable keyword text when the normalized card metadata also exposes the printed blocker keyword
- certify the real Poneglyph-style Blocker line `[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)` by ignoring the parenthetical reminder text in the cards layer
- use EB01-017 as the named live/manual Blocker proof target for the reminder-text parser behavior
- record runtime capability evidence for the certified standalone Blocker parser rule using already-implemented blocker battle behavior
- treat null or empty printed effect text that normalizes to source text `""` as no printed effect text, yielding playable vanilla support evidence rather than an unparsed-span blocker
- use EB01-005 as the named live/manual vanilla proof target for empty-effect generated support
- keep support evidence hash-bound to current normalized Poneglyph source and behavior hashes
- ensure read-only support probe output for cards with mixed supported and unsupported text no longer reports standalone Blocker as unparsed while preserving unsupported blockers for remaining text

## Out of Scope

- OP03-045 full gameplay support
- opponent-turn power modifier support
- conditional effect support
- any new engine-core battle, blocker, or computed-power behavior
- live Poneglyph fixture capture outside EB01-017 and EB01-005
- fixture-only real-card manifest regeneration unless target fixture or generated-support evidence changes require it
- Redis cache or server match-time lazy loading
- broad parser grammar expansion beyond exact standalone Blocker and empty text

## Allowed Touch Points

<!-- prettier-ignore -->
- fixtures/poneglyph/cards/EB01-005.*.json
- fixtures/poneglyph/cards/EB01-017.*.json
- packages/cards/src/certified-card-text-parser.ts
- packages/cards/src/certified-card-text-parser.test.ts
- packages/cards/src/generated-support-index.ts
- packages/cards/src/generated-support-index.test.ts
- packages/cards/src/generated-support-report.test.ts
- packages/cards/src/runtime-capability-matrix.ts
- packages/cards/src/runtime-capability-matrix.test.ts
- packages/cards/src/support-evaluator.ts
- packages/cards/src/support-evaluator.test.ts
- packages/cards/src/support-probe.test.ts
- packages/cards/src/*support*.test.ts
- stories/generated/CARD-012-blocker-and-empty-effect-generated-support.yaml
- stories/approved/CARD-012-blocker-and-empty-effect-generated-support.yaml
- agent-packets/CARD-012.md
- agent-packets/active.json

## Constraints

- generate and activate the CARD-012 packet before implementation
- stay within allowed_touch_points
- preserve generated-support fail-closed behavior when any parsed component lacks certified parser or runtime capability evidence
- do not add per-card manual support records for cards that should be validated at runtime from Poneglyph data
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

### Code Standard

Follow [`docs/code-standard.md`](docs/code-standard.md). Non-negotiables:

- stay inside the approved story boundary
- preserve package boundaries
- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors
- prefer named exports and precise types
- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard
- split by reason-to-change, not by line count
- do not over-split into tiny files or generic dumping grounds
- keep engine-core pure and hidden-info safe
- prove engine behavior with synthetic/unit/regression tests
- keep real-card fixture tests separate from engine behavior requirements
- preserve deterministic event ordering and state hashes
- record ambiguity instead of inventing behavior

## Required Tests

- exact candidate story-review before implementation
- parser unit test for exact standalone `[Blocker]`
- parser unit test for exact EB01-017 full Poneglyph reminder-text Blocker line
- parser or evaluator unit test for `[Blocker]` plus unsupported remaining text preserving only the unsupported span
- generated-support index/evaluator test proving standalone Blocker support evidence is produced
- generated-support index/evaluator test proving EB01-017-shaped Blocker reminder text support evidence is produced
- generated-support index/evaluator test proving EB01-005-shaped null or empty printed effect text normalizes to source text `""` and produces vanilla-confirmed support evidence without an effect definition
- support-probe test proving mixed supported Blocker plus unsupported text prints only the remaining unsupported span
- regression test proving OP03-044 remains generated-support playable
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm --filter @optcg/cards test`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- exact standalone `[Blocker]` source text evaluates playable through generated support with blocker capability evidence and no unparsed-span blockers
- EB01-017-shaped exact full Poneglyph reminder-text Blocker source text evaluates playable through generated support with blocker capability evidence and no unparsed-span blockers
- EB01-005-shaped null or empty printed effect text normalizes to source text `""` and evaluates playable as `vanilla-confirmed`, with no generated EffectDefinition and no unparsed-span blockers
- a card with `[Blocker]` plus unsupported opponent-turn power text remains playable no and reports only the unsupported opponent-turn text as unparsed
- support probe exits 0 for completed playable-no evaluations and includes span text for remaining blockers
- existing OP03-044 generated-support playability remains unchanged

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
