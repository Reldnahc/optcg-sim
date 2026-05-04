<!-- agent-packet:story-id ENG-002C -->
<!-- agent-packet:story-path stories/approved/ENG-002C-official-mulligan-flow.yaml -->
<!-- agent-packet:story-sha256 de4d4de1be86f080d87d48c92805a4ad840adfdf1168d6fbc2985217065a9771 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-002C
Epic ID: M1-001
Title: Add official mulligan flow
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add deterministic official mulligan decision and resolution flow after pre-mulligan setup so the engine can reach a legal post-mulligan starting state before phase progression begins.

## Authoritative Spec References

- 02-engine-mechanics.s008 (Setup sequence)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s019 (Deterministic RNG)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s008 (Setup sequence)

Use a deterministic setup flow:

```text
1. Validate decks, card support, format, banlist.
2. Determine first/second player.
3. Build initial full GameState.
4. Resolve start-of-game effects that modify setup.
5. Shuffle decks using recorded RNG.
6. Draw opening hands.
7. Handle official mulligan decisions: each player may once either keep or return all 5 to deck, reshuffle, and redraw 5, in first-player-then-second-player order.
8. Place Life from the top of deck equal to Leader life using the canonical orientation algorithm below.
9. Start first player's Refresh Phase.
```

Start-of-game effects that alter decks must happen before final shuffle and opening draw.

### 03-game-state-events-decisions.s004 (Engine result)

Every engine call returns a result object rather than only the new state.

```ts
interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  decisions?: PendingDecision[];
  errors?: EngineError[];
  stateHash: string;
}
```

For normal play there should be at most one active `pendingDecision` at a time. Tests may use arrays to inspect internal generated decisions.

### 03-game-state-events-decisions.s017 (Canonical decision routing)

All player choices are represented as `PendingDecision` and answered by exactly one action shape:

```ts
{
  type: ("respondToDecision", decisionId, response);
}
```

The engine validates the response against the current pending decision. The client never gets to submit raw target IDs or payment choices outside the active decision context.

The following decision families are implementation-required for Milestones 1-2:

```text
mulligan
chooseTriggerOrder
chooseOptionalActivation
payCost
selectTargets
selectCards
chooseEffectOption
confirmTriggerFromLife
chooseReplacement
orderCards
chooseCharacterToTrashForOverflow
```

Decision IDs are single-use. A response for an old decision ID is stale unless it is an exact idempotent retry already accepted by the match server.

### 03-game-state-events-decisions.s019 (Deterministic RNG)

The engine must never use `Math.random()`.

```ts
interface RngState {
  algorithm: "pcg32" | "xoshiro256ss" | "test-fixed";
  seedCommitment?: string;
  internalState: string;
  callCount: number;
}

interface RngDrawResult<T> {
  value: T;
  nextRng: RngState;
  event: EngineEvent;
}
```

All shuffle operations emit an event without exposing the resulting order to players.

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

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only mulligan pending-decision creation, keep/redraw-five resolution, and tests for first-player-then-second-player ordering inside engine-core. Do not implement phase progression, Main Phase actions, combat, CLI output, or live view filtering.

## Scope

- add an exported helper that starts official mulligan decisions from ENG-002B pre-mulligan setup state
- represent each mulligan choice with the canonical `MulliganDecision` and `respondToDecision` action shape
- require first player to choose keep or redraw-five before second player receives their mulligan decision
- allow each player to mulligan at most once
- when a player mulligans, return their opening hand to deck, deterministically reshuffle, and redraw five
- transition to active post-mulligan starting state after both players have resolved their mulligan choices
- run invariants and hash the authoritative state after each accepted mulligan response

## Out of Scope

- phase progression after post-mulligan start
- Main Phase legal actions
- play-card, attack, blocker, counter, and damage behavior
- hidden-information view filtering
- server timeout or clock behavior for pending decisions

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not approve this story until ENG-002B is done
- mulligan behavior must remain deterministic and must not call `Math.random`
- no phase progression, combat, or hidden-information filtering behavior may be added in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test for first-player-then-second-player mulligan decision ordering
- unit test for keep behavior
- unit test for redraw-five behavior with deterministic reshuffle
- unit test rejecting duplicate mulligan for the same player
- unit test proving post-mulligan state passes ENG-002A invariants and produces a stable hash

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- first player receives the first mulligan decision
- second player receives the second mulligan decision only after the first player resolves theirs
- keep leaves that player's opening hand and deck order unchanged
- mulligan redraws exactly five cards from a deterministic reshuffled deck
- a player cannot mulligan more than once
- both resolved choices transition the match to active post-mulligan start

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
