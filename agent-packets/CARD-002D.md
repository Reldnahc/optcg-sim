<!-- agent-packet:story-id CARD-002D -->
<!-- agent-packet:story-path stories/approved/CARD-002D-reinforce-engine-core-card-boundary-tests.yaml -->
<!-- agent-packet:story-sha256 2c8ff907b7f5ff1801e272c49599294ab07cd1f21e1471c4742b646993696442 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-002D
Epic ID: CARD-002
Title: Reinforce engine-core card boundary tests
Type: implementation
Area: engine
Primary Concern: tooling

## Why

Reinforce package-boundary tests and lint rules so @optcg/engine-core remains isolated from @optcg/cards, Poneglyph HTTP, Redis, Postgres, server, client, and UI surfaces while still allowing plain fixture manifest data.

## Authoritative Spec References

- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 19-poneglyph-api-contract.s002 (Purpose)
- 19-poneglyph-api-contract.s011 (Adapter API)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 09-card-data-and-support-policy.s013 (Match-time card manifest)

At match creation, snapshot resolved card data versions and implementation data. Replays use this manifest instead of live Poneglyph data. The implementation contract is `MatchCardManifest` in `contracts/canonical-types.ts`.

```ts
interface MatchCardManifest {
  manifestHash: string;
  source: "poneglyph" | "poneglyph-fixture" | "manual-test";
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  cards: Record<CardId, ResolvedCard>;
  createdAt: string;
}
```

### 19-poneglyph-api-contract.s002 (Purpose)

This document tightens the `@optcg/cards` implementation against the provided Poneglyph OpenAPI contract and real card payload examples. The original simulator plan says Poneglyph is the source of truth for printed card text, stats, images, variants, and metadata. This document makes that actionable without giving Poneglyph gameplay authority.

The engine never calls Poneglyph during effect resolution. `@optcg/cards` resolves Poneglyph data, validates it, normalizes it, merges simulator overlays, and produces a match-time manifest.

### 19-poneglyph-api-contract.s011 (Adapter API)

```ts
interface PoneglyphClient {
  getCard(
    cardNumber: CardId,
    options?: { lang?: string },
  ): Promise<PoneglyphCardDetail>;
  getCardsBatch(
    cardNumbers: CardId[],
    options?: { lang?: string },
  ): Promise<{
    data: Record<string, PoneglyphCardDetail>;
    missing: string[];
  }>;
  searchCards(query: PoneglyphSearchQuery): Promise<PoneglyphSearchResult>;
  getPlainText(
    cardNumber: CardId,
    options?: { lang?: string },
  ): Promise<string>;
}

interface CardRepository {
  resolveCard(
    cardId: CardId,
    options?: ResolveCardOptions,
  ): Promise<ResolvedCard>;
  resolveCards(
    cardIds: CardId[],
    options?: ResolveCardOptions,
  ): Promise<ResolvedCard[]>;
  buildMatchManifest(decklists: Decklist[]): Promise<MatchCardManifest>;
}
```

Batch resolution must chunk at 60 card numbers and preserve caller order in the returned manifest.

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

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Package-boundary enforcement is required, not optional.

At minimum, lint rules or dependency-cruiser / equivalent boundary tooling must enforce:

- `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.
- `@optcg/view-engine` cannot import hidden-information-only server modules.
- `@optcg/client` cannot import server-only packages.
- `@optcg/server` cannot bypass `@optcg/cards` to call card-data sources directly from engine execution paths.
- test helpers that expose hidden state cannot be imported into browser/client production bundles.
- replay validation code cannot depend on client rendering code.

If stronger tooling is adopted, such as dependency-cruiser, Knip, or custom graph checks, CI must fail on violations.

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

Ordinary protected-branch changes still require a pull request, at least one
human review, and passing required checks. The only allowed packet-lifecycle
exception is a dedicated GitHub App actor `optcg-packet-cleanup[bot]` running
workflow `.github/workflows/post-merge-packet-cleanup.yml` with token
`POST_MERGE_PACKET_CLEANUP_TOKEN`, and that exception exists only to push exact
packet-completion command output to `main` after a reviewed pull request has
merged. The cleanup actor and token must not be available to arbitrary GitHub
Actions workflows, human users, broad admin roles, implementation changes, docs
changes, tooling changes, or ordinary development pushes.

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

Own mechanical package-boundary enforcement for card-manifest adoption only. Do not change engine behavior, adapter behavior, CLI behavior, hidden-info filtering, server, client, UI, or live dependency behavior.

## Scope

- strengthen tests or lint rules that forbid @optcg/engine-core imports of @optcg/cards
- forbid engine-core imports of Poneglyph HTTP, Redis, Postgres, WebSocket transport, server, client, browser, React, and UI surfaces where not already enforced
- allow engine-core tests to load plain JSON or data fixture manifests without importing @optcg/cards
- add regression coverage for the representative manifest fixture path if needed to keep fixture policy enforceable

## Out of Scope

- changing cards package behavior
- changing engine gameplay semantics
- changing server, client, UI, Redis, or Postgres code
- live Poneglyph or Redis behavior
- broad package-boundary policy unrelated to card-manifest adoption

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/lint/**
- tests/contracts/**
- tests/fixtures/eslint/packages/engine-core/**
- eslint.config.mjs
- stories/generated/CARD-002D-reinforce-engine-core-card-boundary-tests.yaml
- stories/approved/CARD-002D-reinforce-engine-core-card-boundary-tests.yaml
- agent-packets/CARD-002D.md
- agent-packets/active.json

## Constraints

- prefer enforcement over convention
- keep the allowed fixture path narrow and documented
- do not weaken existing lint or TypeScript strictness
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- engine-core package-boundary test
- lint boundary test covering forbidden card-data and infrastructure imports
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- boundary tests fail if engine-core imports @optcg/cards
- boundary tests fail if engine-core imports live card-data or infrastructure surfaces
- plain representative manifest fixture data remains allowed for engine-core tests

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
