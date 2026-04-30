---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "00-project-overview"
doc_title: "Project Overview"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Project Overview

<!-- SECTION_REF: 00-project-overview.s001 -->

Section Ref: `00-project-overview.s001`

## Goal

<!-- SECTION_REF: 00-project-overview.s002 -->

Section Ref: `00-project-overview.s002`

Build a web-based OPTCG simulator where players can build decks, play real-time matches, practice against bots, review replays, join ranked and unranked queues, host custom lobbies, and eventually support tournament play.

The simulator is not just a UI. Its core asset is a deterministic rules engine that can correctly model card movement, hidden information, replacement effects, simultaneous triggers, battle timing, replay reconstruction, and judge-review workflows.

## Product scope

<!-- SECTION_REF: 00-project-overview.s003 -->

Section Ref: `00-project-overview.s003`

### In scope for the initial product

<!-- SECTION_REF: 00-project-overview.s004 -->

Section Ref: `00-project-overview.s004`

- Two-player browser matches.
- Server-authoritative game state.
- Loadout import/export and deck validation.
- Card-data integration with a local simulator overlay.
- A rules engine that can be tested without the client or server.
- A minimal replay/action-log system.
- Casual rollback with consent.
- Admin/judge rollback for competitive play.
- Hidden-information-safe player views.
- Delayed-filtered and host-configurable spectator policies.
- Basic account system, preferably OAuth-based.

### In scope after the playable prototype

<!-- SECTION_REF: 00-project-overview.s005 -->

Section Ref: `00-project-overview.s005`

- Ranked and unranked matchmaking queues plus custom lobbies.
- Tournament lobbies.
- Replay viewer.
- Bot opponent.
- Public deck sharing.
- Moderation reports.
- Automated card-effect generation pipeline.
- Advanced observability and anti-cheat analytics.

### Explicit non-goals for the first engine milestone

<!-- SECTION_REF: 00-project-overview.s006 -->

Section Ref: `00-project-overview.s006`

- Full mobile polish.
- Full released-card coverage.
- Sophisticated bot AI.
- Tournament-grade operations.
- Real-time coaching/broadcast tools.
- Hot-editing card effects from an admin dashboard.
- Client-authoritative rule logic.

## Success criteria

<!-- SECTION_REF: 00-project-overview.s007 -->

Section Ref: `00-project-overview.s007`

A first serious prototype is successful when:

1. Two players can play a complete simplified match with correct turn structure.
2. The server never sends hidden information to the wrong player.
3. The action log can replay the match to the same final state hash.
4. The engine passes invariant checks after every action.
5. At least 10–20 representative cards cover vanilla play, battle, counter, trigger, blocker, search, and simple continuous effects.
6. Unsupported cards are rejected during deck validation rather than behaving as accidental vanilla cards.

A production-ready match engine is successful when:

1. Replays are stable across deployed versions through explicit version pinning.
2. Effect support coverage is measurable by card, effect block, and DSL primitive.
3. Card interactions have regression tests before launch.
4. Ranked matches have hidden-info rollback restrictions.
5. Crash recovery either resumes safely or freezes the match with enough evidence to debug.
6. Spectating is delayed and configurable so live ghosting is reduced while replay-quality information remains available.

## Core design principles

<!-- SECTION_REF: 00-project-overview.s008 -->

Section Ref: `00-project-overview.s008`

### Official rules are law

<!-- SECTION_REF: 00-project-overview.s009 -->

Section Ref: `00-project-overview.s009`

Official rules, official card wording, and official rulings are the gameplay authority. `@optcg/engine-core` is the authoritative simulator implementation of those rules. The server owns the full `GameState`; the client owns input, rendering, and animation.

### State is serializable

<!-- SECTION_REF: 00-project-overview.s010 -->

Section Ref: `00-project-overview.s010`

`GameState`, actions, events, decisions, replay headers, and snapshots must be JSON-serializable. This enables rollback, reconnect, replay, audits, tests, and bot training.

### Hidden information is a security boundary

<!-- SECTION_REF: 00-project-overview.s011 -->

Section Ref: `00-project-overview.s011`

A state-view function is not a convenience helper. It is a security-critical boundary. Every field in the canonical state must default to hidden until explicitly exposed.

### Effects are event-driven

<!-- SECTION_REF: 00-project-overview.s012 -->

Section Ref: `00-project-overview.s012`

Effects are not detected from a single `lastAction`. Every atomic mutation emits one or more `EngineEvent`s. Trigger detection consumes events.

### Continuous effects are derived

<!-- SECTION_REF: 00-project-overview.s013 -->

Section Ref: `00-project-overview.s013`

Power, cost, keywords, restrictions, and other continuous modifications are computed into a `ComputedGameView`. They do not repeatedly mutate canonical state.

### Card support is explicit

<!-- SECTION_REF: 00-project-overview.s014 -->

Section Ref: `00-project-overview.s014`

A card is `vanilla-confirmed`, `implemented-dsl`, `implemented-custom`, `unsupported`, or `banned-in-simulator`. Missing implementations are not silently allowed in normal play.

### Ship a narrow game first

<!-- SECTION_REF: 00-project-overview.s015 -->

Section Ref: `00-project-overview.s015`

A correct 20-card game is more valuable than a huge architecture with no playable loop.

## Launch blockers

<!-- SECTION_REF: 00-project-overview.s016 -->

Section Ref: `00-project-overview.s016`

The following are blockers for public ranked or tournament play:

- Any hidden-information leak in `PlayerView`.
- Unsupported non-vanilla card allowed in deck validation.
- Effect queue or trigger-ordering behavior not covered by tests.
- Replay system missing version metadata.
- Rollback system not classifying hidden-information exposure.
- Spectator mode exposing live full information.
- Card-image/content risk not reviewed.

## System actors

<!-- SECTION_REF: 00-project-overview.s017 -->

Section Ref: `00-project-overview.s017`

| Actor             | Description                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- |
| Player            | Plays live matches, builds decks, reviews replays                                   |
| Spectator         | Watches filtered or delayed match state according to spectator policy               |
| Judge/Admin       | Reviews reports, performs competitive rollback, freezes or resolves errored matches |
| Bot               | Consumes engine legal actions and submits actions like a player                     |
| Match server      | Hosts live matches and owns authoritative state                                     |
| Platform API      | Handles account, deck, queue/lobby orchestration, rating, and moderation data       |
| Card-data adapter | Fetches source card metadata and merges simulator overlays                          |

## Match modes

<!-- SECTION_REF: 00-project-overview.s018 -->

Section Ref: `00-project-overview.s018`

| Game type         | Entry                     | Hidden info         | Rating         | Rollback                                                              | Spectator default                      | Unsupported cards                                         |
| ----------------- | ------------------------- | ------------------- | -------------- | --------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Local/dev sandbox | Local/test only           | Configurable        | None           | Free                                                                  | Optional full info                     | Allowed with warnings                                     |
| Unranked          | Queue                     | Strict player views | None           | Mutual consent before hidden info; otherwise admin/server policy      | `live-filtered`                        | Rejected unless vanilla-confirmed or explicitly supported |
| Ranked            | Queue                     | Strict player views | Elo            | Judge/admin only after hidden info                                    | `disabled`                             | Rejected                                                  |
| Custom            | Lobby (optional password) | Strict player views | None           | Host/mutual consent before hidden info; otherwise admin/server policy | Host-configurable within allowed modes | Rejected by default outside dev overrides                 |
| Replay            | Completed artifact        | Full info           | Not applicable | Not applicable                                                        | Full info                              | Historical, version-pinned                                |

`gameType` answers how the session is entered and what competitive rules apply. `formatId` answers what match/deck profile is being played. See [`29-game-types-queues-and-lobbies.md`](29-game-types-queues-and-lobbies.md) and [`30-formats-and-ranked-competition.md`](30-formats-and-ranked-competition.md).

## Repository shape

<!-- SECTION_REF: 00-project-overview.s019 -->

Section Ref: `00-project-overview.s019`

Use a monorepo with package boundaries enforced by lint rules and CI:

```text
packages/
  types/
  engine-core/
  view-engine/
  effects/
  cards/
  match-server/
  api/
  client/
  bot/
  testing/
apps/
  web/
  api/
  match-server/
docs/
  *.md
```

The exact package names can change, but the boundary between full-state server logic and filtered client logic should not.

## Source-data assumption

<!-- SECTION_REF: 00-project-overview.s020 -->

Section Ref: `00-project-overview.s020`

The simulator uses Poneglyph API (`api.poneglyph.one`) as the external source for printed card metadata: card IDs, names, text, stats, images, and variants. The simulator does not treat Poneglyph or local code as rules authority; it uses official rules/card wording/rulings as authority and uses local effect definitions, custom handlers, rulings overlays, support status, and banlist overlays to implement that authority.

This distinction matters: Poneglyph data tells the simulator what a card says and looks like; the simulator overlay tells the engine what the card does.
