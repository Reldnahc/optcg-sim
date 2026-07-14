# Package Authority Realignment Implementation Plan

> **For agentic workers:** Treat moves as compatibility migrations. Establish
> the target dependency graph and ports before relocating files, and do not mix
> behavior changes with package extraction.

**Goal:** Give bot strategy, effect interpretation, card storage, match
orchestration, and platform services one clear owner each.

**Architecture:** `match-server` orchestrates matches and transports. A bot
package consumes a public observation. An effects package owns parsing,
materialization, and effect-definition semantics. A cards package owns card
metadata and repository/cache adapters. Platform account, deck, rating, and
aggregate-stat behavior belongs behind API/service ports, coordinated with the
sibling `optcg-api` repository.

**Authoritative References:**

- `01-system-architecture.s002`, `.s006`, `.s011`, `.s012`, `.s013`
- `07-match-server-protocol`
- `09-card-data-repository`
- `docs/code-standard.md` package boundaries and cohesion rules
- [Visibility And Observation Boundaries](./2026-07-14-visibility-observation-boundaries.md)

---

## Target Dependency Direction

```text
@optcg/engine-core -> @optcg/types
@optcg/effects -> @optcg/types
@optcg/cards -> @optcg/types
@optcg/bot -> @optcg/types

@optcg/match-server
  -> @optcg/engine-core
  -> @optcg/effects
  -> @optcg/cards
  -> @optcg/card-support
  -> @optcg/bot
  -> platform service ports
```

`engine-core`, `effects`, `cards`, and `bot` must not import match-server. Pure
effect parsing must not load Redis. Bot strategy must not import internal match
state, transport handlers, or database adapters.

## Scope

### In Scope

- Record package ownership and dependency direction in an ADR.
- Extract bot strategy after `BotObservation` is stable.
- Separate effect interpretation from card data/cache ownership.
- Move or port platform persistence responsibilities out of match-server.
- Split touched high-risk files when they contain multiple authorities.
- Add package-boundary tests and temporary compatibility entry points.

### Out Of Scope

- Bot behavior tuning.
- Parser or runtime semantic changes.
- A broad line-count-only refactor.
- Duplicating sibling API behavior inside a new local package.
- Breaking public response schemas.

## Task 1: Approve Ownership And Migration Contracts

**Files:**

- Create: `docs/decisions/*-package-authority-realignment.md`
- Modify: package architecture tests
- Modify: workspace manifests only after the ADR is approved

- [ ] Inventory each production module by domain authority, not current folder.
- [ ] Identify public imports, deep imports, side effects, database clients, and
      transport types for every move candidate.
- [ ] Agree whether platform endpoints move to sibling `optcg-api` or remain as
      thin match-specific adapters behind API-owned contracts.
- [ ] Define compatibility subpaths, deprecation period, and removal criteria.
- [ ] Capture the target graph in a failing architecture test.
- [ ] Commit the ADR and dependency test before moving files.

## Task 2: Extract Bot Strategy Behind `BotObservation`

**Prerequisite:** Complete the visibility plan through its bot-observation and
opponent-knowledge tasks.

**Files:**

- Create: `packages/bot/package.json`, `tsconfig.json`, and `src/index.ts`
- Move: `packages/match-server/src/bot-*` strategy, planner, scoring, and probes
- Modify: match registry and bot player orchestration

- [ ] Classify bot modules as pure strategy, offline probe, match orchestration,
      or transport integration. Move only the first two groups.
- [ ] Define the package API around `BotObservation`, legal actions, strategy
      result, profile, and deterministic RNG input.
- [ ] Keep scheduling, registry lookup, state-sync, and action submission in
      match-server.
- [ ] Move production modules and colocated tests without changing scoring or
      decision behavior.
- [ ] Replace internal match-server imports with explicit package inputs.
- [ ] Add a temporary match-server re-export only for real internal consumers;
      document its deletion criterion.
- [ ] Reject bot imports of `GameState`, internal snapshots, setup decklists,
      HTTP/WebSocket modules, Redis, and Postgres.
- [ ] Commit scaffolding, mechanical moves, integration, and adapter deletion as
      separate changes.

## Task 3: Split Effect Semantics From Card Storage

**Prerequisite:** Stabilize certificate and parser-composition APIs first.

**Files:**

- Create: `packages/effects/package.json`, `tsconfig.json`, and owned sources
- Move: parser, segments, instructions, connectors, materialization, and effect
  definition modules from `packages/cards/src`
- Retain: card metadata, repository discovery, and Redis adapters in cards

- [ ] Define the pure effects API for parsing, typed materialization, evidence,
      certificates, and authored definitions.
- [ ] Define a card-repository input port so interpretation consumes card records
      without owning storage or cache access.
- [ ] Split the cards root barrel so pure imports cannot initialize or import
      `redis-card-cache.ts`.
- [ ] Move one parser family first and prove source maps, certificates, runtime
      admission, and reports remain unchanged.
- [ ] Move remaining effect modules mechanically after the pilot boundary holds.
- [ ] Provide time-bounded cards compatibility re-exports for existing callers.
- [ ] Reject effects imports of Redis, Postgres, transport, React, and
      match-server modules.
- [ ] Commit scaffolding, pilot, bulk move, consumer migration, and re-export
      deletion independently.

## Task 4: Remove Platform Persistence From Match-Server

**Repositories:**

- Current: `packages/match-server/src`
- Coordinate with: sibling `../optcg-api`
- Read the sibling repository `AGENTS.md` before any cross-repo change

- [ ] Classify auth, account, deck CRUD, rating, aggregate stats, lobby, and
      match-result behavior against the architecture spec.
- [ ] Keep match-session orchestration and live seat/lobby state in match-server;
      identify platform persistence that belongs to API services.
- [ ] Define narrow ports for identity verification, deck/loadout lookup, and
      match-result/stat publication using canonical public identities.
- [ ] Resolve internal database IDs behind the service boundary instead of
      adding them to public match-server responses.
- [ ] Implement or reuse API-owned endpoints/contracts in `optcg-api`, preserving
      existing public response fields and meanings.
- [ ] Replace direct Postgres/account dependencies such as
      `postgres-user-stats-sink.ts` with injected port adapters.
- [ ] Migrate one responsibility at a time with contract tests, observability,
      rollback criteria, and any required dual-write reconciliation.
- [ ] Delete the old adapter only after production callers and deployment wiring
      use the new authority.
- [ ] Commit simulator and API repository changes independently with linked
      rollout notes.

## Task 5: Restore Cohesion And Enforce Dependencies

**Files:**

- Modify: package-boundary and architecture tests in every affected package
- Review: touched production files above 800 physical lines

- [ ] For each touched high-risk file, identify distinct authorities such as
      protocol, persistence, orchestration, parsing, and diagnostics.
- [ ] Split only cohesive authorities with an explicit API and focused tests;
      do not extract tokens merely to reduce line count.
- [ ] Enforce the target dependency graph from package manifests and production
      source imports.
- [ ] Reject root barrels that import optional infrastructure as a side effect.
- [ ] Reject deep imports across new package boundaries.
- [ ] Add a package smoke test that imports every pure public entry point without
      Redis, Postgres, browser, or match-server initialization.
- [ ] Track every compatibility re-export with an owner and removal condition.
- [ ] Commit cohesion splits separately from package moves.

---

## Rollout And Compatibility

- Public API and WebSocket schemas remain compatibility-sensitive. Do not add
  required fields, rename fields, or expose database IDs without approval and a
  migration plan.
- Move bot code only after its safe observation input is enforced.
- Move effect code only after parser certificate and composition APIs stabilize.
- Deploy service-port changes behind configuration with observable fallback and
  reconciliation where persistence semantics require it.
- Do not keep two writable authorities indefinitely; assign a cutover owner and
  deadline before dual operation begins.

## Acceptance Criteria

- Bot strategy lives behind an independent package API and imports no internal
  match or persistence state.
- Pure effect parsing/materialization imports no Redis or card-cache adapter.
- Cards owns data/repository concerns; effects owns interpretation semantics.
- Match-server contains no direct account, rating, or aggregate-stat persistence
  behavior outside approved service adapters.
- Package manifests and source imports match the approved dependency graph.
- Compatibility adapters are documented, tested, and time-bounded.
- Touched high-risk files have one coherent authority or a documented reason to
  remain intact.

## Verification

```sh
corepack pnpm install --lockfile-only
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:hidden-info
corepack pnpm test:tooling
corepack pnpm contracts
corepack pnpm test
corepack pnpm coverage
corepack pnpm verify
```

Run the sibling API repository contract, lint, typecheck, test, and deployment
validation commands for every cross-repository slice before cutover.
