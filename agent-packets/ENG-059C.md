<!-- agent-packet:story-id ENG-059C -->
<!-- agent-packet:story-path stories/approved/ENG-059C-effect-origin-field-removal-protection.yaml -->
<!-- agent-packet:story-sha256 a819478ea4a27f72722f8a387b5ff4b39c19188f7dbc53b7a58af5fec2973a2a -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-059C
Epic ID: ENG-059
Title: Effect-origin field removal protection
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add a reusable engine protection layer that classifies field-removal attempts by process and source controller so a supported Character can be protected from opponent effect removal without blocking battle K.O., rule-process trash, costs, or controller-owned effects.

## Authoritative Spec References

- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s038 (Rule-process trashing is not effect trashing)
- 02-engine-mechanics.s043 (Replacement priority)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 04-effect-runtime.s004 (Stable effect identity)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s013 (Replacement effects)
- 05-effect-dsl-reference.s016 (Replacement triggers)
- 06-visibility-security.s005 (Temporary visibility)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s019 (Block Step)

1. Defender may activate one legal `[Blocker]`, unless blocking is prohibited.
2. Blocker rests and becomes the current target.
3. Emit `blockerActivated`.
4. Queue `[On Block]` effects.
5. Resolve the block timing window.
6. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s038 (Rule-process trashing is not effect trashing)

Two common rule processes do not generate normal K.O./trash triggers:

- Playing a sixth Character requires trashing one existing Character before the new Character is played.
- Playing a new Stage trashes the existing Stage first.

These are rule processes, not card effects. Do not emit ordinary K.O./trash triggers unless official rulings require a specific exception.

### 02-engine-mechanics.s043 (Replacement priority)

When multiple replacement effects apply to the same process:

1. The card generating the replaced event has first priority if applicable.
2. Turn player's replacements apply in that player's chosen order.
3. Non-turn player's replacements apply in that player's chosen order.
4. A replacement effect cannot apply more than once to the same process.
5. If the replacement cannot actually perform its replacement, it does not apply.

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

Own only engine-core field-removal protection classification, application, and tests. Do not change card parser support, generated-support records, real-card fixtures, conditional keyword grants, or unrelated replacement behavior.

## Scope

- consume the TYP-012A field-removal protection contract shape; do not widen canonical packages/types contracts in this ENG story
- add or extend reusable runtime metadata that classifies a field-removal attempt by process type and source controller
- distinguish opponent card-effect removal from battle K.O., rule-process trash, costs, controller-owned effects, and unsupported or ambiguous processes
- model primitive protection parts equivalent to protected object "this Character", removal process "removed from the field", source controller "opponent", and source kind "effects" using reusable runtime data, not card-specific code
- apply protection before mutating field zones for supported opponent-effect removal attempts
- preserve allowed battle K.O., sixth-character rule-process trash, stage replacement rule-process trash, controller costs, and controller-owned effect removal
- fail closed before partial mutation when a removal process cannot be classified safely
- preserve source presence, event order, replay determinism, state hashes, and hidden-information projection

## Out of Scope

- production special cases for a real card ID or full-card text matching
- conditional continuous keyword grants
- shared TYP/contracts/schema changes
- parser support, generated-support evidence, support reports, real-card fixtures, source hashes, or behavior hashes
- broad replacement-effect priority beyond what is needed to classify and prevent supported field removal
- protection against battle K.O.
- protection against rule-process trash, including sixth-character overflow and stage replacement
- protection against controller costs or controller-owned effects
- support for unrepresented removal destinations or ambiguous custom handlers
- server, client, API, UI, database, replay UI, WebSocket, Redis, or live Poneglyph work

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/compute-view.ts
- packages/engine-core/src/compute-view.test.ts
- packages/engine-core/src/**/*effect*.ts
- packages/engine-core/src/**/*effect*.test.ts
- packages/engine-core/src/**/*replacement*.ts
- packages/engine-core/src/**/*replacement*.test.ts
- packages/engine-core/src/**/*protection*.ts
- packages/engine-core/src/**/*protection*.test.ts
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/battle-actions.test.ts
- packages/engine-core/src/battle-block-actions.ts
- packages/engine-core/src/battle-blocker*.test.ts
- packages/engine-core/src/battle-counter-actions.ts
- packages/engine-core/src/battle-counter*.test.ts
- packages/engine-core/src/battle-resolution.ts
- packages/engine-core/src/battle-resolution.test.ts
- packages/engine-core/src/battle-damage-step-continuation.ts
- packages/engine-core/src/battle-damage*.test.ts
- tests/hidden-info/**
- stories/generated/ENG-059*.yaml
- stories/approved/ENG-059*.yaml
- agent-packets/ENG-059C.md
- agent-packets/active.json

## Constraints

- generate and activate the ENG-059C packet before implementation
- do not activate or hand off ENG-059C until ENG-059A has landed as reviewed commit evidence on the parent branch
- stay within allowed_touch_points
- do not widen canonical type contracts in this ENG story
- do not import @optcg/cards
- do not add parser/generated-support/card fixture work
- fail closed if process classification, source controller, destination semantics, source presence, or hidden-information behavior is ambiguous
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

- story-review for ENG-059C before approval handoff
- unit test proving opponent-effect K.O. or supported effect removal does not move a protected Character
- unit tests for any supported effect-removal destinations already represented by engine primitives
- unit test proving battle K.O. still removes the protected Character
- unit test proving sixth-character overflow rule-process trash still removes the protected Character and does not fire ordinary K.O. triggers
- unit test proving controller-owned effect removal is not blocked by opponent-effect protection
- unit test proving controller costs are not blocked by opponent-effect protection
- fail-closed tests for ambiguous process source, unsupported destination, custom handler removal, missing source controller, and malformed protection metadata
- event-order, replay, and state-hash tests for prevented, allowed, and fail-closed paths
- hidden-info tests proving prevented removal does not expose private card identities
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run focused engine-core effect, battle, replacement/protection, replay/hash, and hidden-info tests touched by this story
- run `corepack pnpm run test:hidden-info`
- run `corepack pnpm run verify`
- run `corepack pnpm run stories:validate`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- supported opponent-effect field removal is prevented for a protected Character before zone mutation
- allowed battle K.O. still removes the protected Character and follows existing K.O. trigger behavior
- rule-process trash still removes the protected Character where rules require it and does not become opponent-effect removal
- controller-owned effects and controller costs are not blocked by opponent-effect protection
- unsupported or ambiguous removal process classification fails closed before partial mutation
- event output and state hashes are deterministic for prevented, allowed, and fail-closed paths
- implementation consumes the TYP-012A contract without modifying packages/types
- production engine code does not import @optcg/cards and does not mention real card IDs

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
