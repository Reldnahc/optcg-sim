<!-- agent-packet:story-id ENG-010C -->
<!-- agent-packet:story-path stories/approved/ENG-010C-effect-runtime-legal-action-gate.yaml -->
<!-- agent-packet:story-sha256 367ddb4adad1488d5fbe7b3f19f68476f569e43165df05003c0b39d4c5c72527 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-010C
Epic ID: M1-001
Title: Gate legal actions while effect runtime work is pending
Type: implementation
Area: engine
Primary Concern: rules

## Why

Ensure ordinary legal actions are not exposed while effect runtime work is pending, using the empty/unsupported runtime processor as the authority for fail-closed pending queue behavior.

## Authoritative Spec References

- 02-engine-mechanics.s003 (Rule-processing checkpoints)
- 02-engine-mechanics.s035 (Exact win/loss conditions)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 06-visibility-security.s007 (Legal-action visibility)
- 04-effect-runtime.s009 (Queue ordering)
- 04-effect-runtime.s010 (Queue processing)
- 18-acceptance-tests.s004 (Milestone 2 - first effect runtime)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s003 (Rule-processing checkpoints)

Run rule processing after every atomic state change, not only after player actions.

```ts
function afterAtomicMutation(result: EngineStepResult): EngineStepResult {
  const checked = checkRuleProcessing(result.state);
  return { ...result, state: checked };
}
```

Rule processing checks:

- Leader damage when that player has 0 life.
- Deck-out at a rule-processing checkpoint.
- Effect-created win/loss conditions.
- Simultaneous loss resulting in draw.
- Invariant violations in development/test mode.

Concession is immediate and cannot be replaced or prevented.

### 02-engine-mechanics.s035 (Exact win/loss conditions)

Run defeat checks at every rule-processing checkpoint:

1. **Leader damage at 0 Life** - if a player has 0 Life cards and their Leader would take damage, that player loses.
2. **Deck-out** - if a player has 0 cards in deck at any rule-processing checkpoint, that player loses.
3. **Concession** - a player may concede at any time; concession is immediate and cannot be prevented or replaced by card effects.
4. **Effect-based win/loss** - card effects may directly cause a win or loss during effect resolution.
5. **Double loss** - if both players meet defeat conditions at the same rule-processing checkpoint, both lose and the match is a draw.

Rule processing happens after atomic state changes, including mid-effect. For example, if a player decks out while drawing during an effect, the loss is detected at the next rule-processing point.

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

### 03-game-state-events-decisions.s018 (Canonical event visibility)

Each `EngineEvent` has one visibility policy:

```text
public          safe for both players immediately
private         visible only to listed player IDs
replayOnly      hidden during live play but available in completed full replay
serverOnly      never leaves trusted server/runtime logs
```

Visibility is independent of replay determinism. Replay artifacts may store information that was never sent to either player during the live match.

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

### 06-visibility-security.s007 (Legal-action visibility)

Legal actions can leak hidden information. The view should expose only what that recipient is entitled to know.

Examples:

- The defender should not see exactly why the server auto-passed the counter window.
- A player may see their own legal counter cards.
- The opponent sees only that the game progressed, not whether no counters existed or auto-pass was enabled.

### 04-effect-runtime.s009 (Queue ordering)

Every trigger collection creates or joins a timing window. Queue order is deterministic and must not depend on JavaScript array discovery order except where the spec explicitly says discovery order is the canonical tie-breaker.

Normative ordering algorithm:

```text
1. Assign every collected trigger a timingWindowId.
2. Assign generation = 0 for effects triggered by the original timing event.
3. When resolving an effect produces new triggers, enqueue them with generation = currentGeneration + 1 in the same timing window unless a new official timing window has opened.
4. Resolve older timing windows before newer timing windows.
5. Within a timing window, resolve lower generation before higher generation.
6. Within a generation, resolve turn-player bucket before non-turn-player bucket.
7. Within a player's bucket, if more than one effect is pending, create chooseTriggerOrder for that player.
8. If no choice is required, use stable tie-breakers: createdAtEventSeq, then source instance id, then effect id.
```

Consequences:

- If turn player effect A and non-turn player effect B are pending, and A creates turn player effect C while resolving, B resolves before C.
- Effects triggered during damage processing wait until all damage points are complete, except `[Trigger]` resolution itself.
- Effects triggered during an effect or card activation wait until the triggering process completes.
- Optional triggered effects create `chooseOptionalActivation` decisions at the point they would enter or begin resolution, according to the card's timing rule.

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

### 18-acceptance-tests.s004 (Milestone 2 - first effect runtime)

```text
M2-001 On Play draw queues and resolves
M2-002 When Attacking effect resolves before defender On Opponent Attack window
M2-003 blocker redirects attack and emits blockerActivated
M2-004 counter character grants battle power until end of battle
M2-005 counter event is trashed and effect resolves
M2-006 On K.O. activates on field and resolves from trash or last known info
M2-007 life Trigger resolves from no zone then moves to trash unless replaced
M2-008 simultaneous triggers controlled by same player require order decision
M2-009 turn player effect A, opponent effect B, new turn-player effect C resolves A-B-C
M2-010 damage-processing triggers wait until all damage points complete
M2-011 continuous +1000 modifier does not mutate base state
M2-012 replacement effect applies once per process
M2-013 optional effect creates chooseOptionalActivation decision
M2-014 target selection respects visibility and legal candidates
M2-015 unsupported non-vanilla card is rejected outside dev sandbox
M2-016 once-per-turn failed cost does not consume use
M2-017 once-per-turn committed effect that later fizzles still consumes use
M2-018 defender on-opponent-attack effects resolve before ordinary counter actions
M2-019 post-counter missing attacker or target skips Damage Step
M2-020 replacement choice uses chooseReplacement decision and logs replacementApplied
M2-021 replacement cannot apply twice to same process
M2-022 transient revealed card returned face-down is removed from opponent view
```

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

The repo must define a root `tsconfig.base.json` and package-level `tsconfig.json` files extending it.

Required compiler settings for implementation packages:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "noEmitOnError": true
  }
}
```

Strongly preferred unless a package-specific exception is justified in writing:

- `verbatimModuleSyntax`
- `importsNotUsedAsValues = error`
- `noUnusedLocals`
- `noUnusedParameters`

The repo must not rely on broad TypeScript escape hatches. The following require explicit justification in code review and should be lint-restricted where possible:

- `any`
- non-null assertion (`!`)
- `@ts-ignore`
- `@ts-nocheck`
- unchecked type assertions across trust boundaries

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Package-boundary enforcement is required, not optional.

At minimum, lint rules or dependency-cruiser / equivalent boundary tooling must enforce:

- `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.
- `@optcg/view-engine` cannot import hidden-information-only server modules.
- `@optcg/client` cannot import server-only packages.
- `@optcg/server` cannot bypass `@optcg/cards` to call card-data sources directly from engine execution paths.
- test helpers that expose hidden state cannot be imported into browser/client production bundles.
- replay validation code cannot depend on client rendering code.

If stronger tooling is adopted, such as dependency-cruiser, Knip, or custom graph checks, CI must fail on violations.

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only legal-action gating while `effectQueue` or `deferredTriggers` are non-empty. Stop before executing effects, creating effect decisions, adding blocker/counter/trigger actions, or changing vanilla legal actions when no runtime work is pending.

## Scope

- add a narrow legal-action gate in `getLegalActions` that detects pending `effectQueue` or `deferredTriggers`
- expose no ordinary phase, play-card, DON!! attach, attack, blocker, counter, or activate-effect actions while runtime work is pending
- preserve existing pending-decision response actions when a `pendingDecision` coexists with pending runtime work, while still suppressing ordinary non-decision actions
- preserve currently allowed concession behavior for active matches where concession was already available
- preserve all existing legal actions when `effectQueue` and `deferredTriggers` are empty

## Out of Scope

- executing or clearing pending effect runtime work
- adding any new legal action type
- creating, replacing, or routing pending decisions
- creating blocker, counter, trigger, optional activation, target, replacement, or life-trigger decisions
- changing pending-decision routing for mulligan or play-card decisions when runtime queues are empty
- changing CLI grammar, replay schema, server protocol, browser UI, database, Redis, WebSocket, React, live HTTP, or Poneglyph behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/actions.ts
- packages/engine-core/src/actions.test.ts

## Constraints

- fail closed on hidden-information or timing ambiguity
- keep engine-core deterministic and pure
- do not introduce client, server, Redis, Postgres, WebSocket, React, live HTTP, or card-data dependencies
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test proving non-empty `effectQueue` suppresses ordinary Main Phase legal actions while preserving concession if already available
- unit test proving non-empty `deferredTriggers` suppresses ordinary Main Phase legal actions while preserving concession if already available
- unit test proving an existing pending-decision response remains available when runtime queues are non-empty and ordinary non-decision actions are suppressed
- unit test proving `getLegalActions` does not mutate state or create/replace `pendingDecision` when runtime queues are non-empty
- unit test proving different hidden queue/deferred-trigger contents produce the same legal action list
- unit test proving existing play-card payment/overflow pending-decision legal responses remain unchanged when runtime queues are empty
- existing `packages/engine-core/src/actions.test.ts` must pass with unchanged vanilla legal-action assertions
- `corepack pnpm --filter @optcg/engine-core typecheck` must pass
- `corepack pnpm run verify` must pass

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `getLegalActions` returns only currently allowed concession behavior for active states with non-empty `effectQueue` when no `pendingDecision` exists
- `getLegalActions` returns only currently allowed concession behavior for active states with non-empty `deferredTriggers` when no `pendingDecision` exists
- `getLegalActions` preserves existing pending-decision response actions when pending runtime work and an existing `pendingDecision` coexist
- `getLegalActions` remains unchanged for current vanilla states with empty runtime queues
- hidden information is not leaked by pending runtime queue contents, including content-agnostic legal action output for different queue/deferred-trigger contents
- no new pending decisions or legal action types are exposed

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
