<!-- agent-packet:story-id SPEC-006 -->
<!-- agent-packet:story-path stories/approved/SPEC-006-parenthetical-explanatory-note-authority.yaml -->
<!-- agent-packet:story-sha256 b73d25ca1b1dae5a7e2af6bd36a2f76249ad56fb95bcb729fbc990337feef321 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-006
Epic ID: KICK-001
Title: Reflect parenthetical explanatory note authority
Type: specification
Area: docs
Primary Concern: rules

## Why

Update the simulator specifications to reflect official Comprehensive Rules 2-8-4, 2-8-4-1, and 2-8-4-2: parenthetical explanatory notes for keyword effects and other card effects do not influence gameplay, while printed card text remains preserved for display, review, and hashing.

## Authoritative Spec References

- 00-project-overview.s020 (Source-data assumption)
- 02-engine-mechanics.s004 (Authority and official-rules defaults)
- 02-engine-mechanics.s025 (Keyword behavior)
- 05-effect-dsl-reference.s001 (Effect DSL Reference)
- 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)
- 09-card-data-and-support-policy.s003 (Data ownership model)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)
- 19-poneglyph-api-contract.s007 (Normalized card shape)
- source-map.s006 (Official comprehensive rules PDF added in v4)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 00-project-overview.s020 (Source-data assumption)

The simulator uses Poneglyph API (`api.poneglyph.one`) as the external source for printed card metadata: card IDs, names, text, stats, images, and variants. The simulator does not treat Poneglyph or local code as rules authority; it uses official rules/card wording/rulings as authority and uses local effect definitions, custom handlers, rulings overlays, support status, and banlist overlays to implement that authority.

This distinction matters: Poneglyph data tells the simulator what a card says and looks like; the simulator overlay tells the engine what the card does.

### 02-engine-mechanics.s004 (Authority and official-rules defaults)

- Official card wording overrides the comprehensive rules when they conflict.
- Official FAQ/rulings/errata refine behavior when printed text alone is insufficient.
- The simulator must implement that authority through DSL/custom handlers and card-specific tests.
- Simultaneous player choices are ordered turn player first, then non-turn player.
- When both players have triggered effects at the same timing, turn-player effects resolve first under the official timing rules.
- Effects triggered during damage processing wait until damage processing is complete, except for `[Trigger]` handling which follows the official interrupt path.

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

### 05-effect-dsl-reference.s001 (Effect DSL Reference)

Effect definitions are keyed by **Poneglyph base card ID**. Poneglyph supplies the printed card text and metadata; the simulator DSL supplies executable rule behavior. The DSL should store a source-text hash so a Poneglyph text change can trigger implementation review.

### 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)

The original effect-system plan defined three authoring phases:

1. Manual DSL definitions written by developers.
2. Custom TypeScript handlers for cards that cannot be expressed in DSL.
3. Generated DSL candidates from Poneglyph printed card text, always requiring human review before merge.

Generated definitions must never be deployed blindly. The pipeline may read Poneglyph card text and produce a candidate `EffectDefinition`, but a reviewer must verify the card against official text/rulings, update tests, and approve the source-text hash.

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

### source-map.s006 (Official comprehensive rules PDF added in v4)

The supplied comprehensive rules PDF is included directly in the bundle as `source-official-rules/rule_comprehensive_v1.2.0_2026-01-16.pdf` and is reflected in `02-engine-mechanics.md`, `07-match-server-protocol.md`, `08-replay-rollback-recovery.md`, `09-card-data-and-support-policy.md`, and `18-acceptance-tests.md`.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only the specification authority and authority-test coverage for parenthetical explanatory-note handling. Do not change engine behavior, Poneglyph normalization, cards fixtures, source text hashes, behavior hashes, support metadata, effect DSL definitions, server/client/API/UI behavior, or workflow tooling.

## Scope

- add a stable engine-mechanics spec section that reflects official Comprehensive Rules 2-8-4 parenthetical explanatory notes
- state that parenthetical explanatory notes for keyword effects and other card effects do not influence gameplay
- state that parenthetical explanatory-note text may be ignored by engine support/classification logic when determining whether remaining printed text requires implementation
- state that explanatory-note handling must not mutate raw Poneglyph text, normalized ResolvedCard.effectText, manifest display text, PlayerView card text, sourceTextHash, behaviorHash, or reviewed printed-text evidence
- keep gameplay implementation authority in simulator DSL/custom handlers/keyword behavior/support metadata, not in explanatory-note text
- add an authority test that fails if the parenthetical explanatory-note gameplay and non-mutation wording is removed or weakened
- update source coverage and generated spec metadata

## Out of Scope

- implementing reminder/explanatory-note stripping in engine-core
- changing card support status for OP04-014 or any other real fixture
- changing Poneglyph fixtures, Poneglyph schema, cards normalization, sourceTextHash, behaviorHash, or manifest construction
- adding effect DSL primitives, custom handlers, target shapes, Counter Events, Life Trigger changes, replacement effects, optional activation, once-per-turn, permanent modifiers, search/reveal, or multi-damage
- server, client, API, WebSocket, database, deck-builder, or UI integration
- live Poneglyph, live Redis, Postgres, browser, or UI requirements in tests or CI
- changing story workflow, packet tooling, cleanup workflow, GitHub Actions, or branch protection

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/02-engine-mechanics.md
- specs/source-coverage-matrix.md
- specs/section-index.json
- specs/spec-manifest.json
- specs/SPEC_VERSION.md
- tests/contracts/spec-authority-gates.test.mjs
- stories/generated/SPEC-006-parenthetical-explanatory-note-authority.yaml
- stories/approved/SPEC-006-parenthetical-explanatory-note-authority.yaml
- agent-packets/SPEC-006.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate the SPEC-006 packet before implementation
- run `corepack pnpm run packets:verify` before implementation and review handoff
- stay within allowed_touch_points
- parent agent may implement this narrow authority edit directly
- open the PR before implementation-review
- run the implementation-review gate after the PR is opened
- do not change engine, cards, fixture, workflow, cleanup, server, client, database, or UI behavior in this SPEC story
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- update `tests/contracts/spec-authority-gates.test.mjs` to require the parenthetical explanatory-note authority wording
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

- `02-engine-mechanics.md` has a stable SECTION_REF defining parenthetical explanatory-note authority for keyword effects and other card effects
- the new spec wording explicitly reflects official Comprehensive Rules 2-8-4, 2-8-4-1, and 2-8-4-2
- the spec says parenthetical explanatory notes do not influence gameplay and may be ignored for support/classification checks of remaining printed text
- the spec says explanatory-note handling must not mutate Poneglyph printed/display text, normalized effect text, manifest display text, PlayerView card text, sourceTextHash, behaviorHash, or reviewed printed-text evidence
- the spec preserves simulator overlay, keyword behavior, DSL, custom handlers, and reviewed support metadata as gameplay implementation authority
- authority tests pin the parenthetical explanatory-note gameplay and non-mutation requirements
- generated spec metadata is updated and verifies

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
