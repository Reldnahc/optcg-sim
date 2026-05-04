<!-- agent-packet:story-id CLI-001C -->
<!-- agent-packet:story-path stories/approved/CLI-001C-terminal-runner-command-dispatch.yaml -->
<!-- agent-packet:story-sha256 1b475a3cdc24eae7e2e372c31e443d61fcff7617db2295900b31a6e410e0613f -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-001C
Epic ID: M1-001
Title: Dispatch supported terminal runner commands
Type: implementation
Area: engine
Primary Concern: cli

## Why

Add command parsing and dispatch for the terminal runner using only existing engine-core actions and mulligan decision responses, with `play <handIndex>` recognized but fail-closed until a later card-play story owns engine behavior.

## Authoritative Spec References

- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 12-roadmap.s005 (Milestone 1: terminal engine)
- 12-roadmap.s015 (Immediate next tasks)
- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
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

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only CLI command parsing, validation, and dispatch into already-supported engine-core APIs. Stop before adding new engine action types, card-play rules, hidden-information view policy, or transport/server command semantics.

## Scope

- parse the minimum CLI commands `show`, `hand`, `play <handIndex>`, `attach-don <donIndex> <target>`, `attack <attacker> <target>`, `counter <handIndex>`, `pass`, `respond <choice>`, `concede`, and `hash`
- dispatch `respond <choice>` to existing mulligan decision response APIs when the pending decision is a mulligan decision and `<choice>` is `keep` or `mulligan`
- fail closed without mutation for `respond <choice>` when no supported pending decision exists or the choice is unsupported
- map `pass` to the existing end-main-phase action path when legal
- map `attach-don`, `attack`, and `concede` to existing engine-core `applyAction` actions using deterministic CLI reference resolution
- make `show`, `hand`, and `hash` read-only commands that use the rendering helpers from CLI-001B
- recognize `play <handIndex>` and `counter <handIndex>` as valid CLI command shapes but fail closed with deterministic unsupported messages without mutating state
- after each dispatched mutating command, produce the required state sequence, phase/status, pending decision, legal actions, and state hash output
- preserve engine-core errors and illegal-action results in CLI output without converting them into state mutations

## Out of Scope

- implementing engine card-play behavior, costs, board placement, card effects, or new action contracts
- adding new engine-core action types for CLI convenience
- network protocol envelopes, client action IDs, expected-state sequencing, signatures, timers, or persistence
- interactive terminal polish beyond a testable command dispatcher
- hidden-information view/filtering policy

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/**
- tests/cli/**

## Constraints

- do not activate this story until CLI-001B is done on the parent integration branch
- command dispatch must use existing engine-core APIs rather than reimplementing rules in the CLI
- do not modify canonical action contracts or engine gameplay rules in this story
- recognized unsupported commands must fail closed without mutation
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- parser tests for each minimum command shape from `15-implementation-kickoff.s007` and representative invalid commands
- dispatch tests for `respond keep` and `respond mulligan` pending-decision responses
- dispatch tests for `pass`, `attach-don`, `attack`, `concede`, and `hash`
- negative test proving unsupported `respond <choice>` paths fail closed without state mutation
- negative test proving `play <handIndex>` and `counter <handIndex>` fail closed without state mutation
- negative test proving illegal engine-core action results preserve the prior state and hash
- test proving post-dispatch output includes state sequence, phase/status, pending decision, legal actions, and state hash

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- supported commands parse deterministically and either dispatch to existing engine-core APIs or return a deterministic parse/unsupported error
- every minimum CLI command from `15-implementation-kickoff.s007` is either implemented through existing engine-core APIs or recognized and fail-closed without mutation
- `play <handIndex>` and `counter <handIndex>` are recognized but return unsupported results without mutating state or adding engine behavior
- mutating commands print or return state sequence, phase/status, pending decision, legal actions, and state hash after dispatch
- illegal engine actions are surfaced without mutating the prior state
- command dispatch can drive an already-supported fixture match through mulligan, phase progression, DON attachment, attack, defeat, and concession paths

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
