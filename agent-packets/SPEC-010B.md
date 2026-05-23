<!-- agent-packet:story-id SPEC-010B -->
<!-- agent-packet:story-path stories/approved/SPEC-010B-generated-support-capability-factorization-authority.yaml -->
<!-- agent-packet:story-sha256 7fea34ac00d719554005d65f9dac8ce3d24344090c76b642cf91179841b0bb63 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-010B
Epic ID: SPEC-010
Title: Generated-support capability factorization authority
Type: specification
Area: docs
Primary Concern: rules

## Why

Tighten generated-support policy so parser certification and runtime capability evidence must expose reusable primitive boundaries instead of exact wrapper-body, full-line, full-card, or sample-shaped support evidence.

## Authoritative Spec References

- 00-project-overview.s014 (Card support is explicit)
- 02-engine-mechanics.s024 (Effect categories)
- 03-game-state-events-decisions.s009 (Pending decisions)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s010 (Queue processing)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 04-effect-runtime.s016 (Failure policy)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s005 (Triggers)
- 05-effect-dsl-reference.s006 (Conditions)
- 05-effect-dsl-reference.s007 (Costs)
- 05-effect-dsl-reference.s008 (Targets)
- 05-effect-dsl-reference.s009 (Card filters)
- 05-effect-dsl-reference.s011 (Durations)
- 05-effect-dsl-reference.s012 (Effects)
- 05-effect-dsl-reference.s013 (Sequence connector semantics)
- 05-effect-dsl-reference.s015 (Visibility)
- 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)
- 05-effect-dsl-reference.s029 (Schema coverage policy)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s020 (Poneglyph/card-data tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 00-project-overview.s014 (Card support is explicit)

A card is `vanilla-confirmed`, `implemented-dsl`, `implemented-custom`, `unsupported`, or `banned-in-simulator`. Missing implementations are not silently allowed in normal play.

Common card support does not require a manual per-card allowlist when a certified parser rule completely parses the card's gameplay-relevant text into supported keyword, DSL, or custom behavior and the runtime capability matrix confirms every parsed component is currently supported. Partial, ambiguous, stale, or capability-missing parses remain unsupported for normal play.

Generated support evidence must be primitive-boundary evidence. Full-card or full-effect-line branches are insufficient generated support evidence, and sample-shaped parser evidence is insufficient generated support evidence unless those branches also expose reusable primitive-boundary parser and runtime capability evidence.

### 02-engine-mechanics.s024 (Effect categories)

Every effect is classified as one of:

| Category    | Behavior                                             |
| ----------- | ---------------------------------------------------- |
| Auto        | Queued when an event satisfies its trigger.          |
| Activate    | Player chooses to activate during a legal window.    |
| Permanent   | Contributes modifiers/restrictions to computed view. |
| Replacement | Intercepts a replaceable process before it occurs.   |

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

### 03-game-state-events-decisions.s009 (Pending decisions)

Effects, costs, target selection, optional activation, simultaneous trigger ordering, life triggers, and quantity choices all pause through the same model.

```ts
type PendingDecision =
  | ChooseTriggerOrderDecision
  | ChooseOptionalActivationDecision
  | PayCostDecision
  | SelectTargetsDecision
  | SelectCardsDecision
  | ChooseQuantityDecision
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

interface ChooseQuantityDecision extends BaseDecision {
  type: "chooseQuantity";
  min: number;
  max: number;
  mode: "exact" | "upTo";
  defaultResponse?: ChooseQuantityResponse;
}

interface ChooseQuantityResponse {
  type: "chooseQuantity";
  quantity: number;
}
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

### 04-effect-runtime.s010 (Queue processing)

```ts
function processEffectQueue(state: GameState): EngineResult {
  let allEvents: EngineEvent[] = [];

  while (state.effectQueue.length > 0) {
    const entry = dequeueEffect(state);
    state = markResolving(state, entry.id);

    if (!canQueuedEffectResolve(entry, state)) {
      const cancelled = cancelQueuedEffect(
        state,
        entry,
        "source-or-condition-failed",
      );
      state = cancelled.state;
      allEvents.push(...cancelled.events);
      continue;
    }

    const resolution = executeEffectBlock(state, entry);
    state = resolution.state;
    allEvents.push(...resolution.events);

    const checked = checkRuleProcessingWithEvents(state, {
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlock.id,
      },
    });
    state = checked.state;
    allEvents.push(...checked.events);

    if (state.status.type === "gameOver") {
      return { state, events: allEvents, stateHash: hashState(state) };
    }

    const triggered = detectTriggeredEffects(state, resolution.events);
    state = enqueueTriggeredEffectsRespectingTiming(state, triggered);
  }

  return { state, events: allEvents, stateHash: hashState(state) };
}
```

There is no `return` inside the loop unless the game ends, an unrecoverable error occurs, or a pending decision pauses resolution.

Generic composed execution is represented by a resumable effect execution frame stored in `GameState.effectExecutionFrames`. The frame is serialized authoritative runtime context for one resolving effect and is not a client-facing object. It must track at least the queue entry, effect block, current effect path, next segment index, saved result references, segment results, transient selection sets, and pending-decision continuation. Frame records participate in authoritative canonical serialization and state hashes, but filtered player and live spectator views must not expose frame internals.

When a sequence segment pauses for a `PendingDecision`, the runtime stores the frame and returns the pending decision with the same causality context. After a valid response, resolution resumes from the stored frame at the paused segment rather than restarting earlier segments. Completed earlier segments must not be re-applied, and their saved result references and segment results remain available for later connector decisions.

### 04-effect-runtime.s011 (Conditions and costs)

Before resolving an effect block:

1. Check source presence policy.
2. Re-check condition if the effect requires condition-on-resolution.
3. Check `[Once Per Turn]` usage by `source.instanceId + effectBlock.id + turn`.
4. If activation requires cost, create a `PayCostDecision` when choices are required.
5. Pay cost atomically and emit `costPaid` events.
6. Mark once-per-turn usage only after legal commitment: activation conditions passed, required activation-time targets selected, costs paid, and optional activation accepted. Declined optional effects and failed costs do not consume use; legally committed effects that later fizzle do consume use.

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

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
  | { type: "discard"; count: number; filter?: CardFilter; chooser: PlayerRef }
  | { type: "sequence"; costs: Cost[] }
  | { type: "custom"; action: string };

type OptionalTrashFromHandCost = {
  type: "trashFromHand";
  count: number;
  filter?: CardFilter;
  chooser: PlayerRef;
  optional: true;
};

type ScopedOptionalFieldTrashCostFilter = {
  categories: ["character"];
  typesAny: [string, ...string[]];
};

type ScopedOptionalFieldTrashCost = {
  type: "trashFromField";
  count: number;
  filter: ScopedOptionalFieldTrashCostFilter;
  chooser: "self";
  optional: true;
};

type OptionalChooseOneTrashCostAlternative =
  | OptionalTrashFromHandCost
  | ScopedOptionalFieldTrashCost;

type OptionalChooseOneTrashCost = {
  type: "chooseOne";
  options: [
    OptionalChooseOneTrashCostAlternative,
    ...OptionalChooseOneTrashCostAlternative[],
  ];
  optional: true;
};

type OptionalCost =
  | { type: "restDon"; count: number; chooser?: PlayerRef; optional: true }
  | { type: "returnDon"; count: number; chooser?: PlayerRef; optional: true }
  | { type: "restSelf"; optional: true }
  | OptionalTrashFromHandCost
  | OptionalChooseOneTrashCost
  | { type: "sequence"; costs: Cost[]; optional: true };
```

If paying a cost requires choosing cards or DON!!, the runtime creates a `PayCostDecision`.
Cost primitives outside the schema-supported fixture subset remain planned layers.
Scoped optional choose-one trash costs are authorable only through
`{ type: "payCost"; cost: OptionalCost }` sequence segments and only for the
listed optional trash alternatives. This schema/type authorability does not make
broad `Cost.chooseOne`, non-optional `Cost.trashFromField`, parser support,
runtime payment behavior, generated support, or playability available. Optional
cost behavior must remain separate from optional activation and optional effect
clauses as defined by `04-effect-runtime.s011`.

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

### 05-effect-dsl-reference.s009 (Card filters)

```ts
interface CardFilter {
  cardIds?: CardId[];
  names?: string[];
  nameContains?: string;
  nameNot?: string[];
  categories?: CardCategory[];
  colorsAny?: Color[];
  colorsAll?: Color[];
  typesAny?: string[];
  typesAll?: string[];
  attributesAny?: Attribute[];
  attributesAll?: Attribute[];
  cost?: { op: Comparator; value: number } | { min?: number; max?: number };
  power?: { op: Comparator; value: number } | { min?: number; max?: number };
  counter?: { op: Comparator; value: number } | { min?: number; max?: number };
  hasKeywords?: Keyword[];
  lacksKeywords?: Keyword[];
  state?: "active" | "rested" | "attached";
  owner?: PlayerRef;
  controller?: PlayerRef;
  excludeSelf?: boolean;
  custom?: string;
}
```

### 05-effect-dsl-reference.s011 (Durations)

```ts
type Duration =
  | { type: "thisAction" }
  | { type: "thisBattle" }
  | { type: "thisTurn" }
  | {
      type: "untilEndOfTurn";
      whoseTurn?: "current" | "sourceController" | "targetController";
    }
  | { type: "untilStartOfNextTurn"; player: PlayerRef }
  | { type: "whileSourceOnField" }
  | { type: "whileConditionTrue"; condition: Condition }
  | { type: "permanent" };
```

Use `permanent` sparingly. Field buffs should normally be `whileSourceOnField` or a timing duration.
Duration primitives not listed in the schema-supported fixture subset are contract-defined planned layers until schema coverage, validation fixtures, and runtime capability evidence are added.

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

Synthetic terminology example:

- wrapper: `[Activate: Main]` activation wrapper
- category: `activate`
- source-presence policy: `mustRemainInSameZone`
- markers: `[Once Per Turn]`
- body primitive: `{ type: "ko", target: ... }`

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

### 05-effect-dsl-reference.s015 (Visibility)

```ts
type Visibility =
  | "bothPlayers"
  | "chooserOnly"
  | "ownerOnly"
  | "controllerOnly"
  | "hidden"
  | "replayOnly";
```

### 05-effect-dsl-reference.s022 (Poneglyph text-to-DSL pipeline)

The effect-system plan supports three authoring paths:

1. Manual DSL definitions written by developers.
2. Custom TypeScript handlers for cards that cannot be expressed in DSL.
3. Generated DSL from Poneglyph printed card text when certified parser rules produce a complete parse and runtime capability checks pass.

Support ladder:

1. `contract-defined`: a primitive or behavior is described by the Markdown spec or canonical TypeScript contract.
2. `schema-authorable`: `contracts/effect-dsl.schema.json` can validate JSON fixtures for that primitive.
3. `runtime-executable`: the current runtime capability matrix proves the engine can execute the primitive, including decisions, visibility, replay, failure policy, and pause/resume behavior.
4. `parser-certified`: reviewed parser rules produce a complete parse for the relevant printed text shape.
5. `generated-support playable`: a generated support record may enable normal play only when the parse is complete and every parsed component has current runtime capability evidence.

Schema authorability alone is insufficient for generated-support playable status. Generated support requires runtime capability evidence and complete parser support; schema validation only proves a JSON shape can be authored.

This section is a terminology-only clarification and does not define generated-support evidence factorization rules; support-evidence factorization remains in SPEC-010B.

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

Authority tests must assert generated-support factorization wording per cited section. Each required section is asserted independently; one section cannot satisfy another section's required wording.

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

Own only generated-support policy wording, explicit synthetic examples, generated spec metadata, and authority tests for evidence factorization. Do not change parser code, runtime capability records, generated-support metadata, contracts, schema, engine behavior, or card support.

## Scope

- define generated-support component evidence as primitive-boundary evidence, not exact printed-line evidence
- require parser certification evidence to expose stable primitive-boundary evidence for wrapper or entry point, markers, conditions, costs, body effects, targets, filters, cardinality, durations, visibility, source-presence policy, and composition when each is present
- require runtime capability evidence to prove reusable runtime behavior for those same primitive boundaries, decision or response semantics, and any necessary composition semantics
- state that composition evidence may be required for a supported combined shape, but composition evidence cannot replace missing wrapper, body, cost, target, condition, duration, source policy, decision, or visibility evidence
- state that exact full-card branches, exact full-effect-line branches, wrapper-body allowlists, and sample-shaped parser rules are insufficient generated-support evidence unless they also produce the required primitive evidence
- clarify that a supported effect body under one entry point does not automatically make it supported under every entry point; support requires both the entry-point adapter evidence and the body/composition evidence
- include explicit synthetic positive examples for one reusable body composed under multiple entry points and explicit negative examples for exact wrapper-body evidence that does not expose primitive boundaries
- add or update authority tests that pin capability factorization and negative-example wording
- update generated spec metadata

## Out of Scope

- runtime capability matrix implementation changes
- parser implementation changes
- generated-support evaluator or support-probe behavior changes
- contract/schema changes
- real-card fixture capture, overlays, source hashes, behavior hashes, support metadata, or card promotion
- adding support for additional primitives, wrappers, entry points, or complete effect lines

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/00-project-overview.md
- specs/04-effect-runtime.md
- specs/05-effect-dsl-reference.md
- specs/09-card-data-and-support-policy.md
- specs/11-testing-quality.md
- specs/source-coverage-matrix.md
- specs/section-index.json
- specs/spec-manifest.json
- specs/SPEC_VERSION.md
- tests/contracts/spec-authority-gates.test.mjs
- stories/generated/SPEC-010B-generated-support-capability-factorization-authority.yaml
- stories/approved/SPEC-010B-generated-support-capability-factorization-authority.yaml
- agent-packets/SPEC-010B.md
- agent-packets/active.json

## Constraints

- do not change runtime, schema, parser, generated-support, support-probe, or card behavior in this story
- preserve generated-support fail-closed policy for unparsed, ambiguous, stale, unsupported, or missing-capability components
- fail closed on generated-support evidence ambiguity
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

- update `tests/contracts/spec-authority-gates.test.mjs` to require stable primitive-boundary parser evidence including visibility when present, primitive-boundary runtime capability evidence including decision or response semantics when present, composition evidence limits, and negative examples for non-modular support evidence
- update `tests/contracts/spec-authority-gates.test.mjs` to require cross-entry-point wording that body support under one entry point does not authorize another entry point without separate entry-point adapter evidence plus body or composition evidence
- run `corepack pnpm run specs:generate-metadata`
- run `corepack pnpm run specs:verify-metadata`
- run `corepack pnpm run test:contracts`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- generated-support specs explicitly require primitive-boundary parser certification evidence
- generated-support specs explicitly require primitive-boundary runtime capability evidence, including decision or response and visibility boundaries when present, plus necessary composition evidence
- generated-support specs explicitly reject exact full-card, full-line, wrapper-body-only, and sample-shaped evidence as sufficient for generated support
- generated-support specs explicitly define that composition evidence supplements but does not replace missing primitive evidence
- generated-support specs explicitly say support for an effect body under one entry point does not authorize support under another entry point without separate entry-point adapter evidence plus body or composition evidence
- synthetic positive and negative examples make the modular evidence shape unambiguous without naming real cards or card IDs
- authority tests pin the new factorization and negative-example wording

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
