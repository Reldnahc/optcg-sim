<!-- agent-packet:story-id TYP-009A -->
<!-- agent-packet:story-path stories/approved/TYP-009A-optional-cost-clause-runtime-contracts.yaml -->
<!-- agent-packet:story-sha256 bf9fc2befb08a289823de2c6b42d1bd408ab6948a254eaa5856b2c5ad697b35d -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-009A
Epic ID: TYP-009
Title: Optional cost clause runtime contracts
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Define canonical contract and spec authority for optional cost clauses inside composed sequence execution so ENG-055D can implement optional-cost runtime without inventing response, segment-result, or use-consumption behavior.

## Authoritative Spec References

- 03-game-state-events-decisions.s011 (Optional activation)
- 03-game-state-events-decisions.s012 (Cost payment)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 05-effect-dsl-reference.s007 (Costs)
- 05-effect-dsl-reference.s013 (Sequence connector semantics)
- 05-effect-dsl-reference.s029 (Schema coverage policy)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s011 (Optional activation)

```ts
interface ChooseOptionalActivationDecision extends BaseDecision {
  type: "chooseOptionalActivation";
  effectId: string;
  source: CardRef;
  options: ["activate", "decline"];
}
```

### 03-game-state-events-decisions.s012 (Cost payment)

```ts
interface PayCostDecision extends BaseDecision {
  type: "payCost";
  cost: Cost;
  paymentOptions: PaymentOption[];
}

interface PaymentResponse {
  type: "payment";
  optionId: string;
  selectedCardInstanceIds?: InstanceId[];
  selectedDonInstanceIds?: InstanceId[];
}

interface PaymentDeclinedResponse {
  type: "paymentDeclined";
}
```

Optional cost payment uses `PayCostDecision`, not `chooseOptionalActivation`.
Optional cost acceptance uses `PaymentResponse`. Optional cost decline uses
`{ type: "paymentDeclined" }` as the `PaymentDeclinedResponse` payload, with
no `optionId`, selected cards, selected DON!!, decision ID, hidden candidate
details, or reason field inside the response payload. The outer
`respondToDecision.decisionId` identifies the active optional-cost decision.

### 03-game-state-events-decisions.s016 (Action envelope inside the engine)

The server-facing protocol envelope is defined separately. The engine action should be pure data.

```ts
type Action =
  | { type: "playCard"; cardInstanceId: InstanceId; costPayment?: PaymentSpec }
  | {
      type: "activateEffect";
      source: CardRef;
      effectId: string;
      costPayment?: PaymentSpec;
    }
  | { type: "attachDon"; donInstanceId: InstanceId; target: CardRef }
  | { type: "declareAttack"; attacker: CardRef; target: CardRef }
  | { type: "activateBlocker"; blocker: CardRef }
  | { type: "useCounter"; cardInstanceId: InstanceId; target: CardRef }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId }
  | {
      type: "respondToDecision";
      decisionId: string;
      response: DecisionResponse;
    };
```

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

### 03-game-state-events-decisions.s023 (Error handling inside the engine)

Engine errors are classified.

```ts
type EngineError =
  | { type: "illegalAction"; reason: string }
  | { type: "invalidDecisionResponse"; reason: string }
  | { type: "invariantViolation"; invariant: string; details: unknown }
  | { type: "unsupportedCard"; cardId: CardId; status: CardSupportStatus }
  | { type: "effectRuntimeError"; effectId: string; details: unknown }
  | { type: "loopDetected"; signature: LoopSignature };
```

Illegal player actions are rejected and logged. Invariant violations and effect runtime errors freeze or recover the match according to the recovery policy.

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

### 05-effect-dsl-reference.s007 (Costs)

```ts
type Cost =
  | { type: "restDon"; count: number; chooser?: PlayerRef }
  | { type: "returnDon"; count: number; chooser?: PlayerRef }
  | { type: "restSelf" }
  | {
      type: "trashFromHand";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "trashSelf" }
  | {
      type: "trashFromField";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "discard"; count: number; filter?: CardFilter; chooser: PlayerRef }
  | { type: "sequence"; costs: Cost[] }
  | { type: "chooseOne"; options: Cost[] }
  | { type: "custom"; action: string };

type OptionalCost =
  | { type: "restDon"; count: number; chooser?: PlayerRef; optional: true }
  | { type: "returnDon"; count: number; chooser?: PlayerRef; optional: true }
  | { type: "restSelf"; optional: true }
  | { type: "sequence"; costs: Cost[]; optional: true };
```

If paying a cost requires choosing cards or DON!!, the runtime creates a `PayCostDecision`.
Cost primitives outside the schema-supported fixture subset remain planned layers. Optional cost behavior must remain separate from optional activation and optional effect clauses as defined by `04-effect-runtime.s011`.

### 05-effect-dsl-reference.s013 (Sequence connector semantics)

`Effect.type = "sequence"` uses explicit segment connectors. This avoids ambiguity in card text such as "Then", "If you do", and "If possible".

```ts
interface SequencedEffect {
  id?: string;
  effect: Effect;
  connector:
    | "always"
    | "then"
    | "ifPreviousSucceeded"
    | "ifYouDo"
    | "ifPossible";
  saveResultAs?: string;
}
```

Connector behavior:

| Connector             | Runtime behavior                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `always`              | Run this segment regardless of the previous segment result.                                                                          |
| `then`                | Run after the previous segment; if the previous segment was impossible, continue only when card text says to do as much as possible. |
| `ifPreviousSucceeded` | Run only if the previous segment changed game state or made a legal selection.                                                       |
| `ifYouDo`             | Run only if the player chose/performed the previous optional instruction.                                                            |
| `ifPossible`          | Attempt the segment if there is a legal way to perform it; no error if there is not.                                                 |

A segment result must record at least:

```text
attempted
succeeded
changedState
selectedCards
selectedTargets
paidCost
playerDeclined
```

Those fields drive later connector decisions and replay determinism. Runtime frame, pause/resume, saved-reference, and failure-policy behavior for composed execution is authoritative in `04-effect-runtime.s010`, `04-effect-runtime.s012`, and `04-effect-runtime.s016`.

Saved references include `saveResultAs`, `SelectionSetId`, and `SelectionId`. A saved reference is contract-defined here, but generated support may rely on it only when schema validation, parser certification, and runtime capability evidence all cover the reference lifetime, visibility, and later-use legality.

Optionality must preserve optional activation, optional cost, and optional effect clause distinctions. These boundaries are part of generated-support capability evidence because a parser that recognizes optional text still cannot make the effect playable unless the runtime can resume and record the correct optional segment result.

Optional cost clauses inside composed sequence execution use a sequence segment
whose effect is `{ type: "payCost"; cost: OptionalCost }`. The optionality flag
lives on the nested `OptionalCost`; `SequencedEffect.optional` remains reserved
for optional effect clauses and must not be used to represent optional cost
decline. Runtime decline for that segment uses the `PayCostDecision` and
`PaymentDeclinedResponse` contract from `03-game-state-events-decisions.s012`
and `03-game-state-events-decisions.s017`.
Optional cost decline uses the active `PayCostDecision` and a
`PaymentDeclinedResponse` payload.

`ifYouDo` after an optional cost runs only when the previous cost segment
recorded `paidCost: true`. A declined or failed optional cost segment does not
run dependent `ifYouDo` segments. Segment-result, event-order, state-hash, and
once-per-turn timing for optional cost accept, decline, and failure are
authoritative in `04-effect-runtime.s011` and `04-effect-runtime.s012`.

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
- cost: restDon
- cost: returnDon
- cost: restSelf
- cost: sequence
- target: self, myLeader, opponentLeader, attacker, attackTarget, blocker,
  triggerCard, all, choose
- duration: thisAction, thisBattle, thisTurn, whileSourceOnField, permanent
- effect: draw
- effect: ko
- effect: modifyPower
- effect: payCost
- effect: sequence
- effect: custom
- card filters: cardIds, names, nameContains, nameNot, categories, colorsAny,
  colorsAll, typesAny, typesAll, attributesAny, attributesAll, cost, power,
  counter, hasKeywords, lacksKeywords, state, owner, controller, excludeSelf,
  custom

Planned/not fixture-authorable until schema coverage exists:

- condition: donCount
- condition: opponentTurn
- condition: lifeCount
- condition: fieldCount
- condition: handCount
- condition: trashCount
- condition: hasCardInZone
- condition: attackTarget
- condition: cardState
- condition: sourceStillInZone
- condition: eventPayload
- condition: and, or, not, custom
- cost: trashFromHand
- cost: trashSelf
- cost: trashFromField
- cost: discard
- cost: chooseOne
- cost: custom
- duration: untilEndOfTurn
- duration: untilStartOfNextTurn
- duration: whileConditionTrue
- effect: drawUpTo
- effect: search
- effect: lookAtTop
- effect: revealFromZone
- effect: revealTop
- effect: selectFromSet
- effect: selectCards
- effect: moveSelected with position
- effect: putRemaining
- effect: shuffleDeck
- effect: bounce
- effect: trash
- effect: play
- effect: playSelected
- effect: returnUnselectedToDeck
- effect: trashFromHand
- effect: setPowerToZero
- effect: setBasePower
- effect: modifyCost
- effect: setBaseCost
- effect: rest
- effect: activate
- effect: giveKeyword
- effect: removeKeyword
- effect: addDon
- effect: attachDon
- effect: returnDon
- effect: addLife
- effect: damage
- effect: invalidateEffects
- effect: protectFromKO
- effect: cannotAttack
- effect: cannotBlock
- effect: cannotBeAttacked
- effect: cannotBeBlockedBy
- effect: choice
- effect: conditional
- effect: forEachMatch
- effect: repeat
- effect: replacement

new fixture-authorable primitives must add schema coverage and validation fixtures in the same story that makes the primitive authorable.

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

## Story Boundary

Own only optional-cost contract/spec/schema/type authority and contract tests. Do not implement engine runtime behavior, card parser support, or generated card support.

## Scope

- define how optional cost clauses are represented inside composed sequence execution
- decide whether optional cost decline uses `PayCostDecision`, `chooseOptionalActivation`, or a new response shape, and make that choice canonical in contracts/spec text
- define valid, declined, failed, stale, malformed, and wrong-player optional-cost response behavior
- define how sequence segment results record `paidCost: true`, `paidCost: false`, and `playerDeclined` for optional cost accept, decline, and failure branches
- define when once-per-turn or other use consumption happens relative to optional cost accept, decline, and failed payment
- define replay, event-order, and state-hash requirements for both accepted and declined optional-cost branches
- explicitly reconcile `05-effect-dsl-reference.s029` with the executable schema for optional `returnDon` cost authorability, either by aligning the spec coverage list to current schema support or by narrowing schema/type support back to the cited supported subset
- add schema/type fixtures or tests proving supported optional-cost contract shapes validate and unsupported ambiguous shapes reject

## Out of Scope

- engine runtime implementation of optional costs
- optional effect-clause runtime implementation
- optional activation runtime implementation beyond contract compatibility
- parser/card support, generated-support admission, real-card fixtures, server, client, API, UI, database, or live Poneglyph work

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/03-game-state-events-decisions.md
- specs/04-effect-runtime.md
- specs/05-effect-dsl-reference.md
- specs/section-index.json
- contracts/canonical-types.ts
- contracts/effect-dsl.schema.json
- contracts/types/decisions.ts
- contracts/types/effects.ts
- packages/types/src/decisions.ts
- packages/types/src/decisions.test.ts
- packages/types/src/effects.ts
- packages/types/src/effects.test.ts
- packages/types/src/export-cohesion.test.ts
- packages/types/src/export-ownership.manifest.ts
- tests/contracts/**
- fixtures/effect-dsl/**
- stories/approved/TYP-009*.yaml
- stories/generated/TYP-009*.yaml
- agent-packets/TYP-009A.md
- agent-packets/TYP-009*-story-review-*.md
- agent-packets/active.json

## Constraints

- do not implement engine runtime behavior in this story
- do not treat contract authorability as runtime support
- fail closed on optional-cost timing, use-consumption, replay, or hidden-information ambiguity
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

- focused contract/type tests for optional-cost representation and response shape
- positive and negative schema fixture validation for optional-cost shapes if schema changes are required
- tests pinning supported decline, failure, stale, malformed, and wrong-player response contracts
- tests or spec-authority guard updates pinning use-consumption, replay, event-order, and state-hash semantics
- run `corepack pnpm run types:sync:check`
- run `corepack pnpm run contracts:validate-effects`
- run `corepack pnpm run test:contracts`
- run `corepack pnpm run stories:validate`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- optional cost clauses have one canonical composed-execution representation
- optional cost decline has one canonical pending-decision/response contract
- segment result recording for optional cost accept, decline, and failure is unambiguous
- use-consumption timing for optional cost accept, decline, and failure is unambiguous
- stale, malformed, wrong-player, and insufficient-payment responses fail closed without consuming hidden information or causing nondeterministic replay
- ENG-055D can cite this story as authority for optional-cost runtime implementation

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
