<!-- agent-packet:story-id ENG-032A -->
<!-- agent-packet:story-path stories/approved/ENG-032A-split-declare-attack-legality-tests.yaml -->
<!-- agent-packet:story-sha256 72fa1fa672bcc012116b6635ea16fd64f9c60b814bf3883252468712cab32ac2 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-032A
Epic ID: KICK-001
Title: Split declare attack legality tests
Type: refactor
Area: engine
Primary Concern: verification

## Why

Move existing declare-attack legal-action and rejection tests out of battle-declare-attack.test.ts into a focused legality test file without changing assertions, fixtures, errors, events, state hashes, or behavior.

## Authoritative Spec References

- 02-engine-mechanics.s005 (Zones)
- 02-engine-mechanics.s014 (Main Phase)
- 02-engine-mechanics.s018 (Attack Step)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 06-visibility-security.s007 (Legal-action visibility)
- 11-testing-quality.s007 (Interaction tests)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s005 (Zones)

Each player owns one of each zone.

| Zone           |                 Visibility |                  Ordering | Notes                                                                                                                                                                                                                                        |
| -------------- | -------------------------: | ------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deck           |                     Secret |                   Ordered | Neither player sees contents or order. Draw from top.                                                                                                                                                                                        |
| DON!! Deck     |                       Open |                   Ordered | Contents are effectively identical for gameplay, but art may vary cosmetically.                                                                                                                                                              |
| Hand           |         Secret to opponent |                 Unordered | Owner sees all; opponent sees count only.                                                                                                                                                                                                    |
| Trash          |                       Open |                   Ordered | Face-up public zone. New cards placed on top unless effect says otherwise.                                                                                                                                                                   |
| Leader Area    |                       Open |               Single slot | Exactly one leader. Cannot leave by normal effects/rules.                                                                                                                                                                                    |
| Character Area |                       Open |               Board slots | 0–5 characters. If a player would play a sixth Character, they reveal the new card, trash 1 Character already in their Character Area, and then play the new Character. This trash is rule processing, not K.O., and cannot trigger effects. |
| Stage Area     |                       Open |               Single slot | 0–1 stage. Playing a new stage trashes the old one first.                                                                                                                                                                                    |
| Cost Area      |                       Open | Multiset/cards with state | DON!! cards with active/rested state.                                                                                                                                                                                                        |
| Life Area      | Secret except face-up life |                   Ordered | Top card is taken for damage. Some cards may be face-up by effect.                                                                                                                                                                           |
| No Zone        |                 Contextual |                       N/A | Temporary location for resolving life triggers or effects.                                                                                                                                                                                   |

### 02-engine-mechanics.s014 (Main Phase)

Before the turn player receives action priority, emit `phaseStarted(main)`, collect `[Start of Main Phase]` triggers, and resolve required automatic effects. If any pending decision is created, Main Phase action priority does not begin until that decision and the resulting queue are complete.

Turn player may repeatedly:

- Play a Character, Stage, or `[Main]` Event from hand.
- Activate `[Activate: Main]` effects.
- Give active DON!! to Leader or Characters.
- Declare an attack, if legal.
- End the phase.

Neither player can attack on their first turn.

### 02-engine-mechanics.s018 (Attack Step)

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

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

Own only behavior-preserving test-file organization for base declare-attack legality, legal-action projection, active battle suppression, and initial rejection coverage currently in battle-declare-attack.test.ts.

## Scope

- move Leader-to-Leader and Character-to-rested-Character declareAttack legal-action coverage from battle-declare-attack.test.ts
- move active battle legal-action suppression and applyAction rejection coverage from battle-declare-attack.test.ts
- move declareAttack rejection cases and mutation-safety coverage from battle-declare-attack.test.ts
- preserve existing test names or equivalent names that identify the same behavior
- keep assertions, fixtures, legal-action visibility checks, errors, event expectations, and mutation checks behavior-equivalent

## Out of Scope

- changing production code
- changing declareAttack legality behavior
- moving Rush, attack timing, battle damage, Blocker, Counter, Banish, K.O., Life Trigger, or pipeline regression tests
- broad test-helper refactors outside moved declare-attack legality tests

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-declare-attack.test.ts
- packages/engine-core/src/battle-declare-attack-legality.test.ts
- stories/generated/ENG-032A-split-declare-attack-legality-tests.yaml
- stories/approved/ENG-032A-split-declare-attack-legality-tests.yaml
- agent-packets/ENG-032A.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-032A packet while implementing this story
- target the ENG-032 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- this is a behavior-preserving test organization story; if a production change appears necessary, stop and split or record an ambiguity
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/battle-declare-attack.test.ts packages/engine-core/src/battle-declare-attack-legality.test.ts
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

- battle-declare-attack.test.ts no longer contains the moved base declare-attack legality and rejection test groups
- battle-declare-attack-legality.test.ts covers the same base declare-attack legality and rejection scenarios with behavior-equivalent expectations
- no production files change
- focused tests, coverage, and full verify pass

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
