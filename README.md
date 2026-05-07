# optcg-sim

`optcg-sim` is a spec-driven OPTCG simulator repository. The long-term product
is a web-based simulator with deck building, real-time matches, replays,
matchmaking, lobbies, and tournament support. The core asset being built first
is a deterministic, server-authoritative rules engine with hidden-information
safe views, stable events, state hashes, and testable card/effect behavior.

## Repo Map

- `packages/types/` - shared TypeScript contracts and public DTOs.
- `packages/engine-core/` - authoritative game engine, legal actions, battle
  flow, effect queue, hidden-state filtering, and state hashing.
- `packages/cli/` - local/developer CLI runner over the engine.
- `contracts/` - schema and contract artifacts used by validation tests.
- `specs/` - canonical specification bundle. Start at
  [`specs/README.md`](specs/README.md).
- `docs/workflow/` - mandatory story, packet, review, integration, and sync
  procedures.
- `stories/` - generated, approved, blocked, done, and ambiguity story files.
- `agent-packets/` - active checked-in story packet handoffs.
- `tests/` - repo-level hidden-info, contract, CI, and fixture tests.

## Local Setup

Use the package manager declared in `package.json`:

```sh
corepack enable
corepack pnpm install
```

Useful local smoke commands:

```sh
corepack pnpm run cli:boot
corepack pnpm --filter @optcg/engine-core test
corepack pnpm --filter @optcg/cli test
```

## Verification

Run the full gate before claiming a story is complete:

```sh
corepack pnpm run verify
```

Common narrower checks:

```sh
corepack pnpm run format:check
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run packets:verify
corepack pnpm run specs:verify-metadata
corepack pnpm run test
corepack pnpm run test:hidden-info
corepack pnpm run contracts
corepack pnpm run coverage
```

## Story And Packet Workflow

This repo implements one approved story at a time against the authoritative
specs. For agents, [`AGENTS.md`](AGENTS.md) defines the execution contract and
authority order.

Before implementation, a generated or normalized story must pass story-review,
move to `stories/approved/`, generate an active packet with
`corepack pnpm run packets:generate --story <story> --activate`, and pass
`corepack pnpm run packets:verify`. Implementation must stay inside the
story's `allowed_touch_points`.

Mandatory workflow details live here:

- [`docs/workflow/story-execution.md`](docs/workflow/story-execution.md)
- [`docs/workflow/review-gate.md`](docs/workflow/review-gate.md)
- [`docs/workflow/parent-integration-branches.md`](docs/workflow/parent-integration-branches.md)
- [`docs/workflow/reporting-and-github-sync.md`](docs/workflow/reporting-and-github-sync.md)

Do not use this README as an active story handoff or PR tracker. The
authoritative active-story state is `agent-packets/active.json` plus the active
packet and approved story.

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

The terminal engine foundation is closed as of 2026-05-07. The repo has the
deterministic local engine and CLI path needed before broad infrastructure:
engine state, legal actions, vanilla terminal match smoke, events,
hidden-info-safe `PlayerView` filtering, battle timing, state hashes, and local
verification coverage.

The stable focus after that closeout is the first effect-runtime foundation:
explicit supported sample effects, deterministic effect queue behavior,
trigger-ordering coverage, and hidden-info-safe views for effect-driven states.

## Not Yet

These areas are intentionally deferred or only specified unless a later story
adds them:

- browser UI and view-engine package
- live match server, WebSocket protocol, reconnect, and timers
- matchmaking, lobbies, ranked, spectator, and tournament flows
- production replay, rollback, recovery, persistence, and replay viewer
- card-data adapter, broad card pool support, and deck builder
- platform API, accounts, database-backed deck CRUD, and moderation features

## When To Update This README

Update this README for stable onboarding or interface changes, such as new
packages, changed setup or verification commands, renamed authority locations,
or workflow entry points that a new contributor or agent needs to find.

Update it during milestone closeout stories when the stable development focus
changes.

Do not update it for ordinary story progress, active story handoff, daily
status, branch state, blockers, PR tracking, or detailed acceptance tracking.
