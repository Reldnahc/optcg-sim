<!-- agent-packet:story-id SPEC-007 -->
<!-- agent-packet:story-path stories/approved/SPEC-007-generated-card-support-complete-parse.yaml -->
<!-- agent-packet:story-sha256 4eddb228e365693bf27408af98f24eceabd61a482717bb8735c7d7c5098fbc11 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-007
Epic ID: KICK-001
Title: Define generated card support from complete parse
Type: specification
Area: docs
Primary Concern: rules

## Why

Update simulator specifications so common card support may be generated from complete card-text parsing plus runtime capability checks, without implying a manual per-card allowlist or manual card-to-mechanic map for common templates.

## Authoritative Spec References

- 00-project-overview.s014 (Card support is explicit)
- 00-project-overview.s020 (Source-data assumption)
- 01-system-architecture.s023 (Poneglyph-centered card-data topology)
- 01-system-architecture.s024 (Original team and workflow rules preserved)
- 04-effect-runtime.s005 (Card implementation support)
- 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 09-card-data-and-support-policy.s022 (Security checklist)
- 11-testing-quality.s005 (Unit tests per card)
- 11-testing-quality.s016 (Coverage gates)
- 11-testing-quality.s020 (Poneglyph/card-data tests)
- 12-roadmap.s009 (Milestone 5: deck builder and card data)
- 20-card-implementation-examples.s002 (Purpose)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 00-project-overview.s014 (Card support is explicit)

A card is `vanilla-confirmed`, `implemented-dsl`, `implemented-custom`, `unsupported`, or `banned-in-simulator`. Missing implementations are not silently allowed in normal play.

Common card support does not require a manual per-card allowlist when a certified parser rule completely parses the card's gameplay-relevant text into supported keyword, DSL, or custom behavior and the runtime capability matrix confirms every parsed component is currently supported. Partial, ambiguous, stale, or capability-missing parses remain unsupported for normal play.

### 00-project-overview.s020 (Source-data assumption)

The simulator uses Poneglyph API (`api.poneglyph.one`) as the external source for printed card metadata: card IDs, names, text, stats, images, and variants. The simulator does not treat Poneglyph or local code as rules authority; it uses official rules/card wording/rulings as authority and uses generated or reviewed effect definitions, certified parser rules, custom handlers, runtime capability evidence, rulings overlays, support status, and banlist overlays to implement that authority.

This distinction matters: Poneglyph data tells the simulator what a card says and looks like; the simulator's generated support index and overlays tell the engine what the card does and whether that complete parsed behavior is playable in normal modes.

### 01-system-architecture.s023 (Poneglyph-centered card-data topology)

Poneglyph is external display/metadata truth. The simulator is gameplay truth.

```text
Poneglyph API
  -> @optcg/cards fetches and validates with Zod
  -> Redis read-through cache stores validated Poneglyph metadata
  -> certified parser rules may generate complete parsed effect definitions
  -> runtime capability matrix gates generated support status
  -> simulator overlay adds reviewed custom behavior, rulings, banlist status, and explicit overrides
  -> match server snapshots resolved cards at match creation
  -> engine consumes the match card manifest and effect registry
```

Important boundaries:

- The match server never trusts Poneglyph data supplied by the client.
- The client may fetch Poneglyph data for images/search/display only.
- The server validates every Poneglyph response before use.
- Simulator overlays are keyed by Poneglyph card ID.
- Common-template support is generated from complete parse plus runtime capability checks, not from a manual per-card allowlist or manual card-to-mechanic map.
- Generated support records are fail-closed: any unparsed, ambiguous, stale, unsupported, or capability-missing component keeps the card unsupported in normal play.
- Poneglyph variant indexes/generated variant keys are cosmetic and stored in deck data, not rule state.

### 01-system-architecture.s024 (Original team and workflow rules preserved)

Even during solo development, the original ownership model remains useful because it defines clean module boundaries.

| Module                | Future owner profile               | Depends on                    |
| --------------------- | ---------------------------------- | ----------------------------- |
| `@optcg/types`        | Shared / rotating                  | None                          |
| `@optcg/cards`        | API integration developer          | Poneglyph API, Redis          |
| `@optcg/engine-core`  | Rules engineer                     | `types`, card manifest        |
| `@optcg/effects`      | Rules/card implementation engineer | `types`, card schema          |
| `@optcg/match-server` | Real-time backend engineer         | `engine-core`, `types`, Redis |
| `@optcg/api`          | Backend/product engineer           | `types`, PostgreSQL, Redis    |
| `@optcg/client`       | Frontend/game UI engineer          | `types`, `view-engine`        |
| `@optcg/bot`          | AI/gameplay developer              | `engine-core`                 |

Workflow rules:

1. Avoid cross-module PRs. If a feature touches multiple packages, land shared type changes first, then package-specific PRs.
2. Module owners review their package's PRs once contributors join.
3. Integration tests live at the top level and exercise package boundaries.
4. `@optcg/types` and `@optcg/engine-core` are semantically versioned; consumers upgrade deliberately.
5. Changes to Poneglyph schema handling require card-data validation tests.
6. Changes to effect definitions require card tests and coverage updates.

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

For generated support, the runtime must expose or consume a capability matrix that describes which keyword bodies, DSL primitives, trigger timings, decision types, replacement processes, visibility modes, target shapes, costs, and custom handlers are currently executable. A generated card support record may be considered playable only when the card has a complete parse and every parsed component is covered by that current runtime capability matrix.

Multiple parsed effects from one card compose into one generated `EffectDefinition` for that card. If any component is unparsed, ambiguous, stale, unsupported, or missing capability evidence, the entire generated support record fails closed for normal play instead of partially enabling the card.

### 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)

The effect-system plan supports three authoring paths:

1. Manual DSL definitions written by developers.
2. Custom TypeScript handlers for cards that cannot be expressed in DSL.
3. Generated DSL from Poneglyph printed card text when certified parser rules produce a complete parse and runtime capability checks pass.

Generated definitions must never be deployed blindly. A new parser rule, ambiguous parse class, custom handler binding, or wording/ruling ambiguity requires review before it can certify support. Once a parser rule is certified, matching complete-parse cards may be generated without a manual per-card allowlist or manual card-to-mechanic map for that common template.

A complete parse covers all gameplay-relevant printed text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement or optionality semantics, and ruling/errata inputs that affect behavior. Multiple parsed effects compose into one generated `EffectDefinition`. Partial parse output may be reported for coverage progress, but it must not make the card playable in normal modes.

Bandai or Poneglyph wording drift must invalidate the affected parse/hash evidence or downgrade support until parser and support evidence are updated. If any parsed component is unparsed, ambiguous, stale, unsupported, or missing runtime capability evidence, the generated definition fails closed instead of partially enabling the card.

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

Every supported card stores a hash of its Poneglyph printed text and, when generated support is used, a behavior hash or parser-evidence hash for the complete parsed behavior.

When the Poneglyph text changes:

1. Mark the card implementation as stale.
2. Fail CI if a stale card remains marked `tested` without review.
3. Prevent ranked use if the changed text affects card behavior.
4. Require parser/support evidence to be updated before generated support may remain playable.
5. Require a reviewer to update the source hash after verifying any DSL/custom handler or certified parser-rule evidence that remains authoritative.

This catches errata, typo fixes that affect parsing, and Poneglyph schema/text changes.

### 09-card-data-and-support-policy.s016 (Generated support from complete parse)

Common-template card support is generated from complete parsing plus runtime capability checks. It must not depend on a manual per-card allowlist or a manual card-to-mechanic map for templates that parser certification already covers.

Complete parse means every gameplay-relevant part of a card is parsed: printed effect text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement effects, optionality, once-per-turn limits, source-presence rules, and official rulings or errata that affect behavior. Non-gameplay display fields such as images and flavor-like presentation do not need DSL parse evidence, but any field that can affect behavior must be represented or explicitly proven irrelevant.

A runtime capability matrix records which generated components the current engine can execute. It must cover at least keyword bodies, DSL primitives, trigger timings, decision/response types, costs, target/selection shapes, movement operations, replacement processes, continuous modifiers, visibility modes, event/hash requirements, and custom handlers. The matrix is versioned with effect/runtime support evidence and must be updated when runtime capabilities expand or contract.

The generated support index maps Poneglyph card IDs and source hashes to generated `EffectDefinition` IDs, parser-rule versions, parser evidence, runtime capability results, support status, and review state. Multiple parsed effects for one card compose into one generated `EffectDefinition` for that card. If every parsed component is supported by the current runtime capability matrix and parser-rule certification allows automatic support, the generated support index may mark the card playable in the appropriate modes.

Partial support reporting is allowed and encouraged for progress tracking. It may report parsed components, unparsed spans, ambiguous parse classes, missing runtime capabilities, stale hashes, and unsupported custom-handler needs. Partial support does not make a card playable in normal modes.

Generated support fails closed. If any component is unparsed, ambiguous, stale, unsupported, missing capability evidence, missing parser certification, or affected by Bandai/Poneglyph wording drift, the card is rejected for normal play until parser/support evidence is updated. New parser rules, ambiguous parse classes, custom handlers, and wording or ruling ambiguity require review before they can certify support.

### 09-card-data-and-support-policy.s022 (Security checklist)

- Server never trusts card metadata from client.
- Poneglyph response is schema-validated before cache write.
- Overlay merge is versioned.
- Match snapshots resolved cards before play starts.
- Unsupported cards are rejected in public modes.
- Variant IDs are cosmetic and never affect rules.
- Poneglyph text hash changes trigger implementation review.
- Replays store versions and manifest hashes.

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

### 12-roadmap.s009 (Milestone 5: deck builder and card data)

Deliverables:

- Card-data adapter.
- Local overlay and generated support registry.
- Complete-parse generated support index and runtime capability matrix.
- Deck CRUD.
- Deck validation.
- Variant storage.
- Unsupported-card rejection.

Exit criteria:

- Player can create legal sample deck.
- Ranked validation rejects unsupported non-vanilla cards.
- Complete-parse common-template cards can be supported by certified parser rules without manual per-card mapping.
- Partial, stale, ambiguous, unparsed, or capability-missing generated support remains rejected in normal play.
- Variant split counts correctly.

### 20-card-implementation-examples.s002 (Purpose)

This file turns the supplied Poneglyph card examples into implementation guidance, DSL requirements, and acceptance tests. These two cards are useful because they expose several non-trivial engine needs:

- Poneglyph variant indexes are not simple positive IDs.
- FAQ entries can affect hidden-information behavior.
- Effects can temporarily reveal cards, then return them face-down.
- An effect can add a card to hand and then immediately allow that same card to be played.
- Card filters need name exclusion, type matching, color matching, category matching, and cost ranges.

These examples may be used as parser-rule certification fixtures. A complete parser rule may auto-support matching common-template cards only when it parses the entire gameplay-relevant text and the runtime capability matrix supports every parsed component. They are not evidence for a manual per-card allowlist or partial support.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only specification authority, generated spec metadata, and narrow authority-test coverage for complete-parse generated card support. Do not implement parser code, support-report tooling, engine behavior, card-data adapter behavior, real-card fixtures, server/client/API/UI behavior, or broad workflow changes.

## Scope

- define complete parse for gameplay-relevant card text
- define runtime capability matrix requirements for generated support
- define generated support index semantics
- define partial support reporting as progress evidence that does not make a card playable
- define parser-rule certification and review requirements
- state that common-template cards do not require a manual per-card allowlist or manual card-to-mechanic map when complete parse and capability evidence pass
- state that multiple parsed effects compose into one generated EffectDefinition
- preserve fail-closed normal play when any parsed component is unparsed, ambiguous, stale, unsupported, or missing runtime capability
- state that Bandai/Poneglyph wording drift causes parse/hash failure or support downgrade until parser and support evidence are updated
- update roadmap/testing/example specs only as needed to align with the generated-support policy
- add or update narrow spec authority tests so the generated support policy cannot silently regress
- update generated spec metadata

## Out of Scope

- implementing parser code
- implementing support report tooling
- changing engine behavior
- changing card-data adapter code
- adding or changing real-card fixtures
- server, client, API, WebSocket, database, Redis, replay, or UI work
- broad roadmap rewrite

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/00-project-overview.md
- specs/01-system-architecture.md
- specs/04-effect-runtime.md
- specs/05-effect-dsl-reference.md
- specs/09-card-data-and-support-policy.md
- specs/11-testing-quality.md
- specs/12-roadmap.md
- specs/20-card-implementation-examples.md
- specs/source-coverage-matrix.md
- specs/section-index.json
- specs/spec-manifest.json
- specs/SPEC_VERSION.md
- tests/contracts/spec-authority-gates.test.mjs
- stories/generated/SPEC-007-generated-card-support-complete-parse.yaml
- stories/approved/SPEC-007-generated-card-support-complete-parse.yaml
- agent-packets/SPEC-007.md
- agent-packets/active.json

## Constraints

- do not skip story-review
- generate and activate the SPEC-007 packet before implementation
- parent agent may implement this narrow authority edit directly
- stay within allowed_touch_points
- preserve fail-closed normal-play policy for unsupported, partial, stale, ambiguous, or capability-missing parses
- do not add parser, engine, cards, fixture, server, client, API, UI, replay, database, cleanup, or workflow behavior in this SPEC story
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
- update `tests/contracts/spec-authority-gates.test.mjs` to pin complete-parse generated support policy
- run `corepack pnpm run specs:generate-metadata`
- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm run test:contracts`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run typecheck`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- specs no longer imply every simple card needs manual per-card support mapping
- complete parse is defined
- runtime capability matrix is defined
- generated support index is defined
- partial support reporting is defined
- parser-rule certification is defined
- fail-closed normal play remains preserved
- wording drift from Bandai or Poneglyph causes parse/hash failure or support downgrade until parser/support evidence is updated
- spec metadata validation passes

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
