<!-- agent-packet:story-id CLI-002A -->
<!-- agent-packet:story-path stories/approved/CLI-002A-full-vanilla-terminal-match-smoke.yaml -->
<!-- agent-packet:story-sha256 40dbf64aa42e19da7d5d235b6480c931a973e95196e24b9ca42eeb2706fdc563 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-002A
Epic ID: M1-001
Title: Add full vanilla terminal match smoke
Type: verification
Area: engine
Primary Concern: verification

## Why

Add a deterministic CLI command-script smoke that proves the terminal runner can play a complete vanilla match from normal fixture boot through legal CLI commands, stable hashes, and a completed match result.

## Authoritative Spec References

- 02-engine-mechanics.s003 (Rule-processing checkpoints)
- 02-engine-mechanics.s014 (Main Phase)
- 02-engine-mechanics.s016 (Playing a card)
- 02-engine-mechanics.s017 (Battle sequence)
- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s035 (Exact win/loss conditions)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 02-engine-mechanics.s037 (First-turn restrictions)
- 11-testing-quality.s010 (Golden replay tests)
- 11-testing-quality.s012 (Replay drift tests)
- 12-roadmap.s005 (Milestone 1: terminal engine)
- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

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

### 02-engine-mechanics.s014 (Main Phase)

Before the turn player receives action priority, emit `phaseStarted(main)`, collect `[Start of Main Phase]` triggers, and resolve required automatic effects. If any pending decision is created, Main Phase action priority does not begin until that decision and the resulting queue are complete.

Turn player may repeatedly:

- Play a Character, Stage, or `[Main]` Event from hand.
- Activate `[Activate: Main]` effects.
- Give active DON!! to Leader or Characters.
- Declare an attack, if legal.
- End the phase.

Neither player can attack on their first turn.

### 02-engine-mechanics.s016 (Playing a card)

Playing a card from hand is a structured action:

```text
1. Reveal card from hand.
2. Compute total cost from base cost plus continuous cost modifiers.
3. Clamp final negative cost to 0.
4. Select required active DON!! in cost area.
5. Rest selected DON!!.
6. If playing a Character while character area is full, choose and trash one existing Character by rule process; no triggers.
7. If playing a Stage while stage area is full, trash existing Stage.
8. Place card in destination or trash Event before resolving Event effect.
9. Emit cardPlayed/cardMoved events.
10. Detect and queue [On Play] or Event effects as appropriate.
```

Cost payment should be represented as a `PendingDecision` if the player must choose exactly which DON!! or additional cards to pay.

### 02-engine-mechanics.s017 (Battle sequence)

A battle is a sub-state inside Main Phase.

### 02-engine-mechanics.s018 (Attack Step)

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s021 (Damage Step)

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

### 02-engine-mechanics.s035 (Exact win/loss conditions)

Run defeat checks at every rule-processing checkpoint:

1. **Leader damage at 0 Life** - if a player has 0 Life cards and their Leader would take damage, that player loses.
2. **Deck-out** - if a player has 0 cards in deck at any rule-processing checkpoint, that player loses.
3. **Concession** - a player may concede at any time; concession is immediate and cannot be prevented or replaced by card effects.
4. **Effect-based win/loss** - card effects may directly cause a win or loss during effect resolution.
5. **Double loss** - if both players meet defeat conditions at the same rule-processing checkpoint, both lose and the match is a draw.

Rule processing happens after atomic state changes, including mid-effect. For example, if a player decks out while drawing during an effect, the loss is detected at the next rule-processing point.

### 02-engine-mechanics.s036 (DON!! card mechanics)

- Each DON!! attached to a Leader or Character grants +1000 power during the controller's turn only.
- During Main Phase, a player may give any number of active DON!! from cost area to their Leader or Characters.
- An attached DON!! card has `state: "attached"`; it is neither active nor rested while attached.
- When a card with attached DON!! leaves the field, all attached DON!! return to the owner's cost area rested.
- During Refresh Phase, all attached DON!! return to cost area rested, then the player's Leader, Characters, Stage, and DON!! in cost area become active.
- A `DON!! -X` cost may return the paying player's DON!! from cost area, attached to their Leader, or attached to their Characters unless the card text narrows the source. The paying player chooses the DON!! sources. If there are fewer than X eligible DON!! cards, the cost cannot be paid and the activation is illegal or declined before use is consumed.

### 02-engine-mechanics.s037 (First-turn restrictions)

The engine must track first/second player and each player's first turn.

| Player / turn                   |    Draw Phase |                DON!! Phase |        Attack |
| ------------------------------- | ------------: | -------------------------: | ------------: |
| Player going first, first turn  |       No draw |         Place only 1 DON!! | Cannot attack |
| Player going second, first turn | Draw normally | Place 2 DON!! if available | Cannot attack |

### 11-testing-quality.s010 (Golden replay tests)

Store known game scripts and final state hashes.

```text
fixtures/replays/
  vanilla-basic-game.json
  blocker-counter-basic.json
  double-attack-life-trigger.json
  simultaneous-ko-triggers.json
  replacement-trigger-trash.json
```

CI replays them and checks:

- Final state hash.
- Checkpoint hashes.
- Event count/type sequence, optionally.
- No hidden-info leak in generated views.

### 11-testing-quality.s012 (Replay drift tests)

Whenever engine or effect definitions change:

1. Replay previous golden logs under the intended version bundle.
2. Compare checkpoint hashes.
3. Fail CI on unexpected drift.
4. Require migration/version-pin note for intentional drift.

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

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only end-to-end CLI-level verification for a complete supported vanilla terminal match. Stop before adding engine gameplay behavior, new CLI command grammar, production replay storage, browser UI, server protocol behavior, or broad fixture/card-data loading.

## Scope

- add one or more deterministic CLI command-script smoke scenarios that start from the normal CLI fixture boot path and do not rely on test-only state mutation after boot
- drive a complete supported vanilla match through existing CLI commands and existing engine behavior, including mulligan responses, turn progression, Character or Stage play as needed, DON!! attachment, attacks, pass/end-main progression, and a natural completed match result
- assert repeated execution of the full-match command script produces the same checkpoint hashes, final state hash, completed match status, and required post-action output fields
- assert material command-script or fixture-stat drift changes the final hash or fails a checkpoint assertion
- keep the smoke fixture local to CLI verification and avoid defining a production replay artifact schema

## Out of Scope

- implementing or changing engine gameplay behavior
- adding new CLI command grammar or interactive UX features
- adding blocker, counter, trigger, Event-card, On Play, Banish, Double Attack, Rush, replacement, or full effect-runtime behavior
- using test-only setup steps to skip normal fixture boot, normal phase progression, or normal legal CLI actions for the full-match path
- production replay schema, persisted replay storage, replay viewer, rollback, or recovery
- live Poneglyph fixture loading, card-data adapter work, deck builder behavior, account/loadout persistence, browser UI, server protocol, transport envelopes, Redis, WebSocket, React, or database behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/**
- tests/cli/**
- fixtures/replays/**

## Constraints

- story-review must complete before approval
- keep this story verification-only unless story review rejects that boundary
- do not add engine gameplay behavior in this story
- do not add new CLI command grammar in this story
- smoke fixtures must be deterministic and exclude transport timestamps, signatures, client IDs, and nondeterministic metadata
- do not add production replay schema or storage behavior in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- CLI smoke test for deterministic full vanilla terminal match completion through `--command-script`
- CLI smoke test proving the full-match script starts from normal fixture boot and does not use post-boot setup mutation shortcuts
- CLI smoke assertion that the full-match script exercises `respond`, `play`, `respond pay:<donIndex>[,<donIndex>...]`, `attach-don`, `attack`, and `pass`
- CLI smoke test proving repeated full-match execution has stable checkpoint hashes, final hash, completed status, and required output fields
- negative test proving command-script drift or manifest-stat drift changes the final hash or fails an assertion
- blocker-record or follow-up-story artifact if existing engine/CLI behavior cannot complete the match without broadening this story

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- command-script smoke tests run under root verification without requiring an interactive terminal
- at least one full-match script starts from normal CLI fixture boot and reaches a deterministic completed match status through normal legal CLI commands
- the full-match script includes normal terminal use of `respond`, `play`, `respond pay:<donIndex>[,<donIndex>...]`, `attach-don`, `attack`, and `pass` where each command is backed by existing engine behavior
- repeated execution of the full-match script produces the same checkpoint hashes, final hash, final status, and required post-action output fields: state sequence, phase/status, pending decision, legal actions, and state hash
- material command-script drift or fixture-stat drift changes the final hash or fails a checkpoint assertion
- if the full-match script cannot complete using existing engine and CLI behavior, the story fails closed with a parent-owned recorded blocker or follow-up story rather than implementing the missing engine or CLI behavior inline

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
