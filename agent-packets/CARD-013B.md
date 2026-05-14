<!-- agent-packet:story-id CARD-013B -->
<!-- agent-packet:story-path stories/approved/CARD-013B-engine-supported-keyword-generated-support.yaml -->
<!-- agent-packet:story-sha256 3995dd6786491e55e9be23304b1999894648942cd887d865c9cc54dc84477746 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-013B
Epic ID: CARD-013
Title: Certify Rush, Rush: Character, Double Attack, and Banish generated support
Type: implementation
Area: cards
Primary Concern: verification

## Why

Add generated-support parser, runtime-capability, evaluator, support-probe, and verification coverage for the remaining printed combat keyword bodies that are already executed by the engine: `[Rush]`, `[Rush: Character]`, `[Double Attack]`, and `[Banish]`. Use only CARD-013A fixture evidence for real-card proof. Any text in those cards that is not one of the targeted already-implemented keywords must stay unsupported.

## Authoritative Spec References

- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s045 (Parenthetical explanatory notes)
- 04-effect-runtime.s002 (Overview)
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

### 04-effect-runtime.s002 (Overview)

The effect runtime executes effect definitions against the authoritative game state.

```text
Effect definitions        Runtime                 Engine core
DSL + custom handlers --> queue/choices/events --> atomic state mutations
```

The runtime must preserve timing, hidden information, source-presence rules, replacement effects, and deterministic replay.

**v6 contract:** queue entries, decisions, replacement state, and continuous-effect records are defined in [`contracts/canonical-types.ts`](contracts/canonical-types.ts). The algorithms below are normative when they are more precise than older snippets.

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

Own only @optcg/cards certified parser rules, normalized printed keyword extraction, generated-support capability evidence, support evaluator/probe output, and cards-package tests needed to certify exact engine-supported printed keyword bodies. Do not change engine-core battle behavior, generated effect runtime semantics, replay, DTOs, protocols, hidden-info filtering, server loading, or broad card fixture corpus behavior.

## Scope

- add certified parser rules for exact `[Rush]`, `[Rush: Character]`, `[Double Attack]`, and `[Banish]` keyword bodies, including their standard parenthetical explanatory notes when present
- add parser residue handling so a supported keyword prefix plus unsupported remaining text reports only the unsupported residue
- add runtime capability matrix records for printed Rush, Rush: Character, Double Attack, and Banish keyword bodies, backed by existing engine runtime behavior
- update generated-support capability mapping so each new keyword parser rule requires its matching keyword capability plus the keyword source-presence policy
- ensure generated-support evaluator metadata preconditions require normalized category `character` and matching `printedKeywords` for each certified keyword
- update normalized printed keyword extraction for `[Rush: Character]` if current normalization does not produce `rushCharacter`
- keep standalone Blocker parser, capability evidence, and support behavior unchanged
- use the CARD-013A checked-in OP01-025, OP04-014, EB04-011, and P-028 fixtures as the only real-card proof source
- treat EB04-011 as mixed Rush: Character residue evidence; certify only the `[Rush: Character]` span and keep the Neptunian field-count draw-then-trash effect unsupported
- treat every non-target unsupported text span on CARD-013A fixtures as unsupported residue, not as generated-support gameplay support

## Out of Scope

- new engine-core battle, attack, damage, blocker, Banish, Rush: Character, Double Attack, or Unblockable behavior
- Counter Event support
- conditional keyword-granting effects such as "gains [Banish]" or "gains [Double Attack]"
- supporting non-keyword text present on CARD-013A fixtures
- EB04-011 Neptunian field-count draw-then-trash support
- simultaneous Double Attack plus Banish support beyond existing engine behavior
- Double Attack through available blocker paths if currently unsupported by engine
- generated DSL effects for keyword-granting text
- changing Poneglyph raw text, source hashes, behavior hashes, display text, or fixture files
- broad fixture-corpus refreshes or live catalog scraping
- per-card manual support overlays for cards that should be admitted by generated support
- server, client, replay, protocol, DTO, hidden-info, database, or UI changes

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/certified-card-text-parser.ts
- packages/cards/src/certified-card-text-parser.test.ts
- packages/cards/src/generated-support-index.ts
- packages/cards/src/generated-support-index.test.ts
- packages/cards/src/generated-support-report.test.ts
- packages/cards/src/normalization.ts
- packages/cards/src/normalization.test.ts
- packages/cards/src/real-card-fixtures.test.ts
- packages/cards/src/runtime-capability-matrix.ts
- packages/cards/src/runtime-capability-matrix.test.ts
- packages/cards/src/support-evaluator.ts
- packages/cards/src/support-evaluator.test.ts
- packages/cards/src/support-probe.test.ts
- packages/cards/src/*support*.test.ts
- stories/generated/CARD-013-engine-supported-keyword-generated-support-parent.yaml
- stories/generated/CARD-013B-engine-supported-keyword-generated-support.yaml
- stories/approved/CARD-013-engine-supported-keyword-generated-support-parent.yaml
- stories/approved/CARD-013B-engine-supported-keyword-generated-support.yaml
- agent-packets/CARD-013B.md
- agent-packets/active.json

## Constraints

- generate and activate the CARD-013B packet before implementation
- stay within allowed_touch_points
- keep generated-support fail-closed when any parsed component lacks certified parser evidence, normalized metadata evidence, or runtime capability evidence
- do not add per-card manual support records for cards that should be validated from generated support and Poneglyph source data
- do not capture or edit Poneglyph fixtures in this story
- if Double Attack support-status requirements are ambiguous, record an ambiguity or split an ENG prerequisite instead of silently changing engine behavior
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

- exact candidate story-review before approval
- parser unit tests for exact and reminder-text Rush, Rush: Character, Double Attack, and Banish keyword bodies
- parser unit tests for mixed CARD-013A fixture text proving only unsupported residue remains
- generated-support index/evaluator tests proving each new keyword-only parser rule emits matching capability evidence and support status
- generated-support index/evaluator tests proving mismatched category or missing printed keyword metadata stays unsupported
- normalization test proving `[Rush: Character]` extracts `rushCharacter` rather than plain `rush`
- evaluator or fixture-backed tests proving exact keyword-only CARD-013A fixtures become generated-support playable only when complete
- support-probe tests proving mixed CARD-013A fixture output omits certified keyword spans and includes only remaining unsupported text
- regression tests proving CARD-012 Blocker support and empty-effect support remain unchanged
- run `corepack pnpm --filter @optcg/cards test`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run verify` if feasible

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- exact `[Rush]` and Rush reminder text parse completely with parser rule `exact:keyword:rush:standalone`
- exact `[Rush: Character]` and its supported reminder shape parse completely with parser rule `exact:keyword:rush-character:standalone`
- exact `[Double Attack]` and Double Attack reminder text parse completely with parser rule `exact:keyword:double-attack:standalone`
- exact `[Banish]` and Banish reminder text parse completely with parser rule `exact:keyword:banish:standalone`
- generated-support evaluates exact keyword-only Rush, Rush: Character, Double Attack, and Banish candidates as supported only when normalized metadata exposes the matching printed keyword and Character category
- missing or mismatched printed keyword metadata keeps the candidate unsupported with explicit blocker evidence
- exact keyword-only CARD-013A fixtures among OP01-025, OP04-014, EB04-011, and P-028 evaluate as generated-support playable through matching keyword capability evidence with no generated EffectDefinition and no unparsed-span blockers
- mixed CARD-013A fixtures among OP01-025, OP04-014, EB04-011, and P-028 remain unsupported overall, but blocker spans do not include already-certified target keyword or reminder text
- support-probe output for mixed keyword-plus-unsupported text prints only the remaining unsupported spans
- existing CARD-012 Blocker and empty-effect generated support tests remain passing without expectation changes
- no engine-core gameplay, replay, DTO, protocol, hidden-info, fixture, or event behavior changes are included

## Post-Approval Role Sections

### implementation

Responsibilities
- implement only the approved story using packet authority order
- follow strict TypeScript, lint, and verification requirements
- report ambiguity instead of inventing uncited behavior

Forbidden Actions
- do not broaden scope beyond the approved story boundary or allowed_touch_points
- do not add packet extraction behavior unless the approved story explicitly owns it
- do not implement story-author/story-review handoff mechanics

Required Inputs
- active packet content with authoritative spec references
- approved story scope, non-scope, and acceptance criteria
- allowed_touch_points and required test list

Required Outputs
- scoped code and test changes within approved touch points
- verification command results with pass/fail status
- assumptions and blockers note

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

### code-review

Responsibilities
- review correctness, scope fit, and required-test coverage
- verify no forbidden role sections or lifecycle changes were introduced
- confirm canonical packet behavior remains enforceable

Forbidden Actions
- do not author new feature scope outside the reviewed patch
- do not bypass required tests, packet verification, or CI gate evidence
- do not approve scope drift that violates story boundary

Required Inputs
- proposed patch limited to approved touch points
- active packet, approved story, and cited spec references
- verification and test evidence for required commands

Required Outputs
- review findings prioritized by correctness and scope compliance
- clear disposition for findings (fix/defer/block) with rationale
- review closure recommendation for Session Orchestrator handoff

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

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

<!-- prettier-ignore-end -->
