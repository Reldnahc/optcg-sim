<!-- agent-packet:story-id INF-049A -->
<!-- agent-packet:story-path stories/approved/INF-049A-cards-fixture-capture-runner.yaml -->
<!-- agent-packet:story-sha256 25343d9c3f4eb398d362cdaa2671d8858159e1fc1dd6bee7c376bf864351302d -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: INF-049A
Epic ID: INF-049
Title: Make cards fixture capture runner declared
Type: tooling
Area: cards
Primary Concern: tooling

## Why

Make the `@optcg/cards` fixture capture package script reproducible by removing its dependency on an undeclared `tsx` executable and routing it through declared repo-local tooling.

## Authoritative Spec References

- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 18-acceptance-tests.s002 (Purpose)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

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

### 18-acceptance-tests.s002 (Purpose)

Implementation readiness should be measured by named tests, not only by prose. These tests define the minimum acceptable behavior for each milestone.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only the `capture:fixture` runner command for `@optcg/cards`, the minimal package-local loader needed for TypeScript source execution, and focused script-contract coverage. Do not change fixture capture behavior, live Poneglyph fetching behavior, card normalization, generated support output, engine behavior, DTOs, hidden-info projection, replay, protocol, or gameplay behavior.

## Scope

- confirm the live `capture:fixture` script uses `tsx` and that `tsx` is not declared by the root or cards package
- prefer a repo-local `node --experimental-strip-types` runner using the existing source-loader pattern so no dependency is added
- add focused script-contract coverage proving `capture:fixture` does not invoke `tsx` and does invoke the repo-local TypeScript source runner
- verify the safe help path for `capture:fixture` runs without live Poneglyph access

## Out of Scope

- changing fixture capture CLI arguments, output paths, dry-run behavior, write behavior, or network behavior
- changing `support:probe` runner behavior
- adding or updating Poneglyph fixtures
- changing card normalization, generated support evaluation, manifests, support status, engine behavior, DTOs, hidden-info behavior, replay, protocol, server, client, database, or gameplay behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/package.json
- packages/cards/scripts/source-loader.mjs
- tests/cards/cards-package-scripts.test.mjs
- stories/generated/INF-049A-cards-fixture-capture-runner.yaml
- stories/approved/INF-049A-cards-fixture-capture-runner.yaml
- agent-packets/INF-049A.md
- agent-packets/active.json

## Constraints

- use TDD and verify the script-contract test fails while `capture:fixture` still references `tsx`
- keep the patch limited to the cards fixture capture runner and focused script-contract coverage
- use `corepack pnpm`, not plain `pnpm`, when running repo commands in this environment
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

### Code Standard

Follow [`docs/code-standard.md`](docs/code-standard.md). Non-negotiables:

- stay inside the approved story boundary
- preserve package boundaries
- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors
- prefer named exports and precise types
- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard
- split by reason-to-change, not by line count
- do not over-split into tiny files or generic dumping grounds
- keep engine-core pure and hidden-info safe
- prove engine behavior with synthetic/unit/regression tests
- keep real-card fixture tests separate from engine behavior requirements
- preserve deterministic event ordering and state hashes
- record ambiguity instead of inventing behavior

## Required Tests

- add a failing script-contract regression before changing `packages/cards/package.json`
- `corepack pnpm exec vitest run tests/cards/cards-package-scripts.test.mjs`
- `corepack pnpm --filter @optcg/cards capture:fixture -- --help`
- `corepack pnpm --filter @optcg/cards test`
- `corepack pnpm run packets:verify`
- `corepack pnpm run stories:validate`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `packages/cards/package.json` `capture:fixture` no longer references `tsx`
- `capture:fixture` uses only declared repo tooling available from a clean install
- `corepack pnpm --filter @optcg/cards capture:fixture -- --help` succeeds without live Poneglyph access
- focused script-contract coverage protects the runner choice
- no dependency or lockfile change is introduced unless the repo-local runner approach is proven unsuitable
- fixture capture behavior is unchanged
- no unrelated card-data, engine, DTO, hidden-info, replay, protocol, or gameplay changes are included

## Post-Approval Role Sections

### implementation

Responsibilities
- implement only the approved story using packet authority order
- follow strict TypeScript, lint, and verification requirements
- report ambiguity instead of inventing uncited behavior

Forbidden Actions
- do not broaden scope beyond the approved story boundary or allowed_touch_points
- do not add packet extraction behavior unless the approved story explicitly owns it
- do not implement story-author/story-review handoff mechanics

Required Inputs
- active packet content with authoritative spec references
- approved story scope, non-scope, and acceptance criteria
- allowed_touch_points and required test list

Required Outputs
- scoped code and test changes within approved touch points
- verification command results with pass/fail status
- assumptions and blockers note

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

### code-review

Responsibilities
- review correctness, scope fit, and required-test coverage
- verify no forbidden role sections or lifecycle changes were introduced
- confirm canonical packet behavior remains enforceable

Forbidden Actions
- do not author new feature scope outside the reviewed patch
- do not bypass required tests, packet verification, or CI gate evidence
- do not approve scope drift that violates story boundary

Required Inputs
- proposed patch limited to approved touch points
- active packet, approved story, and cited spec references
- verification and test evidence for required commands

Required Outputs
- review findings prioritized by correctness and scope compliance
- clear disposition for findings (fix/defer/block) with rationale
- review closure recommendation for Session Orchestrator handoff

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

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

<!-- prettier-ignore-end -->
