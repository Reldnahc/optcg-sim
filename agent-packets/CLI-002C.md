<!-- agent-packet:story-id CLI-002C -->
<!-- agent-packet:story-path stories/approved/CLI-002C-strict-command-script-failures.yaml -->
<!-- agent-packet:story-sha256 3eff643f3333b351eede5ee52f3ede09449f2ad8d220ef4013fcb26b00e6409e -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CLI-002C
Epic ID: M1-001
Title: Add strict command-script failure exit behavior
Type: implementation
Area: engine
Primary Concern: cli

## Why

Add an explicit strict mode for scripted CLI runs so automation can receive a nonzero process status when any command parse or engine dispatch step fails, while preserving current non-strict script and interactive developer behavior.

## Authoritative Spec References

- 15-implementation-kickoff.s007 (Step 3 - CLI runner)
- 15-implementation-kickoff.s011 (Definition of done for kickoff)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

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

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

The repo must define a root `tsconfig.base.json` and package-level `tsconfig.json` files extending it.

Required compiler settings for implementation packages:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "noEmitOnError": true
  }
}
```

Strongly preferred unless a package-specific exception is justified in writing:

- `verbatimModuleSyntax`
- `importsNotUsedAsValues = error`
- `noUnusedLocals`
- `noUnusedParameters`

The repo must not rely on broad TypeScript escape hatches. The following require explicit justification in code review and should be lint-restricted where possible:

- `any`
- non-null assertion (`!`)
- `@ts-ignore`
- `@ts-nocheck`
- unchecked type assertions across trust boundaries

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

## Story Boundary

Own only CLI command-script process status and error-output behavior for existing command parsing and dispatch results. Do not add gameplay, command grammar beyond the strict-mode flag, replay format, server/client protocol, or hidden-information filtering.

## Scope

- add the exact strict command-script CLI form `--command-script <script> --strict`
- keep successful strict command scripts exiting 0
- make command parse errors exit nonzero when strict command-script mode is enabled
- make illegal or failed engine or CLI dispatch results exit nonzero when strict command-script mode is enabled
- write deterministic stderr details for strict failures including the failed command and error reason
- preserve existing stdout command-result output for the failed command on strict failures
- preserve existing non-strict command-script behavior for developer smoke scripts unless the strict option is used
- preserve interactive mode behavior, including continuing to print command errors without changing process status semantics

## Out of Scope

- new gameplay behavior or engine dispatch semantics
- changing existing command grammar except adding the strict-mode option
- replay format, ReplayLog, ReplayHeader, persisted replay storage, rollback, recovery, or replay viewer
- match server, browser client, transport protocol, WebSocket, Redis, database, or hidden-information filtering behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cli/src/cli.ts
- packages/cli/src/cli.test.ts

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate the packet before worker handoff
- run `corepack pnpm run packets:verify` before implementation and review handoff
- stay within allowed_touch_points
- use a worker subagent for implementation when the subagent surface is available
- open the PR before implementation-review
- run the implementation-review gate after the PR is opened
- do not add engine gameplay behavior in this story
- do not broaden replay, protocol, client, server, or hidden-information behavior in this story

## Required Tests

- CLI test proving `--command-script <script> --strict` successful script exits 0 and writes no stderr
- CLI test proving `--command-script <script> --strict` parse error exits nonzero, preserves stdout command output, and writes useful stderr
- CLI test proving `--command-script <script> --strict` illegal engine action exits nonzero, preserves stdout command output, and writes useful stderr
- regression test proving non-strict command-script parse errors retain existing exit-0 behavior
- regression test proving non-strict command-script dispatch errors retain existing exit-0 behavior
- regression test proving interactive mode still returns 0 on EOF after a command error and still prints useful command error output
- run `corepack pnpm exec vitest run packages/cli/src/cli.test.ts`
- run `corepack pnpm --filter @optcg/cli test`
- run `corepack pnpm run typecheck`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `--command-script <script> --strict` with only successful commands exits 0
- `--command-script <script> --strict` exits nonzero when a command cannot be parsed
- `--command-script <script> --strict` exits nonzero when command dispatch returns an illegal engine action or other command error
- strict command-script failure writes deterministic stderr including the failed command and error reason
- strict command-script failure preserves the existing stdout command-result output for the failed command
- non-strict `--command-script` keeps existing exit-0 behavior for command parse errors
- non-strict `--command-script` keeps existing exit-0 behavior for dispatch errors
- `--interactive` behavior is unchanged for command parse or dispatch errors
- no gameplay, replay format, server/client protocol, or hidden-info filtering behavior is added or changed

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
