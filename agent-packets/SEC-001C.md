<!-- agent-packet:story-id SEC-001C -->
<!-- agent-packet:story-path stories/approved/SEC-001C-hidden-info-verify-and-ci-gate.yaml -->
<!-- agent-packet:story-sha256 62c1df52d23c890a62ab1bb1ff1708757e546994c857211b062f123119c2c741 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: SEC-001C
Epic ID: KICK-001
Title: Wire hidden-information lane into verify and CI
Type: verification
Area: security
Primary Concern: verification

## Why

Promote the dedicated hidden-information regression lane into local verify and CI so leakage checks become a first-class merge gate.

## Authoritative Spec References

- 11-testing-quality.s022 (Required repo enforcement linkage)
- 23-repo-tooling-and-enforcement.s010 (Test tooling requirements)
- 23-repo-tooling-and-enforcement.s012 (Hidden-information safety enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

## Relevant Spec Excerpts

### 11-testing-quality.s022 (Required repo enforcement linkage)

The test strategy in this file is not complete unless it is wired into repository enforcement. The canonical repo-tooling requirements live in [`23-repo-tooling-and-enforcement.md`](23-repo-tooling-and-enforcement.md).

At minimum, CI must run linting, strict typechecking, package tests, contract/schema validation, and formatting checks before merge. Replay determinism and hidden-information regression lanes must be added before public alpha or ranked play.

A test expectation that is described in Markdown but not executable through local commands and CI is not considered fully implemented.

### 23-repo-tooling-and-enforcement.s010 (Test tooling requirements)

The repo must support the following test lanes:

1. package unit tests,
2. engine interaction tests,
3. invariant/property or fuzz-style tests where applicable,
4. replay determinism tests,
5. hidden-information leakage tests,
6. contract/schema validation tests,
7. smoke integration tests for server protocol behavior.

At minimum, the root verification pipeline must include:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts   # if defined at root via recursive filtering
```

Before public alpha or ranked play, CI must also include replay and hidden-information test lanes.

### 23-repo-tooling-and-enforcement.s012 (Hidden-information safety enforcement)

The repo must include automated checks aimed specifically at data leakage risk.

Required enforcement includes:

- tests that assert `filterStateForPlayer()` excludes opponent hand contents, deck order, face-down life identity, RNG state, and non-public queue internals,
- tests that spectator modes obey configured information policy,
- bundle or lint safeguards preventing test-only hidden-state helpers from entering client production imports,
- replay serializer tests ensuring public exports do not accidentally include private state unless explicitly allowed by replay/privacy policy.

Any bug that leaks hidden information is merge-blocking and release-blocking.

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

### 23-repo-tooling-and-enforcement.s023 (Definition of done for repo tooling)

Repo tooling is considered defined and implementation-ready when all of the following are true:

- a contributor can clone the repo and run one documented bootstrap command successfully,
- `pnpm verify` exists and fails on real quality violations,
- package boundaries are mechanically enforced,
- contract/schema validation is automated,
- CI and local checks are materially aligned,
- hidden-information regression checks exist,
- merge protection depends on passing CI rather than reviewer memory.

At that point the repo is not just documented; it is enforceable.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only root verification and CI wiring for the existing hidden-info lane. Do not change the hidden-info fixture contract, production filtering APIs, spectator behavior, replay behavior, or client rendering logic in this story.

## Scope

- add the hidden-information lane to the canonical local verify command
- add or update CI wiring so hidden-information checks run before merge
- add CI/root-script smoke tests proving CI calls the canonical hidden-info lane rather than bespoke commands

## Out of Scope

- hidden-info fixture or assertion-harness design
- production filterStateForPlayer implementation
- spectator mode behavior
- replay serializer policy
- client or browser bundle safeguards

## Allowed Touch Points

<!-- prettier-ignore -->
- package.json
- .github/workflows/**
- tests/ci/**

## Constraints

- hidden-information leakage covered by the current hidden-info lane must be merge-blocking after this story
- CI and local verification must remain materially aligned
- replay serializer privacy and client bundle/helper safeguards are deferred to later replay and architecture-boundary stories
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

## Required Tests

- root verify smoke test proving hidden-info lane inclusion
- CI workflow smoke test proving hidden-info job or step calls the canonical hidden-info lane

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- local verify includes the dedicated hidden-information lane
- CI includes the dedicated hidden-information lane as a merge gate
- CI tests assert the workflow calls the canonical root lane rather than duplicating hidden-info command logic

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
