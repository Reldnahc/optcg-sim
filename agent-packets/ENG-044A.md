<!-- agent-packet:story-id ENG-044A -->
<!-- agent-packet:story-path stories/approved/ENG-044A-continuous-power-modifier-support-gate.yaml -->
<!-- agent-packet:story-sha256 cafc116f6c0d21eacec710f573fb45cdc02aa76de5ebd91fd23f46e0e970c7c8 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-044A
Epic ID: KICK-001
Title: Gate supported continuous power modifiers
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add a narrow engine-core support gate for continuous +1000 power modifier records so computed view can later fail closed on unsupported shapes.

## Authoritative Spec References

- 0003-continuous-effects-computed-view.s003 (Context)
- 0003-continuous-effects-computed-view.s004 (Decision)
- 0003-continuous-effects-computed-view.s005 (Consequences)
- 04-effect-runtime.s004 (Stable effect identity)
- 05-effect-dsl-reference.s027 (Effect-play options)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 0003-continuous-effects-computed-view.s003 (Context)

A fixed-point loop that mutates canonical state risks repeatedly applying modifiers such as `+1000 power` and mixing base facts with derived values.

### 0003-continuous-effects-computed-view.s004 (Decision)

Canonical state stores base facts and active modifier records. `computeView(state)` derives current power, cost, keywords, restrictions, and protections.

### 0003-continuous-effects-computed-view.s005 (Consequences)

Positive:

- Prevents double-application of modifiers.
- Makes state hashes more stable.
- Keeps replay state cleaner.
- Makes expiration easier to reason about.

Negative:

- Computed view performance must be measured.
- Some rule interactions may require careful layering.

### 04-effect-runtime.s004 (Stable effect identity)

Every effect block has a stable ID. Never key `[Once Per Turn]` by array index.

```ts
interface EffectBlock {
  id: string; // e.g. "OP01-001:auto-1" or "OP01-040:activate-main-1"
  trigger: Trigger;
  category: EffectCategory;
  condition?: Condition;
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}
```

The `id` should remain stable across definition edits unless the effect's identity truly changes.

### 05-effect-dsl-reference.s027 (Effect-play options)

Effects that say "play" without requiring cost payment should use:

```ts
{ type: 'playSelected', selection: '...', enterRested: true, ignoreCost: true }
```

The play still obeys rule-processing constraints such as character-area capacity and stage replacement. If the character area is full, the engine must create the forced-trash decision before completing the play.

### 11-testing-quality.s004 (Unit tests per DSL primitive)

Every primitive has tests independent of specific cards:

- `draw`
- `ko`
- `trash`
- `bounce`
- `search`
- `lookAtTop`
- `modifyPower`
- `modifyCost`
- `giveKeyword`
- `replacement`
- `damage`
- `addLife`
- `attachDon`
- `returnDon`
- `choice`
- `conditional`
- `sequence`

Primitive tests should assert events, state, decisions, and visibility where applicable.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only support-shape detection and focused tests. Do not apply continuous modifiers to computed power, alter PlayerView, create new effect-runtime queue paths, or change card-data integration in this story.

## Scope

- define a local support predicate/helper for the first supported continuous modifier record shape
- accept only `modifier.layer: powerAdd`, `modifier.operation: addPower`, `value: 1000`, `modifier.target.type: self`, and `duration.type` of `permanent` or `whileSourceOnField`
- reject base power, cost, keyword, restriction, protection, non-self target, non-1000 value, conditional, and unsupported duration shapes
- keep the helper local to engine-core compute-view behavior unless a cohesive nearby test helper is required

## Out of Scope

- applying supported modifiers to `currentPower`
- PlayerView or public view projection
- effect runtime creation of continuous effect records
- source-removal behavior beyond support gating
- composition with DON or battle modifiers
- real-card fixtures or card-data integration
- server, client, API, Redis, live Poneglyph, or UI work

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/compute-view.ts
- packages/engine-core/src/compute-view.test.ts
- stories/generated/ENG-044A-continuous-power-modifier-support-gate.yaml
- stories/approved/ENG-044A-continuous-power-modifier-support-gate.yaml
- agent-packets/ENG-044A.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-044A packet while implementing this story
- run `corepack pnpm run packets:verify` before implementation and review handoff
- stay within allowed_touch_points
- target the ENG-044 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

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

- run `corepack pnpm exec vitest run packages/engine-core/src/compute-view.test.ts`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- supported permanent +1000 self powerAdd modifier records are recognized by compute-view support checks
- supported whileSourceOnField +1000 self powerAdd modifier records are recognized by compute-view support checks
- unsupported continuous modifier shapes throw deterministic fail-closed errors from `computeView`
- no computed power values change yet solely because a supported modifier exists

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
