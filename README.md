# OPTCG Simulator

This is an unofficial OPTCG simulator project. The core asset is a
deterministic, server-authoritative rules engine with hidden-information-safe
views, stable events, state hashes, and testable card/effect behavior.

## Repo Map

- `packages/types/` - shared TypeScript contracts and public DTOs.
- `packages/engine-core/` - authoritative game engine, legal actions, battle
  flow, effect queue, hidden-state filtering, and state hashing.
- `packages/cards/` - card metadata adapters, Poneglyph integration, generated
  card parsing, and support probing.
- `packages/match-server/` - local and future live match orchestration over the
  engine.
- `packages/client/` - filtered-view client experience.
- `packages/cli/` - local/developer CLI runner over the engine.
- `contracts/` - schema and contract artifacts used by validation tests.
- `specs/` - canonical specification bundle. Start at
  [`specs/README.md`](specs/README.md).
- `docs/` - stable implementation notes and closeout documentation.
- `tests/` - repo-level hidden-info, contract, CI, and fixture tests.

## License

This repository's own source code, specifications, documentation, tests, and
tooling are licensed under the MIT License; see [LICENSE](LICENSE).

This license does not grant rights to third-party card names, card text, images,
trademarks, logos, or other third-party content.

## Disclaimer

This is an unofficial project. See [DISCLAIMER.md](DISCLAIMER.md) for the
third-party content and ownership disclaimer.

## Local Setup

Use the package manager declared in `package.json`:

```sh
corepack enable
corepack pnpm install
```

Useful local smoke commands:

```sh
corepack pnpm run dev
corepack pnpm run cli:boot
corepack pnpm --filter @optcg/engine-core test
corepack pnpm --filter @optcg/cards test
```

Local development does not require Redis by default. Redis can be toggled with
`PONEGLYPH_SIM_REDIS`: use `off` to force in-memory/no-cache behavior, `auto`
to use Redis only when `REDIS_URL` is set, or `on` to opt into Redis with
`REDIS_URL` or `redis://localhost:6379`.

## Card Support Probe

Use the support probe when checking whether card text can enter the generated
card path and the engine runtime. The command exits `0` when the probed input is
supported and nonzero when parsing, certification, runtime support, card fetch,
or deck-hash decoding fails.

Probe one printed effect or trigger line:

```sh
corepack pnpm run support:probe -- --text "[On Play] Draw 1 card."
```

Probe the live Poneglyph data for one card number:

```sh
corepack pnpm run support:probe -- --card OP01-001
```

Probe every unique card in a deck hash:

```sh
corepack pnpm run support:probe -- --deck-hash <deck-hash>
```

Probe every card in a set:

```sh
corepack pnpm run support:probe -- --set OP16
```

Deck-hash and set modes print the card count summary and only the cards with
failures. Add `--raw-unsupported-lines` when you want just the failing text
lines for parser/runtime work:

```sh
corepack pnpm run support:probe -- --deck-hash <deck-hash> --raw-unsupported-lines
```

`--card`, `--deck-hash`, and `--set` fetch card text from the Poneglyph API.
Deck-hash and set modes batch card-detail requests through `/v1/cards/batch`.
They do not use local fixtures.

## Verification

Run the full gate before claiming a broad change is complete:

```sh
corepack pnpm run verify
```

Common narrower checks:

```sh
corepack pnpm run format:check
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run specs:verify-metadata
corepack pnpm run test
corepack pnpm run test:hidden-info
corepack pnpm run test:tooling
corepack pnpm run contracts
corepack pnpm run coverage
```

## Architecture And Specs

Use [`specs/README.md`](specs/README.md) as the spec authority index. Core
onboarding specs:

- [`specs/00-project-overview.md`](specs/00-project-overview.md) - product goal,
  principles, and non-goals.
- [`specs/01-system-architecture.md`](specs/01-system-architecture.md) -
  package boundaries and data authority.
- [`specs/02-engine-mechanics.md`](specs/02-engine-mechanics.md) - core game
  mechanics.
- [`specs/03-game-state-events-decisions.md`](specs/03-game-state-events-decisions.md)
  - state, events, decisions, and hashes.
- [`specs/04-effect-runtime.md`](specs/04-effect-runtime.md) and
  [`specs/05-effect-dsl-reference.md`](specs/05-effect-dsl-reference.md) -
  effect queue and DSL behavior.
- [`specs/06-visibility-security.md`](specs/06-visibility-security.md) -
  hidden-information and view filtering.
- [`specs/12-roadmap.md`](specs/12-roadmap.md) - build order and deferred
  systems.

## Current Stable Development Focus

The repo has a deterministic local engine, generated card parsing path, local
match server, and client prototype. Active development should keep server
authority, hidden-information filtering, engine determinism, and reusable card
effect primitives as first-class constraints.

## Not Yet

These areas are intentionally deferred or only specified unless a later change
adds them:

- production live match server hardening, reconnect, and timers
- matchmaking, lobbies, ranked, spectator, and tournament flows
- production replay, rollback, recovery, persistence, and replay viewer
- deck builder and broad card-pool support
- platform API, accounts, database-backed deck CRUD, and moderation features

## When To Update This README

Update this README for stable onboarding or interface changes, such as new
packages, changed setup or verification commands, renamed authority locations,
or workflow entry points that a new contributor or agent needs to find.

Do not update it for daily status, branch state, blockers, PR tracking, or
detailed acceptance tracking.
