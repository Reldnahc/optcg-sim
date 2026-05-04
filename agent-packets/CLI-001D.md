<!-- agent-packet:story-id CLI-001D -->
<!-- agent-packet:story-path stories/approved/CLI-001D-terminal-runner-smoke-tests.yaml -->
<!-- agent-packet:story-sha256 d9067491cac9ec110f44b2cad0bb3ca376157b765c67e0fe319ca3ced17df68f -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-001D
Epic ID: M1-001
Title: Add terminal runner smoke coverage
Type: verification
Area: engine
Primary Concern: verification

## Why

Add CLI-level smoke coverage proving the terminal runner can drive supported deterministic vanilla match paths through command scripts and preserve stable hashes/output without defining production replay storage.

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

- Two sample decks can finish a vanilla match in CLI.
- Golden replay can reconstruct final hash.
- Invariant tests pass after every action.

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
- A CLI vanilla match can end by damage, deck-out, or concession.
- Every accepted action increments `stateSeq`.
- Every atomic mutation emits at least one `EngineEvent` or has an explicit no-event reason.
- `hashGameState()` is stable across repeated runs with the same seed.
- `filterStateForPlayer()` never leaks opponent hand, deck order, face-down life, RNG, or effect queue internals.

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

Own only CLI-level scripted smoke tests for the terminal runner behavior from CLI-001A through CLI-001C. Stop before adding production replay artifacts, interactive UX polish, server protocol behavior, or new engine gameplay rules.

## Scope

- add testable CLI command-script smoke fixtures for supported terminal runner paths
- prove a scripted CLI path can end a match by concession
- prove a scripted CLI path can end a match by supported Leader damage at 0 Life using existing ENG-003 engine behavior
- prove a scripted CLI path can surface deck-out terminal defeat when existing engine checkpoints produce it
- assert deterministic final hashes and required post-action output fields for the smoke scripts
- keep smoke fixtures local to CLI verification and avoid defining a production replay artifact schema

## Out of Scope

- production replay artifact schema
- persisted replay storage, rollback, recovery, or post-game replay viewing
- interactive TTY automation beyond deterministic command-script tests
- card play behavior or full card effect runtime
- blocker, counter, trigger, replacement, Banish, Double Attack, or unsupported combat paths
- browser UI, server protocol, transport envelopes, persistence, or live Poneglyph access

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/**
- tests/cli/**
- fixtures/replays/**

## Constraints

- do not activate this story until CLI-001C is done on the parent integration branch
- smoke fixtures must be deterministic and exclude transport timestamps, signatures, client IDs, and nondeterministic metadata
- do not add production replay schema or storage behavior in this story
- do not add engine gameplay behavior in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- CLI smoke test for deterministic boot through concession completion
- CLI smoke test for deterministic supported Leader-damage terminal defeat
- CLI smoke test for deterministic deck-out terminal defeat surfaced through existing engine rule-processing
- negative test proving command-script drift or manifest-stat drift changes the final hash or fails an assertion
- test proving all smoke-script post-action outputs include state sequence, phase/status, pending decision, legal actions, and state hash

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- CLI command-script smoke tests can run under root verification without requiring an interactive terminal
- concession, supported Leader-damage defeat, and deck-out defeat scripts reach deterministic completed match statuses
- repeated execution of the same CLI command script produces the same final hash and stable required output fields
- changing a material command-script action or fixture manifest stat changes the final hash or fails a checkpoint assertion

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
