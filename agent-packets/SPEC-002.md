<!-- agent-packet:story-id SPEC-002 -->
<!-- agent-packet:story-path stories/approved/SPEC-002-authorize-strict-cli-command-script-failures.yaml -->
<!-- agent-packet:story-sha256 bc93429b5c8565f34d92eafef6a5b91b4e3999d01aa2b18b2f09e67a9973e58b -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SPEC-002
Epic ID: M1-001
Title: Authorize strict CLI command-script failure semantics
Type: tooling
Area: docs
Primary Concern: contract

## Why

Define the local/developer CLI contract for optional strict command-script failure behavior so a follow-up CLI implementation story can rely on stable specification authority.

## Authoritative Spec References

- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

## Relevant Spec Excerpts

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

For local/developer automation, command-script mode may support an optional
strict flag using the exact form `--command-script <script> --strict`.
In strict mode, command parse errors must exit nonzero. In strict mode, engine
or CLI dispatch errors must exit nonzero. Strict failure diagnostics must be
deterministic and useful: stderr must include the failed command and error
reason, and stdout command-result output for the failed command must remain
available. Non-strict command-script behavior remains unchanged unless a later
spec section changes it. Interactive developer behavior remains unchanged.
This is local/developer CLI behavior only, not match server protocol behavior,
browser client behavior, replay schema behavior, hidden-information filtering,
or database contracts.

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
- Local deterministic CLI command/decision script smoke from fixture boot
  reproduces script-defined state-hash checkpoints and final hash, without
  requiring production ReplayCheckpoint artifacts.
- production `filterStateForPlayer` hidden-info tests consume real engine output
  and prove opponent hand, deck order, face-down life, RNG, and effect queue
  internals stay hidden.
- Milestone 1 does not include server, client, Poneglyph live adapter, Redis,
  ranked, broad card pool work, or production ReplayLog, ReplayHeader, persisted
  replay storage, rollback, recovery, version migration, or replay viewer.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Each package must expose consistent task names where applicable:

- `build`
- `typecheck`
- `lint`
- `test`
- `test:watch`
- `coverage`

Integration-heavy packages may additionally expose:

- `test:integration`
- `test:replay`
- `test:contracts`
- `test:hidden-info`

At the root, the workspace must provide:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm verify
```

`pnpm verify` is the canonical local pre-push command and must run the same core checks as the main merge CI pipeline.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

A pull request must not merge unless the main CI pipeline passes.

Minimum required merge gates:

1. install dependencies with locked versions,
2. build/typecheck workspace,
3. lint workspace,
4. run tests,
5. validate contracts and schemas,
6. validate formatting,
7. publish coverage artifact,
8. fail if generated artifacts or snapshots are stale when the repo defines them.

Recommended CI jobs:

- `quality` -> lint, typecheck, format check
- `engine` -> engine unit, interaction, invariant, replay tests
- `contracts` -> canonical types, DSL schema, fixture normalization, SQL/schema validation
- `client-server-smoke` -> protocol smoke tests and filtered-view checks

For protected branches, require at least one human review plus passing CI.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only the canonical spec wording for local/developer CLI command-script failure semantics. Do not implement CLI behavior or change engine, gameplay, replay, server, client, hidden-info, or database contracts.

## Scope

- update the CLI runner spec to say command-script mode may support the exact optional strict form `--command-script <script> --strict`
- define strict command-script parse failures as nonzero process exits
- define strict command-script engine or dispatch failures as nonzero process exits
- require strict failure diagnostics on stderr to include the failed command and error reason
- require strict failures to preserve the existing stdout command-result output for the failed command
- state that non-strict command-script behavior remains unchanged unless separately specified
- state that interactive developer behavior remains unchanged
- state that this is local/developer CLI behavior, not match-server protocol behavior

## Out of Scope

- engine behavior
- gameplay rules
- CLI implementation changes
- match server protocol
- browser client behavior
- replay schema, ReplayLog, ReplayHeader, persisted replay storage, rollback, recovery, or replay viewer
- hidden-information filtering
- database contracts

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/15-implementation-kickoff.md
- tests/contracts/spec-authority-gates.test.mjs

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate the packet before implementation
- run `corepack pnpm run packets:verify` before implementation and review handoff
- stay within allowed_touch_points
- parent agent may implement this parent-owned authority edit directly
- open the PR before implementation-review
- run the implementation-review gate after the PR is opened
- do not implement CLI behavior in this SPEC story
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- update tests/contracts/spec-authority-gates.test.mjs to require the strict CLI command-script authority wording
- update tests/contracts/spec-authority-gates.test.mjs to require the exact form `--command-script <script> --strict`
- update tests/contracts/spec-authority-gates.test.mjs to require nonzero parse and engine/dispatch failure wording
- update tests/contracts/spec-authority-gates.test.mjs to require deterministic stderr failed-command and reason diagnostics plus stdout preservation wording
- run `corepack pnpm run test:contracts`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run typecheck`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `15-implementation-kickoff.s007` defines optional strict command-script failure behavior for local/developer CLI automation using exact form `--command-script <script> --strict`
- strict command-script parse errors are specified to exit nonzero
- strict command-script engine or dispatch errors are specified to exit nonzero
- strict failure diagnostics are specified as deterministic stderr including the failed command and error reason
- strict failures preserve the existing stdout command-result output for the failed command
- non-strict command-script and interactive developer behavior are explicitly preserved unless separately specified
- the spec text explicitly excludes match-server protocol, browser client, replay schema, hidden-info filtering, and database behavior
- no implementation package, engine behavior, gameplay rule, protocol, replay schema, hidden-info filter, or database contract is changed

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
