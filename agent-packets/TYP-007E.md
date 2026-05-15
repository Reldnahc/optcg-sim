<!-- agent-packet:story-id TYP-007E -->
<!-- agent-packet:story-path stories/approved/TYP-007E-duration-modifier-restriction-schema.yaml -->
<!-- agent-packet:story-sha256 97650c164ebe1ad280be358ee388d766aa07a797813a72bd44b613ab60bc94c0 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-007E
Epic ID: TYP-007
Title: Duration, modifier, and restriction DSL schema
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Add schema and type authorability for temporary power modifiers and spec-cited restrictions, reusing the saved-reference contracts from TYP-007B when a later sequence step targets an earlier selected object.

## Authoritative Spec References

- 04-effect-runtime.s014 (Continuous effects as computed view)
- 04-effect-runtime.s015 (Duration expiration)
- 05-effect-dsl-reference.s011 (Durations)
- 05-effect-dsl-reference.s012 (Effects)
- 05-effect-dsl-reference.s021 (Example: permanent power buff)
- 05-effect-dsl-reference.s029 (Schema coverage policy)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

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

Duration and restriction effects such as `cannotAttack`, `cannotBlock`, `cannotBeAttacked`, `cannotBeBlockedBy`, `invalidateEffects`, and `protectFromKO` remain planned unless the schema coverage policy lists them as schema-supported and the runtime capability matrix proves the active engine can enforce the restriction for the full duration.

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
- cost: restSelf
- cost: sequence
- target: self, myLeader, opponentLeader, attacker, attackTarget, blocker,
  triggerCard, all, choose
- duration: thisAction, thisBattle, thisTurn, whileSourceOnField, permanent
- effect: draw
- effect: ko
- effect: modifyPower
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
- cost: returnDon
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

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only canonical schema/type authorability and schema fixtures for duration, modifier, and restriction shapes. Do not implement modifier runtime behavior.

## Scope

- authorize temporary power modifier schema and types
- authorize schema and types for spec-cited restrictions such as cannotAttack and cannotBlock
- authorize duration shapes needed by those primitives
- reuse saved-reference target shapes from TYP-007B where modifier or restriction authoring needs to refer to an earlier selected object
- add positive and negative schema fixtures for these shapes

## Out of Scope

- defining new saved-reference or sequence result shapes
- computed-view modifier runtime behavior
- refresh phase mutation behavior or expiry behavior
- parser certification or generated-support admission
- replacement generalization
- server, client, API, UI, replay, database, or gameplay behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- contracts/canonical-types.ts
- contracts/effect-dsl.schema.json
- contracts/types/effects.ts
- contracts/types/runtime.ts
- packages/types/src/effects.ts
- packages/types/src/runtime.ts
- packages/types/src/effects.test.ts
- packages/types/src/runtime.test.ts
- tests/contracts/**
- fixtures/effect-dsl/**
- stories/generated/TYP-007*.yaml
- stories/approved/TYP-007*.yaml
- agent-packets/TYP-007E.md
- agent-packets/active.json

## Constraints

- do not mutate canonical runtime behavior in this story
- keep duration and modifier semantics narrow to runtime-authorable contracts
- fail closed on timing or expiry ambiguity
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

- positive and negative schema fixture validation for duration, modifier, and restriction shapes
- focused type tests for modifier/restriction authoring
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

- supported temporary modifier and restriction shapes validate
- modifier/restriction authoring does not define a second saved-reference shape outside TYP-007B
- malformed or unsupported duration/modifier/restriction shapes reject
- exported types align with canonical schema
- no runtime or card support is added

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
