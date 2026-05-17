<!-- agent-packet:story-id ENG-055J -->
<!-- agent-packet:story-path stories/approved/ENG-055J-duration-modifier-restriction-runtime.yaml -->
<!-- agent-packet:story-sha256 9c539e3be70ebd5b4f5cdee15c80d6ce1e4353be4abda7df4e28005c6d59dee8 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-055J
Epic ID: ENG-055
Title: Duration, modifier, and restriction runtime
Type: implementation
Area: engine
Primary Concern: rules

## Why

Implement temporary power modifier and TYP-007E-authorized restriction runtime behavior through the engine computed-view/modifier model.

## Authoritative Spec References

- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 04-effect-runtime.s002 (Overview)
- 04-effect-runtime.s014 (Continuous effects as computed view)
- 04-effect-runtime.s015 (Duration expiration)
- 05-effect-dsl-reference.s011 (Durations)
- 05-effect-dsl-reference.s021 (Example: permanent power buff)
- 05-effect-dsl-reference.s029 (Schema coverage policy)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

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

### 03-game-state-events-decisions.s018 (Canonical event visibility)

Each `EngineEvent` has one visibility policy:

```text
public          safe for both players immediately
private         visible only to listed player IDs
replayOnly      hidden during live play but available in completed full replay
serverOnly      never leaves trusted server/runtime logs
```

Visibility is independent of replay determinism. Replay artifacts may store information that was never sent to either player during the live match.

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

### 04-effect-runtime.s015 (Duration expiration)

| Duration               | Expiration point                                              |
| ---------------------- | ------------------------------------------------------------- |
| `thisBattle`           | End of Battle                                                 |
| `thisTurn`             | End Phase cleanup                                             |
| `untilEndOfTurn`       | End Phase cleanup                                             |
| `untilStartOfNextTurn` | Start of specified player's next Refresh Phase                |
| `whileSourceOnField`   | When source leaves required zone                              |
| `whileConditionTrue`   | Not active when condition false; removed or ignored by policy |
| `permanent`            | Only for true game-permanent changes; avoid for field buffs   |

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

### 05-effect-dsl-reference.s021 (Example: permanent power buff)

```json
{
  "cardId": "OP01-001",
  "implementationStatus": "implemented-dsl",
  "effects": [
    {
      "id": "OP01-001:permanent-1",
      "category": "permanent",
      "trigger": { "type": "permanent" },
      "condition": {
        "type": "and",
        "conditions": [
          { "type": "donCount", "target": { "type": "self" }, "min": 1 },
          { "type": "yourTurn" }
        ]
      },
      "sourcePresencePolicy": "mustRemainInSameZone",
      "effect": {
        "type": "modifyPower",
        "target": {
          "type": "all",
          "zone": "characterArea",
          "player": "self",
          "filter": { "typesAny": ["Straw Hat Crew"] }
        },
        "value": 1000,
        "duration": { "type": "whileSourceOnField" }
      }
    }
  ],
  "metadata": {
    "sourceTextHash": "sha256:...",
    "rulesVersion": "2026-01-16",
    "effectDefinitionsVersion": "0.1.0",
    "tested": true
  }
}
```

The runtime should convert this into a `ContinuousEffectRecord`/modifier and apply it through `computeView()`.

When a duration-bearing effect uses a chosen target and later needs exact-card continuous-effect target binding, the runtime must resolve the saved field-object reference once and create a modifier target using the canonical `TargetSpec` shape `{ type: "exactCard"; card: CardRef; binding: SavedFieldObjectTargetBinding; createdAtStateSeq: StateSeq }`. The chosen target does not re-run the original `choose` target during computed-view recalculation. The modifier remains bound to the same card instance until its duration expires or the exact card is no longer a legal public object for that modifier.

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
- condition: fieldCount
- cost: restDon
- cost: returnDon
- cost: restSelf
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
- effect: payCost
- effect: selectCards
- effect: selectTargets
- effect: playSelected
- effect: sequence
- effect: cannotAttack
- effect: cannotBlock
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
- duration: whileConditionTrue
- effect: search
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
- effect: cannotBeAttacked
- effect: cannotBeBlockedBy
- effect: choice
- effect: conditional
- effect: forEachMatch
- effect: repeat
- effect: replacement

new fixture-authorable primitives must add schema coverage and validation fixtures in the same story that makes the primitive authorable.

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

Own only runtime behavior for temporary power modifiers and TYP-007E-authorized restrictions such as cannotAttack/cannotBlock plus expiry tests. Do not implement parser/card support.

## Scope

- implement temporary power modifiers through the computed-view/modifier model
- implement runtime expiry only for `thisBattle`, `thisTurn`, `untilEndOfTurn`, `untilStartOfNextTurn`, `whileSourceOnField`, and `permanent` durations
- defer `thisAction` runtime until a cited canonical expiration rule exists
- implement TYP-007E-authorized temporary power modifier target runtime for `self`, `choose`, and `all` target shapes
- implement TYP-007E-authorized restriction runtime only for `cannotAttack` and `cannotBlock` with `self`, `choose`, and `all` target shapes authorized by TYP-007E
- for `choose` modifier/restriction targets, create or reuse a `selectTargets` pending decision, validate valid/stale/malformed/wrong-player responses, and persist the exact chosen field object in a durable continuous-effect target carrier until the modifier/restriction expires
- if the chosen target is gone, no longer a legal field object, hidden, or otherwise unresolvable before continuous-effect creation, fail closed without adding the modifier/restriction
- fail closed for every non-TYP-007E-authorized restriction target outside `self`, `choose`, and `all`, including `myLeader`, `opponentLeader`, attack-context targets such as `attacker`, `attackTarget`, `blocker`, and `triggerCard`, and saved-selection targets
- fail closed for `whileConditionTrue`, malformed turn-relative durations, `thisAction`, and unsupported restriction families
- add expiry tests for duration boundaries
- add hidden-info, event-order, deterministic replay, and state-hash regression coverage

## Out of Scope

- parser/card support
- permanent effect fixed-point generalization beyond this story
- `thisAction` duration runtime
- cannotBeAttacked, cannotBeBlockedBy, invalidateEffects, and protectFromKO runtime
- refresh-lock or cannot-become-active-next-refresh runtime until contract/schema authority exists
- saved-selection modifier/restriction targets until a proper field-target saved-reference contract exists
- replacement generalization

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/battle-actions.test.ts
- packages/engine-core/src/battle-block-actions.ts
- packages/engine-core/src/battle-blocker.test.ts
- packages/engine-core/src/battle-blocker-flow.test.ts
- packages/engine-core/src/battle-blocker-invalid.test.ts
- packages/engine-core/src/battle-counter-actions.ts
- packages/engine-core/src/battle-counter.test.ts
- packages/engine-core/src/battle-counter-flow.test.ts
- packages/engine-core/src/battle-counter-invalid.test.ts
- packages/engine-core/src/battle-declare-attack-legality.test.ts
- packages/engine-core/src/battle-resolution.ts
- packages/engine-core/src/battle-pipeline-regression.test.ts
- packages/engine-core/src/battle-support.ts
- packages/engine-core/src/compute-view.ts
- packages/engine-core/src/compute-view.test.ts
- packages/engine-core/src/effect-runtime*.ts
- packages/engine-core/src/effect-runtime*.test.ts
- packages/engine-core/src/phases.ts
- packages/engine-core/src/phases.test.ts
- packages/engine-core/src/target-selection*.ts
- packages/engine-core/src/target-selection*.test.ts
- packages/engine-core/src/turn-actions.ts
- packages/engine-core/src/turn-actions.test.ts
- packages/types/src/game-state.ts
- packages/types/src/game-state.test.ts
- packages/types/src/runtime.ts
- packages/types/src/runtime.test.ts
- tests/hidden-info/**
- stories/generated/ENG-055*.yaml
- stories/approved/ENG-055*.yaml
- agent-packets/ENG-055J.md
- agent-packets/active.json

## Constraints

- do not import @optcg/cards
- keep canonical state mutation minimal and deterministic
- fail closed on duration or refresh timing ambiguity
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

- temporary power modifier runtime tests
- choose-target modifier/restriction decision tests covering `selectTargets` creation, valid response resume, stale/malformed/wrong-player rejection, gone/illegal target fail-closed behavior, and durable chosen-target binding until expiry
- cannotAttack/cannotBlock restriction expiry tests for supported `self`, `choose`, and `all` target shapes and supported duration boundaries
- fail-closed tests for `thisAction`, `whileConditionTrue`, malformed turn-relative durations, every non-TYP-007E-authorized restriction target outside `self`, `choose`, and `all` including `myLeader`, `opponentLeader`, attack-context targets, and saved-selection targets, plus unsupported restriction families
- replay regression pinning emitted event order and final state hash across modifier/restriction application and expiry
- hidden-info, event-order, and state-hash tests
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run stories:validate`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- temporary power modifiers affect computed view without mutating canonical current power
- temporary power modifiers and `cannotAttack`/`cannotBlock` restrictions support `self`, `choose`, and `all` target shapes authorized by TYP-007E
- `cannotAttack` and `cannotBlock` apply and expire at the correct supported duration boundary
- `choose` target modifier/restriction application pauses through a valid `selectTargets` decision when needed, resumes by creating a durable continuous-effect record bound to the chosen field object, and rejects stale, malformed, wrong-player, gone-target, hidden, or illegal responses fail-closed
- unsupported targets, durations, malformed duration parameterizations, and restriction families fail closed
- hidden-info, event order, deterministic replay, and state hashes are preserved

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
