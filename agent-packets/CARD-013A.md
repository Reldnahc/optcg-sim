<!-- agent-packet:story-id CARD-013A -->
<!-- agent-packet:story-path stories/approved/CARD-013A-capture-engine-supported-keyword-fixtures.yaml -->
<!-- agent-packet:story-sha256 2ab4876c1e7527fbcd9c69d96caf11658b1eaf4ddc37033caa6db5b2c7b7173e -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-013A
Epic ID: CARD-013
Title: Capture human-supplied keyword proof fixtures
Type: implementation
Area: cards
Primary Concern: verification

## Why

Capture and verify the exact Poneglyph card fixtures for the human-supplied proof-card list that will feed generated-support certification for already implemented printed combat keywords. The implementation worker may not choose substitute proof cards; if the supplied list is incomplete or unsuitable, stop and return the story for human revision.

## Authoritative Spec References

- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s045 (Parenthetical explanatory notes)
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

Own only fixture capture, fixture schema/normalization/hash verification, and story metadata updates for the human-supplied keyword proof cards. Do not add parser rules, runtime capability records, generated-support support status, generated effect definitions, engine behavior, support overlays, manifests, or gameplay admission in this story.

## Scope

- capture only OP01-025, OP04-014, EB04-011, and P-028 from the human-supplied proof-card list
- use `corepack pnpm --filter @optcg/cards capture:fixture -- --card <CARD_ID>` to generate any missing fixture files
- use `corepack pnpm --filter @optcg/cards capture:fixture -- --card <CARD_ID> --dry-run` before writing when inspecting newly supplied IDs is useful
- verify every captured fixture through the checked-in Poneglyph schema and normalization path
- record behavior-sensitive fields for each supplied card: cardId, card_type/category, printed effect text, trigger text, keyword field, normalized printedKeywords, official FAQ, errata, sourceTextHash, and behaviorHash
- classify each supplied card as exact keyword-only proof or mixed keyword-plus-unsupported residue proof for CARD-013B
- preserve existing checked-in fixtures unless the human-supplied ID points to a fixture whose current checked-in source has drifted and the capture output is reviewed
- fix only the capture-runner card ID validation needed to accept the human-supplied promo ID `P-028`, if the existing validation rejects it before capture

## Out of Scope

- selecting replacement card IDs
- parser grammar changes
- runtime capability matrix changes
- generated-support evaluator or support-probe behavior changes
- changing support status, support overlays, effectDefinitions, real-card manifests, deck/loadout validation, or gameplay admission
- engine-core changes
- live Poneglyph use in CI tests
- broad fixture-corpus refreshes or live catalog scraping
- capture-runner changes beyond accepting official one-letter promo prefixes such as `P-028`

## Allowed Touch Points

<!-- prettier-ignore -->
- fixtures/poneglyph/cards/*.json
- packages/cards/src/real-card-fixtures.ts
- packages/cards/src/real-card-fixtures.test.ts
- packages/cards/src/normalization.test.ts
- packages/cards/src/fixture-capture.ts
- packages/cards/src/fixture-capture.test.ts
- stories/generated/CARD-013-engine-supported-keyword-generated-support-parent.yaml
- stories/generated/CARD-013A-capture-engine-supported-keyword-fixtures.yaml
- stories/generated/CARD-013B-engine-supported-keyword-generated-support.yaml
- stories/approved/CARD-013-engine-supported-keyword-generated-support-parent.yaml
- stories/approved/CARD-013A-capture-engine-supported-keyword-fixtures.yaml
- stories/approved/CARD-013B-engine-supported-keyword-generated-support.yaml
- agent-packets/CARD-013A.md
- agent-packets/active.json

## Constraints

- generate and activate the CARD-013A packet before implementation
- stay within allowed_touch_points
- do not choose proof card IDs in the implementation pass; use only the human-supplied list
- do not hand-edit raw Poneglyph fixture text or hashes
- do not promote any card support status in this story
- if the supplied card list is incomplete, stale, or semantically mismatched, fail closed and return the story for human revision
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
- dry-run or probe command evidence for newly supplied card IDs when the fixture is not already checked in
- run `corepack pnpm --filter @optcg/cards capture:fixture -- --card OP01-025` if OP01-025 is not already checked in
- run `corepack pnpm --filter @optcg/cards capture:fixture -- --card EB04-011` if EB04-011 is not already checked in
- run `corepack pnpm --filter @optcg/cards capture:fixture -- --card P-028` if P-028 is not already checked in
- regression test proving the capture runner accepts official one-letter promo IDs such as `P-028`
- fixture schema validation test coverage for every new fixture
- normalization/hash assertion coverage for every new fixture's behavior-sensitive fields
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

- OP01-025, OP04-014, EB04-011, and P-028 have deterministic checked-in Poneglyph fixture files or already-reviewed existing fixture files
- fixture validation and normalization tests cover every newly captured fixture
- the story records each supplied card's intended proof role for CARD-013B
- unsupported non-keyword text in supplied cards is explicitly identified as residue evidence, not gameplay support
- no generated-support parser, runtime-capability, support-status, manifest, or engine behavior changes are included

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
