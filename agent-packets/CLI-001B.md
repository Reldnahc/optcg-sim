<!-- agent-packet:story-id CLI-001B -->
<!-- agent-packet:story-path stories/approved/CLI-001B-terminal-runner-state-rendering.yaml -->
<!-- agent-packet:story-sha256 a69d8cf65a4282506c17295d5236404aada918a2e872deee9db5a85661357fbe -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-001B
Epic ID: M1-001
Title: Render terminal runner game state
Type: implementation
Area: engine
Primary Concern: cli

## Why

Add deterministic terminal rendering helpers for the CLI runner so a developer can inspect the booted match state, current hand, legal actions, pending decision, state sequence, phase, and state hash.

## Authoritative Spec References

- 12-roadmap.s005 (Milestone 1: terminal engine)
- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s009 (Hardcoded card metadata policy)
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

### 15-implementation-kickoff.s009 (Hardcoded card metadata policy)

Use fixture cards that look like resolved Poneglyph records, even before `@optcg/cards` is implemented.

```ts
const OP01_001: CardMetadata = {
  cardId: "OP01-001" as CardId,
  source: "poneglyph-fixture",
  name: "Fixture Leader",
  category: "leader",
  color: ["red"],
  life: 5,
  power: 5000,
  text: "",
};
```

This keeps the transition to real Poneglyph data straightforward.

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

Own only terminal-safe rendering for already-available CLI runner state and existing engine-core views/actions. Stop before implementing interactive command parsing, action dispatch, card play, or new engine view/filtering contracts.

## Scope

- add rendering helpers for the `show`, `hand`, `legal actions`, `pending decision`, `state sequence`, `current phase`, and `state hash` output required by the CLI runner spec
- render deterministic text snapshots with stable ordering for players, zones, cards, legal actions, and attack targets
- make `hand` output explicitly developer-local for the active or pending player in the one-developer terminal runner and avoid presenting it as a public/player-view filtering policy
- render manifest-derived card labels from checked-in fixture metadata when available, while preserving deterministic fallback identifiers for fixture cards
- keep rendering read-only and free of state mutation

## Out of Scope

- interactive readline loop
- command parser or action dispatch
- public `PlayerView`, spectator view, or hidden-information filtering contracts
- engine-core `computeView` behavior changes
- implementing card play or any new gameplay action
- ANSI styling, curses-style UI, browser UI, replay views, or server protocol output

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/**
- tests/cli/**

## Constraints

- do not activate this story until CLI-001A is done on the parent integration branch
- rendering must remain deterministic and testable without an interactive TTY
- do not add production hidden-information filtering policy in this story
- do not add engine gameplay behavior in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- snapshot or string-assertion test for deterministic `show` output from a booted fixture match
- test proving `hand` output is deterministic and scoped to the requested player context
- test proving legal-action rendering reflects existing engine-core legal actions after fixture boot
- regression test proving render helpers do not mutate the input state or change its hash

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- rendering a booted fixture match includes state sequence, phase/status, pending decision, legal actions, and state hash
- `show` output is deterministic for repeated fixture boots
- `hand` output is available only as developer-local terminal output and does not create or modify production view/filtering APIs
- rendering legal actions uses existing engine-core legal-action data instead of inventing CLI-only legality

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
