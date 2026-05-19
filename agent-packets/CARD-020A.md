<!-- agent-packet:story-id CARD-020A -->
<!-- agent-packet:story-path stories/approved/CARD-020A-unsupported-wrapper-component-diagnostics.yaml -->
<!-- agent-packet:story-sha256 2f9330e3cf77a6abb7fbe17bb037a7de8c20c2a9c6be4fda941bc3b3ea9d2d76 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-020A
Epic ID: CARD-020
Title: Unsupported wrapper and component diagnostics
Type: implementation
Area: cards
Primary Concern: verification

## Why

Improve cards-side support-probe and generated-support report diagnostics for unsupported composed-effect text by decomposing recognized wrapper, condition, action, and body candidates from exact unsupported components while preserving fail-closed generated support.

## Authoritative Spec References

- 01-system-architecture.s023 (Poneglyph-centered card-data topology)
- 04-effect-runtime.s005 (Card implementation support)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 09-card-data-and-support-policy.s022 (Security checklist)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 11-testing-quality.s020 (Poneglyph/card-data tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

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

Generated composed runtime shapes must fail closed for normal play when the runtime cannot represent the whole composed execution as a supported resumable frame. Unsupported composed shapes include sequence connectors, saved-result references, optionality boundaries, costs, targets, visibility requirements, or pending-decision continuations that the runtime capability matrix does not cover.

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

CARD parser/generated-support stories consume completed contract/schema plus runtime-capability evidence before parser certification or generated-support linkage may enable normal-mode support. Contract/schema completion alone is not playable support.

Complete parse means every gameplay-relevant part of a card is parsed: printed effect text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement effects, optionality, once-per-turn limits, source-presence rules, and official rulings or errata that affect behavior. Non-gameplay display fields such as images and flavor-like presentation do not need DSL parse evidence, but any field that can affect behavior must be represented or explicitly proven irrelevant.

A runtime capability matrix records which generated components the current engine can execute. It must cover at least keyword bodies, DSL primitives, trigger timings, decision/response types, costs, target/selection shapes, movement operations, replacement processes, continuous modifiers, visibility modes, event/hash requirements, and custom handlers. The matrix is versioned with effect/runtime support evidence and must be updated when runtime capabilities expand or contract.

The generated support index maps Poneglyph card IDs and source hashes to generated `EffectDefinition` IDs, parser-rule versions, parser evidence, runtime capability results, support status, and review state. Multiple parsed effects for one card compose into one generated `EffectDefinition` for that card. If every parsed component is supported by the current runtime capability matrix and parser-rule certification allows automatic support, the generated support index may mark the card playable in the appropriate modes.

Partial support reporting is allowed and encouraged for progress tracking. It may report parsed components, unparsed spans, ambiguous parse classes, missing runtime capabilities, stale hashes, and unsupported custom-handler needs. Partial support does not make a card playable in normal modes, and partial support or effect coverage progress never enables normal play.

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

Own only package-local diagnostics and diagnostic metadata for unsupported generated-support text. Do not certify new parser rules, add generated DSL admission, add runtime capability records, add engine behavior, edit real-card fixtures, change source or behavior hashes, or make any new card/effect shape playable.

## Scope

- improve support-probe and generated-support report output for unsupported composed-effect text without changing support decisions
- decompose parser failures that contain recognizable component candidates into diagnostic fragments for recognized wrapper syntax, recognized condition candidates, recognized action/body candidates, and exact unsupported blocking fragments
- label diagnostic fragments explicitly so recognized candidates cannot be confused with support-admitted parser rules
- recognize slash-combined trigger wrapper text such as `[On Play]/[When Attacking]` as diagnostic wrapper syntax only
- for slash-combined trigger wrapper diagnostics, report `[On Play]` and `[When Attacking]` as recognized wrapper candidates when each individual wrapper is currently recognized elsewhere by generated support, but report the combined wrapper shape itself as unsupported unless another approved story certifies it
- recognize conditional syntax `If <condition>, <body>` as diagnostic syntax for unsupported rows when condition parser components can identify at least one condition candidate or unsupported condition fragment
- recognize unwrapped continuous/static conditional text such as `If <condition>, <body>.` as an unsupported wrapper category when it is not attached to a supported effect trigger
- preserve CARD-019 condition parser diagnostics for supported fragments such as `your Leader has the {Supernovas} type`
- report unsupported condition fragments separately, including `you have no other [Cavendish] Characters` as missing field-count, name-filter, and exclude-self or other-self semantics
- report unsupported body/action fragments separately, including `set up to 2 of your DON!! cards as active` as missing generated body support and missing truthful runtime capability evidence if the runtime layer does not currently expose the needed effect behavior
- report recognized supported child effects inside unsupported whole-card text when safe, including `[On K.O.] Draw 1 card.` as a supported wrapper/body candidate while leaving the whole card unsupported if another line is blocked
- for `If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].`, report the unwrapped continuous/static conditional wrapper as unsupported, condition/body fragments separately, and multi-body `and` composition as unsupported unless already certified
- for `[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.`, report recognized wrapper candidates, recognized conditional syntax, recognized Leader-type condition, unsupported `no other [Cavendish] Characters` condition, and unsupported DON-active body separately
- whole-card unsupported diagnostics are acceptable only when no narrower diagnostic decomposition matched
- preserve blocker identity for existing codes `unparsed-span`, `ambiguous-wording`, `custom-handler-required`, `unsupported-primitive`, `stale-hash`, `invalid-dsl-schema`, and `missing-runtime-capability`
- stale hash remains the highest-priority diagnostic and must not silently refresh or rewrite fixture evidence
- keep any new diagnostic helper types package-local to `packages/cards`

## Out of Scope

- new parser certification
- slash-combined trigger wrapper support
- continuous/static/permanent generated support
- new condition support for field counts, name filters, exclude-self semantics, trash counts, protection text, keyword grants, or multi-body composition
- new effect body support for setting DON!! cards as active
- new runtime behavior
- new runtime capability records
- new generated playable support
- real-card fixture support
- source hash, behavior hash, overlay, or supported-card manifest changes
- shared contracts or effect DSL schema changes unless story-review proves a real shared authority gap
- server, client, API, UI, database, replay, WebSocket, Redis, or live Poneglyph work
- broad natural-language inference or replacement generalization

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/support-probe.ts
- packages/cards/src/support-probe.test.ts
- packages/cards/src/generated-support-report.ts
- packages/cards/src/generated-support-report.test.ts
- packages/cards/src/generated-support-diagnostics.ts
- packages/cards/src/generated-support-index.ts
- packages/cards/src/generated-support-types.ts
- packages/cards/src/*support*.test.ts
- stories/generated/CARD-020*.yaml
- stories/approved/CARD-020*.yaml
- agent-packets/CARD-020A.md
- agent-packets/active.json

## Constraints

- generate and activate the CARD-020A packet before implementation
- stay within allowed_touch_points
- do not add parser rules, runtime behavior, runtime capability records, fixture support, or playable generated support
- keep diagnostic helper types package-local to packages/cards unless story-review proves a real shared authority gap
- fail closed when diagnostics cannot determine a trusted narrower component or source span
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

- story-review for CARD-020A before approval handoff
- support-probe test for `[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.` proving the output reports recognized `[On Play]` and `[When Attacking]` wrapper candidates, diagnostic slash-combined wrapper syntax, conditional syntax, recognized Leader-type condition, unsupported no-other-Cavendish field-count, name-filter, and exclude-self or other-self condition pieces, plus unsupported DON-active effect body, up-to cardinality, own-DON target, active-state result, and missing body or runtime-capability evidence pieces while staying unsupported
- generated-support report test for the same Supernovas/Cavendish/DON-active text proving equivalent structured blocker metadata for the same wrapper, condition, and DON-active body subcomponents while staying unsupported
- fail-closed test proving slash-combined wrapper diagnostic recognition does not produce complete parser support, generated DSL admission, runtime capability evidence, or playable support
- support-probe test for `If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].\n[On K.O.] Draw 1 card.` proving the output reports the unsupported unwrapped continuous/static wrapper, trash-count condition fragment, protection body fragment, keyword-grant body fragment, and unsupported multi-body `and` composition separately, and reports `[On K.O.] Draw 1 card.` as a recognized candidate while the whole card remains unsupported
- generated-support report test for the same continuous plus On K.O. text proving equivalent structured blocker metadata for the unsupported wrapper, trash-count condition, protection body, keyword-grant body, multi-body connector, and recognized On K.O. draw candidate while staying unsupported
- regression tests proving whole-card unsupported diagnostics are used only when no narrower decomposition matched
- regression tests proving stale hash reports `stale-hash` before parser, diagnostic decomposition, schema, or runtime capability diagnostics
- regression tests proving existing CARD-008 through CARD-019 generated-support behavior remains supported or unsupported exactly as before, except for diagnostic text or metadata formatting intentionally changed by this story
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm --filter @optcg/cards test`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- support-probe output is more actionable for unsupported composed-effect text by naming recognized candidates and exact unsupported components
- generated-support report output exposes the same diagnostic decomposition as structured blocker metadata where the report format already carries blocker metadata
- unsupported text remains unsupported
- "[On Play]/[When Attacking]" is recognized only as diagnostic slash-combined wrapper syntax and does not become generated-supported
- unwrapped `If <condition>, <body>.` continuous/static text is recognized only as an unsupported wrapper category and does not become generated-supported
- recognized component candidates are clearly labeled as diagnostic candidates, not certified parser support
- the Supernovas/Cavendish/DON-active example reports recognized wrapper candidates, recognized Leader-type condition, unsupported no-other-Cavendish field-count, name-filter, and exclude-self or other-self condition pieces, plus unsupported DON-active effect body, up-to cardinality, own-DON target, active-state result, and missing body or runtime-capability evidence pieces separately
- the continuous protection plus `[On K.O.] Draw 1 card.` example reports the unsupported unwrapped continuous/static wrapper, trash-count condition fragment, protection body fragment, keyword-grant body fragment, and unsupported multi-body `and` composition separately, while still identifying the On K.O. draw line as a recognized candidate without making the whole card playable
- stale hash remains highest-priority and non-mutating
- existing CARD-008 through CARD-019 supported and unsupported behavior remains compatible

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
