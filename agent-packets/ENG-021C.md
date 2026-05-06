<!-- agent-packet:story-id ENG-021C -->
<!-- agent-packet:story-path stories/approved/ENG-021C-guard-battle-context-clear-timing.yaml -->
<!-- agent-packet:story-sha256 fd92ba717adeefbf3fa734844ace3e611cd193f040c5ef2d20a7c98305e303e4 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-021C
Epic ID: KICK-001
Title: Guard battle-context clear timing
Type: verification
Area: engine
Primary Concern: verification

## Why

Add regression coverage proving supported battle context is cleared only after timing, damage, cleanup, rule-processing, and event-journal work completes.

## Authoritative Spec References

- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s020 (Counter Step)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s022 (End of Battle)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s021 (Invariant hooks)
- 11-testing-quality.s007 (Interaction tests)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s018 (Attack Step)

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s019 (Block Step)

1. Defender may activate one legal `[Blocker]`, unless blocking is prohibited.
2. Blocker rests and becomes the current target.
3. Emit `blockerActivated`.
4. Queue `[On Block]` effects.
5. Resolve the block timing window.
6. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.

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

### 02-engine-mechanics.s021 (Damage Step)

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

### 02-engine-mechanics.s022 (End of Battle)

1. Queue/resolve end-of-battle triggers.
2. Expire battle-duration continuous effects.
3. Clear battle context.
4. Return to Main Phase.

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

### 03-game-state-events-decisions.s021 (Invariant hooks)

Run invariants after every accepted action and after every effect resolution in tests/dev.

Required invariants:

```ts
assertAllCardsInExactlyOneLocation(state);
assertNoDuplicateInstanceIds(state);
assertZoneOwnershipIsValid(state);
assertAttachedDonExistsAndBelongsToController(state);
assertCharacterAreaSizeAtMostFive(state);
assertStageAreaSizeAtMostOne(state);
assertLeaderAreaExactlyOne(state);
assertNoNegativeZoneCounts(state);
assertPendingDecisionHasLegalResponses(state);
assertEffectQueueEntriesHaveValidSourcesOrPolicies(state);
assertHiddenInfoNotPresentInPlayerViews(state);
```

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

Own only engine-core regression coverage and minimal test helpers for battle-context clear timing. Do not change production behavior in this story; if the tests expose a defect inside ENG-021A or ENG-021B cleanup routing, stop and report the blocker.

## Scope

- add regression assertions that supported accepted battle scripts retain battle context while Block Step or Counter Step decisions are pending
- add regression assertions that final accepted battle results have no battle context only after damage or no-damage comparison and End of Battle cleanup events have occurred
- assert cleanup event ordering after damage, card movement, K.O., counter, and blocker events where those events are present
- assert appended eventJournal suffix equality, full eventJournal ordering, invariant validity, and repeated-script state hash stability

## Out of Scope

- production cleanup-routing or rules behavior changes, including fixes for defects found in ENG-021A or ENG-021B routing; stop and report the blocker instead
- new card effects or new effect-runtime DSL primitives
- Life Triggers, On K.O., replacement effects, protection effects, End of Battle trigger resolution, production replay schema, server/client/UI, database, or CLI behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-actions.test.ts
- packages/engine-core/src/battle-pipeline-regression.test.ts
- packages/engine-core/src/event-sequencing-regression.test.ts
- packages/engine-core/src/battle-actions-test-fixtures.ts
- packages/engine-core/src/action-test-fixtures.ts
- stories/approved/ENG-021C-guard-battle-context-clear-timing.yaml
- agent-packets/ENG-021C.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-021C packet while implementing this story
- run corepack pnpm run packets:verify before implementation and review handoff
- stay within allowed_touch_points
- target the ENG-021 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- if implementation requires production cleanup-routing changes or new rules behavior, split or record the blocker
- implementation-review gate is required after the PR is opened
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- add or update package-local regression tests covering pending Block Step, pending Counter Step, final Leader damage, final Character K.O., and no-damage comparison cleanup states
- run corepack pnpm exec vitest run packages/engine-core/src/battle-actions.test.ts packages/engine-core/src/battle-pipeline-regression.test.ts packages/engine-core/src/event-sequencing-regression.test.ts
- run corepack pnpm --filter @optcg/engine-core typecheck
- run corepack pnpm run packets:verify
- run corepack pnpm run verify

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- regression coverage proves battle context remains present during supported pending Block Step and Counter Step decisions
- regression coverage proves battle context is absent only on final accepted battle results after supported cleanup
- cleanup event ordering is asserted after damage/K.O./card movement events where applicable
- event seq ordering, event ID uniqueness, eventJournal suffix equality, invariant validity, and state hash stability are asserted for the covered scripts
- no production files are changed; if a cleanup-routing defect from ENG-021A or ENG-021B is exposed, stop and report the blocker

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
