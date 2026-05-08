<!-- agent-packet:story-id ENG-032C -->
<!-- agent-packet:story-path stories/approved/ENG-032C-split-attack-timing-tests.yaml -->
<!-- agent-packet:story-sha256 09fc990fa4be2bfde68c0e52d0bb40b1dd700f2d5e4a8686bdd423bebd5b4529 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-032C
Epic ID: KICK-001
Title: Split attack timing tests
Type: refactor
Area: engine
Primary Concern: verification

## Why

Move existing When Attacking and On Your Opponent's Attack tests out of battle-declare-attack.test.ts into a focused attack-timing test file without changing assertions, fixtures, errors, events, state hashes, or behavior.

## Authoritative Spec References

- 02-engine-mechanics.s005 (Zones)
- 02-engine-mechanics.s006 (Zone transition rules)
- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s020 (Counter Step)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
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

### 02-engine-mechanics.s006 (Zone transition rules)

When a card moves from field to another zone, it becomes a new card instance. Applied effects are stripped. Instance identity must reset when appropriate.

```ts
interface CardInstance {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  turnPlayed?: number;
  attachedDon?: InstanceId[];
}
```

When multiple cards are placed into a zone simultaneously, the owner chooses their order. If the destination is secret, the opponent must not see the chosen order unless the game rules explicitly reveal it.

When a card with attached DON!! leaves the field, attached DON!! return to the owner's cost area rested.

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

### 03-game-state-events-decisions.s018 (Canonical event visibility)

Each `EngineEvent` has one visibility policy:

```text
public          safe for both players immediately
private         visible only to listed player IDs
replayOnly      hidden during live play but available in completed full replay
serverOnly      never leaves trusted server/runtime logs
```

Visibility is independent of replay determinism. Replay artifacts may store information that was never sent to either player during the live match.

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

Own only behavior-preserving test-file organization for attack timing effect coverage currently in battle-declare-attack.test.ts.

## Scope

- move supported attacker When Attacking legal-action and resolution coverage from battle-declare-attack.test.ts
- move defender On Your Opponent's Attack resolution and ordering coverage from battle-declare-attack.test.ts
- move same-player multiple timing fail-closed coverage from battle-declare-attack.test.ts
- move unsupported attacker and defender attack timing fail-closed and hidden-identity leakage coverage from battle-declare-attack.test.ts
- preserve deterministic event-order and Counter Step ordering assertions

## Out of Scope

- changing production code
- changing attack timing, Block Step, or Counter Step behavior
- moving base declare-attack legality, Rush, battle damage, Blocker, Counter, Banish, K.O., Life Trigger, or pipeline regression tests

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-declare-attack.test.ts
- packages/engine-core/src/battle-declare-attack-timing.test.ts
- stories/generated/ENG-032C-split-attack-timing-tests.yaml
- stories/approved/ENG-032C-split-attack-timing-tests.yaml
- agent-packets/ENG-032C.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-032C packet while implementing this story
- target the ENG-032 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- this is a behavior-preserving test organization story; if a production change appears necessary, stop and split or record an ambiguity
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/battle-declare-attack.test.ts packages/engine-core/src/battle-declare-attack-rush.test.ts packages/engine-core/src/battle-declare-attack-timing.test.ts
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

- battle-declare-attack.test.ts no longer contains the moved attack timing test groups
- battle-declare-attack-timing.test.ts covers the same attack timing scenarios with behavior-equivalent expectations
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
