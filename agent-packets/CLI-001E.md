<!-- agent-packet:story-id CLI-001E -->
<!-- agent-packet:story-path stories/approved/CLI-001E-play-card-command-dispatch.yaml -->
<!-- agent-packet:story-sha256 23b180c1fdd9e17b4ece1542a371c4c5fc972321ce99bccc6619d7277b5cc3ce -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-001E
Epic ID: M1-001
Title: Dispatch terminal play-card commands from hand
Type: implementation
Area: engine
Primary Concern: cli

## Why

Replace the current fail-closed `play <handIndex>` CLI placeholder with deterministic dispatch into the existing engine-core `playCard` action so the terminal runner can start vanilla Character and Stage play-card flows.

## Authoritative Spec References

- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 12-roadmap.s005 (Milestone 1: terminal engine)
- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

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

Own only CLI parsing/dispatch support that converts a current player's hand index into an existing engine-core `playCard` action and renders the resulting engine output. Stop before adding new engine gameplay rules, new action contracts, or decision-response grammars for payment and overflow choices.

## Scope

- map `play <handIndex>` to the current actor''s hand card, resolve that card''s existing `instanceId`, and dispatch `applyAction(state, { type: "playCard", cardInstanceId })`
- resolve the actor from pending decision player when present, otherwise from the turn player, matching existing CLI command actor behavior
- fail closed without mutation when the hand index is missing, stale, points at no card, or the selected card is not currently playable by engine legality
- surface engine errors, pending decisions, state sequence, phase/status, legal actions, and state hash using existing CLI output conventions
- preserve the current deterministic parser behavior for all other CLI commands

## Out of Scope

- payment, Stage replacement, Character overflow, or other play-card decision response input grammar
- new engine-core card-play behavior, action types, legality rules, or decision contracts
- Event card effects, On Play effects, blocker/counter/trigger behavior, or full effect runtime
- interactive readline loop
- browser UI, match-server protocol, persistence, Redis, WebSocket, React, or live Poneglyph access

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/**
- tests/cli/**

## Constraints

- story-review completed before approval for the CLI follow-up slice set
- use the parent integration branch workflow for the CLI-001E through CLI-001H group
- keep one active CLI substory packet at a time
- command dispatch must use existing engine-core APIs rather than reimplementing rules in the CLI
- do not modify canonical action contracts or engine gameplay rules in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- parser regression proving `play <handIndex>` command shape remains deterministic
- dispatch test proving a playable fixture hand card resolves to `cardInstanceId` and moves through existing engine-core `playCard`
- dispatch test proving a play that creates a pending engine decision is surfaced in CLI output
- negative test proving a stale or out-of-range hand index fails closed without state or hash mutation
- regression test proving unsupported or illegal engine `playCard` results surface engine errors without CLI-only state mutation

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `play <handIndex>` dispatches a valid hand card through the existing engine-core `playCard` path using the canonical `cardInstanceId` action field
- successful zero-decision vanilla play updates state, events, pending decisions if any, and state hash through the normal `EngineResult`
- invalid or stale hand indexes return deterministic CLI errors without mutating the input state or hash
- CLI output after `play` includes state sequence, phase/status, pending decision, legal actions, and state hash
- the story does not alter engine gameplay behavior or canonical action contracts

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
