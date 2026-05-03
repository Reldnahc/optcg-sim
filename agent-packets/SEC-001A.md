<!-- agent-packet:story-id SEC-001A -->
<!-- agent-packet:story-path stories/approved/SEC-001A-hidden-info-fixture-assertion-contract.yaml -->
<!-- agent-packet:story-sha256 2260a51938ea5194160dbf2cf02c3c0817e7bf627fd4021e80ab89e8ae2bc00e -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SEC-001A
Epic ID: KICK-001
Title: Define hidden-information fixture assertion contract
Type: verification
Area: security
Primary Concern: verification

## Why

Define the first hidden-information fixture and assertion contract so future filtered-view stories can express leakage expectations without inventing a new harness or placeholder gameplay behavior.

## Authoritative Spec References

- 06-visibility-security.s004 (PlayerView shape)
- 06-visibility-security.s023 (Security checklist from source spec)
- 11-testing-quality.s011 (Hidden-information tests)
- 23-repo-tooling-and-enforcement.s012 (Hidden-information safety enforcement)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 06-visibility-security.s004 (PlayerView shape)

```ts
interface PlayerView {
  matchId: MatchId;
  playerId: PlayerId;
  stateSeq: StateSeq;
  actionSeq: number;
  turn: PublicTurnState;
  self: VisiblePlayerState;
  opponent: OpponentVisibleState;
  battle?: PublicBattleState;
  pendingDecision?: PublicDecision;
  legalActions: PublicLegalAction[];
  revealedCards: PublicRevealRecord[];
  effectEvents: PublicEffectEvent[];
  timers: PublicTimerState;
}
```

Do not include:

- Deck order.
- Opponent hand card IDs.
- Face-down life card IDs.
- RNG seed/internal state.
- Effect queue internals.
- Private decision candidates not visible to recipient.
- Internal crash/recovery metadata.

### 06-visibility-security.s023 (Security checklist from source spec)

Before sending any match data to a player, spectator, or replay consumer, assert:

- Opponent hand contains only count, not card IDs.
- Decks expose count only, not order or card IDs.
- Face-down life exposes count only, not card IDs.
- Revealed life cards are visible only while legally revealed.
- Private search/look candidates are visible only to the searching player unless `reveal=true`.
- RNG seed/state is absent.
- Internal effect queue is absent.
- Pending decisions are recipient-filtered.
- Auto-pass timing does not reveal whether hidden counter options existed.
- Spectator delay/filter policy was applied.

### 11-testing-quality.s011 (Hidden-information tests)

For every view-filtering change:

- Assert opponent hand card IDs absent.
- Assert deck order absent.
- Assert face-down life absent.
- Assert RNG state absent.
- Assert effect queue internals absent.
- Assert temporary reveals are recipient-filtered.
- Assert declined triggers never reveal card IDs.
- Assert spectator policy applied.

Create fixtures for each reveal scenario.

### 23-repo-tooling-and-enforcement.s012 (Hidden-information safety enforcement)

The repo must include automated checks aimed specifically at data leakage risk.

Required enforcement includes:

- tests that assert `filterStateForPlayer()` excludes opponent hand contents, deck order, face-down life identity, RNG state, and non-public queue internals,
- tests that spectator modes obey configured information policy,
- bundle or lint safeguards preventing test-only hidden-state helpers from entering client production imports,
- replay serializer tests ensuring public exports do not accidentally include private state unless explicitly allowed by replay/privacy policy.

Any bug that leaks hidden information is merge-blocking and release-blocking.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only the hidden-information fixture shape and assertion harness smoke tests. Do not add package scripts, CI wiring, production engine APIs, spectator behavior, replay behavior, or client rendering logic in this story.

## Scope

- define a fixture shape for hidden-information absence assertions
- define assertion categories for opponent hand contents, deck order and card identities beyond count, face-down life identity, RNG state, non-public queue internals, private decision candidates, and internal crash/recovery metadata
- add smoke tests proving the harness can evaluate allowed public fields and rejected private paths against fixture payloads

## Out of Scope

- package script wiring
- CI workflow wiring
- production filterStateForPlayer implementation
- temporary reveal timing scenarios
- declined-trigger leakage scenarios
- private search/look candidate behavior
- pending-decision filtering behavior beyond baseline private-candidate absence paths
- auto-pass timing behavior
- spectator mode behavior
- spectator-policy fixture cases
- replay serializer policy
- client or browser bundle safeguards

## Allowed Touch Points

<!-- prettier-ignore -->
- tests/hidden-info/**
- fixtures/hidden-info/**

## Constraints

- do not create placeholder gameplay, spectator, replay, or client behavior
- temporary reveal, declined-trigger, private search/look, pending-decision behavior, auto-pass timing, and spectator-policy cases are deferred to later behavior-specific stories
- replay serializer privacy and client bundle/helper safeguards are deferred to later replay and architecture-boundary stories
- future view-filtering stories must extend this fixture/assertion contract instead of creating one-off checks
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- hidden-information fixture smoke test for a passing filtered player-view fixture
- hidden-information fixture smoke test proving each baseline private category fails independently when present

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- hidden-information fixtures can describe public fields that may be present and private paths that must be absent
- the assertion harness fails a fixture containing opponent hand card IDs, deck order or card IDs beyond count, face-down life identity, RNG state, non-public queue internals, private decision candidates, or internal crash/recovery metadata
- the assertion harness passes a fixture that omits those private fields while preserving explicitly public fields

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
