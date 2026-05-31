# Client App Shell Design

## Purpose

Build the first production-shaped simulator client shell. The shell gives
`sim.poneglyph.one` an app home and stable navigation toward queues, custom
lobbies, deck builder, profile/account, and the existing match surface.

This is an app-first dashboard, not a marketing landing page.

## Goals

- Add a dashboard at `/` that leads to Play, Lobbies, Decks, and Profile.
- Add route-level pages for `/play`, `/lobbies`, `/decks`, `/profile`, and the
  match board route.
- Keep the existing match board usable for current dev testing.
- Keep shell layout, navigation, and page composition separate from match-board
  rendering.
- Make placeholder routes honest: they should show where future functionality
  lives without pretending unsupported platform services are already complete.

## Non-Goals

- No production authentication implementation.
- No real Poneglyph deck CRUD integration.
- No ranked or unranked queue backend.
- No polished marketing homepage.
- No match engine, card parsing, or gameplay changes.
- No redesign of the match board itself except what is needed to mount it under
  the new route structure.

## Route Model

The initial route model is client-side and intentionally small.

| Route      | Page      | Behavior                                                               |
| ---------- | --------- | ---------------------------------------------------------------------- |
| `/`        | Dashboard | Shows primary app panels and navigation entry points.                  |
| `/play`    | Play      | Shows ranked/unranked placeholders and a dev-play entry path.          |
| `/lobbies` | Lobbies   | Hosts the current create/join local lobby flow as the first real flow. |
| `/decks`   | Decks     | Placeholder page for future Poneglyph deck builder integration.        |
| `/profile` | Profile   | Placeholder page for future Poneglyph identity/account integration.    |
| `/match`   | Match     | Mounts the existing match board app surface.                           |

Existing query parameters such as `matchId`, `lobbyId`, and `seat` remain
supported for the match route. Direct links to an active dev match should still
work.

## Component Boundaries

### App Shell

The app shell owns:

- top-level route selection;
- navigation state;
- page frame layout;
- shared page chrome;
- links between dashboard and route pages.

The app shell must not import match-server code or engine internals.

### Page Modules

Each page is a focused module:

- `DashboardPage`: overview and primary navigation cards.
- `PlayPage`: queue entry placeholders plus dev-play entry.
- `LobbiesPage`: current local lobby create/join affordances.
- `DecksPage`: deck builder placeholder.
- `ProfilePage`: account/profile placeholder.
- `MatchPage`: wrapper around the existing match board surface.

Page modules may share small presentational components from the shell, but they
should not depend on each other's internals.

### Match Board

The existing `MatchApp` remains isolated as the match-board surface. It should be
mounted by the match route rather than being the root application.

This preserves current dev match behavior while letting the broader app shell
evolve independently.

## Navigation And Data Flow

- Dashboard cards navigate to the corresponding route.
- The Play page links into the dev match/lobby flow until real queue services
  exist.
- The Lobbies page uses the existing client controller flow for creating or
  joining local lobbies.
- The Decks and Profile pages are static placeholders with production-shaped
  copy and disabled actions where needed.
- The match board remains responsible for match session state, live sockets,
  modals, windows, and board controls.

The shell should not duplicate match state. It only chooses which page is
mounted.

## Styling Direction

The shell should feel like an operational app surface:

- compact dashboard layout;
- clear navigation;
- restrained panels;
- no marketing hero;
- no large decorative card-heavy splash;
- no coupling between shell styles and match-board zone styles.

The first pass should be functional and clean, not final visual polish.

## Error And Empty States

- Unknown routes should render a lightweight not-found page with a way back to
  the dashboard.
- Placeholder pages should state the unavailable capability plainly.
- Dev lobby/match failures should continue to surface through the existing match
  client error handling.

## Testing Requirements

Implementation must include focused client tests proving:

- `/` renders dashboard navigation entries.
- route selection renders Play, Lobbies, Decks, Profile, and Match pages.
- the match route mounts the existing match board surface rather than duplicating
  match UI logic.
- unknown routes render a not-found state.
- app shell files do not import match-server or engine-core modules.

Existing match-board tests must continue to pass.

## Acceptance Criteria

- The client no longer boots directly into the match board for `/`.
- The dashboard is the first screen at `/`.
- The existing match board remains reachable and usable through the match route.
- Play, Lobbies, Decks, and Profile have separate route modules.
- Placeholder routes are visibly incomplete but structurally ready for future
  Poneglyph platform integration.
- Shell code is separated from match-board code enough that the shell can be
  redesigned without rewriting match gameplay UI.
