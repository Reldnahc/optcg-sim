<!-- agent-packet:story-id CLI-001F -->
<!-- agent-packet:story-path stories/approved/CLI-001F-play-card-decision-responses.yaml -->
<!-- agent-packet:story-sha256 17c4c1eb122193545fc10d2204a03f0172232ce7d3d01a6a1ec009c860225ea8 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-001F
Epic ID: M1-001
Title: Route terminal responses for play-card decisions
Type: implementation
Area: engine
Primary Concern: cli

## Why

Extend the existing `respond <choice>` CLI path beyond mulligan responses so one developer can answer play-card payment decisions and Character overflow selection decisions produced by engine-core.

## Authoritative Spec References

- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
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

Own only deterministic CLI response parsing and routing for existing engine-core pending decisions created by play-card actions. Stop before changing decision contracts, adding new engine decisions, or implementing unsupported effect/counter/trigger decisions.

## Scope

- preserve existing `respond keep` and `respond mulligan` behavior for mulligan decisions
- add deterministic CLI response grammar for existing play-card `PayCostDecision` payloads: `respond pay:<donIndex>[,<donIndex>...]`, where indexes address the decision player's cost area
- add deterministic CLI response grammar for existing Character overflow `SelectCardsDecision` payloads: `respond cards:<cardRef>[,<cardRef>...]`, where card refs use the existing CLI board-reference syntax such as `character:0` or `self-character:0`
- route supported response input through existing engine-core `respondToDecision` action handling
- resolve payment DON!! selections from current cost-area indexes without exposing hidden opponent zones
- resolve Character overflow selections from visible controller board references only
- rely on existing engine-core behavior for automatic Stage replacement after successful play/payment, without adding a Stage replacement selection response
- fail closed without mutation for malformed response grammar, wrong decision type, stale references, duplicate selections, or unsupported decision types
- render post-response state sequence, phase/status, pending decision, legal actions, and state hash using existing CLI output conventions

## Out of Scope

- changing engine-core pending decision shapes, IDs, or legal response validation
- adding counter, trigger, blocker, Event-card, effect-runtime, or replacement-effect decision support
- adding public/player/spectator view filtering policy
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
- response routing must use existing engine-core APIs rather than reimplementing decision validation in the CLI
- do not modify canonical decision contracts or engine gameplay rules in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- regression tests for existing mulligan `respond keep` and `respond mulligan`
- parser and dispatch tests for `respond pay:<donIndex>[,<donIndex>...]`
- parser and dispatch tests for `respond cards:<cardRef>[,<cardRef>...]`
- negative tests for malformed responses, stale references, duplicate selections, and wrong pending decision type
- test proving post-response output includes state sequence, phase/status, pending decision, legal actions, and state hash

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `respond keep` and `respond mulligan` continue to work for mulligan decisions
- supported payment and selection CLI responses resume existing engine-core play-card decisions
- malformed, stale, duplicate, or decision-type-mismatched responses fail closed without mutating state or hash
- CLI output after a supported response includes state sequence, phase/status, pending decision, legal actions, and state hash
- the story does not alter engine decision contracts or gameplay validation

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
