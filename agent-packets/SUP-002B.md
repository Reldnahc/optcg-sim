<!-- agent-packet:story-id SUP-002B -->
<!-- agent-packet:story-path stories/approved/SUP-002B-optional-hand-trash-cost-filtered-ko-runtime.yaml -->
<!-- agent-packet:story-sha256 986f4c3dfab1f445e1a1e00ae67e68e9662cc69c97fd426f309c136bbd6071ca -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SUP-002B
Epic ID: SUP-002
Title: Optional hand-trash cost into filtered K.O. runtime
Type: implementation
Area: engine
Primary Concern: rules

## Why

Execute reusable sequence effects where an optional hand-trash cost gates a later filtered target selection and saved-target K.O. continuation.

## Authoritative Spec References

- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s027 (Impossible actions)
- 02-engine-mechanics.s029 (Negative power)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s012 (Cost payment)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 04-effect-runtime.s004 (Stable effect identity)
- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 05-effect-dsl-reference.s006 (Conditions)
- 05-effect-dsl-reference.s007 (Costs)
- 05-effect-dsl-reference.s012 (Effects)
- 05-effect-dsl-reference.s013 (Sequence connector semantics)
- 06-visibility-security.s004 (PlayerView shape)
- 06-visibility-security.s005 (Temporary visibility)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

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

### 02-engine-mechanics.s027 (Impossible actions)

If a required part of an effect is impossible, skip that impossible part unless the effect block says it requires all parts. Default policy is do as much as possible.

### 02-engine-mechanics.s029 (Negative power)

Power may be negative. Negative power does not automatically remove a card.

### 03-game-state-events-decisions.s005 (Event journal)

Every atomic mutation emits events. Trigger detection consumes events, not actions.

Event sequencing is part of the replay and state-hash contract:

- EngineResult.events from one accepted transition must be strictly increasing by
  `seq`.
- The final `state.eventJournal` must be strictly increasing by `seq`.
- Event `seq` values must be allocated by append order.
- Helpers must not create multiple events in one `push` call when event IDs or seq values depend on `events.length`; append events one at a time or use an
  equivalent allocator that observes the already-appended event count.

```ts
interface EngineEvent {
  id: EngineEventId;
  seq: number;
  type: EngineEventType;
  actor?: PlayerId;
  source?: CardRef;
  affected?: CardRef[];
  payload: unknown;
  causedBy?: CausalityRef;
  visibility: EventVisibility;
  createdAtStateSeq: StateSeq;
}

type EngineEventType =
  | "phaseStarted"
  | "phaseEnded"
  | "cardRevealed"
  | "cardMoved"
  | "cardPlayed"
  | "cardDrawn"
  | "cardDiscarded"
  | "cardTrashed"
  | "cardKOd"
  | "cardReturned"
  | "donAttached"
  | "donReturned"
  | "costPaid"
  | "attackDeclared"
  | "blockerActivated"
  | "counterUsed"
  | "damageWouldBeDealt"
  | "damageDealt"
  | "lifeTaken"
  | "triggerActivated"
  | "effectQueued"
  | "effectResolved"
  | "replacementApplied"
  | "decisionCreated"
  | "decisionResolved"
  | "ruleProcessingChecked"
  | "gameEnded";
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

### 04-effect-runtime.s004 (Stable effect identity)

Every effect block has a stable ID. Never key `[Once Per Turn]` by array index.

```ts
interface EffectBlock {
  id: string; // e.g. "OP01-001:auto-1" or "OP01-040:activate-main-1"
  trigger: Trigger;
  category: EffectCategory;
  condition?: Condition;
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}
```

The `id` should remain stable across definition edits unless the effect's identity truly changes.

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

A saved field-object reference is the runtime contract for same-frame `selectedTargets` and `producedObjects` consumers in the same effect execution frame. `selectedTargets` production records the public field objects legally selected by a non-mutating `selectTargets` request segment in the segment result and saved-reference ledger; mutating target effects are not standalone selectedTargets producer authority. `producedObjects` records public field objects produced by a supported segment when the runtime story for that producer explicitly authorizes the produced-object family. Saved hand-selection/playSelected references remain separate from saved field-object references and must not be consumed as field-object targets.

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

### 05-effect-dsl-reference.s006 (Conditions)

```ts
type Condition =
  | { type: "donCount"; target?: Target; min: number }
  | { type: "yourTurn" }
  | { type: "opponentTurn" }
  | { type: "lifeCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "fieldCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | { type: "handCount"; player: PlayerRef; op: Comparator; value: number }
  | {
      type: "trashCount";
      player: PlayerRef;
      filter?: CardFilter;
      op: Comparator;
      value: number;
    }
  | {
      type: "leaderColorCount";
      player: PlayerRef;
      op: Comparator;
      value: number;
    }
  | { type: "hasCardInZone"; zone: Zone; player: PlayerRef; filter: CardFilter }
  | { type: "attackTarget"; targetType: "leader" | "character" | "any" }
  | { type: "cardState"; target: Target; state: "active" | "rested" }
  | { type: "sourceStillInZone" }
  | { type: "eventPayload"; path: string; op: Comparator; value: unknown }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition }
  | { type: "custom"; check: string };

type Comparator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
type PlayerRef =
  | "self"
  | "opponent"
  | "turnPlayer"
  | "nonTurnPlayer"
  | "owner"
  | "controller";
```

`leaderColorCount` is a public Leader metadata condition. It reads only the
player's Leader colors from the match manifest or resolved card snapshot, uses a
canonical `PlayerRef` and `Comparator`, and its `value` is a non-negative safe
integer. Printed "multicolored" Leader conditions map to
`{ type: "leaderColorCount", player: "self", op: "gte", value: 2 }`.

Leader type and Leader attribute conditions do not introduce `leaderType` or
`leaderAttribute` predicates. Represent them through the public Leader Area with
`hasCardInZone` and `CardFilter`, for example
`{ type: "hasCardInZone", zone: "leaderArea", player: "self", filter: { categories: ["leader"], typesAny: ["Straw Hat Crew"] } }`
or
`{ type: "hasCardInZone", zone: "leaderArea", player: "self", filter: { categories: ["leader"], attributesAny: ["slash"] } }`.
The schema-supported fixture subset admits only this public Leader-zone metadata
form and does not authorize private-zone metadata queries.

Condition, duration, and restriction primitives outside the schema-supported fixture subset remain planned layers. They are contract-defined by this reference, but they are not fixture-authorable until the schema coverage policy lists them as supported.

For public DON-on-field count authorability, use existing `fieldCount` with a
DON filter (`filter.categories` containing `"don"`), canonical comparator, and
non-negative threshold. In this DON filter form, schema fixtures support
`player: "self"` and `player: "opponent"` only, and reject free-text shortcuts.
This is contract/schema authorability evidence only and does not by itself imply
runtime executable support, parser certification, generated support, or card
playability.

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
  | {
      type: "trashFromHand";
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
      optional: true;
    }
  | { type: "sequence"; costs: Cost[]; optional: true };
```

If paying a cost requires choosing cards or DON!!, the runtime creates a `PayCostDecision`.
Cost primitives outside the schema-supported fixture subset remain planned layers. Optional cost behavior must remain separate from optional activation and optional effect clauses as defined by `04-effect-runtime.s011`.

### 05-effect-dsl-reference.s012 (Effects)

```ts
type Effect =
  // Card movement
  | { type: "draw"; count: number; player: PlayerRef }
  | { type: "drawUpTo"; count: number; player: PlayerRef }
  | { type: "search"; request: SearchRequest }
  | { type: "lookAtTop"; player: PlayerRef; count: number }
  | {
      type: "revealFromZone";
      player: PlayerRef;
      zone: Zone;
      count?: number;
      filter?: CardFilter;
      to: Visibility;
    }
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: Zone | SelectionSetId;
      to: Zone;
      position?: "top" | "bottom";
    }
  | {
      type: "putRemaining";
      zone: Zone;
      position: "top" | "bottom";
      order: "ownerChoice" | "chooserChoice" | "random";
    }
  | { type: "shuffleDeck"; player: PlayerRef }
  | {
      type: "bounce";
      target: Target;
      destination: "hand" | "deckTop" | "deckBottom";
    }
  | { type: "trash"; target: Target }
  | { type: "ko"; target: Target }
  | {
      type: "play";
      source: Zone;
      player: PlayerRef;
      filter: CardFilter;
      costModifier?: number;
    }
  | {
      type: "trashFromHand";
      player: PlayerRef;
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }
  | { type: "payCost"; cost: OptionalCost }

  // Power/cost modification
  | { type: "modifyPower"; target: Target; value: number; duration: Duration }
  | { type: "setPowerToZero"; target: Target; duration: Duration }
  | { type: "setBasePower"; target: Target; value: number; duration: Duration }
  | {
      type: "modifyCost";
      filter: CardFilter;
      value: number;
      duration: Duration;
      player: PlayerRef;
    }
  | { type: "setBaseCost"; target: Target; value: number; duration: Duration }

  // State and keywords
  | { type: "rest"; target: Target }
  | { type: "activate"; target: Target }
  | {
      type: "giveKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }
  | {
      type: "removeKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }

  // DON!!
  | { type: "addDon"; count: number; player: PlayerRef }
  | { type: "attachDon"; target: Target; count: number; player: PlayerRef }
  | { type: "returnDon"; count: number; player: PlayerRef }

  // Life and damage
  | {
      type: "addLife";
      count: number;
      player: PlayerRef;
      source: "deck" | "hand" | "trash";
      faceUp?: boolean;
    }
  | { type: "damage"; target: "leader"; player: PlayerRef; count: number }

  // Restrictions/protections
  | { type: "invalidateEffects"; target: Target; duration: Duration }
  | { type: "protectFromKO"; target: Target; duration: Duration }
  | { type: "cannotAttack"; target: Target; duration: Duration }
  | { type: "cannotBlock"; target: Target; duration: Duration }
  | { type: "cannotBeAttacked"; target: Target; duration: Duration }
  | {
      type: "cannotBeBlockedBy";
      target: Target;
      filter: CardFilter;
      duration: Duration;
    }

  // Composition
  | { type: "sequence"; effects: SequencedEffect[] }
  | {
      type: "choice";
      chooser: PlayerRef;
      options: EffectOption[];
      min: number;
      max: number;
    }
  | { type: "conditional"; if: Condition; then: Effect; else?: Effect }
  | {
      type: "forEachMatch";
      zone: Zone;
      player: PlayerRef;
      filter: CardFilter;
      effect: Effect;
    }
  | { type: "repeat"; count: number; effect: Effect }

  // Replacement/custom
  | { type: "replacement"; when: ReplacementTrigger; instead: Effect }
  | { type: "custom"; handler: string };
```

Cardinality fields such as `min` and `max` use the exact-N and up-to-N semantics from `03-game-state-events-decisions.s017`. `drawUpTo` is a planned `chooseQuantity`-backed primitive: it must pause through a `chooseQuantity` pending decision, validate the selected whole integer against public min/max bounds, and draw only the chosen amount when a future runtime story makes it executable.

`drawUpTo` short-deck resolution is do-as-much-as-possible. If the chosen quantity is greater than the number of cards remaining in that player's deck, the runtime must draw every remaining card and emit draw and card-movement events only for cards actually drawn. The next rule-processing checkpoint detects deck-out under `02-engine-mechanics.s035`; the effect does not fail closed before drawing the remaining cards solely because the chosen quantity exceeded the remaining deck size.

Event `seq` values for partial-deck drawUpTo resolution must remain strictly increasing by append order, as required by `03-game-state-events-decisions.s005`. The resolved decision increments `state.seq` once under `03-game-state-events-decisions.s022`; individual draw events do not each advance `state.seq`. State hashes at the replay checkpoints include the post-draw empty deck. Golden replay coverage for drawUpTo short-deck cases must pin the final state hash.

Duration and restriction effects such as `cannotAttack`, `cannotBlock`, `cannotBeAttacked`, `cannotBeBlockedBy`, `invalidateEffects`, and `protectFromKO` remain planned unless the schema coverage policy lists them as schema-supported and the runtime capability matrix proves the active engine can enforce the restriction for the full duration.

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

A saved field-object reference is a same-frame saved-reference family for later text such as "that Character". The supported field-object families are `selectedTargets` and `producedObjects`; `selectedCards`, `paidCost`, `SelectionSetId`, `SelectionId`, and saved hand-selection references are separate families and are not field-object target references. A segment with `saveResultAs` may expose `selectedTargets` when it legally selected field objects through a target request, and may expose `producedObjects` when a supported runtime story later creates or moves a public field object and records that object as produced by the segment.

A later segment consumes a saved field-object reference with `{ type: "savedFieldObject", binding: { family: "selectedTargets" | "producedObjects", saveResultAs, objectIndex?, sourceSegmentId? }, zone, player, controller?, filter?, visibility: "publicOnly", onFailure: "failClosed" }`. The reference is valid only inside the same effect execution frame, only for the named `saveResultAs` ledger entry, and only while the referenced object remains a public legal object for the later instruction. unsupported saved-reference families fail closed. stale objects, gone objects, hidden objects, and illegal objects fail closed. Public events, public legal actions, PlayerView, and SpectatorView must not reveal hidden identities or the private saved-reference failure reason. State hashes include the frame saved-reference ledger and the failed segment result so replay, event order, and connector decisions remain deterministic.

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

### 06-visibility-security.s005 (Temporary visibility)

Some events reveal hidden cards temporarily.

| Event                    | Who sees                                        | Duration                                       |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------- |
| Playing card from hand   | Both players                                    | Reveal through placement/resolution            |
| Counter card from hand   | Both players                                    | Reveal through trash/effect resolution         |
| Activated life trigger   | Both players                                    | Reveal through trigger resolution              |
| Declined life trigger    | Nobody except server                            | Never shown                                    |
| Search/look at deck      | Searching player only unless effect says reveal | During effect resolution                       |
| Effect reveals hand/life | As specified by effect                          | During effect resolution or specified duration |
| Trash from hidden zone   | Public once in trash                            | From arrival in trash onward                   |

```ts
interface RevealRecord {
  id: string;
  card: CardRef;
  sourceZone: Zone;
  reason:
    | "play"
    | "counter"
    | "trigger"
    | "search"
    | "lookAt"
    | "effect"
    | "trash";
  visibleTo: "both" | PlayerId[] | "replayOnly";
  expires: RevealExpiration;
}
```

The engine must remove expired `RevealRecord`s as part of effect cleanup.

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

Engine runtime story only. Do not add card parser/generated-support behavior, real-card fixture evidence, support manifests, source hashes, behavior hashes, or contract changes beyond consuming SUP-002A.

## Scope

- support optional `payCost` sequence segments whose cost is `trashFromHand` with player self, chooser self, no filter, and positive integer count
- create a private pay-cost decision with payment and decline legal responses that do not leak hand candidates to the opponent
- on payment, move selected hand cards to trash with deterministic public events and record `paidCost: true`
- on decline or failed payment, record `paidCost: false`, set player-declined evidence, and skip dependent `ifYouDo` segments
- support filtered `selectTargets` sequence segments for opponent character-area targets with reusable CardFilter cost maximums
- support saved-target K.O. continuation after filtered target selection, including zero-target legal resolution for `up to 1`
- preserve existing optional rest/return DON cost behavior and existing trashFromHand effect behavior

## Out of Scope

- shared contract/schema changes beyond consuming SUP-002A
- card parser, generated-support, runtime capability matrix, support reports, fixtures, overlays, card IDs, source hashes, or behavior hashes
- optional hand-trash costs with filters, opponent hand trash, discard aliases, arbitrary zones, or multi-cost choose-one logic
- broad target filters beyond opponent Characters with cost min/max support already represented in CardFilter
- base-cost modifier rules beyond current manifest/base cost values
- server, client, UI, database, API, or live card-data work

## Allowed Touch Points

<!-- prettier-ignore -->
- stories/generated/SUP-002B-optional-hand-trash-cost-filtered-ko-runtime.yaml
- stories/approved/SUP-002B-optional-hand-trash-cost-filtered-ko-runtime.yaml
- agent-packets/SUP-002B.md
- agent-packets/active.json
- packages/engine-core/src/effect-runtime-sequence-support.ts
- packages/engine-core/src/effect-runtime-sequence-frame-decisions.ts
- packages/engine-core/src/effect-runtime-sequence-frames.ts
- packages/engine-core/src/effect-runtime-sequence-select-cards.ts
- packages/engine-core/src/effect-runtime-sequence-select-targets.ts
- packages/engine-core/src/effect-runtime-sequence-select-targets.test.ts
- packages/engine-core/src/effect-runtime-sequence-saved-field-object.ts
- packages/engine-core/src/effect-runtime-sequence-saved-field-object.test.ts
- packages/engine-core/src/effect-runtime-cost-hand-selection.test.ts
- packages/engine-core/src/effect-runtime-optional-hand-trash-cost.test.ts
- packages/engine-core/src/effect-runtime-sequence-frames.test.ts
- packages/engine-core/src/optional-activation-actions.ts
- packages/engine-core/src/target-selection.ts
- packages/engine-core/src/target-selection-actions.ts
- packages/engine-core/src/target-selection-actions.test.ts

## Constraints

- implement only SUP-002B while its packet is active
- do not activate or implement SUP-002B until SUP-002A has landed as reviewed prerequisite evidence on the active parent integration branch
- keep engine-core free of cards package imports and live card-data adapters
- stop and split if filtered target selection requires new shared contract fields
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

- engine test for optional hand-trash cost accept records paidCost true and runs filtered target K.O.
- engine test for optional hand-trash cost decline records paidCost false and skips filtered target/K.O.
- engine test for zero legal K.O. targets after paid cost resolves without selecting a target
- engine test varying the cost threshold to prove no exact `5 or less` branch
- engine hidden-information/view test for private hand candidates and public trashed-card events
- engine malformed/stale/forged response tests for payment and target decisions
- deterministic event-order and state-hash tests for optional hand-trash accept, decline, malformed/failure, and saved-target K.O. continuation branches
- `corepack pnpm --filter @optcg/engine-core test`
- `corepack pnpm run stories:validate`
- `corepack pnpm run packets:verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- optional hand-trash cost payment and decline both resolve deterministically through the sequence frame model
- `ifYouDo` effects after optional hand-trash cost run only when the hand-trash cost was paid
- filtered select-target sequence segments can choose up to one opponent Character with cost less than or equal to a variable threshold
- runtime shape is generic enough for the later cards-layer capability evidence ID `selectTargets:field:public:character:max1:cost-max` so cards-layer support can distinguish generic Character selection from cost-filtered Character selection; this engine story does not edit the cards runtime-capability matrix
- saved-target K.O. consumes only the selected target reference and does not reselect or hardcode the printed sentence
- legal actions and player views do not reveal private hand candidates to the opponent
- malformed, duplicate, wrong-player, stale, wrong-count, and insufficient-card responses fail closed without mutation
- no engine code imports `@optcg/cards` or checks real card IDs or exact printed text

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
