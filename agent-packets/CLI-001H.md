<!-- agent-packet:story-id CLI-001H -->
<!-- agent-packet:story-path stories/approved/CLI-001H-play-card-terminal-smoke.yaml -->
<!-- agent-packet:story-sha256 6c70461771ee779b2c143cf9876d76dc550d911b231f70b2d1641ff1f1fea39e -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-001H
Epic ID: M1-001
Title: Add terminal smoke coverage for play-card flows
Type: verification
Area: engine
Primary Concern: verification

## Why

Add CLI-level deterministic smoke coverage proving the terminal runner can drive vanilla play-card flows through command scripts after the play command, play-card responses, and terminal loop exist.

## Authoritative Spec References

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

Own only CLI-level scripted verification for the play-card terminal path. Stop before defining production replay storage, broad card-data loading, browser UI, server protocol behavior, or new engine gameplay rules.

## Scope

- add deterministic CLI command-script fixtures that include `play <handIndex>` and any supported play-card `respond <choice>` paths from CLI-001F
- prove the terminal runner can play vanilla Character and Stage cards from hand using engine-core behavior
- prove repeated execution of the same command script produces the same final hash and stable required output fields
- prove material command-script or fixture-stat drift changes the final hash or fails a checkpoint assertion
- keep smoke fixtures local to CLI verification and avoid defining a production replay artifact schema

## Out of Scope

- production replay schema, replay viewer, rollback, recovery, or persisted replay storage
- live Poneglyph fixture loading, card-data adapter work, deck builder behavior, or account/loadout persistence
- Event-card effects, On Play effects, blocker/counter/trigger behavior, or full effect runtime
- browser UI, match-server protocol, transport envelopes, Redis, WebSocket, React, or database behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/**
- tests/cli/**
- fixtures/replays/**

## Constraints

- story-review completed before approval for the CLI follow-up slice set
- use the parent integration branch workflow for the CLI-001E through CLI-001H group
- keep one active CLI substory packet at a time
- smoke fixtures must be deterministic and exclude transport timestamps, signatures, client IDs, and nondeterministic metadata
- do not add production replay schema or storage behavior in this story
- do not add engine gameplay behavior in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- CLI smoke test for deterministic vanilla Character play from hand
- CLI smoke test for deterministic vanilla Stage play or Stage replacement from hand
- CLI smoke test that exercises `respond pay:<donIndex>[,<donIndex>...]` after a play-card payment decision
- CLI smoke test that exercises `respond cards:<cardRef>[,<cardRef>...]` after a Character overflow decision
- negative test proving command-script drift or manifest-stat drift changes the final hash or fails an assertion
- test proving all smoke-script post-action outputs include state sequence, phase/status, pending decision, legal actions, and state hash

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- command-script smoke tests run under root verification without requiring an interactive terminal
- at least one smoke script plays a vanilla Character from hand and reaches a deterministic checkpoint hash
- at least one smoke script plays or replaces a vanilla Stage from hand and reaches a deterministic checkpoint hash
- at least one smoke script uses `respond pay:<donIndex>[,<donIndex>...]` to complete a nonzero-cost play-card payment decision
- at least one smoke script uses `respond cards:<cardRef>[,<cardRef>...]` to complete a Character overflow selection decision
- repeated execution of each play-card CLI smoke script produces the same final hash
- material command-script or fixture-stat drift changes the final hash or fails a checkpoint assertion

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
