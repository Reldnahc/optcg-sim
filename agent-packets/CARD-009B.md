<!-- agent-packet:story-id CARD-009B -->
<!-- agent-packet:story-path stories/approved/CARD-009B-generated-draw-then-trash-template-evidence.yaml -->
<!-- agent-packet:story-sha256 53b279571d007f2042a7603eafb236c0765d4604fdfe3e2aee7dce72992d72e8 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-009B
Epic ID: CARD-009
Title: Generated draw-then-trash template evidence
Type: implementation
Area: cards
Primary Concern: rules

## Why

Certify generated parser/capability/index/report behavior for the narrow `Draw N cards and trash M cards from your hand` template using ENG-050 runtime capability evidence.

## Authoritative Spec References

- 04-effect-runtime.s005 (Card implementation support)
- 05-effect-dsl-reference.s008 (Targets)
- 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)
- 06-visibility-security.s003 (Player zone visibility)
- 06-visibility-security.s004 (PlayerView shape)
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
- 17-first-card-fixtures.s004 (Recommended 20-card coverage set)
- 20-card-implementation-examples.s002 (Purpose)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
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

For generated support, the runtime must expose or consume a capability matrix that describes which keyword bodies, DSL primitives, trigger timings, decision types, replacement processes, visibility modes, target shapes, costs, and custom handlers are currently executable. A generated card support record may be considered playable only when the card has a complete parse and every parsed component is covered by that current runtime capability matrix.

Multiple parsed effects from one card compose into one generated `EffectDefinition` for that card. If any component is unparsed, ambiguous, stale, unsupported, or missing capability evidence, the entire generated support record fails closed for normal play instead of partially enabling the card.

### 05-effect-dsl-reference.s008 (Targets)

Use `TargetRequest` when a player may choose and `Target` for source-relative automatic targets.

```ts
type Target =
  | { type: "self" }
  | { type: "myLeader" }
  | { type: "opponentLeader" }
  | { type: "attacker" }
  | { type: "attackTarget" }
  | { type: "blocker" }
  | { type: "triggerCard" }
  | { type: "all"; zone: Zone; player: PlayerRef; filter?: CardFilter }
  | { type: "choose"; request: TargetRequest };

interface TargetRequest {
  timing: "onActivation" | "onResolution";
  chooser: PlayerRef;
  zone: Zone;
  player: PlayerRef;
  filter?: CardFilter;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility?: "public" | "privateToChooser";
}
```

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

### 06-visibility-security.s003 (Player zone visibility)

| Zone           | Self view                        | Opponent view                    |
| -------------- | -------------------------------- | -------------------------------- |
| Deck           | Count only                       | Count only                       |
| DON!! Deck     | Count only / cosmetic art policy | Count only / cosmetic art policy |
| Hand           | Full card data                   | Count only                       |
| Trash          | Full ordered public data         | Full ordered public data         |
| Leader Area    | Full public data                 | Full public data                 |
| Character Area | Full public data                 | Full public data                 |
| Stage Area     | Full public data                 | Full public data                 |
| Cost Area      | Full public DON!! state          | Full public DON!! state          |
| Life Area      | Count + face-up cards only       | Count + face-up cards only       |
| No Zone        | Only if revealed to that player  | Only if revealed to that player  |

### 06-visibility-security.s004 (PlayerView shape)

```ts
interface PlayerView {
  matchId: MatchId;
  playerId: PlayerId;
  stateSeq: StateSeq;
  actionSeq: number;
  turn: PublicTurnState;
  self: VisiblePlayerState;
  opponent: OpponentVisibleState;
  battle?: PublicBattleState;
  pendingDecision?: PublicDecision;
  legalActions: PublicLegalAction[];
  revealedCards: PublicRevealRecord[];
  events: EngineEvent[];
  timers: PublicTimerState;
}
```

Do not include:

- Deck order.
- Opponent hand card IDs.
- Face-down life card IDs.
- RNG seed/internal state.
- Effect queue internals.
- Private decision candidates not visible to recipient.
- Internal crash/recovery metadata.

Canonical public support DTOs for the initial live view contract:

```ts
type SpectatorPolicy = {
  mode: "disabled" | "live-filtered";
  allowHandRevealAfterGame: boolean;
};

interface PublicTurnState {
  globalTurn: number;
  playerTurnCounts: Record<PlayerId, number>;
  turnPlayerId: PlayerId;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  step?: BattleStep;
}

interface PublicBattleState {
  attacker: CardRef;
  originalTarget: CardRef;
  currentTarget: CardRef;
  blocker?: CardRef;
  step: BattleStep;
  damageCount: number;
}

interface PublicCardView {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  attachedDonCount: number;
  turnPlayed?: number;
}

interface PublicLifeView {
  count: number;
  faceUpCards: PublicCardView[];
}

interface VisiblePlayerState {
  playerId: PlayerId;
  deckCount: number;
  donDeckCount: number;
  hand: PublicCardView[];
  trash: PublicCardView[];
  leader: PublicCardView;
  characters: PublicCardView[];
  stage?: PublicCardView;
  costArea: PublicCardView[];
  life: PublicLifeView;
  hasMulliganed: boolean;
  turnCount: number;
}

interface OpponentVisibleState {
  playerId: PlayerId;
  deckCount: number;
  donDeckCount: number;
  handCount: number;
  trash: PublicCardView[];
  leader: PublicCardView;
  characters: PublicCardView[];
  stage?: PublicCardView;
  costArea: PublicCardView[];
  life: PublicLifeView;
  hasMulliganed: boolean;
  turnCount: number;
}

type SpectatorVisiblePlayerState = OpponentVisibleState;

interface PublicDecision {
  id: DecisionId;
  type: string;
  playerId: PlayerId;
  prompt: string;
  causedBy: CausalityRef;
  timeoutMs?: number;
}

type PublicLegalAction =
  | { type: "playCard"; card: CardRef; costPaymentRequired?: boolean }
  | { type: "activateEffect"; source: CardRef; effectId: EffectId }
  | { type: "attachDon"; don: CardRef; target: CardRef }
  | { type: "declareAttack"; attacker: CardRef; target: CardRef }
  | { type: "activateBlocker"; blocker: CardRef }
  | { type: "useCounter"; card: CardRef; target: CardRef }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId }
  | { type: "respondToDecision"; decisionId: DecisionId };

interface PublicRevealRecord {
  id: string;
  cards: CardRef[];
  visibility: "public" | "privateToRecipient";
  origin: ZoneRef | "topOfDeck" | "lifeDamage" | "custom";
  createdAtStateSeq: StateSeq;
  cleanupPolicy: "returnToOrigin" | "trashAfterResolution" | "none";
}

type SpectatorRevealRecord = Omit<PublicRevealRecord, "visibility"> & {
  visibility: "public";
};

type SpectatorEvent = Omit<EngineEvent, "visibility"> & {
  visibility: { type: "public" };
};
```

Initial live-filtered spectator view is distinct from `PlayerView`:

```ts
interface SpectatorView {
  matchId: MatchId;
  stateSeq: StateSeq;
  actionSeq: number;
  spectatorPolicy: SpectatorPolicy;
  turn: PublicTurnState;
  players: Record<PlayerId, SpectatorVisiblePlayerState>;
  battle?: PublicBattleState;
  revealedCards: SpectatorRevealRecord[];
  events: SpectatorEvent[];
  timers: PublicTimerState;
}
```

Initial `SpectatorView` has no `pendingDecision` or `legalActions` field.
It does not include either player's hand card IDs, deck order, face-down life
card IDs, private reveal records, non-public events, RNG state, effect queue
internals, or audit entries. Full-information live spectating is deferred to a
future explicit policy story.

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

### 17-first-card-fixtures.s004 (Recommended 20-card coverage set)

| Slot | Fixture purpose                  | Mechanics covered                                          |
| ---: | -------------------------------- | ---------------------------------------------------------- |
|    1 | Vanilla Leader                   | Setup, life, attacks, leader damage.                       |
|    2 | Vanilla Character 2-cost         | Basic play, cost payment, summoning sickness.              |
|    3 | Vanilla Character high power     | Character battle and K.O.                                  |
|    4 | Vanilla Stage                    | Stage play and stage replacement.                          |
|    5 | Character with counter value     | Counter step, hand trash, temporary battle power.          |
|    6 | `[Blocker]` Character            | Block window, blocker rests, target redirection.           |
|    7 | `[Rush]` Character               | Can attack turn played.                                    |
|    8 | `[Rush: Character]` Character    | Can attack rested Characters but not Leader on play turn.  |
|    9 | `[Double Attack]` Character      | Multiple damage points and damage deferral.                |
|   10 | `[Banish]` Character             | Replacement of life-to-hand/trigger path.                  |
|   11 | `[On Play] Draw 1`               | Auto trigger, draw event, rule processing.                 |
|   12 | `[When Attacking]` Draw/discard  | Attack trigger, sequence effect, private discard decision. |
|   13 | `[On K.O.]` Draw 1               | Source leaves field, resolves from trash/last known info.  |
|   14 | `[Trigger]` Life effect          | Reveal from life, no-zone resolution, trash after trigger. |
|   15 | `[Counter]` Event + power        | Counter event cost/trash/effect.                           |
|   16 | `[Main]` Event K.O. low-cost     | Main event play, target selection, K.O. effect.            |
|   17 | Permanent +1000 during your turn | Computed continuous effect, no state mutation.             |
|   18 | Search/look top cards            | Hidden-information private choice and reveal policy.       |
|   19 | Protection/replacement effect    | Replacement priority and one-use-per-process rule.         |
|   20 | Custom-handler card              | Escape hatch, handler registry, handler tests.             |

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

Own only cards-package generated-support parser, capability, support-index, and report behavior for draw-then-trash templates. Do not add engine runtime behavior or OP10-045 fixture support in this story.

## Scope

- certify parameterized parser rules for `[On Play] Draw N card(s) and trash M card(s) from your hand.`
- certify parameterized parser rules for `[When Attacking] Draw N card(s) and trash M card(s) from your hand.`
- certify `[When Attacking] [Once Per Turn] Draw N card(s) and trash M card(s) from your hand.` for the OP10-045 shape
- use positive safe-integer count parsing from CARD-009A for both draw and trash counts
- generate a deterministic EffectDefinition that composes draw and trash-from-hand in printed order
- update runtime capability matrix evidence to consume ENG-050 runtime capabilities for draw-then-trash sequence support
- fail closed for unsupported sequence order, unsupported trigger wrappers, unsupported optionality, unparsed residue, invalid counts, missing capability evidence, or unsupported runtime shapes

## Out of Scope

- engine runtime behavior changes
- OP10-045 fixture/support evidence
- leader-type conditions
- end-of-turn triggers
- dynamic trash-until-hand-size effects
- broad sequence grammar
- optional activation decisions
- new cost semantics
- replacement effects
- server, client, API, UI, Redis, database, replay, or live Poneglyph work

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/certified-card-text-parser.ts
- packages/cards/src/certified-card-text-parser.test.ts
- packages/cards/src/generated-support-index.ts
- packages/cards/src/generated-support-index.test.ts
- packages/cards/src/generated-support-report.test.ts
- packages/cards/src/runtime-capability-matrix.ts
- packages/cards/src/runtime-capability-matrix.test.ts
- packages/cards/src/index.ts
- stories/generated/CARD-009B-generated-draw-then-trash-template-evidence.yaml
- stories/approved/CARD-009B-generated-draw-then-trash-template-evidence.yaml
- agent-packets/CARD-009B.md
- agent-packets/active.json

## Constraints

- generate and activate the CARD-009B packet before implementation
- stay within allowed_touch_points
- do not add OP10-045 fixture/support evidence until CARD-009C
- preserve generated-support fail-closed behavior when any parsed component lacks runtime capability evidence
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
- focused parser tests for On Play draw-then-trash success, When Attacking draw-then-trash success, once-per-turn wrapper success, unsupported sequence order failure, near-miss failure, invalid draw-count failure, invalid trash-count failure, and residue failure
- focused capability/index/report tests for supported sequence, unsupported runtime shape blockers, and unsupported missing-capability cases
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

- `[On Play] Draw 2 cards and trash 1 card from your hand.` parses to generated DSL and is supported by capability checks
- `[When Attacking] Draw 2 cards and trash 1 card from your hand.` parses to generated DSL and is supported by capability checks
- `[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.` parses to generated DSL and is supported by capability checks
- generated parser-rule evidence is parameterized and does not require per-number certification
- generated support index/report show the supported sequence and parser rules used
- invalid counts, unsupported wrappers, near misses, unparsed residue, and missing capability evidence remain unsupported with blocker evidence

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
