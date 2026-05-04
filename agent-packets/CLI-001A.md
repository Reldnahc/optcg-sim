<!-- agent-packet:story-id CLI-001A -->
<!-- agent-packet:story-path stories/approved/CLI-001A-terminal-runner-package-skeleton.yaml -->
<!-- agent-packet:story-sha256 801ed3ffe95977476f9593b4910dcd8edda593f024290a268dcf473161dd8cc5 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-001A
Epic ID: M1-001
Title: Add terminal runner package skeleton
Type: implementation
Area: engine
Primary Concern: cli

## Why

Add the first CLI runner package and command entry point that can boot a deterministic fixture match from existing engine-core setup primitives without implementing command rendering or interactive action dispatch yet.

## Authoritative Spec References

- 12-roadmap.s005 (Milestone 1: terminal engine)
- 12-roadmap.s015 (Immediate next tasks)
- 15-implementation-kickoff.s004 (Package bootstrap order)
- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s009 (Hardcoded card metadata policy)
- 15-implementation-kickoff.s012 (Guardrails)
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

### 12-roadmap.s015 (Immediate next tasks)

1. Create `@optcg/types` skeleton.
2. Define `GameState`, `PlayerView`, `Action`, `EngineEvent`, `PendingDecision` types.
3. Write invariant utilities.
4. Implement deterministic RNG wrapper.
5. Implement setup and vanilla turn flow.
6. Create CLI runner.
7. Add first golden replay test.

### 15-implementation-kickoff.s004 (Package bootstrap order)

```text
packages/
  types/
  engine-core/
  effects/
  cards/
  view-engine/
  match-server/
  api/
  client/
  bot/
integration/
fixtures/
```

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

### 15-implementation-kickoff.s012 (Guardrails)

- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code.
- The client must not import `engine-core` once hidden state exists; use `view-engine`.
- The card-data package may call Poneglyph, but effect resolution must consume resolved manifests, not live HTTP calls.
- Unsupported cards must fail closed outside dev sandbox.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only the package skeleton, executable command wiring, and deterministic fixture match boot path for the terminal runner. Stop before adding the full command parser, terminal rendering surface, card play behavior, or new engine rules.

## Scope

- add a workspace package for the terminal runner without browser, server, database, Redis, WebSocket, React, or live HTTP dependencies
- expose a package-local command entry point that can be invoked by a root or package script
- build a deterministic hardcoded fixture setup input using existing engine-core primitives and checked-in fixture metadata
- start the official mulligan flow from the deterministic initial state
- return or print a minimal boot summary containing state sequence, phase/status, pending decision presence, and state hash
- keep the boot path deterministic across repeated invocations with the same seed and fixture input

## Out of Scope

- interactive readline loop
- command parser for gameplay commands
- `show`, `hand`, legal-action, or computed-view rendering
- applying gameplay actions from terminal input
- implementing `play <handIndex>` or any engine card-play behavior
- Poneglyph HTTP access, card-data package work, browser UI, server protocol, persistence, or replay storage

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/**
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- tsconfig.base.json
- tests/contracts/**
- tests/cli/**

## Constraints

- do not approve or packetize this story until the CLI child-story set has passed story-review
- use the parent integration branch workflow for the CLI-001 child-story group if the group is approved
- keep one active CLI substory packet at a time
- do not add or modify engine gameplay rules in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- package or integration test proving the CLI boot helper returns a deterministic state hash for repeated fixture boots
- package-boundary test proving the CLI package depends only on allowed local packages and standard Node APIs
- script or command smoke test proving the entry point can run without entering an interactive loop

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- the CLI package is part of the workspace and can compile under the repo typecheck flow
- invoking the command boots the same deterministic fixture match with the same final boot hash on repeated runs
- the boot path reaches the first pending mulligan decision using existing engine-core APIs
- the package boundary excludes server, browser, Redis, Postgres, WebSocket, React, and live HTTP imports

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
