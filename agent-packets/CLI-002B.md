<!-- agent-packet:story-id CLI-002B -->
<!-- agent-packet:story-path stories/approved/CLI-002B-cli-automatic-phase-advancement.yaml -->
<!-- agent-packet:story-sha256 ea67562bea423bb385106f323a469cf63ad6ebe04c3357f59d8074bfc5cfccf1 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-002B
Epic ID: M1-001
Title: Add CLI automatic phase advancement
Type: implementation
Area: engine
Primary Concern: cli

## Why

Teach the terminal runner to advance through existing automatic engine phases after normal boot and turn pass commands so command scripts can reach Main Phase action priority without test-only setup mutation shortcuts.

## Authoritative Spec References

- 02-engine-mechanics.s003 (Rule-processing checkpoints)
- 02-engine-mechanics.s011 (Refresh Phase)
- 02-engine-mechanics.s012 (Draw Phase)
- 02-engine-mechanics.s013 (DON!! Phase)
- 02-engine-mechanics.s014 (Main Phase)
- 02-engine-mechanics.s015 (End Phase)
- 02-engine-mechanics.s035 (Exact win/loss conditions)
- 02-engine-mechanics.s037 (First-turn restrictions)
- 12-roadmap.s005 (Milestone 1: terminal engine)
- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)

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

### 02-engine-mechanics.s011 (Refresh Phase)

1. Expire effects that end at the start of this player's turn.
2. Queue/resolve start-of-turn triggers.
3. Return attached DON!! to cost area rested.
4. Set the turn player's Leader, Characters, Stage, and Cost Area cards active.

### 02-engine-mechanics.s012 (Draw Phase)

1. Turn player draws one card.
2. First player skips this draw on their first turn.

### 02-engine-mechanics.s013 (DON!! Phase)

1. Place two DON!! from DON!! Deck into cost area active.
2. First player places only one on their first turn.
3. If fewer DON!! remain, place as many as possible.

### 02-engine-mechanics.s014 (Main Phase)

Before the turn player receives action priority, emit `phaseStarted(main)`, collect `[Start of Main Phase]` triggers, and resolve required automatic effects. If any pending decision is created, Main Phase action priority does not begin until that decision and the resulting queue are complete.

Turn player may repeatedly:

- Play a Character, Stage, or `[Main]` Event from hand.
- Activate `[Activate: Main]` effects.
- Give active DON!! to Leader or Characters.
- Declare an attack, if legal.
- End the phase.

Neither player can attack on their first turn.

### 02-engine-mechanics.s015 (End Phase)

1. Resolve `[End of Your Turn]` triggers controlled by the turn player.
2. Resolve `[End of Your Opponent's Turn]` triggers controlled by the non-turn player.
3. Expire end-of-turn effects in the correct order.
4. Swap turn player.
5. Proceed to the next Refresh Phase.

### 02-engine-mechanics.s035 (Exact win/loss conditions)

Run defeat checks at every rule-processing checkpoint:

1. **Leader damage at 0 Life** - if a player has 0 Life cards and their Leader would take damage, that player loses.
2. **Deck-out** - if a player has 0 cards in deck at any rule-processing checkpoint, that player loses.
3. **Concession** - a player may concede at any time; concession is immediate and cannot be prevented or replaced by card effects.
4. **Effect-based win/loss** - card effects may directly cause a win or loss during effect resolution.
5. **Double loss** - if both players meet defeat conditions at the same rule-processing checkpoint, both lose and the match is a draw.

Rule processing happens after atomic state changes, including mid-effect. For example, if a player decks out while drawing during an effect, the loss is detected at the next rule-processing point.

### 02-engine-mechanics.s037 (First-turn restrictions)

The engine must track first/second player and each player's first turn.

| Player / turn                   |    Draw Phase |                DON!! Phase |        Attack |
| ------------------------------- | ------------: | -------------------------: | ------------: |
| Player going first, first turn  |       No draw |         Place only 1 DON!! | Cannot attack |
| Player going second, first turn | Draw normally | Place 2 DON!! if available | Cannot attack |

### 12-roadmap.s005 (Milestone 1: terminal engine)

Deliverables:

- `GameState` model.
- Setup, draw, DON!!, main, end phases.
- Play Character/Stage/Event skeleton.
- Attack/battle/damage with vanilla cards.
- Event journal.
- State hash.
- CLI runner.

Exit criteria:

- CLI can play a complete vanilla match through normal legal actions.
- Character play from hand exists.
- Stage play from hand exists.
- DON!! attach/refresh works.
- Attacks against Leader and rested Character work.
- Damage, life-to-hand, K.O., deck-out, and concession endings work.
- Every accepted action has stable state hash output.
- Event journal seq is strictly increasing.
- Golden replay reconstructs final hash.
- production `filterStateForPlayer` hidden-info tests consume real engine output.
- Invariant tests pass after every accepted action.

Milestone 1 does not include server, client, Poneglyph live adapter, Redis, ranked, or broad card pool work.

### 15-implementation-kickoff.s007 (Step 3 - CLI runner)

A CLI runner should allow one developer to play both sides.

Minimum CLI commands:

```text
show
hand
play <handIndex>
attach-don <donIndex> <target>
attack <attacker> <target>
counter <handIndex>
pass
respond <choice>
concede
hash
```

The CLI should print state sequence, current phase, pending decision, legal actions, and state hash after every action.

### 15-implementation-kickoff.s011 (Definition of done for kickoff)

- `pnpm test` passes.
- CLI can play a complete vanilla match through normal legal actions.
- Character play from hand exists.
- Stage play from hand exists.
- DON!! attach/refresh works.
- Attacks against Leader and rested Character work.
- Damage, life-to-hand, K.O., deck-out, and concession endings work.
- Every accepted action increments `stateSeq`.
- Every accepted action has stable state hash output.
- Every atomic mutation emits at least one `EngineEvent` or has an explicit no-event reason.
- Event journal seq is strictly increasing.
- `hashGameState()` is stable across repeated runs with the same seed.
- Golden replay reconstructs final hash.
- production `filterStateForPlayer` hidden-info tests consume real engine output
  and prove opponent hand, deck order, face-down life, RNG, and effect queue
  internals stay hidden.
- Milestone 1 does not include server, client, Poneglyph live adapter, Redis, ranked, or broad card pool work.

### 18-acceptance-tests.s003 (Milestone 1 - terminal engine)

```text
M1-001 setup creates legal starting state
M1-002 opening hand draw uses deterministic deck order
M1-003 official mulligan flow supports keep or redraw-five once per player in first-player-then-second-player order
M1-004 first player skips first draw
M1-005 first player gains only one DON!! on first turn
M1-006 second player cannot attack on their first turn
M1-007 active DON!! can be attached during Main Phase
M1-008 attached DON!! returns rested during Refresh Phase
M1-009 vanilla leader damage moves life to hand
M1-010 leader taking damage at 0 life loses at rule processing
M1-011 attacking rested character can K.O. it
M1-012 character played this turn cannot attack without Rush
M1-013 deck-out loses at rule-processing checkpoint
M1-014 concession immediately ends match and cannot be replaced
M1-015 state hash is stable for same seed and action log
M1-016 PlayerView hides opponent hand and deck order
M1-017 life setup orientation makes original deck top card bottom Life card
M1-018 attached DON!! has attached state and no active/rested state while attached
M1-019 start-of-main-phase trigger window resolves before Main Phase action priority
```

## Story Boundary

Own only CLI runner and dispatch behavior needed to continue through existing engine-core refresh, draw, DON!!, and main-phase transitions until player action priority, a pending decision, or match completion is reached. Do not add gameplay rules, new command grammar, replay schema, storage, UI, server protocol, or broad fixture/card-data loading.

## Scope

- add CLI-level advancement through existing engine phase APIs from active non-main phases to the next player-action point
- ensure `--command-script "respond keep;respond keep"` reaches normal Main Phase action priority from `bootFixtureMatch()` without smoke `setupScript`
- ensure `pass` from Main Phase ends the turn and the CLI reaches the next turn player's Main Phase action priority when no pending decision or terminal status intervenes
- preserve pending-decision handling by stopping advancement whenever a pending decision exists
- preserve completed or game-over status by stopping command-script execution when the match completes

## Out of Scope

- changing engine-core phase rules or legality rules
- adding new CLI command grammar
- implementing blockers, counters, triggers, Event cards, On Play effects, replacement effects, Rush, or other effect runtime behavior
- changing smoke fixture setup mutation helpers
- production replay schema, persisted replay storage, replay viewer, rollback, recovery, browser UI, server protocol, transport envelopes, Redis, WebSocket, React, or database behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/**

## Constraints

- story-review must complete before approval
- keep this story CLI-only unless story review rejects that boundary
- do not add engine gameplay behavior in this story
- do not add new CLI command grammar in this story
- must pass `corepack pnpm --filter @optcg/cli test`
- must pass `corepack pnpm run verify`

## Required Tests

- CLI command-script test proving `respond keep;respond keep` reaches Main Phase action priority from normal boot
- CLI command-script or dispatch test proving `pass` from Main Phase reaches the next turn player's Main Phase action priority
- regression test proving advancement does not skip pending decisions
- regression test proving completed matches stop command-script execution

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- command-script execution from normal boot can advance from completed mulligans into Main Phase action priority without `setupScript` mutation
- pass from Main Phase advances to the next turn player's Main Phase action priority through existing refresh, draw, and DON!! behavior when no pending decision or terminal status intervenes
- advancement stops without consuming commands when a pending decision exists
- advancement stops at completed or game-over status
- no new CLI command grammar is introduced
- existing CLI smoke and command tests continue to pass or are updated only for the intentional terminal phase-advancement behavior

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
