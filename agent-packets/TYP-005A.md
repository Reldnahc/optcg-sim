<!-- agent-packet:story-id TYP-005A -->
<!-- agent-packet:story-path stories/approved/TYP-005A-package-type-authority-strategy.yaml -->
<!-- agent-packet:story-sha256 3240c373ae0e3900f6b74b3cb9cb45d61511a9c349b5e6c07ab8d6ed176d16ba -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-005A
Epic ID: TYP-005
Title: Define the package type authority strategy
Type: design
Area: contracts
Primary Concern: contract

## Why

Document the authoritative strategy for exposing canonical contract types through `@optcg/types`, including why direct re-export from `contracts` is or is not viable under the current package exports and TypeScript rootDir constraints.

## Authoritative Spec References

- 22-v6-implementation-tightening.s006 (2. TypeScript model)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)
- 24-story-schema.s016 (`spec_refs`)
- 24-story-schema.s025 (Story sizing rules)
- 24-story-schema.s031 (`story_boundary`)
- 24-story-schema.s032 (`allowed_touch_points`)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 22-v6-implementation-tightening.s006 (2. TypeScript model)

The old `16-typescript-interface-draft.md` was a draft and referenced undefined symbols. The implementation contract is now `contracts/canonical-types.ts`.

Resolved and normalized items include:

- `Color` -> `CardColor`
- `Attribute`
- `ZoneRef`
- `MatchCardManifest`
- `RngState`
- `EffectQueueEntry`
- `ContinuousEffect`
- `EventVisibility`
- `CardRef`
- `DecisionResponse`
- `Cost`
- `PaymentOption`
- `TargetRequest`
- `CardSelectionRequest`
- `EffectOption`
- `PublicEffectEvent` replacement via filtered `EngineEvent[]`
- `PlayerView` and initial live-filtered `SpectatorView`
- public live-view DTO support contracts
- spectator-safe public-only reveal and event DTOs
- `eventLog`/`eventJournal` conflict resolved to `eventJournal`
- `activeBattle`/`battle` conflict resolved to `battle`
- serializable arrays instead of `Set`

The contract compiles with:

```bash
cd contracts
tsc -p tsconfig.json
```

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

### 23-repo-tooling-and-enforcement.s011 (Contract and fixture validation)

The repo must validate the canonical contract files and fixtures automatically.

Required checks:

- `contracts/canonical-types.ts` compiles under `contracts/tsconfig.json`
- effect DSL fixtures validate against `contracts/effect-dsl.schema.json`
- card fixture normalization tests run against real supplied fixture payloads
- replay fixtures remain loadable and hash-stable
- schema/DDL files parse successfully in CI

A change to DSL shape, card manifests, or replay structure is incomplete unless fixtures are updated in the same change.

### 24-story-schema.s016 (`spec_refs`)

List of exact spec section references that authorize the story. These references are mandatory. In v6, `spec_refs` should use stable `SECTION_REF` identifiers such as `07-match-server-protocol.s010 (Timers)` instead of renderer-specific heading anchors. The story must not ask the agent to invent uncited behavior.

### 24-story-schema.s025 (Story sizing rules)

Approved stories should usually fit within a single reviewable pull request. The primary sizing rule is concern boundary, not raw diff size. Broad gameplay or platform capabilities should become epics. The approved stories inside an epic should be sliced by one primary concern at a time.

A story is too large if it:

- combines multiple primary concerns such as contract plus rules, rules plus protocol, or protocol plus UI in one assignment,
- changes multiple systems with different review concerns,
- requires the agent to choose architecture rather than implement it,
- cannot state acceptance criteria in a few bullets,
- cannot be validated by a targeted set of tests,
- cannot be reverted independently without backing out unrelated work,
- needs repeated "and also" scope clauses to explain what it does.

Warning signals may still justify a split, but they are secondary to concern boundaries:

- unusually large diffs,
- creation or expansion of large multi-purpose files,
- acceptance criteria that read like an end-to-end milestone instead of one reviewable concern.

Tests, fixtures, snapshots, and docs that directly prove the same concern do not count as a second concern by themselves.

### 24-story-schema.s031 (`story_boundary`)

One or two sentences describing what the story owns and where it must stop. This field exists because `non_scope` alone often becomes a loose list; the boundary statement should make the intended stopping point obvious to authors, implementers, and reviewers.

### 24-story-schema.s032 (`allowed_touch_points`)

List of packages, directories, modules, or other implementation surfaces the story is expected to modify. This is both a review aid and a future automation hook for detecting scope creep between the approved story and the resulting patch.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only the strategy decision and its proof against current repo structure. Do not implement generation, migrate package source files, or change type shapes in this story.

## Scope

- inspect and document the current `@optcg/types` package boundary, including package exports pointing at `src/index.ts` and package tsconfig rootDir behavior
- choose exactly one strategy for making canonical contracts authoritative for package types
- document the expected current strategy as checked-in package source files generated or synced from `contracts/types/*` unless direct re-export is proven to work without broad package-boundary changes
- document the canonical-to-package module mapping, generated-output ownership, manual edit policy, and stale-output check entrypoint expected from later stories
- add a focused contract test that pins the documented strategy and the repo facts it relies on

## Out of Scope

- implementing a sync or generation tool
- changing `packages/types/src/*`
- changing `contracts/types/*` or `contracts/canonical-types.ts`
- changing root verification or CI gates
- resolving any current package type drift
- gameplay, server, client, replay, database, UI, or protocol behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- docs/contracts/type-authority.md
- tests/contracts/type-authority-strategy.test.mjs
- stories/approved/TYP-005A-package-type-authority-strategy.yaml

## Constraints

- do not activate TYP-005B through TYP-005D until this strategy is reviewed or normalized to match the selected approach
- if direct re-export is selected instead of generated package files, rewrite later child stories before activation
- fail closed if the strategy would require uncited changes to gameplay, validation, protocol, replay, or hidden-information behavior
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

- exact candidate story-review before implementation
- focused contract test proving the strategy document exists and names the selected authority model
- focused contract test proving the documented repo constraints match current `packages/types/package.json` and `packages/types/tsconfig.json`
- run `corepack pnpm exec vitest run tests/contracts/type-authority-strategy.test.mjs`
- run `corepack pnpm run stories:validate`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `docs/contracts/type-authority.md` identifies `contracts/canonical-types.ts` and `contracts/types/*` as the source of truth for `@optcg/types`
- the document records whether direct re-export or checked-in generated package files is selected, with the repo constraints that justify the decision
- the document states that manual package type edits are not authoritative and must be overwritten or rejected by later sync verification
- the document states that contract shape changes require canonical contract edits under separate approved authority, not one-sided package patches
- no contract or package type shape changes are included

## Post-Approval Role Sections

### story-orchestrator

Responsibilities
- own story authority, scope enforcement, ambiguity handling, and role assignment
- ensure active packet content is current before implementation or review handoff
- handoff only approved post-approval roles for this story

Forbidden Actions
- do not perform story-author or story-review pre-approval handoff mechanics
- do not introduce packet-agent, cleanup-sync-agent, or revision-agent roles
- do not mutate packet lifecycle semantics outside approved story scope

Required Inputs
- approved story file under stories/approved/
- active packet file under agent-packets/
- AGENTS.md and required workflow docs for the current phase

Required Outputs
- worker assignment constrained to allowed_touch_points and story boundary
- implementation handoff instructions bound to packet authority
- verification handoff readiness note

Handoff Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

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
- review closure recommendation for pr-gate handoff

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

### pr-gate

Responsibilities
- own PR gate state, cleanup metadata validation, and human-review handoff
- confirm cleanup-metadata-guard presence and passing status before handoff
- preserve reviewed packet lifecycle behavior without scope expansion

Forbidden Actions
- do not merge without required human review and passing checks
- do not change cleanup metadata semantics in implementation patches
- do not implement feature code while serving as gate role

Required Inputs
- current PR body or durable handoff comment with cleanup metadata source
- fetched changed files, PR head branch, and status checks
- review records, revision response, and verification evidence

Required Outputs
- gate decision with explicit pass/fail blockers
- human-review-ready handoff with cleanup metadata validation status
- post-merge cleanup or fallback status confirmation

Handoff Checklist
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
