<!-- agent-packet:story-id TYP-001H -->
<!-- agent-packet:story-path stories/approved/TYP-001H-types-package-export-cohesion.yaml -->
<!-- agent-packet:story-sha256 ed00ee07d2eaeeb6d9a51e16221d43976c59f83213ca678c30920ccba22a2e6f -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-001H
Epic ID: M1-001
Title: Add shared types export cohesion tests
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Finish the shared type package replacement with export cohesion tests that prove all canonical TYP-001 contract exports are importable from `@optcg/types` without adding new type families.

## Authoritative Spec References

- 15-implementation-kickoff.s005 (Step 1 - `@optcg/types`)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

## Relevant Spec Excerpts

### 15-implementation-kickoff.s005 (Step 1 - `@optcg/types`)

Create shared types with no dependency on server/client packages.

Initial exports:

- Branded IDs: `CardId`, `InstanceId`, `PlayerId`, `MatchId`, `EffectId`.
- `Action` union.
- `PendingDecision` union.
- Public protocol DTOs.
- `PlayerView` and `SpectatorView`.
- Card metadata interfaces shaped around Poneglyph IDs.

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

## Story Boundary

Own only package export cohesion and package-local tests. Do not introduce new domain contracts, public view DTOs, engine behavior, adapters, or runtime implementation.

## Scope

- ensure the package entrypoint exports the type families delivered by TYP-001A through TYP-001G
- remove or quarantine any remaining placeholder-only export coverage
- add a checked ownership/export manifest that enumerates every `export type` and `export interface` from `contracts/canonical-types.ts` owned by TYP-001A through TYP-001G
- add tests that validate the checked manifest rather than relying on placeholder-only relative import or object-key smoke coverage
- add package export cohesion tests for branded IDs, card/deck/loadout contracts, events, effect support, decisions/actions, runtime support structures, GameState, EngineResult, error, handler, and hash input contracts

## Out of Scope

- new branded IDs or primitive aliases
- new card metadata, state, action, decision, event, result, effect, handler, or view DTO shapes
- public/player/spectator view DTOs
- engine-core package creation
- runtime behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/**
- packages/types/package.json

## Constraints

- do not introduce public view DTOs until TYP-002 resolves the authority gap
- do not implement runtime behavior in the types package
- limit `packages/types/package.json` edits to entrypoint metadata required for the package-name import test; do not add dependencies, scripts, runtime fields, or unrelated package setup
- must pass `corepack pnpm run verify`

## Required Tests

- checked ownership/export manifest plus a test that validates every canonical export owned by TYP-001A through TYP-001G is assigned exactly one owner and importable from `@optcg/types`
- compile/package-resolution test importing the manifest-covered exports from `@optcg/types`, not only from `./index.js`
- test proving placeholder-only coverage, such as relative import or object-key smoke coverage by itself, is not sufficient as the export proof
- root `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- package exports no longer rely on placeholder contract coverage
- every canonical export owned by TYP-001A through TYP-001G is importable from `@optcg/types`
- the ownership/export manifest has no unowned or duplicate-owned canonical exports for the TYP-001 scope
- the checked manifest keys exactly match all exported type/interface names in `contracts/canonical-types.ts`; each entry has exactly one owner from `TYP-001A` through `TYP-001G`; no duplicate, unowned, extra, or missing canonical exports are accepted
- this story does not add new contract families beyond export cohesion

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
