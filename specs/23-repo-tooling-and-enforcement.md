---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "23-repo-tooling-and-enforcement"
doc_title: "Repo Tooling And Enforcement"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Repository Tooling and Enforcement

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s001 -->

Section Ref: `23-repo-tooling-and-enforcement.s001`

This document defines the required repository tooling for implementation. These are not optional recommendations. If local developer preference conflicts with this file, this file wins.

The purpose of repo tooling is to convert architectural and code standards into repeatable mechanical enforcement so the codebase does not drift as packages, cards, server logic, replay logic, and client UX evolve.

## Goals

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s002 -->

Section Ref: `23-repo-tooling-and-enforcement.s002`

The repository tooling must enforce five things:

1. deterministic engine correctness,
2. package-boundary discipline,
3. hidden-information safety,
4. consistent TypeScript quality,
5. repeatable CI merge gates.

A standard is not considered implemented until the repository can automatically detect violations.

## Canonical toolchain

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s003 -->

Section Ref: `23-repo-tooling-and-enforcement.s003`

Use the following baseline unless `SPEC_VERSION.md` is superseded by a later approved version:

- package manager: `pnpm`
- runtime target: Node.js LTS
- language: TypeScript with strict mode
- unit/integration test runner: Vitest
- linting: ESLint with type-aware rules
- formatting: Prettier
- schema/API validation: JSON Schema validation for effect DSL fixtures
- SQL verification: migration or schema validation in CI before merge
- git hooks: Husky or equivalent hook runner
- changed-file staging checks: lint-staged or equivalent
- monorepo task runner: pnpm workspaces alone or Turbo; if Turbo is added later it must not weaken any required checks
- coverage output: V8/Istanbul-compatible coverage reports

If a replacement tool is used later, it must provide equivalent or stronger enforcement.

## Required root files

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s004 -->

Section Ref: `23-repo-tooling-and-enforcement.s004`

The repository should define and maintain the following root-level files as implementation begins:

```text
/package.json
/pnpm-workspace.yaml
/tsconfig.base.json
/.editorconfig
/.prettierrc
/.prettierignore
/eslint.config.js   or eslint.config.mjs
/.eslintignore      if needed
/.gitattributes
/.gitignore
/.husky/
/lint-staged.config.*   or package.json equivalent
/CI workflow definitions
```

If the repo uses Turbo, also include:

```text
/turbo.json
```

## Workspace structure and task naming

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s005 -->

Section Ref: `23-repo-tooling-and-enforcement.s005`

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

## TypeScript enforcement

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s006 -->

Section Ref: `23-repo-tooling-and-enforcement.s006`

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

## ESLint enforcement

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s007 -->

Section Ref: `23-repo-tooling-and-enforcement.s007`

ESLint must run in CI and pre-commit/pre-push flows for changed files and for full-repo verification.

The ruleset must include enforcement for at least the following:

- no unused imports/variables except documented intentional placeholders
- consistent type imports where configured
- no floating promises
- no misused promises
- no fallthrough in switch statements
- exhaustive handling for discriminated unions where practical
- no default export rule if the repo adopts named-export-only policy
- no restricted imports across forbidden package boundaries
- no direct environment access in engine-core except through approved config modules
- no console usage in production packages except approved logger wrappers
- no focused tests committed (`it.only`, `describe.only`, etc.)

The repo must use import restriction rules to enforce the architecture defined in `01-system-architecture.md` and `15-implementation-kickoff.md`.

## Boundary enforcement

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s008 -->

Section Ref: `23-repo-tooling-and-enforcement.s008`

Package-boundary enforcement is required, not optional.

At minimum, lint rules or dependency-cruiser / equivalent boundary tooling must enforce:

- `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.
- `@optcg/view-engine` cannot import hidden-information-only server modules.
- `@optcg/client` cannot import server-only packages.
- `@optcg/server` cannot bypass `@optcg/cards` to call card-data sources directly from engine execution paths.
- test helpers that expose hidden state cannot be imported into browser/client production bundles.
- replay validation code cannot depend on client rendering code.

If stronger tooling is adopted, such as dependency-cruiser, Knip, or custom graph checks, CI must fail on violations.

## Formatting enforcement

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s009 -->

Section Ref: `23-repo-tooling-and-enforcement.s009`

Prettier formatting is required for Markdown, JSON, YAML, TypeScript, JavaScript, and SQL where supported.

Formatting should run:

- automatically on staged files before commit,
- in CI as a check,
- in editor integration for contributor convenience.

Formatting must not be treated as subjective review feedback once formatter rules are defined.

## Test tooling requirements

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s010 -->

Section Ref: `23-repo-tooling-and-enforcement.s010`

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

## Contract and fixture validation

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s011 -->

Section Ref: `23-repo-tooling-and-enforcement.s011`

The repo must validate the canonical contract files and fixtures automatically.

Required checks:

- `contracts/canonical-types.ts` compiles under `contracts/tsconfig.json`
- effect DSL fixtures validate against `contracts/effect-dsl.schema.json`
- card fixture normalization tests run against real supplied fixture payloads
- replay fixtures remain loadable and hash-stable
- schema/DDL files parse successfully in CI

A change to DSL shape, card manifests, or replay structure is incomplete unless fixtures are updated in the same change.

## Hidden-information safety enforcement

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s012 -->

Section Ref: `23-repo-tooling-and-enforcement.s012`

The repo must include automated checks aimed specifically at data leakage risk.

Required enforcement includes:

- tests that assert `filterStateForPlayer()` excludes opponent hand contents, deck order, face-down life identity, RNG state, and non-public queue internals,
- tests that spectator modes obey configured information policy,
- bundle or lint safeguards preventing test-only hidden-state helpers from entering client production imports,
- replay serializer tests ensuring public exports do not accidentally include private state unless explicitly allowed by replay/privacy policy.

Any bug that leaks hidden information is merge-blocking and release-blocking.

## Git hook policy

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s013 -->

Section Ref: `23-repo-tooling-and-enforcement.s013`

The repo must install local hooks.

Minimum behavior:

### pre-commit

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s014 -->

Section Ref: `23-repo-tooling-and-enforcement.s014`

Run on staged files only:

- formatter
- eslint
- optionally fast unit tests for changed packages

### pre-push

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s015 -->

Section Ref: `23-repo-tooling-and-enforcement.s015`

Run a fast but meaningful verification subset:

- typecheck for affected packages or full workspace
- lint for affected packages or full workspace
- relevant tests for affected packages

Hooks improve local quality but do not replace CI. CI remains the final authority.

## CI merge gates

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s016 -->

Section Ref: `23-repo-tooling-and-enforcement.s016`

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

## Coverage policy

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s017 -->

Section Ref: `23-repo-tooling-and-enforcement.s017`

Coverage is a signal, not the authority. Passing coverage does not override missing acceptance tests.

Still, the repo should enforce coverage thresholds for core packages to prevent silent erosion.

Minimum expectation:

- higher thresholds for `@optcg/engine-core`, `@optcg/cards`, and replay code,
- lower thresholds allowed for temporary bootstrap CLI/UI packages,
- card-specific handlers require direct tests even if global package coverage is already high.

A recommended initial policy is package-specific thresholds, with the highest bar on deterministic engine and card-resolution packages.

## Snapshot policy

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s018 -->

Section Ref: `23-repo-tooling-and-enforcement.s018`

Snapshots are allowed only where they improve stability and reviewability.

Allowed examples:

- filtered player views,
- replay event streams,
- normalized card manifests,
- protocol envelopes.

Disallowed or discouraged examples:

- giant UI snapshots as the main correctness signal,
- snapshots that hide meaningful game-state assertions,
- snapshots that contain nondeterministic ordering or timestamps without normalization.

Snapshot updates must be reviewed as behavioral changes, not rubber-stamped.

## Logging and diagnostics tooling

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s019 -->

Section Ref: `23-repo-tooling-and-enforcement.s019`

Production code must use a logger abstraction rather than ad hoc console calls.

Required behavior:

- structured logs for server-side events,
- log-level control by environment,
- redaction of secrets and private game information,
- test coverage for any serializer/redaction helpers used in protocol or replay diagnostics.

Engine-core should emit structured events and diagnostics without taking a direct dependency on a production logging backend.

## Dependency policy

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s020 -->

Section Ref: `23-repo-tooling-and-enforcement.s020`

The repo should prefer a small dependency surface in core packages.

Required rules:

- no heavy runtime dependency in `@optcg/engine-core` without written justification,
- avoid duplicate libraries solving the same concern,
- add exact purpose in PR description for new dependency families,
- security or license blockers are merge-blocking.

If automated dependency auditing is enabled, CI failures must block merge until triaged.

## Generated code and codegen policy

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s021 -->

Section Ref: `23-repo-tooling-and-enforcement.s021`

Generated code is allowed only when reproducible and checked in deliberately.

If the repo adds code generation later:

- generator inputs must be versioned,
- generated outputs must be reproducible in CI,
- `pnpm verify` must fail when generated artifacts are stale,
- hand edits inside generated files are forbidden unless explicitly marked and preserved by the generator.

## Required implementation sequence for tooling

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s022 -->

Section Ref: `23-repo-tooling-and-enforcement.s022`

Before broad package implementation begins, create the repository tooling baseline in this order:

1. root workspace files,
2. root TypeScript base config,
3. Prettier,
4. ESLint with boundary restrictions,
5. Vitest setup,
6. Husky + lint-staged,
7. root `pnpm verify`,
8. CI workflow mirroring `pnpm verify`,
9. contract/schema validation lane,
10. hidden-information regression lane.

The implementation kickoff is not complete until steps 1 through 8 exist.

## Definition of done for repo tooling

<!-- SECTION_REF: 23-repo-tooling-and-enforcement.s023 -->

Section Ref: `23-repo-tooling-and-enforcement.s023`

Repo tooling is considered defined and implementation-ready when all of the following are true:

- a contributor can clone the repo and run one documented bootstrap command successfully,
- `pnpm verify` exists and fails on real quality violations,
- package boundaries are mechanically enforced,
- contract/schema validation is automated,
- CI and local checks are materially aligned,
- hidden-information regression checks exist,
- merge protection depends on passing CI rather than reviewer memory.

At that point the repo is not just documented; it is enforceable.
