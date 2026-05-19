<!-- agent-packet:story-id TYP-012A -->
<!-- agent-packet:story-path stories/approved/TYP-012A-field-removal-protection-contract-shape.yaml -->
<!-- agent-packet:story-sha256 586145cc5ff49f4d4a9eb9ccfc63d24b7ed95e855862e8425f7356b08a3fc9b5 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-012A
Epic ID: TYP-012
Title: Field-removal protection contract shape
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Extend canonical type contracts so protection metadata can express reusable field-removal protection against opponent effects without conflating battle K.O., rule-process trash, costs, controller-owned effects, or custom ambiguous processes.

## Authoritative Spec References

- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s038 (Rule-process trashing is not effect trashing)
- 03-game-state-events-decisions.s003 (Base state vs. computed view)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s013 (Replacement effects)
- 04-effect-runtime.s014 (Continuous effects as computed view)
- 05-effect-dsl-reference.s012 (Effects)
- 05-effect-dsl-reference.s016 (Replacement triggers)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 02-engine-mechanics.s021 (Damage Step)

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

### 02-engine-mechanics.s038 (Rule-process trashing is not effect trashing)

Two common rule processes do not generate normal K.O./trash triggers:

- Playing a sixth Character requires trashing one existing Character before the new Character is played.
- Playing a new Stage trashes the existing Stage first.

These are rule processes, not card effects. Do not emit ordinary K.O./trash triggers unless official rulings require a specific exception.

### 03-game-state-events-decisions.s003 (Base state vs. computed view)

Separate base facts from derived values.

Base state stores:

- Which cards are in which zones.
- Active/rested state.
- Attached DON!! cards.
- Turn, phase, battle sub-step.
- Effect durations and source references.
- Pending decisions.

Computed view derives:

- Current power.
- Current cost.
- Granted/removed keywords.
- Attack/block restrictions.
- Protection from K.O. or other processes.
- Replacement candidates.

```ts
interface ComputedGameView {
  seq: StateSeq;
  turnPlayerId: PlayerId;
  cards: Record<InstanceId, ComputedCardView>;
  legalAttackTargets: Record<InstanceId, InstanceId[]>;
  restrictions: RestrictionIndex;
}

interface ComputedCardView {
  instanceId: InstanceId;
  cardId: CardId;
  basePower?: number;
  currentPower?: number;
  baseCost?: number;
  currentCost?: number;
  keywords: Keyword[];
  canAttack: boolean;
  canBlock: boolean;
  cannotBeAttacked: boolean;
  protectedFrom: Protection[];
}
```

Do not persist derived current power as canonical state unless a rule explicitly changes a base value. Recompute from base state and continuous modifiers.

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

### 04-effect-runtime.s013 (Replacement effects)

Replacement effects intercept replaceable processes.

```ts
interface ReplacementProcess {
  id: string;
  type: ReplaceableProcessType;
  source?: CardRef;
  target?: CardRef;
  payload: unknown;
  causedBy: CausalityRef;
  usedReplacementIds: string[];
}
```

Processing order:

1. Replacements generated by the card/process being replaced, if applicable.
2. Turn player's applicable replacements in chosen order.
3. Non-turn player's applicable replacements in chosen order.

A replacement cannot apply twice to the same replacement process. If a replacement cannot actually perform its replacement, it does not apply.

```ts
function executeReplaceableProcess(
  state: GameState,
  process: ReplacementProcess,
): EngineStepResult {
  let current = process;
  let currentState = state;

  while (true) {
    const replacements = findApplicableReplacements(currentState, current)
      .filter((r) => !current.usedReplacementIds.includes(r.id))
      .filter((r) => canApplyReplacement(r, currentState, current));

    if (replacements.length === 0) {
      return executeUnreplacedProcess(currentState, current);
    }

    const choice = chooseReplacementByPriorityOrDecision(
      currentState,
      replacements,
      current,
    );

    if (choice.pausedForDecision) {
      return choice.result;
    }

    if (!choice.chosen) {
      return executeUnreplacedProcess(currentState, current);
    }

    current = {
      ...transformProcessByReplacement(choice.chosen, currentState, current),
      usedReplacementIds: [...current.usedReplacementIds, choice.chosen.id],
    };

    currentState = emitReplacementApplied(
      currentState,
      choice.chosen,
      current,
    ).state;
  }
}
```

Replacement decisions use `PendingDecision.chooseReplacement`. Optional replacements may be declined; mandatory replacements cannot be declined unless more than one mandatory replacement requires a controller-chosen order. A replacement cannot apply twice to the same `process.id`, even if the process is transformed into a new shape.

Every applied replacement emits `replacementApplied` with the original process ID, selected replacement ID, old process payload hash, and transformed process payload hash. This event is at least `replayOnly` and may be public when the replacement effect is public.

### 04-effect-runtime.s014 (Continuous effects as computed view)

Continuous and permanent effects do not mutate canonical state on every recalculation. They generate modifiers, and a computed view applies them.

```ts
interface ContinuousEffectRecord {
  id: string;
  source: CardRef;
  sourceSnapshot: CardSnapshot;
  controller: PlayerId;
  modifier: Modifier;
  duration: Duration;
  condition?: Condition;
  createdBy: CausalityRef;
  createdAtStateSeq: StateSeq;
}

interface Modifier {
  layer: ModifierLayer;
  target: TargetSpec;
  operation: ModifierOperation;
}

type ModifierLayer =
  | "basePowerSet"
  | "baseCostSet"
  | "powerAdd"
  | "costAdd"
  | "keywordAdd"
  | "keywordRemove"
  | "restriction"
  | "protection";
```

Computing a view:

```ts
function computeView(state: GameState): ComputedGameView {
  const base = buildBaseView(state);
  const activeModifiers = collectActiveContinuousEffects(state);
  return applyModifierLayers(base, activeModifiers, state.turn.turnPlayerId);
}
```

Permanent effects may depend on the computed state. If the official rule requires fixed-point behavior, implement the fixed-point over computed views, not by writing current power/cost into canonical state.

exact-card continuous-effect target binding uses `TargetSpec` shape `{ type: "exactCard"; card: CardRef; binding: SavedFieldObjectTargetBinding; createdAtStateSeq: StateSeq }`. A duration-bearing modifier created from a chosen target resolves the saved field-object reference once, stores the exact card target in the `ContinuousEffectRecord`, and does not re-run the original `choose` target during computed-view recalculation. The modifier remains bound to the same card instance while that instance remains legal for the modifier and the duration; if the object is stale, gone, hidden, or illegal, the modifier fails closed without leaking hidden identities.

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

### 05-effect-dsl-reference.s016 (Replacement triggers)

```ts
type ReplacementTrigger =
  | { type: "wouldBeKOd"; target: Target }
  | { type: "wouldTakeDamage"; target: Target }
  | { type: "wouldBeTrashed"; target: Target }
  | { type: "wouldDraw"; player: PlayerRef }
  | { type: "wouldMoveZone"; from?: Zone; to?: Zone; target: Target }
  | { type: "custom"; event: string };
```

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

Own only canonical contracts/types and compile-time tests for field-removal protection metadata. Do not implement engine runtime behavior, parser support, generated-support records, card fixtures, or runtime capability matrix updates.

## Scope

- extend the existing `Protection` contract with a structured field-removal protection shape; nested helper types are allowed only when they are consumed by `Protection`
- represent field-removal protection as reusable structured data, not as a string, card-specific branch, or full-text template
- define stable discriminants for protected process family, protected field-removal destination or process classification, source kind, source-controller relation, and protected object scope
- support a source kind value for card effects and a source-controller relation value for opponent-controlled sources
- represent explicit exclusion or fail-closed classification data for battle K.O., rule-process trash, controller costs, controller-owned effects, and ambiguous custom removal
- keep existing simple protection fixtures source-compatible or migrate them with focused compile-time test updates
- preserve `ComputedCardView.protectedFrom` as the public computed-view projection surface unless review finds a better existing contract-owned surface
- keep contracts serializable and deterministic for state hash and replay consumers

## Out of Scope

- engine runtime enforcement
- process classification implementation in engine-core
- parser support, generated-support evidence, support reports, support probes, real-card fixtures, source hashes, behavior hashes, or runtime capability matrix updates
- support for arbitrary replacement priority rules beyond representing protection metadata needed by downstream engine work
- server, client, API, UI, database, replay UI, WebSocket, Redis, or live Poneglyph work

## Allowed Touch Points

<!-- prettier-ignore -->
- contracts/types/runtime.ts
- packages/types/src/runtime.ts
- packages/types/src/game-state.ts
- packages/types/src/runtime.test.ts
- packages/types/src/game-state.test.ts
- packages/types/src/export-cohesion.test.ts
- packages/types/src/export-ownership.manifest.ts
- stories/generated/TYP-012*.yaml
- stories/approved/TYP-012*.yaml
- agent-packets/TYP-012A.md
- agent-packets/active.json

## Constraints

- generate and activate the TYP-012A packet before implementation
- stay within allowed_touch_points
- do not import @optcg/cards
- do not add engine runtime, parser, generated-support, or card fixture work
- fail closed if the protection contract cannot precisely separate opponent-effect field removal from battle, rule-process, cost, own-effect, or ambiguous custom removal
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

- story-review for TYP-012A before approval handoff
- package type and serialization-shape tests for opponent-effect field-removal protection metadata
- package type and serialization-shape tests for explicit exclusions or classification fields covering battle, rule-process, cost, own-effect, and ambiguous custom removal
- regression tests for existing simple protection examples
- export cohesion and ownership tests for any new exported type
- no engine-core behavior or process-classification tests are added by this story
- run `corepack pnpm --filter @optcg/types typecheck`
- run `corepack pnpm exec vitest run packages/types/src/runtime.test.ts packages/types/src/game-state.test.ts packages/types/src/export-cohesion.test.ts`
- run `corepack pnpm run stories:validate`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- contracts can represent "this Character cannot be removed from the field by your opponent's effects" as primitive metadata without full-card text or card ID branches
- the `Protection` contract exposes stable contract axes for protected process family, field-removal classification, source kind, source-controller relation, and protected object scope
- the contract includes a card-effect source kind and opponent source-controller relation suitable for downstream engine classification
- contracts can distinguish opponent effect removal from battle K.O., rule-process trash, costs, controller-owned effects, and ambiguous custom removal
- existing protection, continuous-effect, computed-view, and export-cohesion tests pass after any contract migration
- downstream ENG stories can consume the contract without changing packages/types again for this protection shape

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
