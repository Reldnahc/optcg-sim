<!-- agent-packet:story-id CLI-001G -->
<!-- agent-packet:story-path stories/approved/CLI-001G-interactive-terminal-loop.yaml -->
<!-- agent-packet:story-sha256 1cf73cd179379bc4918f79716cf565552f8ae9226d5329d644e428f0456afd62 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-001G
Epic ID: M1-001
Title: Add interactive terminal runner loop
Type: implementation
Area: engine
Primary Concern: cli

## Why

Replace the boot-summary-only CLI entry behavior with a deterministic testable terminal loop that lets one developer play both sides using the already-supported CLI command dispatcher.

## Authoritative Spec References

- 12-roadmap.s005 (Milestone 1: terminal engine)
- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

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

Own only the terminal runner loop and process entry behavior for local one-developer play. Stop before adding network protocol semantics, production account/deck loading, TTY UI polish, or new engine gameplay behavior.

## Scope

- keep the existing boot-summary mode available for deterministic smoke checks
- add a non-interactive command-script mode that boots the fixture match and dispatches a supplied sequence of CLI commands
- add an interactive stdin/stdout loop mode that boots the fixture match, accepts one command per line, and prints command output after each dispatch
- terminate cleanly on end-of-input, explicit quit/exit input, or completed match status
- ensure every dispatched command prints state sequence, phase/status, pending decision, legal actions, and state hash when command output is state-bearing
- make the loop testable with injected input/output streams rather than requiring a real TTY

## Out of Scope

- new engine actions, rules, or decision contracts
- production deck loading, account/loadout persistence, Poneglyph HTTP access, or card-data package work
- readline history, curses layout, ANSI styling, autocomplete, command aliases, or terminal UX polish
- match-server protocol, WebSocket transport, browser UI, Redis, or database behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/**
- package.json
- tests/cli/**

## Constraints

- story-review completed before approval for the CLI follow-up slice set
- use the parent integration branch workflow for the CLI-001E through CLI-001H group
- keep one active CLI substory packet at a time
- loop behavior must remain deterministic and testable without an interactive TTY
- do not add production deck loading or server/client behavior in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- unit or integration test for command-script mode with a short deterministic command sequence
- injected-stream test for interactive loop startup, command dispatch, and clean exit
- regression test proving boot-summary mode still returns the deterministic fixture summary
- negative test proving an unsupported CLI argument exits nonzero with a deterministic error

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- the CLI can run the deterministic boot-summary mode that already exists
- command-script mode can boot a fixture match, dispatch commands in order, and return deterministic output and final hash
- interactive mode can be tested with injected streams and does not require a real TTY in automated tests
- the loop exits cleanly on EOF, quit/exit, or completed match status
- the story does not alter engine gameplay behavior

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
