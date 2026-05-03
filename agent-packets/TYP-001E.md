<!-- agent-packet:story-id TYP-001E -->
<!-- agent-packet:story-path stories/approved/TYP-001E-decision-action-and-legal-action-contracts.yaml -->
<!-- agent-packet:story-sha256 acf93878ab4f3bd3e2d69bcae3391e36a449850af53a2d0c28819db641edfcc5 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-001E
Epic ID: M1-001
Title: Add decision, response, action, and legal-action contracts
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Add the canonical pure-data decision and action contracts after their card, event, and effect support contracts exist.

## Authoritative Spec References

- 03-game-state-events-decisions.s009 (Pending decisions)
- 03-game-state-events-decisions.s010 (Trigger order)
- 03-game-state-events-decisions.s011 (Optional activation)
- 03-game-state-events-decisions.s012 (Cost payment)
- 03-game-state-events-decisions.s013 (Targets/cards)
- 03-game-state-events-decisions.s014 (Life trigger)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s009 (Pending decisions)

Effects, costs, target selection, optional activation, simultaneous trigger ordering, and life triggers all pause through the same model.

```ts
type PendingDecision =
  | ChooseTriggerOrderDecision
  | ChooseOptionalActivationDecision
  | PayCostDecision
  | SelectTargetsDecision
  | SelectCardsDecision
  | ChooseEffectOptionDecision
  | ConfirmLifeTriggerDecision
  | OrderCardsDecision
  | MulliganDecision
  | DeclareLoopCountDecision
  | RollbackConsentDecision;

interface BaseDecision {
  id: string;
  type: string;
  playerId: PlayerId;
  prompt: string;
  causedBy: CausalityRef;
  timeoutMs?: number;
  defaultResponse?: DecisionResponse;
  visibility: EventVisibility;
}
```

### 03-game-state-events-decisions.s010 (Trigger order)

```ts
interface ChooseTriggerOrderDecision extends BaseDecision {
  type: "chooseTriggerOrder";
  triggerIds: string[];
  constraints: {
    mustUseAll: true;
  };
}
```

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
```

### 03-game-state-events-decisions.s013 (Targets/cards)

```ts
interface SelectTargetsDecision extends BaseDecision {
  type: "selectTargets";
  request: TargetRequest;
  candidates: TargetCandidate[];
}

interface SelectCardsDecision extends BaseDecision {
  type: "selectCards";
  request: CardSelectionRequest;
  candidates: CardSelectionCandidate[];
}
```

### 03-game-state-events-decisions.s014 (Life trigger)

```ts
interface ConfirmLifeTriggerDecision extends BaseDecision {
  type: "confirmLifeTrigger";
  card: CardRef;
  options: ["activateTrigger", "addToHand"];
}
```

### 03-game-state-events-decisions.s015 (Legal actions)

`getLegalActions()` should return actions valid for the current game state and current pending decision.

```ts
function getLegalActions(state: GameState, playerId: PlayerId): LegalAction[] {
  if (state.pendingDecision) {
    return legalResponsesForDecision(state.pendingDecision, playerId, state);
  }

  return legalPhaseActions(state, playerId);
}
```

Legal actions sent to a client must not leak hidden information. For example, the opponent should not receive an action list that implies exactly which hidden counter cards exist.

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
chooseEffectOption
confirmTriggerFromLife
chooseReplacement
orderCards
chooseCharacterToTrashForOverflow
```

Decision IDs are single-use. A response for an old decision ID is stale unless it is an exact idempotent retry already accepted by the match server.

### 22-v6-implementation-tightening.s006 (2. TypeScript model)

The old `16-typescript-interface-draft.md` was a draft and referenced undefined symbols. The implementation contract is now `contracts/canonical-types.ts`.

Resolved and normalized items include:

- `Color` -> `CardColor`
- `Attribute`
- `ZoneRef`
- `MatchCardManifest`
- `RngState`
- `EffectQueueEntry`
- `ContinuousEffect`
- `EventVisibility`
- `CardRef`
- `DecisionResponse`
- `Cost`
- `PaymentOption`
- `TargetRequest`
- `CardSelectionRequest`
- `EffectOption`
- `PublicEffectEvent` replacement via filtered `EngineEvent[]`
- `eventLog`/`eventJournal` conflict resolved to `eventJournal`
- `activeBattle`/`battle` conflict resolved to `battle`
- serializable arrays instead of `Set`

The contract compiles with:

```bash
cd contracts
tsc -p tsconfig.json
```

## Story Boundary

Own only pending-decision, decision-response, action, legal-action, and directly required decision/action support type exports. Do not implement decision creation, legality computation, action application, protocol envelopes, CLI parsing, client prompts, timers, or effect execution.

## Scope

- export canonical decision/action support contracts directly required for compile-ready decisions and actions: `TargetCandidate`, `CardSelectionCandidate`, `PaymentSpec`, and `PaymentOption`
- export canonical decision response contracts covering every `DecisionResponse` variant: `orderedIds`, `optionalActivation`, `payment`, `targets`, `cards`, `effectOption`, `lifeTrigger`, `replacement`, `mulligan`, `loopCount`, and `rollbackConsent`
- export canonical decision interfaces: `BaseDecision`, `ChooseTriggerOrderDecision`, `ChooseOptionalActivationDecision`, `PayCostDecision`, `SelectTargetsDecision`, `SelectCardsDecision`, `ChooseEffectOptionDecision`, `ConfirmLifeTriggerDecision`, `OrderCardsDecision`, `MulliganDecision`, `DeclareLoopCountDecision`, `RollbackConsentDecision`, `ChooseReplacementDecision`, and `PendingDecision`
- export canonical action contracts covering every `Action` variant: `playCard`, `activateEffect`, `attachDon`, `declareAttack`, `activateBlocker`, `useCounter`, `endMainPhase`, `concede`, and `respondToDecision`, plus `LegalAction`
- ensure `respondToDecision` actions reference typed `DecisionResponse` data
- add package-local type tests for representative decision and action shapes

## Out of Scope

- legal response computation
- legal-action generation
- action validation or application
- match-server action envelopes or WebSocket protocol DTOs
- public/player-facing legal-action projection, hidden-info filtering, or `PublicLegalAction` DTOs
- CLI command parsing or prompt rendering
- effect queue processing behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/**

## Constraints

- fail closed on ambiguous decision categories
- keep engine action contracts transport-free
- do not add runtime behavior to `@optcg/types`
- must pass `corepack pnpm run verify`

## Required Tests

- package type test compiling one fixture for every canonical decision interface
- package type test compiling one fixture for every canonical `DecisionResponse` variant, including `loopCount`
- package type test compiling representative payment, target, card-selection, and effect-option decision support contracts
- package type test compiling one fixture for every canonical `Action` variant
- package type test compiling the `respondToDecision` action with a typed decision response
- package negative type tests proving transport envelope fields such as `clientActionId`, `expectedStateSeq`, `actionHash`, `sentAtClientTime`, `matchId`, and `signature` are rejected from `Action` and `LegalAction`
- package type test proving `LegalAction` is assignable-equivalent to `Action` and does not introduce a separate shape

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- decision and action contracts are pure data and contain no server transport envelope fields
- `respondToDecision` can be expressed without cross-story type gaps
- later engine stories can import action and decision contracts without importing server or client code
- story follows `contracts/canonical-types.ts` exactly where older prose differs; do not introduce stale non-canonical decision families such as `chooseCharacterToTrashForOverflow`, and use canonical `confirmLifeTrigger`

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
