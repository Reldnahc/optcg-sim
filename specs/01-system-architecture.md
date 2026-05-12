---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "01-system-architecture"
doc_title: "System Architecture"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# System Architecture

<!-- SECTION_REF: 01-system-architecture.s001 -->

Section Ref: `01-system-architecture.s001`

## High-level topology

<!-- SECTION_REF: 01-system-architecture.s002 -->

Section Ref: `01-system-architecture.s002`

```text
                   ┌──────────────────────────┐
                   │        Web Client         │
                   │ React UI + view-engine    │
                   └─────────────┬────────────┘
                       REST       │ WebSocket
                                  │
        ┌─────────────────────────┴─────────────────────────┐
        │                                                   │
┌───────▼────────┐                              ┌────────────▼────────────┐
│  Platform API  │                              │      Match Server        │
│ auth, decks,   │                              │ authoritative live game  │
│ users, ratings │                              │ rooms, timers, replay    │
└───────┬────────┘                              └────────────┬────────────┘
        │                                                    │
        │                                                    │ in-process
        │                                                    │
┌───────▼────────┐                              ┌────────────▼────────────┐
│   PostgreSQL   │                              │    engine-core           │
│ persisted data │                              │ full GameState rules     │
└────────────────┘                              └────────────┬────────────┘
                                                             │
                                      ┌──────────────────────▼──────────────────────┐
                                      │ cards + effects overlay + support registry  │
                                      └──────────────────────┬──────────────────────┘
                                                             │
                                      ┌──────────────────────▼──────────────────────┐
                                      │ Redis: active matches, cache, matchmaking   │
                                      └─────────────────────────────────────────────┘
```

## Package boundaries

<!-- SECTION_REF: 01-system-architecture.s003 -->

Section Ref: `01-system-architecture.s003`

### `@optcg/types`

<!-- SECTION_REF: 01-system-architecture.s004 -->

Section Ref: `01-system-architecture.s004`

Shared TypeScript types with no runtime dependencies on app packages.

Contains:

- `CardId`, `InstanceId`, `PlayerId`, `MatchId` branded types.
- Public action and message contracts.
- `PlayerView`, `SpectatorView`, and replay DTOs.
- Card-data schemas.
- Deck validation input/output types.

Does not contain:

- Full engine implementation.
- Database clients.
- WebSocket clients.
- Browser-specific code.

### `@optcg/engine-core`

<!-- SECTION_REF: 01-system-architecture.s005 -->

Section Ref: `01-system-architecture.s005`

Server-only authoritative game engine.

Contains:

- Full `GameState`, including hidden zones and RNG state.
- `applyAction`, `getLegalActions`, `resumeDecision`.
- Rule processing, battle flow, effect queue, event journal.
- Full visibility filtering functions.
- State hash generation.

Does not contain:

- React components.
- Database queries.
- WebSocket room management.
- Poneglyph HTTP calls.

### `@optcg/view-engine`

<!-- SECTION_REF: 01-system-architecture.s006 -->

Section Ref: `01-system-architecture.s006`

Client-safe helper layer that operates only on `PlayerView` or replay snapshots.

Contains:

- UI affordance helpers.
- Animation planning.
- Local optimistic presentation for actions already known to be legal.
- Board layout computations.

Does not contain:

- Full `GameState`.
- Opponent hidden hand/deck/life data.
- RNG seeds.
- Authoritative legal-action generation from hidden state.

### `@optcg/effects`

<!-- SECTION_REF: 01-system-architecture.s007 -->

Section Ref: `01-system-architecture.s007`

Effect definitions and custom handlers.

Contains:

- JSON/JSONC DSL definitions.
- Zod schema for effect definitions.
- Custom handler registry.
- Card support registry.
- Effect coverage report scripts.

The runtime that executes effects can live in `engine-core`, but the definitions should be packaged separately so they can be versioned and tested.

### `@optcg/cards`

<!-- SECTION_REF: 01-system-architecture.s008 -->

Section Ref: `01-system-architecture.s008`

Card-data adapter.

Contains:

- Typed card metadata schema.
- Source-card API client.
- Read-through Redis cache integration.
- Local overlay merge: effects, ruling overrides, ban status, simulator metadata.

The server never trusts card data supplied by the browser.

### `@optcg/match-server`

<!-- SECTION_REF: 01-system-architecture.s009 -->

Section Ref: `01-system-architecture.s009`

Live match orchestration.

Contains:

- WebSocket rooms.
- Action envelopes and sequencing.
- Per-match timers.
- Reconnect handling.
- Match crash boundary.
- Snapshot/action persistence to Redis.
- Writing completed match/replay records.

Does not contain card rules beyond calling the engine.

### `@optcg/api`

<!-- SECTION_REF: 01-system-architecture.s010 -->

Section Ref: `01-system-architecture.s010`

Platform services.

Contains:

- Auth/session endpoints.
- Deck CRUD.
- Deck validation.
- Ranked and unranked queue control.
- Custom lobby creation/join/leave control.
- Rating/history and disconnect discipline.
- Social features.
- Reports/moderation.

### `@optcg/client`

<!-- SECTION_REF: 01-system-architecture.s011 -->

Section Ref: `01-system-architecture.s011`

Player-facing application.

Contains:

- Board, hand, deck builder, queue flows, lobby flows, replay viewer.
- Storybook or equivalent component harness.
- WebSocket client.
- REST client.
- Rendering of filtered views.

### `@optcg/bot`

<!-- SECTION_REF: 01-system-architecture.s012 -->

Section Ref: `01-system-architecture.s012`

Computer opponents.

Consumes `engine-core` directly in server/test contexts. In live matches, the bot submits actions through the same server path as a human player.

## Data authority

<!-- SECTION_REF: 01-system-architecture.s013 -->

Section Ref: `01-system-architecture.s013`

| Data                    | Authority                                   |
| ----------------------- | ------------------------------------------- |
| Full match state        | Match server + `engine-core`                |
| Hidden zones            | Server only                                 |
| Card rules/effects      | Server-loaded card/effect registry          |
| Deck legality           | Platform API and match server re-validation |
| Visual card art variant | Loadout data, cosmetic only                 |
| User profile/settings   | Platform API                                |
| Replays                 | Match server writes; replay service reads   |

## Client prediction policy

<!-- SECTION_REF: 01-system-architecture.s014 -->

Section Ref: `01-system-architecture.s014`

The client may predict only presentation, not authority.

Allowed:

- Animate a card toward the board after the player clicks a valid action button.
- Highlight targets provided by the server as legal candidates.
- Pre-render known public state updates while waiting for server confirmation.

Not allowed:

- Compute legal actions using full hidden state.
- Infer whether the opponent has counter actions by timing windows.
- Receive deck order, opponent hand contents, face-down life contents, RNG seed, or effect queue internals.
- Decide outcome of any rule interaction without server confirmation.

## Versioning

<!-- SECTION_REF: 01-system-architecture.s015 -->

Section Ref: `01-system-architecture.s015`

Version these independently:

```ts
interface RuntimeVersionSet {
  engineVersion: string;
  rulesVersion: string;
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  banlistVersion: string;
  protocolVersion: string;
}
```

Every match and replay stores the complete `RuntimeVersionSet`.

## Deployment model

<!-- SECTION_REF: 01-system-architecture.s016 -->

Section Ref: `01-system-architecture.s016`

### Early stage

<!-- SECTION_REF: 01-system-architecture.s017 -->

Section Ref: `01-system-architecture.s017`

- One match-server instance.
- One API instance.
- Redis with persistence enabled.
- PostgreSQL.
- Frontend hosted separately.

### Later scaling

<!-- SECTION_REF: 01-system-architecture.s018 -->

Section Ref: `01-system-architecture.s018`

- Sticky WebSocket routing by match ID.
- Multiple match-server instances.
- Any instance can recover a match from Redis if the assigned instance dies.
- Dedicated worker for replay compression and moderation analysis.

## Observability baseline

<!-- SECTION_REF: 01-system-architecture.s019 -->

Section Ref: `01-system-architecture.s019`

Instrument from day one:

- Match started/completed/errored/abandoned counts.
- Action acceptance/rejection rate.
- Average action processing time.
- Effect queue length and max depth.
- Decision timeout rate.
- State serialized size.
- WebSocket connection/reconnect rate.
- Redis hit/miss rate for card data.
- Replay drift failures in CI.

Every log line inside a live match should include `matchId`, `stateSeq`, and `actionSeq` when available.

## Ownership model

<!-- SECTION_REF: 01-system-architecture.s020 -->

Section Ref: `01-system-architecture.s020`

In solo development, the package boundaries still matter because they constrain scope. When contributors join, assign owners by package.

| Package        | Owner profile                              |
| -------------- | ------------------------------------------ |
| `types`        | Shared, reviewed by engine + server owners |
| `engine-core`  | Rules-focused engineer                     |
| `effects`      | Rules/card implementation engineer         |
| `cards`        | Backend/API integration engineer           |
| `match-server` | Real-time backend engineer                 |
| `api`          | Backend/product engineer                   |
| `client`       | Frontend/game UI engineer                  |
| `bot`          | Gameplay/AI engineer                       |

## Cross-package workflow

<!-- SECTION_REF: 01-system-architecture.s021 -->

Section Ref: `01-system-architecture.s021`

1. Shared type changes land first.
2. Engine changes include tests and replay hash updates.
3. Effect-definition changes include card tests.
4. Protocol changes include old/new compatibility notes.
5. Integration tests run across packages before merge.

Avoid single PRs that rewrite multiple boundaries unless they are mechanical migrations.

## Confirmed technology stack from the original plan

<!-- SECTION_REF: 01-system-architecture.s022 -->

Section Ref: `01-system-architecture.s022`

The original architecture included a concrete stack. This rebuilt spec keeps those choices visible while still allowing later replacement if testing proves a better option.

| Layer                   | Confirmed / initial choice                         | Notes                                                                                               |
| ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Language                | TypeScript full stack                              | Shared types across client, server, and engine.                                                     |
| Frontend                | React                                              | Large contributor pool, component ecosystem, Storybook support.                                     |
| Board rendering         | DOM + CSS + framer-motion                          | A card game is primarily a layout problem. Canvas/WebGL can be introduced later for specific needs. |
| API framework           | Fastify                                            | Pairs well with Zod schemas and TypeScript.                                                         |
| WebSocket               | `ws` custom rooms or `socket.io`                   | Real-time match communication.                                                                      |
| Database                | PostgreSQL                                         | Durable users, decks, matches, replays, ratings, social, moderation.                                |
| Cache / ephemeral state | Redis                                              | Sessions, matchmaking queues, active match recovery, Poneglyph read-through cache.                  |
| Card data               | Poneglyph API (`api.poneglyph.one`)                | Source of truth for printed card text, stats, images, variants, and metadata.                       |
| Monorepo                | Turborepo over pnpm workspaces                     | Lightweight task running and build caching.                                                         |
| CI/CD                   | GitHub Actions                                     | Package-level PR checks and deployment workflows.                                                   |
| Backend hosting         | Railway or Fly.io initially                        | Managed hosting with WebSocket support.                                                             |
| Frontend hosting        | TBD                                                | Vercel, Cloudflare Pages, or similar.                                                               |
| Observability           | Structured logs plus Prometheus/Grafana or Datadog | Match ID should be the correlation key.                                                             |

## Poneglyph-centered card-data topology

<!-- SECTION_REF: 01-system-architecture.s023 -->

Section Ref: `01-system-architecture.s023`

Poneglyph is external display/metadata truth. The simulator is gameplay truth.

```text
Poneglyph API
  -> @optcg/cards fetches and validates with Zod
  -> Redis read-through cache stores validated Poneglyph metadata
  -> certified parser rules may generate complete parsed effect definitions
  -> runtime capability matrix gates generated support status
  -> simulator overlay adds reviewed custom behavior, rulings, banlist status, and explicit overrides
  -> match server snapshots resolved cards at match creation
  -> engine consumes the match card manifest and effect registry
```

Important boundaries:

- The match server never trusts Poneglyph data supplied by the client.
- The client may fetch Poneglyph data for images/search/display only.
- The server validates every Poneglyph response before use.
- Simulator overlays are keyed by Poneglyph card ID.
- Common-template support is generated from complete parse plus runtime capability checks, not from a manual per-card allowlist or manual card-to-mechanic map.
- Generated support records are fail-closed: any unparsed, ambiguous, stale, unsupported, or capability-missing component keeps the card unsupported in normal play.
- Poneglyph variant indexes/generated variant keys are cosmetic and stored in deck data, not rule state.

## Original team and workflow rules preserved

<!-- SECTION_REF: 01-system-architecture.s024 -->

Section Ref: `01-system-architecture.s024`

Even during solo development, the original ownership model remains useful because it defines clean module boundaries.

| Module                | Future owner profile               | Depends on                    |
| --------------------- | ---------------------------------- | ----------------------------- |
| `@optcg/types`        | Shared / rotating                  | None                          |
| `@optcg/cards`        | API integration developer          | Poneglyph API, Redis          |
| `@optcg/engine-core`  | Rules engineer                     | `types`, card manifest        |
| `@optcg/effects`      | Rules/card implementation engineer | `types`, card schema          |
| `@optcg/match-server` | Real-time backend engineer         | `engine-core`, `types`, Redis |
| `@optcg/api`          | Backend/product engineer           | `types`, PostgreSQL, Redis    |
| `@optcg/client`       | Frontend/game UI engineer          | `types`, `view-engine`        |
| `@optcg/bot`          | AI/gameplay developer              | `engine-core`                 |

Workflow rules:

1. Avoid cross-module PRs. If a feature touches multiple packages, land shared type changes first, then package-specific PRs.
2. Module owners review their package's PRs once contributors join.
3. Integration tests live at the top level and exercise package boundaries.
4. `@optcg/types` and `@optcg/engine-core` are semantically versioned; consumers upgrade deliberately.
5. Changes to Poneglyph schema handling require card-data validation tests.
6. Changes to effect definitions require card tests and coverage updates.

## Deployment and scaling notes from the original plan

<!-- SECTION_REF: 01-system-architecture.s025 -->

Section Ref: `01-system-architecture.s025`

Early stage:

- Single match-server process is acceptable.
- Persist active match snapshots/actions to Redis anyway so deploys and crashes are recoverable.
- Use sticky WebSocket routing by `matchId` once multiple match-server instances exist.

Later stage:

- Store active match ownership in Redis.
- If a match-server instance dies, another instance can recover the match from Redis.
- Replay compression, moderation analysis, and card coverage checks can move to background workers.
