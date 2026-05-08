<!-- agent-packet:story-id ENG-036E -->
<!-- agent-packet:story-path stories/approved/ENG-036E-extract-queue-source-presence-and-cleanup-helpers.yaml -->
<!-- agent-packet:story-sha256 3f88fec3e35f4bf74f1c418c16dd1a8f17db9d64bfc53855fed92522fac5f3db -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-036E
Epic ID: KICK-001
Title: Extract queue source-presence and cleanup helpers
Type: refactor
Area: engine
Primary Concern: rules

## Why

Extract queued source-presence validation and Life Trigger cleanup helpers from effect-runtime-queue-processing.ts without changing fail-closed behavior, cleanup events, queue resolution, state hashes, or visibility.

## Authoritative Spec References

- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s006 (Effect queue entry)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s010 (Queue processing)
- 04-effect-runtime.s016 (Failure policy)
- 04-effect-runtime.s017 (Transient reveal and selection sets)
- 06-visibility-security.s005 (Temporary visibility)
- 06-visibility-security.s006 (Effect event visibility)
- 11-testing-quality.s007 (Interaction tests)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s004 (Engine result)

Every engine call returns a result object rather than only the new state.

```ts
interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  decisions?: PendingDecision[];
  errors?: EngineError[];
  stateHash: string;
}
```

For normal play there should be at most one active `pendingDecision` at a time. Tests may use arrays to inspect internal generated decisions.

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

### 04-effect-runtime.s006 (Effect queue entry)

```ts
interface EffectQueueEntry {
  id: QueueEntryId;
  state: "pending" | "resolving" | "resolved" | "cancelled";
  timingWindowId: TimingWindowId;
  generation: number;
  controllerId: PlayerId;
  source: CardRef;
  sourceSnapshot: CardSnapshot;
  triggerEventId?: EngineEventId;
  effectBlockId: EffectId;
  orderingGroup: "turnPlayer" | "nonTurnPlayer";
  createdAtEventSeq: number;
  queuedAtStateSeq: StateSeq;
  sourcePresencePolicy: SourcePresencePolicy;
  causedBy: CausalityRef;
}
```

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

### 04-effect-runtime.s016 (Failure policy)

```ts
type FailurePolicy =
  | "doAsMuchAsPossible"
  | "requiresAll"
  | "skipIfNoLegalTarget"
  | "optionalIfPossible";
```

Default is `doAsMuchAsPossible`, unless a connector or card text requires dependency.

### 04-effect-runtime.s017 (Transient reveal and selection sets)

Transient sets are part of effect execution context, not normal zones. They exist for patterns such as revealing the top card, selecting from a revealed set, and returning unselected cards face-down.

Rules:

1. A transient set has an origin, visibility, and cleanup policy.
2. Cards in a transient set are not simultaneously in hand/deck/trash/life.
3. Movement from a transient set to a real zone must emit a `cardMoved` event with appropriate visibility.
4. If an effect exits early, cleanup policy runs before the queue continues.
5. Opponent views may see a revealed card only for the duration and visibility specified by the effect. If the card returns face-down to a hidden zone, future opponent views must not retain its ID.

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

### 06-visibility-security.s006 (Effect event visibility)

The game log can leak information if not filtered.

```ts
interface EffectEvent {
  id: string;
  sourceCardId: CardId;
  sourceInstanceId?: InstanceId;
  effectId: string;
  description: string;
  choices?: PublicChoiceSummary;
  visibleTo: "both" | PlayerId[] | "replayOnly";
}
```

Examples:

- Public target selection: visible to both.
- Searching deck: opponent sees "Opponent is searching deck" and maybe count, not card IDs.
- Choosing a card from hand to trash: opponent sees the resulting public trash card, not pre-choice hand options.

### 11-testing-quality.s007 (Interaction tests)

Representative interactions:

```text
tests/interactions/
  blocker-plus-unblockable.test.ts
  double-attack-plus-banish.test.ts
  replacement-on-ko.test.ts
  simultaneous-ko-triggers.test.ts
  on-ko-source-presence.test.ts
  trigger-during-damage-defers.test.ts
  event-activates-effect-after-resolution.test.ts
  negative-power-stays-on-field.test.ts
  negative-cost-clamps-to-zero.test.ts
```

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

Own only behavior-preserving production helper extraction for queued source-presence and Life Trigger cleanup logic. Do not move queue ordering, target-decision, or result assembly bodies in this story.

## Scope

- move queued source-presence validation into effect-runtime-queue-source-presence.ts
- move Life Trigger resolution detection, trash cleanup event emission, and revealed-card cleanup logic into effect-runtime-life-trigger-cleanup.ts
- preserve all cleanup event payloads, state sequence behavior, zone reindexing, revealed-card filtering, errors, and no-mutation fail-closed paths
- update package-internal imports only as required by the extraction

## Out of Scope

- changing source-presence policy semantics
- changing Life Trigger cleanup behavior or event visibility
- changing queue ordering, target-decision, trigger-order, or result assembly behavior
- changing trigger queueing or effect primitive execution behavior
- adding new exported public API beyond package-internal helper exports

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/effect-runtime-queue-processing.ts
- packages/engine-core/src/effect-runtime-queue-source-presence.ts
- packages/engine-core/src/effect-runtime-life-trigger-cleanup.ts
- packages/engine-core/src/effect-runtime-queue-processing-no-choice.test.ts
- packages/engine-core/src/effect-runtime-queue-processing-source-presence.test.ts
- packages/engine-core/src/effect-runtime-queue-processing-stability.test.ts
- stories/generated/ENG-036E-extract-queue-source-presence-and-cleanup-helpers.yaml
- stories/approved/ENG-036E-extract-queue-source-presence-and-cleanup-helpers.yaml
- agent-packets/ENG-036E.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-036E packet while implementing this story
- target the ENG-036 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- this is a behavior-preserving production refactor story; if any behavior delta appears, stop and split or record an ambiguity
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-queue-processing-no-choice.test.ts packages/engine-core/src/effect-runtime-queue-processing-source-presence.test.ts packages/engine-core/src/effect-runtime-queue-processing-stability.test.ts packages/engine-core/src/life-trigger-actions.test.ts packages/engine-core/src/event-sequencing-regression.test.ts
- run corepack pnpm --filter @optcg/engine-core typecheck
- run corepack pnpm run packets:verify
- run corepack pnpm run coverage
- run corepack pnpm run verify

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- focused helper modules own queued source-presence and Life Trigger cleanup logic
- effect-runtime-queue-processing.ts remains behavior-compatible for createEffectRuntimeQueueProcessing consumers
- no event, error, queue entry, state hash, ordering, decision, or hidden-information output changes
- focused queue processing tests, coverage, and full verify pass

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
