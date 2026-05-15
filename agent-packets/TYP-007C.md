<!-- agent-packet:story-id TYP-007C -->
<!-- agent-packet:story-path stories/approved/TYP-007C-condition-optionality-dsl-schema.yaml -->
<!-- agent-packet:story-sha256 405738ec64ebd49f25948f1306df676abf667517a08ff54ea5eda9851a5d13d2 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-007C
Epic ID: TYP-007
Title: Condition and optionality DSL schema
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Add schema and type authorability for supported non-replacement optionality shapes and supported condition shapes used by composed effects.

## Authoritative Spec References

- 04-effect-runtime.s004 (Stable effect identity)
- 04-effect-runtime.s011 (Conditions and costs)
- 05-effect-dsl-reference.s004 (Effect block)
- 05-effect-dsl-reference.s006 (Conditions)
- 05-effect-dsl-reference.s007 (Costs)
- 05-effect-dsl-reference.s013 (Sequence connector semantics)
- 05-effect-dsl-reference.s020 (Example: Activate Main with cost and up-to target)
- 05-effect-dsl-reference.s029 (Schema coverage policy)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

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

```ts
interface OncePerTurnRecord {
  cardInstanceId: InstanceId;
  effectId: string;
  turnNumber: number;
  usedAtStateSeq: StateSeq;
}
```

### 05-effect-dsl-reference.s004 (Effect block)

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

Condition, duration, and restriction primitives outside the schema-supported fixture subset remain planned layers. They are contract-defined by this reference, but they are not fixture-authorable until the schema coverage policy lists them as supported.

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

### 05-effect-dsl-reference.s020 (Example: Activate Main with cost and up-to target)

```json
{
  "cardId": "OP01-040",
  "implementationStatus": "implemented-dsl",
  "effects": [
    {
      "id": "OP01-040:activate-main-1",
      "category": "activate",
      "trigger": { "type": "activateMain" },
      "optional": true,
      "oncePerTurn": true,
      "sourcePresencePolicy": "mustRemainInSameZone",
      "cost": {
        "type": "sequence",
        "costs": [
          { "type": "restDon", "count": 2, "chooser": "self" },
          { "type": "restSelf" }
        ]
      },
      "failurePolicy": "doAsMuchAsPossible",
      "effect": {
        "type": "ko",
        "target": {
          "type": "choose",
          "request": {
            "timing": "onResolution",
            "chooser": "self",
            "zone": "characterArea",
            "player": "opponent",
            "filter": { "cost": { "op": "lte", "value": 3 } },
            "min": 0,
            "max": 1,
            "allowFewerIfUnavailable": true,
            "visibility": "public"
          }
        }
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

Own only canonical type/schema authorability and schema fixtures for supported optional activation, optional cost/effect clause, and condition shapes. Do not implement runtime semantics or parser certification.

## Scope

- authorize schema/type shapes for supported optional activation, optional cost, and optional effect clauses
- authorize schema/type shapes for supported hand count, life count, field/rested count, source/card state, and and/or/not conditions
- add positive and negative effect DSL schema fixtures for supported optionality and condition shapes

## Out of Scope

- runtime condition evaluation or optional commitment timing
- replacement optionality
- card parser certification or generated-support metadata
- server, client, API, UI, replay, database, or gameplay behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- contracts/canonical-types.ts
- contracts/effect-dsl.schema.json
- contracts/types/effects.ts
- packages/types/src/effects.ts
- packages/types/src/effects.test.ts
- tests/contracts/**
- fixtures/effect-dsl/**
- stories/generated/TYP-007*.yaml
- stories/approved/TYP-007*.yaml
- agent-packets/TYP-007C.md
- agent-packets/active.json

## Constraints

- keep replacement optionality out of this series
- do not add leader-type or other uncited condition families in this story
- reject unsupported or ambiguous composed condition shapes
- fail closed on gameplay-rule ambiguity
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

- positive and negative schema fixture validation for optionality and conditions
- focused type tests for condition and optionality authoring
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

- schema fixtures prove supported condition and optionality shapes validate
- negative fixtures prove malformed or unsupported optionality/condition shapes reject
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
