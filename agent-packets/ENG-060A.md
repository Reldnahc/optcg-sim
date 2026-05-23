<!-- agent-packet:story-id ENG-060A -->
<!-- agent-packet:story-path stories/approved/ENG-060A-multi-effect-definition-entry-point-routing.yaml -->
<!-- agent-packet:story-sha256 8ae8f56182c3a7d09135c62240b712bf431f27432675faa6355fa533b56ef332 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-060A
Epic ID: ENG-060
Title: Multi-effect definition entry-point routing
Type: implementation
Area: engine
Primary Concern: rules

## Why

Remove engine-core assumptions that an implemented-DSL card definition must contain exactly one effect block before an entry point can queue, expose, or resolve its relevant supported effect.

## Authoritative Spec References

- 04-effect-runtime.s003 (Effect categories)
- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s016 (Failure policy)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s005 (Triggers)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s005 (Unit tests per card)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 04-effect-runtime.s003 (Effect categories)

| Category    | Runtime behavior                                           |
| ----------- | ---------------------------------------------------------- |
| Auto        | Detected from `EngineEvent`s and queued.                   |
| Activate    | Exposed through legal actions during valid timing windows. |
| Permanent   | Contributes continuous modifiers to computed view.         |
| Replacement | Intercepts replaceable processes before atomic mutation.   |

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

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

Own only engine runtime routing and legal-action exposure changes needed to select relevant supported effect blocks from a multi-effect generated EffectDefinition. Do not add new body primitives, cards-layer capability matrix evidence, parser certification, generated-support promotion, or real card support.

## Scope

- remove checks that reject an implemented-DSL definition solely because `definition.effects.length !== 1` or equivalent whole-definition exact-size assumptions
- replace whole-definition single-effect gates with relevant-entry-point filtering that selects the supported effect block for the current event, legal action, or decision
- update On Play queueing so a supported On Play effect can queue when the same definition also contains independent supported non-On Play blocks
- update When Attacking and On Opponent Attack queueing so a supported attack-timing effect can queue when the same definition also contains independent supported non-matching blocks
- update On K.O. candidate detection so a supported On K.O. effect can queue when the same definition also contains independent supported non-On K.O. blocks
- update Main Event queueing so a supported main effect can queue when the same definition also contains independent supported non-main blocks
- update play-card legal metadata so a playable implemented-DSL card is not rejected solely because its complete supported generated definition has multiple effect blocks
- update life trigger and counter event support only as far as needed to avoid whole-definition exact-one rejection; do not add new trigger or counter body support in this child
- preserve current fail-closed behavior for multiple matching effects in the same unresolved timing window, unsupported relevant effects, stale sources, unsupported source-presence policies, and unsupported runtime work

## Out of Scope

- new body primitive support
- new sequence connector support
- deterministic ordering for multiple matching same-entry-point effects from one source
- cards package changes
- parser certification, generated support, support probe/report/proof-certificate changes
- real-card IDs, exact printed text, source hashes, behavior hashes, overlays, fixtures, or card manifests
- changing event payload contracts or shared DSL schema
- server, client, UI, database, replay UI, WebSocket, Redis, or live Poneglyph work

## Allowed Touch Points

<!-- prettier-ignore -->
- stories/generated/ENG-060A-multi-effect-definition-entry-point-routing.yaml
- stories/approved/ENG-060A-multi-effect-definition-entry-point-routing.yaml
- agent-packets/ENG-060A.md
- agent-packets/active.json
- packages/engine-core/src/effect-runtime-trigger-queueing-on-play.ts
- packages/engine-core/src/effect-runtime-trigger-queueing-attack.ts
- packages/engine-core/src/effect-runtime-trigger-queueing-ko.ts
- packages/engine-core/src/effect-runtime-trigger-queueing-main-event.ts
- packages/engine-core/src/play-card-support.ts
- packages/engine-core/src/battle-counter-actions.ts
- packages/engine-core/src/life-trigger-actions.ts
- packages/engine-core/src/attack-timing.ts
- packages/engine-core/src/battle-support.ts
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/effect-runtime-conditions.ts
- packages/engine-core/src/**/*trigger*queueing*.test.ts
- packages/engine-core/src/**/*play-card*support*.test.ts
- packages/engine-core/src/**/*life-trigger*.test.ts
- packages/engine-core/src/**/*counter*.test.ts
- packages/engine-core/src/**/*attack-timing*.test.ts

## Constraints

- generate and activate the ENG-060A packet before implementation
- keep changes engine-core only
- do not edit packages/cards
- do not add parser or generated-support behavior
- stop and split if removing exact-one gates requires new shared contract fields
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

- story-review for ENG-060A before approval handoff
- On Play queueing regression with one supported On Play block plus one independent supported non-On Play block in the same definition
- When Attacking queueing regression with one supported When Attacking block plus one independent supported non-When Attacking block in the same definition
- On Opponent Attack queueing regression with one supported On Opponent Attack block plus one independent supported non-On Opponent Attack block in the same definition
- On K.O. queueing regression with one supported On K.O. block plus one independent supported non-On K.O. block in the same definition
- Main Event queueing regression with one supported Main block plus one independent supported non-Main block in the same definition
- play-card legal metadata regression proving a supported multi-block implemented-DSL Character or Event is not rejected solely because the definition has multiple supported blocks
- life trigger or counter regression proving whole-definition exact-one rejection is removed or explicitly documented as still out of scope with a fail-closed reason
- negative tests proving multiple matching same-entry-point effects still fail closed where ordering remains unsupported
- negative tests proving unsupported relevant blocks still fail closed without mutation
- production-code search or lint-style assertion proving no real-card ID or exact printed text branch was added
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

- no covered engine entry point rejects a generated implemented-DSL definition solely because the full definition has more than one supported effect block
- current relevant entry-point behavior is selected from the effect block trigger and id, not from whole-definition size
- same-entry-point duplicate matching effects still fail closed where deterministic ordering or choice semantics are not implemented
- unsupported relevant effects still fail closed without partial mutation
- unrelated supported effect blocks do not interfere with source-presence validation, event ordering, once-per-turn checks, hidden-information filtering, or replay determinism for the current entry point
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
