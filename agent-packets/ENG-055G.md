<!-- agent-packet:story-id ENG-055G -->
<!-- agent-packet:story-path stories/approved/ENG-055G-playselected-play-from-hand-runtime.yaml -->
<!-- agent-packet:story-sha256 47920f81c3101af24859f30da606e85dd74f6f25e761a54ec88d200b8024b37f -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-055G
Epic ID: ENG-055
Title: playSelected and play-from-hand runtime
Type: implementation
Area: engine
Primary Concern: rules

## Why

Implement playSelected from hand runtime with up-to cardinality integration, area-capacity handling, and forced-trash consequences.

## Authoritative Spec References

- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 04-effect-runtime.s002 (Overview)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 04-effect-runtime.s016 (Failure policy)
- 05-effect-dsl-reference.s026 (Transient reveal and selection primitives)
- 05-effect-dsl-reference.s027 (Effect-play options)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s017 (Canonical decision routing)

All player choices are represented as `PendingDecision` and answered by exactly one action shape:

```ts
{
  type: ("respondToDecision", decisionId, response);
}
```

The engine validates the response against the current pending decision. The client never gets to submit raw target IDs or payment choices outside the active decision context.

The following decision families are implementation-required for Milestones 1-2:

```text
mulligan
chooseTriggerOrder
chooseOptionalActivation
payCost
selectTargets
selectCards
chooseQuantity
chooseEffectOption
confirmTriggerFromLife
chooseReplacement
orderCards
chooseCharacterToTrashForOverflow
```

For `chooseQuantity`, the response payload shape is `{ type: "chooseQuantity"; quantity: number }`. The outer `respondToDecision.decisionId` must name the active `chooseQuantity` decision. The inner `ChooseQuantityResponse` payload does not carry a decision ID; it is valid only when it has response type `chooseQuantity` and carries a whole integer `quantity` inside the decision's allowed `min` and `max` bounds.

Cardinality is explicit:

- exact-N decisions use `mode: "exact"` and must be represented with `min: N` and `max: N`; `mode: "exact"` with different `min` and `max` values is malformed and must not be created. A response below the required value, above it, non-integer, negative when the minimum is non-negative, or otherwise out-of-range is an `invalidDecisionResponse`.
- up-to-N decisions use `mode: "upTo"` and allow a partial response from `min` through `max`, inclusive. Choosing `max` is legal. Choosing less than `max` is legal only when it is still at least `min`.
- zero is legal only when the decision's `min` is `0`; exact-0 is represented as `min: 0`, `max: 0`, and `mode: "exact"`.
- minimum and maximum bounds are authoritative. Responses below `min`, above `max`, non-integer, missing, or with the wrong response type are rejected as `invalidDecisionResponse`.

Quantity decisions exposed through legal actions must advertise only public bounds, prompt text, and the active decision ID. They must not reveal hidden candidate counts, must not reveal hidden card identities, and must not encode whether a private candidate set contains a particular card. If a quantity is constrained by hidden information, the engine validates against the private candidate set internally and returns `invalidDecisionResponse` for illegal responses without disclosing the hidden reason through public legal actions or public events.

Decision IDs are single-use. A response for an old decision ID is stale unless it is an exact idempotent retry already accepted by the match server.

For optional costs, the only canonical decline route is the active
`PayCostDecision` answered with `PaymentDeclinedResponse`; optional cost decline
must not reuse `chooseOptionalActivation` and must not submit a partial
`PaymentResponse`. A stale optional-cost decision ID, malformed optional-cost
response, wrong player response, insufficient payment, response whose
`optionId` is not one of the active `paymentOptions`, or payment selection
outside the active decision context is rejected as `invalidDecisionResponse`.
These failures fail closed: they do not resolve the decision, do not record a
segment result, do not consume once-per-turn usage or other use counters, do not
emit public events describing hidden payment candidates, and must not reveal
hidden payment candidates, private DON!! choices, or internal failure details
through public legal actions, public events, PlayerView, or SpectatorView.
Optional cost payment uses `PayCostDecision`, not `chooseOptionalActivation`.
Optional cost decline uses `{ type: "paymentDeclined" }` and never carries
payment selections.
A rejected optional-cost response does not consume once-per-turn usage.

### 03-game-state-events-decisions.s020 (State hashing)

Replays and recovery need state hashes.

```ts
interface StateHashInput {
  state: GameState;
  includeHidden: boolean;
  normalizeTransientIds: boolean;
}
```

Use canonical JSON serialization:

- Stable object-key ordering.
- Stable array ordering.
- Exclude timestamps unless explicitly part of replay logic.
- Include hidden data for authoritative replay hashes.
- Use separate public-view hash for client sync if useful.

### 03-game-state-events-decisions.s022 (Internal state sequencing)

```ts
type StateSeq = number & { __brand: "StateSeq" };

interface TurnState {
  globalTurn: number;
  playerTurnCounts: Record<PlayerId, number>;
  turnPlayerId: PlayerId;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  step?: BattleStep;
}
```

Increment `state.seq` after every accepted action or resolved decision, not after every internal event. Internal events have their own sequence inside the event journal.

### 04-effect-runtime.s002 (Overview)

The effect runtime executes effect definitions against the authoritative game state.

```text
Effect definitions        Runtime                 Engine core
DSL + custom handlers --> queue/choices/events --> atomic state mutations
```

The runtime must preserve timing, hidden information, source-presence rules, replacement effects, and deterministic replay.

**v6 contract:** queue entries, decisions, replacement state, and continuous-effect records are defined in [`contracts/canonical-types.ts`](contracts/canonical-types.ts). The algorithms below are normative when they are more precise than older snippets.

### 04-effect-runtime.s011 (Conditions and costs)

Before resolving an effect block:

1. Check source presence policy.
2. Re-check condition if the effect requires condition-on-resolution.
3. Check `[Once Per Turn]` usage by `source.instanceId + effectBlock.id + turn`.
4. If activation requires cost, create a `PayCostDecision` when choices are required.
5. Pay cost atomically and emit `costPaid` events.
6. Mark once-per-turn usage only after legal commitment: activation conditions passed, required activation-time targets selected, costs paid, and optional activation accepted. Declined optional effects and failed costs do not consume use; legally committed effects that later fizzle do consume use.

Optionality has three distinct meanings:

- Optional activation asks whether the player commits to resolving the effect block. Declining optional activation means the effect block is not legally committed and once-per-turn usage is not consumed.
- Optional cost asks whether the player pays a non-mandatory cost inside an otherwise committed effect. Declining or failing an optional cost records `paidCost: false` and only skips later instructions whose connector or text depends on that cost being paid.
- Optional effect clause asks whether the player performs a non-mandatory instruction during resolution. Declining an optional effect clause records `playerDeclined: true` for that segment and does not undo prior legally completed segments.

Optional cost clauses inside composed execution are not effect-block activation
costs. They occur after legal commitment to the effect block, inside a
resumable sequence segment. Optional cost accept, decline, and failure do not
consume once-per-turn usage because usage was consumed at legal commitment
before the optional cost clause executes. Accepted optional costs pay cost
atomically and emit the normal cost-payment events. Declined optional costs do
not emit cost-payment events. Failed optional costs emit no public event that
reveals hidden payment candidates or private payment details.

Accepted optional cost records `attempted: true`, `succeeded: true`,
`paidCost: true`, and `playerDeclined: false`; `changedState` records whether
canonical state actually changed. Declined optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: true`. Failed optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: false`. Optional cost accept, decline,
and failure do not consume once-per-turn usage, and dependent connectors use
`paidCost` rather than optional-activation state.
Event `seq` values and `state.seq` advancement remain deterministic for
optional cost accept, decline, and failure. State hashes include the frame
segment result for each branch.

```ts
interface OncePerTurnRecord {
  cardInstanceId: InstanceId;
  effectId: string;
  turnNumber: number;
  usedAtStateSeq: StateSeq;
}
```

### 04-effect-runtime.s012 (Player choices during effect resolution)

Effects pause through `PendingDecision`.

Example target selection flow:

```ts
function executeKoEffect(
  state: GameState,
  effect: KoEffect,
  context: EffectContext,
): EngineResult {
  const candidates = resolveTargetCandidates(state, effect.target, context);

  if (requiresChoice(effect.target)) {
    return pauseForDecision(state, {
      type: "selectTargets",
      playerId: resolveChooser(effect.target, context),
      request: effect.target,
      candidates,
      causedBy: context.causedBy,
    });
  }

  return koTargets(state, candidates.selected, context);
}
```

Decision responses are validated by the engine, not the client.

Composed execution records one segment result for every attempted sequence segment or optional clause. A segment result must record `attempted`, `succeeded`, `changedState`, `selectedCards`, `selectedTargets`, `paidCost`, and `playerDeclined`. `succeeded` means the segment legally performed its required instruction, while `changedState` separately records whether canonical state changed. Legal selection without mutation may still drive connectors such as "if you do" when card text depends on choosing or identifying an object.

Saved-result references may bind selected cards, selected targets, paid costs, or produced objects for later text such as `that Character`. A later segment may use a saved-result reference only while the referenced object remains legal for that later instruction; otherwise the later segment follows its connector and failure policy. Saved references must preserve hidden-information visibility and replay determinism.

A saved field-object reference is the runtime contract for same-frame `selectedTargets` and `producedObjects` consumers in the same effect execution frame. `selectedTargets` production records the public field objects legally selected by a target request in the segment result and saved-reference ledger. `producedObjects` records public field objects produced by a supported segment when the runtime story for that producer explicitly authorizes the produced-object family. Saved hand-selection/playSelected references remain separate from saved field-object references and must not be consumed as field-object targets.

Field-object consumers must validate the saved family, `saveResultAs`, optional object index, current zone, player/controller, filter, public visibility, and instruction legality at consumption time. unsupported saved-reference families fail closed. stale objects, gone objects, hidden objects, and illegal objects fail closed. A fail-closed saved field-object reference records the segment as attempted, not succeeded, and not changedState, then follows the active connector and failure policy. Public events, public legal actions, PlayerView, and SpectatorView must not reveal hidden identities, hidden candidates, or the private saved-reference failure reason; replay and private effect logs may retain the failure reason for audit. State hashes include the frame saved-reference ledger, the consumer result, and unchanged public/hidden game state so replay, event order, and connector decisions remain deterministic.

Accepted optional cost records `attempted: true`, `succeeded: true`,
`paidCost: true`, and `playerDeclined: false`. Declined optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: true`. Failed optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: false`. Optional cost accept, decline,
and failure do not consume once-per-turn usage.

Optional cost segment results participate in the serialized effect execution
frame and authoritative state hash. Event `seq` values and `state.seq`
advancement remain deterministic for accepted, declined, and failed optional
cost branches under `03-game-state-events-decisions.s005` and
`03-game-state-events-decisions.s022`: resolving a valid optional-cost decision
advances `state.seq` once, individual internal events do not each advance
`state.seq`, and rejected stale, malformed, wrong-player, or insufficient
payment responses do not resolve the decision. State hashes include the frame
segment result and unchanged game state for decline or failure branches.

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

### 05-effect-dsl-reference.s026 (Transient reveal and selection primitives)

```ts
type SelectionSetId = string;
type SelectionId = string;

type Effect =
  | {
      type: "revealTop";
      player: PlayerRef;
      count: number;
      saveAs: SelectionSetId;
      visibility: Visibility;
    }
  | {
      type: "selectFromSet";
      set: SelectionSetId;
      chooser: PlayerRef;
      min: number;
      max: number;
      filter?: CardFilter;
      saveAs: SelectionId;
    }
  | {
      type: "selectCards";
      zone: Zone;
      player: PlayerRef;
      chooser: PlayerRef;
      min: number;
      max: number;
      filter?: CardFilter;
      saveAs: SelectionId;
      visibility: Visibility;
    }
  | {
      type: "playSelected";
      selection: SelectionId;
      enterRested?: boolean;
      ignoreCost?: boolean;
    }
  | {
      type: "returnUnselectedToDeck";
      set: SelectionSetId;
      player: PlayerRef;
      position: "top" | "bottom";
      order: "original" | "ownerChoice" | "random";
      faceDown: boolean;
    }
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: Zone | SelectionSetId;
      to: Zone;
    };
```

These are not UI concepts. They are deterministic effect-runtime concepts. They let the runtime represent "reveal top card, maybe play it, otherwise return it face-down" without losing hidden-information boundaries.

`playSelected` is planned/not fixture-authorable until schema coverage and runtime capability evidence exist. Generated support may not treat a parsed play-from-selection instruction as playable unless the parser covers the complete selection/play/return flow and the runtime capability matrix covers the resulting decision, hidden-information, forced-trash, and zone-movement behavior.

`playSelected` may consume only an authorized saved hand selection produced by the same supported effect execution frame. At playSelected resolution time, the selected card must still be in that player's hand and must still be legal to play under the current rules and the playSelected options. A stale, non-hand, no-longer-legal, or unsupported saved-reference family fails closed.

A fail-closed stale playSelected segment does not emit `cardPlayed` or hand-to-field `cardMoved` events, records the failed segment as attempted, not succeeded, and not changedState, and then follows the active connector and failure policy. Public events, public legal actions, PlayerView, and SpectatorView must not reveal hidden hand card IDs, private candidates, or unsupported saved-reference details. Replay and private effect logs may retain the internal saved-reference failure reason for audit and deterministic replay.

Event `seq` values and `state.seq` advancement remain deterministic for stale playSelected failures under `03-game-state-events-decisions.s005` and `03-game-state-events-decisions.s022`. State hashes must include the unchanged hand and board state after the failed segment. Golden replay coverage for stale playSelected failures must pin the final state hash.

### 05-effect-dsl-reference.s027 (Effect-play options)

Effects that say "play" without requiring cost payment should use:

```ts
{ type: 'playSelected', selection: '...', enterRested: true, ignoreCost: true }
```

The play still obeys rule-processing constraints such as character-area capacity and stage replacement. If the character area is full, the engine must create the forced-trash decision before completing the play.

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

### 11-testing-quality.s008 (Invariant tests)

Run after every action, decision response, effect resolution, and replay step in test mode.

```ts
assertAllCardsInExactlyOneLocation(state);
assertNoDuplicateInstanceIds(state);
assertCharacterAreaSizeAtMostFive(state);
assertStageAreaSizeAtMostOne(state);
assertLeaderAreaExactlyOne(state);
assertAttachedDonConsistency(state);
assertNoIllegalHiddenInfoInViews(state);
assertPendingDecisionIsValid(state);
assertEffectQueueEntriesAreResolvableOrCancelled(state);
assertStateHashStable(state);
```

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

Own only playSelected/play-from-hand runtime for selected hand cards. Do not implement parser support, real-card proof, or new card support metadata.

## Scope

- implement playSelected from hand runtime only for saved hand selections produced by authorized selectCards runtime
- require playSelected to consume only an authorized saved hand selection from the same supported effect execution frame
- fail closed for stale, non-hand, no-longer-legal, or unsupported saved-reference cases
- integrate up-to cardinality from chooseQuantity/selection contracts
- preserve cost-free rested play semantics for selected hand cards
- preserve area-capacity rules, stage replacement handling, and forced-trash consequences
- add synthetic engine tests for success, zero-card selection where allowed, full area, invalid card, stage replacement, and forced-trash behavior

## Out of Scope

- card parser/generated support
- new source fixture capture
- replacement generalization

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/effect-runtime*.ts
- packages/engine-core/src/play-card*.ts
- packages/engine-core/src/play-card*.test.ts
- packages/engine-core/src/effect-runtime*.test.ts
- packages/engine-core/src/actions-pending-decision.test.ts
- tests/hidden-info/**
- stories/generated/ENG-055*.yaml
- stories/approved/ENG-055*.yaml
- agent-packets/ENG-055G.md
- agent-packets/active.json

## Constraints

- do not import @optcg/cards
- use synthetic manifests for exact runtime behavior where clearer
- fail closed on area-capacity or forced-trash ambiguity
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

- synthetic playSelected/play-from-hand runtime tests
- cost-free rested play, stage replacement, full-area, and forced-trash tests
- forced-trash decision timing regression proving the decision is created before play completion and event/order/state resume deterministically after the response
- stale saved-selection failure tests asserting failed segment fields, no play/move events, and no public legal action, PlayerView, SpectatorView, or public-event leakage
- replay and state-hash pinning for stale playSelected failures
- hidden-info, event-order, and state-hash tests
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run stories:validate`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- selected legal hand cards from saved hand selections can be played through runtime effects
- up-to cardinality can choose zero or fewer legal cards when allowed
- stale, non-hand, no-longer-legal, and unsupported saved-reference cases fail closed without `cardPlayed` or hand-to-field `cardMoved` events and without leaking hidden hand details through public events, public legal actions, PlayerView, or SpectatorView
- played cards enter play rested without cost payment unless the primitive explicitly says otherwise
- full character area creates the forced-trash decision before play completion and resumes deterministically after the response
- stage area replacement and other area consequences match existing rule processing
- hidden-info, event order, deterministic replay, and state hashes are covered

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
