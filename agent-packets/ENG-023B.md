<!-- agent-packet:story-id ENG-023B -->
<!-- agent-packet:story-path stories/approved/ENG-023B-queue-opponent-attack-effects.yaml -->
<!-- agent-packet:story-sha256 fd6ba932fb8234ff07b0cdbd5f84b51f9bea547b5d064dbc7b9fa78a87070e7b -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-023B
Epic ID: KICK-001
Title: Queue opponent attack effects
Type: implementation
Area: engine
Primary Concern: rules

## Why

Queue and resolve supported defender On Your Opponent's Attack effects after Block Step and before ordinary Counter Step actions or Counter Step pass decisions.

## Authoritative Spec References

- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s020 (Counter Step)
- 02-engine-mechanics.s022 (End of Battle)
- 02-engine-mechanics.s041 (Auto-effect timing details)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s008 (Trigger detection from events)
- 04-effect-runtime.s006 (Effect queue entry)
- 04-effect-runtime.s009 (Queue ordering)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 11-testing-quality.s007 (Interaction tests)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s018 (Attack Step)

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s020 (Counter Step)

1. Queue defender-side effects that trigger from being attacked or from the opponent's attack timing, such as `[On Your Opponent's Attack]`, before ordinary counter actions.
2. Resolve that timing window.
3. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.
4. Defender may perform any number of legal counter actions:
   - Trash a Character card with counter value from hand for power.
   - Use a `[Counter]` Event by paying its cost and trashing it.
5. After each counter action and after the defender passes, re-check whether attacker and current target still exist and remain legal battle participants. If not, skip to End of Battle.
6. Proceed to Damage Step only if the attacker and current target are still legal.

The server must avoid timing leaks. If the defender has no legal counter actions and settings allow auto-pass, the window should auto-pass without revealing hidden details.

### 02-engine-mechanics.s022 (End of Battle)

1. Queue/resolve end-of-battle triggers.
2. Expire battle-duration continuous effects.
3. Clear battle context.
4. Return to Main Phase.

### 02-engine-mechanics.s041 (Auto-effect timing details)

- `[When Attacking]` and `[On Your Opponent's Attack]` are distinct timing windows.
- The attacker's `[When Attacking]` effects trigger first.
- Defender's `[On Your Opponent's Attack]` effects trigger after that window.
- `[On K.O.]` activates on field but resolves from trash.
- `[DON!! xX]` triggers or becomes active when attached DON!! count goes from below X to at least X, depending on whether the specific effect is auto or permanent.

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

### 04-effect-runtime.s008 (Trigger detection from events)

Trigger detection consumes event batches.

```ts
function detectTriggeredEffects(
  state: GameState,
  events: EngineEvent[],
): TriggerCandidate[] {
  const candidates: TriggerCandidate[] = [];

  for (const event of events) {
    candidates.push(...findAutoEffectsForEvent(state, event));
    candidates.push(...findReplacementFollowupsIfAny(state, event));
  }

  return candidates.filter((c) => canTriggerNow(c, state));
}
```

The engine must check source presence before queueing, then apply the queue entry's source-presence policy before resolution.

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

### 09-card-data-and-support-policy.s011 (Support policy by mode)

| Status                |              Dev sandbox | Unranked / custom |                         Ranked |
| --------------------- | -----------------------: | ----------------: | -----------------------------: |
| `vanilla-confirmed`   |                  Allowed |           Allowed |                        Allowed |
| `implemented-dsl`     |                  Allowed |           Allowed |                        Allowed |
| `implemented-custom`  |                  Allowed | Allowed if tested | Allowed if tested and reviewed |
| `unsupported`         |     Allowed with warning |          Rejected |                       Rejected |
| `banned-in-simulator` | Rejected unless override |          Rejected |                       Rejected |

Missing overlay records should fail closed in public modes. A non-vanilla Poneglyph card without support metadata is treated as `unsupported`.

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

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

A pull request must not merge unless the main CI pipeline passes.

Minimum required merge gates:

1. install dependencies with locked versions,
2. build/typecheck workspace,
3. lint workspace,
4. run tests,
5. validate contracts and schemas,
6. validate formatting,
7. publish coverage artifact,
8. fail if generated artifacts or snapshots are stale when the repo defines them.

Recommended CI jobs:

- `quality` -> lint, typecheck, format check
- `engine` -> engine unit, interaction, invariant, replay tests
- `contracts` -> canonical types, DSL schema, fixture normalization, SQL/schema validation
- `client-server-smoke` -> protocol smoke tests and filtered-view checks

For protected branches, require at least one human review plus passing CI.

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

Own only defender-side opponent-attack trigger detection, queueing, no-choice resolution handoff, source-presence checks, and battle-continuation checks at Counter Step entry after Block Step completes.

## Scope

- detect supported defender-controlled On Your Opponent's Attack effect definitions at Counter Step entry after Block Step completes
- queue supported no-choice defender opponent-attack effects using deterministic queue entry IDs, timing window IDs, payloads, and event ordering
- support only deterministic no-order-choice queueing; fail closed or split if multiple same-player defender timing effects require chooseTriggerOrder or other unsupported ordering choice
- resolve defender opponent-attack timing after Block Step and before ordinary Counter Step actions or Counter Step pass decisions are created
- enforce mustRemainInSameZone source presence for queued defender timing entries
- if attacker or current target leaves legal battle participation after defender timing, skip to existing End of Battle cleanup without adding new cleanup behavior

## Out of Scope

- changing attacker When Attacking queueing beyond ENG-023A behavior
- Counter implementation changes
- Blocker changes
- Life Triggers
- On K.O.
- replacement effects
- target selection unless already supported
- new effect primitives, custom handlers, server/client/UI, database, Redis, WebSocket, replay schema, or CLI behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/battle-counter-actions.ts
- packages/engine-core/src/battle-resolution.ts
- packages/engine-core/src/battle-support.ts
- packages/engine-core/src/attack-timing.ts
- packages/engine-core/src/effect-runtime.ts
- packages/engine-core/src/effect-runtime.test.ts
- packages/engine-core/src/battle-declare-attack.test.ts
- packages/engine-core/src/battle-pipeline-regression.test.ts
- packages/engine-core/src/event-sequencing-regression.test.ts
- packages/engine-core/src/battle-actions-test-fixtures.ts
- packages/engine-core/src/action-test-fixtures.ts
- stories/approved/ENG-023B-queue-opponent-attack-effects.yaml
- agent-packets/ENG-023B.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-023B packet while implementing this story
- run corepack pnpm run packets:verify before implementation and review handoff
- stay within allowed_touch_points
- target the ENG-023 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- changes to battle-counter-actions.ts or battle-resolution.ts are limited to attack-timing queue integration at Counter Step entry
- if implementation requires Counter action semantics, Blocker semantics, target-selection, Life Trigger, On K.O., or replacement behavior, stop and split or record the blocker
- implementation-review gate is required after the PR is opened
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/battle-declare-attack.test.ts packages/engine-core/src/battle-pipeline-regression.test.ts packages/engine-core/src/effect-runtime.test.ts packages/engine-core/src/event-sequencing-regression.test.ts
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

- defender On Your Opponent's Attack effects queue only at Counter Step entry after attacker timing and Block Step have completed
- defender attack-response timing resolves before ordinary Counter Step actions or Counter Step pass decisions are created
- supported no-choice defender timing effects queue and resolve deterministically
- source presence uses mustRemainInSameZone and fails closed without mutation when violated
- battle continues through the existing battle pipeline when participants remain legal

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
