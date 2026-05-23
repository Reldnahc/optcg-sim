<!-- agent-packet:story-id ENG-060C -->
<!-- agent-packet:story-path stories/approved/ENG-060C-runtime-composability-regression-matrix.yaml -->
<!-- agent-packet:story-sha256 666cb8eee5bd34447b13f0efb53768726ddd0e559d2260f7bbd8bb23fd75226b -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-060C
Epic ID: ENG-060
Title: Runtime composability regression matrix
Type: implementation
Area: engine
Primary Concern: verification

## Why

Add engine-only regression coverage that locks in SPEC-010 composable runtime behavior and prevents future reintroduction of exact whole-definition, wrapper-body, full-line, or card-specific support paths.

## Authoritative Spec References

- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s016 (Failure policy)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s005 (Triggers)
- 05-effect-dsl-reference.s029 (Schema coverage policy)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s005 (Unit tests per card)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

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

Parser certification evidence must expose stable primitive boundaries for wrapper or entry point, markers, conditions, costs, body effects, targets, filters, cardinality, durations, visibility, source-presence policy, and composition when present. Runtime capability evidence must prove reusable runtime behavior for the same primitive boundaries plus decision or response semantics when present.

Composition evidence may be required for supported combined shapes, but composition evidence cannot replace missing wrapper, body, cost, target, condition, duration, source policy, decision, or visibility evidence.

Multiple parsed effects from one card compose into one generated `EffectDefinition` for that card. If any component is unparsed, ambiguous, stale, unsupported, or missing capability evidence, the entire generated support record fails closed for normal play instead of partially enabling the card.

Generated composed runtime shapes must fail closed for normal play when the runtime cannot represent the whole composed execution as a supported resumable frame. Unsupported composed shapes include sequence connectors, saved-result references, optionality boundaries, costs, targets, visibility requirements, or pending-decision continuations that the runtime capability matrix does not cover.

### 04-effect-runtime.s007 (Source presence policy)

A simple "cancel if source moved" rule is not enough. Zone-transition triggers such as `[On K.O.]` must activate on field and resolve after the card moves to trash.

```ts
type SourcePresencePolicy =
  | "mustRemainInSameZone"
  | "resolveFromDestinationZone"
  | "resolveFromLastKnownInformation"
  | "noSourceRequired";
```

Recommended defaults:

| Trigger/effect kind           | Policy                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `[When Attacking]`            | `mustRemainInSameZone`                                                                                |
| `[On Your Opponent's Attack]` | `mustRemainInSameZone`                                                                                |
| `[On Block]`                  | `mustRemainInSameZone`                                                                                |
| `[On K.O.]`                   | `resolveFromDestinationZone` or `resolveFromLastKnownInformation`, depending on ruling/implementation |
| `[Trigger]` from life         | `resolveFromLastKnownInformation` or `noSourceRequired` while in no zone                              |
| Event `[Main]` / `[Counter]`  | `resolveFromDestinationZone` after event is trashed                                                   |
| Global rule-created effect    | `noSourceRequired`                                                                                    |

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

### 04-effect-runtime.s016 (Failure policy)

```ts
type FailurePolicy =
  | "doAsMuchAsPossible"
  | "requiresAll"
  | "skipIfNoLegalTarget"
  | "optionalIfPossible";
```

Default is `doAsMuchAsPossible`, unless a connector or card text requires dependency.

For composed execution, failure policy applies to the whole effect block and to each segment through its connector:

- `doAsMuchAsPossible` attempts each supported segment and records per-segment success without rolling back successful independent segments.
- `requiresAll` fails the composed execution before mutation when any required segment cannot legally complete.
- `skipIfNoLegalTarget` skips the composed execution when required activation-time or first required resolution-time targets are absent.
- `optionalIfPossible` offers the optional instruction only when at least one legal execution path exists; if none exists, the segment is not attempted and does not create a decision.

Unsupported composed runtime shapes default to fail-closed rather than degrading to partial execution. Ambiguous connector dependency, saved-reference lifetime, optionality boundary, target visibility, pending-decision continuation, or replacement interaction must be treated as unsupported until the spec and capability matrix authorize it.

Exact wrapper-body allowlists are insufficient generated-support evidence unless they also expose required primitive-boundary evidence. A supported effect body under one entry point does not authorize support under another entry point; support under another entry point requires separate entry-point adapter evidence plus body or composition evidence.

### 05-effect-dsl-reference.s004 (Effect block)

Entry-point selectors are wrapper semantics, not effect body primitives. The current DSL field name `trigger` includes entry-point selector values and must not be read as only queued triggered-effect timing.

```ts
interface EffectBlock {
  id: string;
  category: "auto" | "activate" | "permanent" | "replacement";
  trigger: Trigger;
  condition?: Condition;
  conditionTiming?: "activation" | "resolution" | "both";
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}
```

### 05-effect-dsl-reference.s005 (Triggers)

Entry-point selectors are wrapper semantics, not effect body primitives. The current DSL field name `trigger` includes entry-point selector values and must not be read as only queued triggered-effect timing.

```ts
type Trigger =
  | { type: "onPlay" }
  | { type: "whenAttacking" }
  | { type: "onOpponentAttack" }
  | { type: "onBlock" }
  | { type: "onKO" }
  | { type: "endOfYourTurn" }
  | { type: "endOfOpponentTurn" }
  | { type: "trigger" }
  | { type: "donAttach"; count: number }
  | { type: "activateMain" }
  | { type: "main" }
  | { type: "counter" }
  | { type: "permanent" }
  | { type: "replacement"; replacement: ReplacementTrigger }
  | { type: "startOfGame" }
  | { type: "startOfYourTurn" }
  | { type: "startOfOpponentTurn" }
  | { type: "startOfMainPhase" }
  | { type: "endOfBattle" }
  | { type: "custom"; event: string };
```

### 05-effect-dsl-reference.s029 (Schema coverage policy)

`contracts/effect-dsl.schema.json` is the executable JSON fixture contract.
TypeScript/spec primitives outside that JSON schema are planned/not
fixture-authorable until schema validation and fixtures exist.
This list is the fixture-authorability boundary, not generated playable support.
Schema authorability alone does not imply runtime-executable,
parser-certified, or generated-support playable status. New TYP schema stories
may move primitives into the schema-supported fixture subset only when they also
add schema coverage and validation fixtures; generated playable support still
requires complete parser support and runtime capability evidence.

Synthetic positive modular example:

- wrapper: `[On Play]` with entry-point adapter evidence
- wrapper: `[When Attacking]` with separate entry-point adapter evidence
- body primitive: shared `draw` + `chooseQuantity` composition evidence reused by both wrappers

Synthetic negative exact wrapper-body example:

- one parser branch that only certifies one exact full printed line for `[On Play] draw 1`
- no primitive-boundary parser evidence for reusable wrapper, body, cost, target, visibility, or decision semantics
- no separate entry-point adapter evidence for other wrappers

These synthetic examples must not name real cards or card IDs.

Schema-supported fixture subset:

- trigger: onPlay
- trigger: whenAttacking
- trigger: onOpponentAttack
- trigger: onBlock
- trigger: onKO
- trigger: endOfYourTurn
- trigger: endOfOpponentTurn
- trigger: trigger
- trigger: activateMain
- trigger: main
- trigger: counter
- trigger: permanent
- trigger: startOfGame
- trigger: startOfYourTurn
- trigger: startOfOpponentTurn
- trigger: startOfMainPhase
- trigger: endOfBattle
- trigger: donAttach
- trigger: custom
- condition: yourTurn
- condition: attachedDonCount
- condition: fieldCount
- condition: fieldCount DON filter authorability uses existing `fieldCount` +
  `CardFilter` (`categories` containing `don`) with `player` limited to `self`
  or `opponent`; this remains schema-authorability-only evidence and is not
  runtime/playability support
- condition: trashCount (public `player` + `op` + non-negative safe-integer `value`; optional public filter)
- cost: restDon
- cost: returnDon
- cost: restSelf
- cost: optional trashFromHand through `{ type: "payCost"; cost: OptionalCost }`
  sequence segments only; this is schema authorability for optional cost
  clauses, not non-optional activation `Cost.trashFromHand` authorability and
  not runtime/playability support
- cost: scoped optional choose-one trash cost through
  `{ type: "payCost"; cost: OptionalCost }` sequence segments only. Options are
  limited to the reusable optional `trashFromHand` alternative and scoped
  optional self Character-field `trashFromField` alternatives with positive
  `count`, `chooser: "self"`, `optional: true`, and a filter limited to
  `categories: ["character"]` plus nonempty `typesAny`. This is schema
  authorability only and is not runtime payment behavior, parser certification,
  generated support, support-report evidence, or card promotion.
- cost: sequence
- target: self, myLeader, opponentLeader, attacker, attackTarget, blocker,
  triggerCard, all, choose, savedFieldObject
- duration: thisAction
- duration: thisBattle
- duration: thisTurn
- duration: untilEndOfTurn
- duration: untilStartOfNextTurn
- duration: whileSourceOnField
- duration: permanent
- effect: draw
- effect: drawUpTo
- effect: ko
- effect: modifyPower
- effect: setBasePower for scoped permanent continuous setters only:
  `target.type: "all"`, `target.zone: "characterArea"`,
  `target.player: "self"`, optional target `filter.typesAny`, numeric `value`,
  and `duration: { type: "permanent" }`; this is schema-authorability-only
  evidence and not runtime/playability support
- effect: search for scoped top-N deck requests only:
  `zone: "deck"`, `player: "self"`, positive integer `lookCount`,
  `destination: "hand"`, `min: 0`, `max: 1`,
  `remainingCards.destination: "deck"`, `remainingCards.position: "bottom"`,
  `remainingCards.order: "ownerChoice"`, and `shuffleAfter: false`. The
  schema-supported variants are public reveal to `bothPlayers` with a nonempty
  filter limited to `categories`, `colorsAny`, `typesAny`, and `nameNot`, or
  non-reveal any-card search to `chooserOnly` with an empty filter object. This
  is schema-authorability-only evidence and not runtime executable support,
  parser certification, generated support, support-report evidence, or card
  promotion.
- effect: search for one scoped start-of-game Stage setup request only:
  `zone: "deck"`, `player: "self"`, no `lookCount`,
  `filter.categories: ["stage"]` with nonempty `typesAny`, `min: 0`, `max: 1`,
  `destination: "stageArea"`, `revealTo: "chooserOnly"`, and
  `shuffleAfter: false`; this is schema-authorability-only evidence and not
  runtime executable support, parser certification, generated support,
  support-report evidence, or card promotion.
- effect: payCost
- effect: selectCards
- effect: selectTargets
- effect: playSelected for existing same-sequence hand-selection producers only,
  plus
  the only non-hand saved-selection exception
  `selection: "selected:start-of-game"` when consumed in the same sequence
  with exact shape `{ type: "playSelected", selection: "selected:start-of-game", ignoreCost: true }`
  after the scoped start-of-game Stage setup search
  producer above; this remains schema-authorability-only evidence and not
  runtime executable support, parser certification, generated support,
  support-report evidence, or card promotion.
- effect: sequence
- effect: cannotAttack
- effect: cannotBlock
- effect: giveKeyword
- effect: giveProtection (structured `Protection` metadata only; includes TYP-012A field-removal metadata shape)
- effect: custom
- card filters: cardIds, names, nameContains, nameNot, categories, colorsAny,
  colorsAll, typesAny, typesAll, attributesAny, attributesAll, cost, power,
  counter, hasKeywords, lacksKeywords, state, owner, controller, excludeSelf,
  custom

Planned/not fixture-authorable until schema coverage exists:

- condition: donCount
- condition: opponentTurn
- condition: lifeCount
- condition: handCount
- condition: hasCardInZone
- condition: attackTarget
- condition: cardState
- condition: sourceStillInZone
- condition: eventPayload
- condition: and, or, not, custom
- cost: trashFromHand as non-optional `Cost.trashFromHand`
- cost: trashSelf
- cost: trashFromField as broad or non-optional `Cost.trashFromField`
- cost: discard
- cost: chooseOne as broad or standalone non-optional `Cost.chooseOne`
- cost: custom
- duration: whileConditionTrue
- effect: lookAtTop
- effect: revealFromZone
- effect: revealTop
- effect: selectFromSet
- effect: moveSelected with position
- effect: putRemaining
- effect: shuffleDeck
- effect: bounce
- effect: trash
- effect: play
- effect: returnUnselectedToDeck
- effect: trashFromHand
- effect: setPowerToZero
- effect: modifyCost
- effect: setBaseCost
- effect: rest
- effect: activate
- effect: removeKeyword
- effect: addDon
- effect: attachDon
- effect: returnDon
- effect: addLife
- effect: damage
- effect: invalidateEffects
- effect: protectFromKO
- effect: cannotBeAttacked
- effect: cannotBeBlockedBy
- effect: choice
- effect: conditional
- effect: forEachMatch
- effect: repeat
- effect: replacement

new fixture-authorable primitives must add schema coverage and validation fixtures in the same story that makes the primitive authorable.

### 09-card-data-and-support-policy.s016 (Generated support from complete parse)

Common-template card support is generated from complete parsing plus runtime capability checks. It must not depend on a manual per-card allowlist or a manual card-to-mechanic map for templates that parser certification already covers.

CARD parser/generated-support stories consume completed contract/schema plus runtime-capability evidence before parser certification or generated-support linkage may enable normal-mode support. Contract/schema completion alone is not playable support.

Complete parse means every gameplay-relevant part of a card is parsed: printed effect text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement effects, optionality, once-per-turn limits, source-presence rules, and official rulings or errata that affect behavior. Non-gameplay display fields such as images and flavor-like presentation do not need DSL parse evidence, but any field that can affect behavior must be represented or explicitly proven irrelevant.

A runtime capability matrix records which generated components the current engine can execute. It must cover at least keyword bodies, DSL primitives, trigger timings, decision/response types, costs, target/selection shapes, movement operations, replacement processes, continuous modifiers, visibility modes, event/hash requirements, and custom handlers. The matrix is versioned with effect/runtime support evidence and must be updated when runtime capabilities expand or contract.

The generated support index maps Poneglyph card IDs and source hashes to generated `EffectDefinition` IDs, parser-rule versions, parser evidence, runtime capability results, support status, and review state. Multiple parsed effects for one card compose into one generated `EffectDefinition` for that card. If every parsed component is supported by the current runtime capability matrix and parser-rule certification allows automatic support, the generated support index may mark the card playable in the appropriate modes.

Partial support reporting is allowed and encouraged for progress tracking. It may report parsed components, unparsed spans, ambiguous parse classes, missing runtime capabilities, stale hashes, and unsupported custom-handler needs. Partial support does not make a card playable in normal modes, and partial support or effect coverage progress never enables normal play.

Generated support fails closed. If any component is unparsed, ambiguous, stale, unsupported, missing capability evidence, missing parser certification, or affected by Bandai/Poneglyph wording drift, the card is rejected for normal play until parser/support evidence is updated. New parser rules, ambiguous parse classes, custom handlers, and wording or ruling ambiguity require review before they can certify support.

Generated-support evidence factorization is primitive-boundary authority, not exact wrapper-body or sample-shaped authority. Parser certification and runtime capability evidence must expose reusable boundaries for wrapper or entry point, markers, conditions, costs, body effects, targets, filters, cardinality, durations, visibility, source-presence policy, and composition when present. Composition evidence may be required for supported combined shapes, but composition evidence cannot replace missing wrapper, body, cost, target, condition, duration, source policy, decision, or visibility evidence.

The entry-point terminology note in `05-effect-dsl-reference.s022` remains terminology-only; this section is normative generated-support evidence factorization authority.

### 11-testing-quality.s004 (Unit tests per DSL primitive)

Every primitive has tests independent of specific cards:

- `draw`
- `ko`
- `trash`
- `bounce`
- `search`
- `lookAtTop`
- `modifyPower`
- `modifyCost`
- `giveKeyword`
- `replacement`
- `damage`
- `addLife`
- `attachDon`
- `returnDon`
- `choice`
- `conditional`
- `sequence`

Primitive tests should assert events, state, decisions, and visibility where applicable.

For generated-support parser/certification stories, primitive-boundary parser tests
must prove wrapper or entry-point handling, markers, conditions, costs, effect
body behavior, targets or filters, cardinality, durations, source-presence
policy, and decision/visibility behavior when applicable. Do not treat exact
full-line matches, wrapper-body-only matches, or sample-shaped outputs as
primitive-boundary proof.

Authority tests must assert generated-support factorization wording per cited section. Each required section is asserted independently; one section cannot satisfy another section's required wording.

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

This per-card requirement applies to implemented non-vanilla cards and does not
reintroduce a manual per-card allowlist requirement for complete-parse
common-template generated support. Generated-support stories must still include
representative synthetic proof tests for reusable primitive/composition support,
runtime capability matrix coverage checks, generated-support decision/reporting
path checks, at least one positive modular example, and at least one negative
anti-shape regression proving non-modular exact full-line, wrapper-body-only, or
sample-shaped paths are rejected. When a generated-support story claims
cross-entry-point reuse, it must include at least one regression proving the
supported reusable body works under more than one supported entry point.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only engine verification and test hardening for the runtime architecture implemented by ENG-060A and ENG-060B. Do not add new runtime behavior, cards parser behavior, generated-support evidence, real-card fixtures, or support matrix updates.

## Scope

- add a focused engine regression matrix for multi-effect implemented-DSL definitions across supported entry points
- add tests proving reusable body support is not tied to one exact wrapper-body pair when separate entry-point adapter evidence exists
- add tests proving body support under one entry point does not automatically authorize another entry point without adapter evidence
- add tests proving full-definition size, full-line text, real-card ID branches, manual per-card allowlists, external card lists, and equivalent card-to-mechanic maps are not required for runtime support
- add negative tests proving unsupported body, composition, source-presence, visibility, decision, and same-entry-point ambiguity cases remain fail-closed
- add or update production-code search assertions that detect real-card ID, exact printed text, exact full-line branches, sample-shaped full-card branches, manual per-card allowlists, external card lists, equivalent card-to-mechanic maps, and full-definition-size authorization branches in engine runtime support paths
- document in test names or comments which SPEC-010 primitive-boundary obligation each regression protects

## Out of Scope

- production runtime behavior changes beyond minimal testability hooks if reviewers require them
- cards package tests or runtime capability matrix updates
- parser certification, generated support, support probe/report/proof-certificate changes
- real-card fixtures, overlays, source hashes, behavior hashes, support manifests, or cards-produced manifests
- new body primitives, new entry points, or new ordering semantics
- server, client, API, UI, database, replay UI, WebSocket, Redis, or live Poneglyph work

## Allowed Touch Points

<!-- prettier-ignore -->
- stories/generated/ENG-060C-runtime-composability-regression-matrix.yaml
- stories/approved/ENG-060C-runtime-composability-regression-matrix.yaml
- agent-packets/ENG-060C.md
- agent-packets/active.json
- packages/engine-core/src/**/*runtime*.test.ts
- packages/engine-core/src/**/*trigger*queueing*.test.ts
- packages/engine-core/src/**/*sequence*.test.ts
- packages/engine-core/src/**/*play-card*.test.ts
- packages/engine-core/src/**/*life-trigger*.test.ts
- packages/engine-core/src/**/*counter*.test.ts
- packages/engine-core/src/**/*support*.test.ts
- packages/engine-core/src/**/*composition*.test.ts
- packages/engine-core/src/effect-runtime-activation-main.test.ts

## Constraints

- generate and activate the ENG-060C packet before implementation
- do not activate ENG-060C until ENG-060A and ENG-060B have landed as reviewed commit evidence on the parent branch
- keep changes engine-core tests only unless a tiny production export is required for testability and approved by review
- do not edit packages/cards
- do not use real card IDs, exact printed text, manual per-card allowlists, external card lists, or equivalent card-to-mechanic maps as proof data
- fail closed if a regression expectation requires behavior outside ENG-060A or ENG-060B implemented scope
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

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

- story-review for ENG-060C before approval handoff
- synthetic multi-effect definition matrix covering On Play, When Attacking, On Opponent Attack, On K.O., Main Event, Life Trigger, Counter, and Activate Main where each entry point has current executable runtime semantics
- cross-entry-point reusable body matrix proving at least one no-choice body and one sequence body work under more than one supported entry-point adapter
- negative adapter matrix proving a body with no adapter evidence for an entry point remains unsupported
- negative composition matrix proving unsupported connectors, saved-reference lifetimes, visibility needs, decision continuations, costs, or source policies fail closed
- production-code anti-regression assertion proving covered engine runtime source contains no real-card ID branch, exact printed text branch, exact full-line branch, sample-shaped full-card branch, manual per-card allowlist, external card list, equivalent card-to-mechanic-map branch, or full-definition-size authorization branch
- targeted anti-regression tests proving support is not authorized solely by exact wrapper-body, full-line, or sample-shaped helpers without primitive adapter/body/composition evidence
- targeted negative body regression proving a supported wrapper with an unsupported body remains unsupported
- targeted same-entrypoint ambiguity/order regression proving duplicate or ambiguous same-entrypoint blocks fail closed rather than selecting a convenient supported block
- run `corepack pnpm --filter @optcg/engine-core test`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run packets:verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- regression tests would fail if a whole-definition `effects.length === 1` requirement is reintroduced on covered entry-point paths
- regression tests would fail if reusable sequence support is replaced by an exact draw-then-trash wrapper-body branch for covered entry-point paths
- regression tests prove cross-entry-point reuse only when both the entry-point adapter and body or composition support are present
- regression tests prove unsupported adapter, body, composition, source-presence, visibility, decision, and ordering cases remain fail-closed without mutation
- test coverage is synthetic and primitive-shaped, not based on real card IDs, exact printed text, manual per-card allowlists, external card lists, or equivalent card-to-mechanic maps
- no production engine code imports `@optcg/cards` or checks real card IDs or exact printed text

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
