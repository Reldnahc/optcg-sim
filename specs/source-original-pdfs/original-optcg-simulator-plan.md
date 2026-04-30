---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "original-optcg-simulator-plan"
doc_title: "Original OPTCG Simulator Plan Source Extract"
doc_type: "source-extract"
status: "supporting"
machine_readable: true
---

# Optcg Simulator Plan - Source Extract

<!-- SECTION_REF: original-optcg-simulator-plan.s001 -->

Section Ref: `original-optcg-simulator-plan.s001`

This file preserves the text extracted from the original PDF. It is included so the Markdown spec remains auditable against the original planning documents. Formatting may reflect PDF extraction artifacts; the implementation-ready docs are the canonical rewritten specs.

---

OPTCG Simulator — Software Architecture &
Development Plan

1. Project Overview
   A web-based One Piece Trading Card Game (OPTCG) simulator that allows players to build
   decks, play matches against other players in real time, and practice against AI or in solo
   mode. The system should be modular from day one — designed so multiple developers can
   own and work on independent pieces without stepping on each other.

2. High-Level Architecture
   The project is split into four major layers, each of which can be developed, tested, and
   deployed independently.

┌─────────────────────────────────────────────────┐
│ Client (Frontend) │
│ React/Vue/Svelte SPA — UI, animations, input │
└──────────────────────┬──────────────────────────┘
│ WebSocket + REST
┌──────────────────────▼──────────────────────────┐
│ API Gateway │
│ Auth, rate limiting, routing, session mgmt │
└──────────┬───────────────────────┬──────────────┘
│ │
┌──────────▼──────────┐ ┌─────────▼──────────────┐
│ Game Engine │ │ Platform Services │
│ Rules, state, │ │ Accounts, decks, │
│ match orchestration│ │ matchmaking, social │
└──────────────────────┘ └────────────────────────┘
│ │
┌──────────▼───────────────────────▼──────────────┐
│ Shared Data Layer │
│ Poneglyph API (card data), local cache, DB │
└─────────────────────────────────────────────────┘

---

3. Module Breakdown
   Each module below is a separate package/repo (or monorepo workspace) with its own
   tests, CI, and owner(s).

3.1 Card Data Layer ( @optcg/cards )
Responsibility: A thin client library that wraps the Poneglyph API
( api.poneglyph.one ) and returns typed Card objects consumable by the engine and
client. Poneglyph is the source of truth for all card text, stats, images, and metadata.

Read-through Redis cache: When the match server needs a card, it checks Redis first.
If the card is cached, it’s returned instantly. If not, the library fetches it from Poneglyph,
validates it, writes it to Redis with a TTL (e.g. 24 hours), and returns it. Popular cards like
staple leaders and meta characters stay warm naturally because they’re constantly
being played. Niche cards expire and get re-fetched on demand. No sync jobs, no cron
— the cache populates itself organically through normal usage.

Why the match server fetches: Server-authoritative architecture means the server
must never trust card data from the client. The server fetches it, validates it, and uses it
— the client has no say in what a card does.

Validation: A Zod schema validates the Poneglyph response before caching or passing
to the engine. If Poneglyph’s format changes unexpectedly, the match fails to start with
a clear error rather than producing a corrupt game state.

Client-side card data: The client also needs card data for rendering (images, names,
text). The client can fetch this from Poneglyph directly for display purposes — this data
has no authority over game logic, so there’s no security concern.

Card variants: Poneglyph provides variant/alternate art data for cards. The client
fetches and displays these. Players can assign variants to individual cards in their deck
via the deck builder (stored as variant_id in deck_cards ). During a match, both
players see each other’s chosen variant art — this is purely cosmetic and has no
gameplay impact. The server doesn’t need variant data; it only cares about the base
card_id for game logic.

Cache invalidation: On new set release, a manual cache flush (or a short TTL) ensures
fresh data flows in naturally as players start using new cards. No coordination needed.

Supplementary data: Any simulator-specific data that Poneglyph doesn’t provide (e.g.
effect DSL mappings, ruling overrides, ban list status) lives in a local JSON/YAML
overlay file in this package, keyed by card ID. The match server merges this overlay on
top of the Poneglyph data at fetch time.

---

Owner profile: Backend developer comfortable with API integrations and Redis.

3.2 Game Rules Engine ( @optcg/engine )
Responsibility: Implements all OPTCG game rules as a pure, deterministic state
machine. No UI, no networking — just logic.

Core concepts:

       GameState — a serializable object representing the full state of a match (hands,
      board, life, don, trash, turn phase, etc.).

       Action — a player input (play card, attack, activate effect, pass, etc.).

       applyAction(state, action) → newState — the core function. Given a state and a
      legal action, returns the next state.

       getLegalActions(state, playerId) → Action[] — returns what a player can do
      right now.

       resolveEffect(state, effect) → newState — handles card effects, triggers, and
      chains.

Why this separation matters:

      Testable in isolation with unit tests for every rule interaction.

      Can be shared between server (authoritative) and client (prediction/animation).

      AI/bot opponents consume this same engine.

      Rule changes are isolated to this package.

Mechanical specification: See optcg-engine-spec.md for the full engine-facing
breakdown of turn structure, battle sequence, effect resolution order, zone rules,
keyword behaviors, and confirmed judge rulings. That document is the canonical
reference the engine is built against.

Owner profile: Requires deep knowledge of OPTCG rules. 1–2 dedicated developers.

3.3 Match Server ( @optcg/match-server )
Responsibility: Hosts live matches, enforces rules authoritatively, manages turn timers,
and relays state to clients.

Key design:

      Stateful WebSocket connections per match (one room per game).

---

      Server holds the authoritative GameState ; clients send Action intents; server
      validates via the engine and broadcasts the resulting state diff.

      Turn timer / disconnect handling / reconnection logic.

      Match result recording (winner, stats, replay data).

Tech options: Node.js with ws or socket.io , or a Go/Rust service for performance.

Owner profile: Backend/infra engineer comfortable with real-time systems.

3.4 Platform API ( @optcg/api )
Responsibility: REST (or GraphQL) API for everything that isn’t a live match.

Domains:

      Auth — Discord OAuth login, session management. No password storage — Discord
      handles identity.

      Deck Builder — CRUD for user decks, deck validation against format rules,
      import/export.

      Matchmaking — queue management, ELO/rating, pairing logic.

      Social — friends list, chat, spectating, profile/stats.

      Collection (optional) — if simulating card ownership or wishlists.

Each domain can be a separate service or a module within a modular monolith,
depending on team size.

Server-side deck validation: The server is the authority on deck legality, not the client.
When a player submits a deck for a match, the server validates it against format rules
(card limits, banned list, leader/color restrictions) before the match is created. The client
can run the same validation for instant UI feedback, but the server re-validates
unconditionally — a modified client that skips checks gains nothing. Validation logic
should live in a shared function (part of @optcg/types or @optcg/engine ) that both the
API and client import, so the rules stay in sync automatically.

Owner profile: General backend developers; each domain can have a different owner.

3.5 Frontend Client ( @optcg/client )
Responsibility: The player-facing web app — everything the user sees and touches.

Suggested sub-modules:

---

Sub-module What it covers

ui-kit Shared components: buttons, modals, card frames, tooltips

board The game board — zones, card placement, drag-and-drop, animations

hand Hand display, card selection, mulligan UI

deck-builder Deck list editor, card search/filter, format validation feedback

lobby Matchmaking queue, game creation, friend invites

replay Replay viewer consuming recorded match data

auth Login/register/profile screens

Key considerations:

         Use a component library (Storybook) so UI work can happen in isolation.

         Board rendering is the most complex piece — consider Canvas/WebGL (PixiJS,
         Phaser) for card animations and interactions vs. DOM-based with CSS.

         The client holds a local copy of the engine for instant UI feedback (optimistic
         updates), reconciled against server state.

Owner profile: Frontend developers; board/animation work is a specialty role.

3.6 Bot / AI ( @optcg/bot )
Responsibility: Computer opponents for practice mode.

Consumes: @optcg/engine directly.

Approach: Start with a rules-based heuristic bot (play highest power, attack leader
when able). Upgrade to MCTS or ML later.

Owner profile: Can be a side project or dedicated contributor interested in game AI.

4. Shared Contracts & Communication
   To keep modules decoupled, define shared types and protocols in a common package:

@optcg/types

---

Card , Deck , GameState , Action , Player , MatchResult — TypeScript
interfaces/types used across all packages.

Versioned. Breaking changes require a major version bump and coordinated migration.

Communication protocols

Boundary Protocol Format

Client ↔ Match JSON messages with { type, payload }
WebSocket
Server envelope

Client ↔ Platform
REST / GraphQL JSON over HTTPS
API

Match Server ↔ In-process function
Direct import
Engine calls

Services ↔
ORM / query layer Prisma, Drizzle, or raw SQL
Database

5. Tech Stack (Confirmed)

Layer Choice Notes

Language TypeScript (full stack) Shared types across client/server/engine

Frontend Component ecosystem, Storybook, large
React
framework contributor pool

                                                Card game is a layout problem, not a physics one.
                                                ~32 cards on screen is well within DOM

Board DOM + CSS + framer-
performance. CSS transitions handle
rendering motion
tap/rotate/play animations. Drop in a Canvas
element later if a specific effect needs it

API Fast, modern, built-in schema validation pairs well
Fastify
framework with Zod types

                  ws + custom rooms or

WebSocket Real-time match communication
socket.io

                                                Relational — fits user/deck/match data well

---

Database PostgreSQL

                                          Session storage, matchmaking queues, Poneglyph

Cache Redis
card data read-through cache

                 Poneglyph API

Card data Source of truth for all card text, stats, images
( api.poneglyph.one )

Monorepo Lightweight build caching + task running over
Turborepo
tooling pnpm workspaces

CI/CD GitHub Actions PR checks per package, deploy pipelines

Backend
Railway or Fly.io Managed, WebSocket support, easy scaling
hosting

Frontend
TBD Vercel, Cloudflare Pages, or similar — decide later
hosting

6. Team & Ownership Model
   Currently a solo developer project. The module structure is designed so that as
   contributors join, ownership can be handed off cleanly — but for now, all modules are owned
   by you.

Priority order for solo development
Since one person can’t build everything at once, focus in this order:

1.  @optcg/types — define the shared contracts first
2.  @optcg/cards — Poneglyph client + Redis cache
3.  @optcg/engine — core game logic (the heart of the project)
4.  @optcg/match-server — get two clients playing
5.  @optcg/client — UI to actually see and play the game
6.  @optcg/api — auth, deck builder, matchmaking
7.  @optcg/bot — AI opponent (nice to have)

When the team grows
Each module has a clear boundary so a new contributor can own one without needing to
understand the whole system. The ownership table for future reference:

---

Module Owner Role Depends On
─────────────────────────────────────────────────────
@optcg/cards API integration dev (none — consumes Poneglyph API)
@optcg/types Shared / rotating (none)
@optcg/engine Rules engineer(s) cards, types
@optcg/match-server Backend engineer engine, types
@optcg/api Backend engineer(s) types
@optcg/client Frontend engineer(s) types, engine (client copy)
@optcg/bot AI / gameplay dev engine

Workflow rules

1. No cross-module PRs — if a feature touches two modules, it’s two PRs. The shared
   types change lands first.

2. Module owners review their own module’s PRs. External contributors get approval
   from the owner.

3. Integration tests live in a top-level /integration folder and run in CI against all
   modules together.

4. Semantic versioning on @optcg/types and @optcg/engine — consumers pin versions
   and upgrade deliberately.

5. Development Phases

Phase 1 — Foundation (Weeks 1–4)
Set up monorepo with Turborepo/Nx.

Define @optcg/types — card schema, game state shape, action types.

Build @optcg/cards — implement Poneglyph API client, sync pipeline, and local cache.
Validate that synced data matches the engine’s expected card schema.

Implement core @optcg/engine — basic turn flow (draw, don, main, attack phases) with
a handful of vanilla cards (no complex effects).

Write a CLI test harness that plays a game via terminal input against the engine.

Phase 2 — Playable Prototype (Weeks 5–10)
Stand up @optcg/match-server — two clients can connect and play a basic match.

---

Build initial @optcg/client — board layout, hand display, basic card play and attack UI.

Implement @optcg/api auth and deck builder endpoints.

First end-to-end playtest: two humans play a simplified match in the browser.

Phase 3 — Feature Completion (Weeks 11–18)
Expand @optcg/engine to cover all card effects, keywords, triggers, and counter steps.

Expand @optcg/cards to cover all released sets.

Add matchmaking, ELO, and game history to @optcg/api .

Polish @optcg/client — animations, sound, responsive layout, mobile support.

Build @optcg/bot — basic AI opponent for solo play.

Phase 4 — Launch & Iterate (Ongoing)
Replay system.

Spectator mode.

Tournament/lobby features.

Community features (deck sharing, ratings).

Performance optimization and scaling.

New set releases as card data PRs.

8. Key Design Principles
1. The engine is law. All game logic lives in the engine. The server and client are just
   transport and display. If you can’t express a rule in applyAction , it doesn’t exist.

1. State is serializable. GameState can be JSON-stringified at any point. This enables
   replays, reconnection, debugging, and AI training.

1. Modules don’t reach into each other. Communication happens through published
   types and defined APIs. No importing a server utility into the client.

1. Test at the boundary. Unit test each module in isolation. Integration tests verify the
   boundaries (client → server → engine round trips).

1. Ship incrementally. A working game with 10 cards is more valuable than a perfect

---

     architecture with 0 cards. Get to playable fast, then expand.

9. Rollback System
   Rollbacks are essential in a card game — players misclick, effects resolve incorrectly, or a
   judge ruling requires rewinding. Because the engine is a pure state machine, rollbacks are
   architecturally straightforward.

How it works
The match server maintains a state history stack — an ordered list of every GameState
snapshot produced by applyAction . Each entry is indexed by turn number and action
sequence.

StateHistory = [
{ index: 0, state: GameState, action: null }, // game start
{ index: 1, state: GameState, action: "draw" }, // player 1 draws
{ index: 2, state: GameState, action: "playCard:OP01-025" },
{ index: 3, state: GameState, action: "attack:OP01-025→leader" },
...
]

To roll back: set the current GameState to StateHistory[targetIndex].state and truncate
everything after it. The game continues from that point with a new action sequence.

Rollback modes
Mutual rollback (casual/friendly matches): Either player can request a rollback. The
opponent receives a prompt to accept or deny. If accepted, the server rewinds to the
agreed-upon state. A configurable limit (e.g. max 3 rollbacks per player per game) prevents
abuse.

Judge rollback (ranked/tournament matches): Only a judge or admin can trigger a
rollback. The server exposes an admin endpoint that accepts a match ID and target state
index. This is logged and auditable.

Auto-rollback (bug recovery): If the engine detects an illegal state (e.g. a card in a zone it
shouldn’t be, negative life values, impossible board state), it automatically rolls back to the
last known-good state and flags the incident for review.

Implementation notes

---

    State snapshots are cheap because GameState is a plain serializable object. For
    memory efficiency, store full snapshots at turn boundaries and diffs (actions) within
    turns — full state can be reconstructed by replaying actions from the last snapshot.

    The replay system and the rollback system share the same underlying state history, so
    building one gives you the other for free.

    Rollback events are logged with timestamps, player IDs, and the reason, feeding into
    both the replay viewer and the anti-cheat system.

10. Anti-Cheat System
    In a card game simulator, cheating typically means: seeing hidden information (opponent’s
    hand/deck), manipulating game state (adding cards, changing life), or exploiting
    timing/disconnects. The server-authoritative architecture already prevents most of this, but
    a layered approach hardens the system further.

Layer 1 — Server Authority (Foundation)
The most important anti-cheat measure is already baked into the architecture: the server is
the single source of truth. The client never computes authoritative game state. All it does
is send action intents; the server validates them against getLegalActions() and rejects
anything illegal.

What this prevents: playing cards not in hand, attacking with characters that can’t attack,
activating effects at wrong timings, playing more don than available, skipping mandatory
costs.

Layer 2 — Information Hiding
The server must never send hidden information to a client that shouldn’t have it. This is
the most critical anti-cheat boundary.

    Hand: Each player’s hand is only sent to that player’s client. The opponent receives only
    the hand count.

    Deck: Neither client receives deck contents or ordering. The server handles all draws
    internally and sends only the drawn card to the drawing player.

    Life cards: Face-down life cards are hidden from both players until revealed by the
    game rules (damage, trigger effects). The server tracks them internally.

    State diffs: When broadcasting state updates, the server sends per-player filtered

---

views rather than the full GameState . A filterStateForPlayer(state, playerId)
function strips all hidden information before transmission.

// Server-side: never send raw state
const fullState = engine.applyAction(currentState, action);
const p1View = filterStateForPlayer(fullState, player1Id);
const p2View = filterStateForPlayer(fullState, player2Id);
ws.sendTo(player1, p1View);
ws.sendTo(player2, p2View);

Layer 3 — Action Validation & Rate Limiting
Every action from a client is validated against getLegalActions(state, playerId) . If
the action isn’t in the legal set, it is rejected and the incident is logged.

Action rate limiting: Players can only submit actions during their valid action windows.
Rapid-fire action spam is throttled and flagged.

Sequence enforcement: Actions must follow the correct phase order (refresh → draw
→ don → main → attack → end). Out-of-sequence actions are rejected.

Timing windows: When a player has no legal actions (e.g. no counter cards during
counter step), the server auto-passes for them rather than revealing that information by
waiting.

Layer 4 — Behavioral Detection (Post-Hoc)
For patterns that can’t be caught per-action but emerge over many games:

Win-rate anomaly detection: Flag accounts with statistically improbable win rates,
especially in short time windows.

Disconnect abuse: Track players who disconnect when losing. Implement a penalty
system: frequent rage-quits result in match losses, temporary bans, or ELO penalties.

Collusion detection: In tournament settings, flag accounts that repeatedly face each
other with suspicious play patterns (e.g. one player always conceding quickly).

Client integrity: While the client-side code can always be modified, obfuscate the
WebSocket protocol and use signed message payloads so that trivially modified clients
are detectable. This isn’t foolproof but raises the bar.

Layer 5 — Reporting & Moderation
Player reports: In-game report button that attaches the match replay and state history

---

for moderator review.

Audit log: Every match stores the full action history, rollback events, rejected actions,
and timing data. Moderators can replay any match action-by-action.

Automated flags: Games where a player submitted multiple rejected actions, triggered
auto-rollbacks, or had abnormal timing patterns are auto-flagged for review.

Anti-cheat summary

Threat Prevention layer How

Playing illegal cards/actions Server authority getLegalActions() validation

Seeing opponent’s hand/deck Information hiding Per-player filtered state views

Manipulating life/don/board Server authority Client has no write access to state

Rapid action spam / botting Rate limiting Action throttling + behavioral flags

Disconnect abuse Behavioral detection Rage-quit tracking, ELO penalties

Modified client Protocol hardening Signed messages, obfuscation

Collusion Behavioral detection Pattern analysis across matches

11. Spectator Information Model
    Spectators see full game state — both hands, all zones, everything. The anti-ghosting
    measure isn’t information filtering, it’s a turn delay. Spectators see the game as it was N
    turns ago, so relaying information to a player is useless because the game has already
    moved on.

Delay modes
Default (public matches): 3-turn delay. Spectators see full state, but 3 turns behind
real-time.

Tournament / Ranked: 3-turn delay by default, adjustable by tournament admins.

Private lobby: Configurable by lobby creator (0 to N turns). A 0-turn delay means real-
time full info — useful for coaching, friendly games, or local play.

Stream / Broadcast: 0-turn delay with full info, enabled by tournament admins for

---

commentary streams.

The delay is set at match creation and cannot be changed mid-match.

Implementation notes
The match server already maintains a turn-indexed state history (shared with the
rollback and replay systems). Spectators subscribe to stateHistory[currentTurn -
delay] rather than the live state.

Spectator connections are read-only WebSocket subscriptions. They send no actions,
only receive state updates.

The match server tracks spectator count for display (“12 watching”) but spectators have
no influence on the match.

See filter-state-spec.md for full details on spectator view construction.

12. Observability & Metrics
    Monitoring is not a Phase 4 nice-to-have — instrument from day one. If a match silently
    corrupts or the server leaks memory, you need to know before players tell you.

Match-level metrics
Match lifecycle: matches started, matches completed, matches abandoned
(disconnect/timeout), average match duration.

Action throughput: actions processed per second, action validation rejection rate (a
spike means either a bug or an exploit attempt).

State size: average GameState serialized size over the course of a match. Track this to
catch state bloat early.

Turn timers: average time per turn, timeout rate. Helps tune timer settings and detect
stalling.

Infrastructure metrics
WebSocket connections: active connections, connection churn, reconnection rate.

Redis cache: hit rate, miss rate, memory usage. A low hit rate on the Poneglyph cache
means the TTL might be too short or card variety is higher than expected.

Match server resource usage: CPU, memory, and open file descriptors per match

---

process. Memory growth that correlates with match count suggests a leak.

API latency: p50/p95/p99 for all Platform API endpoints. Deck validation and
matchmaking are the most latency-sensitive.

Alerting
Immediate: Match server crash/restart, Redis connection failure, action rejection rate
spike (>5% of actions rejected in a 5-minute window).

Warning: Memory usage trending upward across matches, Poneglyph API error rate
increase, average match duration anomaly (could indicate infinite loops in effect
resolution).

Tooling
Start with structured logging (JSON logs with match ID, player IDs, action type on every log
line) and a metrics collector (Prometheus + Grafana, or a managed service like Datadog).
The match ID should be a correlation key across all logs, metrics, and traces for a given
game — when debugging, you want to pull the complete story of a match from a single ID.

13. Match Server Crash Recovery
    The match server is stateful — each active match lives in memory as a GameState plus its
    state history. This section covers two distinct failure modes: a single match crashing
    (common — bad effect chain, engine bug) and the entire server process crashing (rare —
    OOM, host failure).

Match-level isolation
Each match runs inside its own error boundary. If one match hits a bug — infinite loop in
effect resolution, corrupt state, unhandled edge case — only that match is affected. Every
other match on the same server continues normally.

When a single match crashes:

1. The error is caught at the match boundary, not the process level. The server process
   stays up.

2. The match is marked as errored and frozen. No further actions are accepted.

3. Both players receive a match_error event with a human-readable message (e.g., “This
   match encountered an error and cannot continue”). No silent disconnects.

---

4. The client shows an error screen with a Report button that auto-attaches the match ID,
   last known state, and the action that triggered the crash.

5. The full state history and action log are preserved for debugging — the match is written
   to the database as an errored match, not discarded.

6. If the match is recoverable (the last turn-boundary snapshot is clean), the server can
   attempt an auto-rollback to the last good state and offer both players the option to
   resume. If not, the match is ended with no result recorded.

This is the most common failure mode — a card interaction the engine doesn’t handle
correctly. It should never take down other matches.

Process-level crash recovery
If the server process itself dies (OOM, unhandled exception that escapes all error
boundaries, deploy, host failure), every in-flight match on that process is lost unless the
state is persisted externally. The rest of this section defines how matches survive that.

What gets persisted
At every turn boundary (start of each Refresh Phase), the match server writes a snapshot
to Redis:

Key: match:{matchId}:state
Value: JSON-serialized GameState
TTL: 2 hours (matches that aren't resumed are garbage collected)

Key: match:{matchId}:meta
Value: { player1Id, player2Id, startedAt, turnNumber, spectatorDelay, lobbyConfig }
TTL: 2 hours

Turn boundaries are chosen because they’re natural pause points — no effects are mid-
resolution, no battles are in progress, and the state is clean. Writing every action would be
more durable but adds latency to every move; turn boundaries hit the right tradeoff.

The action log (every action since the last snapshot) is also persisted, appended per
action:

Key: match:{matchId}:actions
Value: JSON array of Actions since last snapshot
TTL: 2 hours

This allows the server to restore to the exact mid-turn state by replaying actions from the

---

last turn-boundary snapshot.

Recovery flow
When a match server starts (or restarts), it:

1. Scans Redis for match:\*:meta keys to find active matches.

2. For each active match, loads the last GameState snapshot and the action log.

3. Replays all actions from the log against the snapshot using applyAction() to
   reconstruct the current state. Because the engine is pure and deterministic, this
   produces the exact same state.

4. Reopens WebSocket rooms for the recovered matches.

5. Sends a reconnection signal to both players’ clients (see below).

Client reconnection
When a player’s WebSocket drops, the client enters a reconnection loop:

1. Client attempts to reconnect with its matchId and playerId .

2. Server checks if the match exists (in memory or recoverable from Redis).

3. If found, server sends the current filtered PlayerView and the client resumes.

4. If not found (match was lost and not persisted), server sends a match_lost event. The
   client shows an error. The match is recorded as abandoned.

The client should show a “Reconnecting…” overlay during this process rather than dumping
the player back to the lobby. A configurable timeout (e.g., 60 seconds) determines how long
the server holds a match open for a disconnected player before declaring a forfeit.

What happens to spectators
Spectators reconnect the same way as players — they re-subscribe to the match room with
their configured delay offset. Since spectators are already viewing delayed state, a brief
server restart is often invisible to them (the delay buffer absorbs it).

Multi-server considerations
If the match server scales horizontally (multiple processes/instances), each match must be
assigned to a specific instance. Options:

Sticky sessions: Route both players to the same instance by match ID. If that instance
dies, another instance recovers the match from Redis.

---

    Single-instance (early stage): Start with one match server process. Persist to Redis
    anyway so deploys and crashes are recoverable. Scale later.

For the solo developer phase, single-instance with Redis persistence is the right call. The
architecture supports horizontal scaling later without changing the recovery model.

Failure modes

Scenario Impact Recovery

Single match Only that match is Error boundary catches it. Players see error screen
crashes affected; all other with report button. Auto-rollback to last good state
(engine bug) matches continue if possible, otherwise match ends

                    State since last

Server crash
turn boundary is in Replay actions from last snapshot
mid-turn
the action log

                    Action log has the

Server crash triggering action
Replay the action — deterministic engine
during effect but not
reproduces the same effect chain
resolution intermediate
effect states

                                          Match is lost. Alert fires. Players see error. This is

Redis itself No recovery an infrastructure failure, not an application one —
goes down possible Redis should be deployed with persistence
(RDB/AOF) and ideally replicated

Server crash +
State rolls back to Players lose at most one turn of progress.
action log
last turn boundary Acceptable tradeoff
write failed

Both players Server holds
If server also crashes, Redis snapshot allows
disconnect match in memory
recovery when either player reconnects
simultaneously for timeout period

14. Database Schema
    PostgreSQL is the primary datastore for everything that persists beyond a single match
    session. Redis handles ephemeral state (active matches, matchmaking queues, Poneglyph
    cache). This section defines the Postgres schema.

---

14.1 Users & Auth
Authentication is handled via Discord OAuth — we don’t store passwords or manage
account security ourselves. Discord handles identity, we store a reference. This also gives
us avatars, display names, and a natural social graph (mutual servers) for free.

users
id UUID PRIMARY KEY
discord_id VARCHAR(32) UNIQUE NOT NULL
username VARCHAR(32) NOT NULL -- synced from Discord on login
avatar_url VARCHAR(512) -- synced from Discord on login
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

sessions
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash VARCHAR(255) NOT NULL
expires_at TIMESTAMPTZ NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

14.2 Player Settings
Account-level gameplay preferences. These travel with the player across all matches and
are loaded by the client on login. The server respects these where relevant (e.g., auto-
passing when the player has no counter cards and confirm_counter is off).

player_settings
user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
auto_draw_turn BOOLEAN NOT NULL DEFAULT true -- auto-draw in Draw Phase
auto_draw_don BOOLEAN NOT NULL DEFAULT true -- auto-place DON!! in DON!! Phase
confirm_attach_don BOOLEAN NOT NULL DEFAULT true -- prompt before giving DON!! to a
confirm_end_turn BOOLEAN NOT NULL DEFAULT true -- prompt before ending Main Phase
confirm_counter BOOLEAN NOT NULL DEFAULT true -- prompt during Counter Step (if
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

New settings can be added as columns with sensible defaults — existing players get the
default without a migration affecting their experience.

14.3 Decks

decks
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE

---

    name              VARCHAR(100) NOT NULL
    leader_card_id    VARCHAR(32) NOT NULL       -- Poneglyph card ID
    format            VARCHAR(32) NOT NULL DEFAULT 'standard'
    is_public         BOOLEAN NOT NULL DEFAULT false
    playmat_id        VARCHAR(64)                -- cosmetic playmat asset ID
    sleeve_id         VARCHAR(64)                -- cosmetic card sleeve asset ID
    icon_id           VARCHAR(64)                -- deck icon/thumbnail asset ID
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()

deck_cards
id UUID PRIMARY KEY
deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE
card_id VARCHAR(32) NOT NULL -- Poneglyph card ID (base card)
variant_id VARCHAR(32) -- Poneglyph variant ID (alt art). Null = default ar
quantity SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 4)
UNIQUE(deck_id, card_id)

deck_don_cards
id UUID PRIMARY KEY
deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE
card_id VARCHAR(32) NOT NULL -- Poneglyph DON!! card ID
variant_id VARCHAR(32) -- Poneglyph variant ID (alt art DON!!)
quantity SMALLINT NOT NULL CHECK (quantity >= 1)
UNIQUE(deck_id, card_id)

The DON!! deck is a separate editable list of DON!! cards attached to each deck. Default is
10 cards, but formats may allow alternate sizes (e.g., 6). Total DON!! count is validated at
the application layer alongside the main deck. Players can mix different DON!! card
arts/variants within their DON!! deck — both players see each other’s DON!! art in-match.

Deck validation happens at the application layer (shared validation function), not via DB
constraints — the rules are too complex for CHECK constraints (color restrictions, ban lists,
leader-dependent rules, DON!! deck size per format).

14.4 Matches & Replays

matches
id UUID PRIMARY KEY
player1_id UUID NOT NULL REFERENCES users(id)
player2_id UUID NOT NULL REFERENCES users(id)
player1_deck_id UUID REFERENCES decks(id) ON DELETE SET NULL
player2_deck_id UUID REFERENCES decks(id) ON DELETE SET NULL
winner_id UUID REFERENCES users(id) -- null if draw or abandoned
status VARCHAR(16) NOT NULL DEFAULT 'active'

---

                      -- 'active', 'completed', 'abandoned', 'errored', 'draw'
    match_type        VARCHAR(16) NOT NULL DEFAULT 'casual'
                      -- 'casual', 'ranked', 'tournament', 'private'
    lobby_config      JSONB                                      -- spectator delay, rollback limits, e
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    ended_at          TIMESTAMPTZ
    turn_count        SMALLINT

match_replays
id UUID PRIMARY KEY
match_id UUID NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE
action_log JSONB NOT NULL -- full ordered list of actions
final_state JSONB -- final GameState snapshot
compressed BOOLEAN NOT NULL DEFAULT false
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

The action_log in match_replays is the complete ordered action sequence. Combined
with the initial state (derivable from both decks + RNG seed), the replay viewer can
reconstruct any point in the match by replaying actions through the engine. final_state is
optional — stored for quick “jump to end” without full replay.

14.5 Ratings

ratings
id UUID PRIMARY KEY
user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
elo INTEGER NOT NULL DEFAULT 1200
wins INTEGER NOT NULL DEFAULT 0
losses INTEGER NOT NULL DEFAULT 0
draws INTEGER NOT NULL DEFAULT 0
win_streak INTEGER NOT NULL DEFAULT 0
best_streak INTEGER NOT NULL DEFAULT 0
last_match_at TIMESTAMPTZ
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

rating_history
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE
elo_before INTEGER NOT NULL
elo_after INTEGER NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

14.6 Social

---

friendships
id UUID PRIMARY KEY
requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
status VARCHAR(16) NOT NULL DEFAULT 'pending'
-- 'pending', 'accepted', 'blocked'
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE(requester_id, addressee_id)

14.7 Reports & Moderation

reports
id UUID PRIMARY KEY
reporter_id UUID NOT NULL REFERENCES users(id)
reported_id UUID NOT NULL REFERENCES users(id)
match_id UUID REFERENCES matches(id)
reason VARCHAR(32) NOT NULL -- 'cheating', 'stalling', 'abuse', 'bug', 'other'
description TEXT
status VARCHAR(16) NOT NULL DEFAULT 'open'
-- 'open', 'reviewing', 'resolved', 'dismissed'
reviewed_by UUID REFERENCES users(id)
resolved_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

bans
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
reason TEXT NOT NULL
banned_by UUID NOT NULL REFERENCES users(id)
expires_at TIMESTAMPTZ -- null = permanent
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

14.8 Indexes

-- Lookup patterns that need indexes:
CREATE INDEX idx_decks_user_id ON decks(user_id);
CREATE INDEX idx_deck_cards_deck_id ON deck_cards(deck_id);
CREATE INDEX idx_deck_don_cards_deck_id ON deck_don_cards(deck_id);
CREATE INDEX idx_matches_player1 ON matches(player1_id);
CREATE INDEX idx_matches_player2 ON matches(player2_id);
CREATE INDEX idx_matches_status ON matches(status) WHERE status = 'active';
CREATE INDEX idx_rating_history_user ON rating_history(user_id, created_at DESC);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);

---

CREATE INDEX idx_reports_status ON reports(status) WHERE status = 'open';
CREATE INDEX idx_bans_user_active ON bans(user_id, expires_at)
WHERE expires_at IS NULL OR expires_at > now();

14.9 What Lives in Redis, Not Postgres

Data Why Redis

                         Ephemeral, high write frequency, needs sub-ms reads. Written to

Active match state
Postgres as replay on match end

Matchmaking
Ephemeral sorted set. Players enter/leave constantly
queue

Poneglyph card
Read-through cache with TTL. No reason to persist card data locally
cache

Player sessions
Can live in either; Redis is simpler for token lookup
(optional)

Active WebSocket
Which player is connected to which match server instance
mappings

15. Risks & Mitigations

Risk Impact Mitigation

Complex
card effects Engine becomes Build an effect DSL/scripting layer early; extensive
are hard to brittle, bugs multiply unit tests per card
model

WebSocket
Isolate match rooms; horizontal scaling with sticky
scaling under Matches drop or lag
sessions or dedicated processes
load

Rule
ambiguity
Maintain a rulings document alongside card data;
(official Player disputes
flag disputed interactions
rulings
unclear)

---

Contributor Modules go Keep modules small; document everything; cross-
churn unmaintained train at least one backup per module

                                            Phase 1–2 focus on minimal playable game;

Scope creep Never ships
features are gated behind phases

                   New/uncached cards
                                            Read-through cache means most matches work

Poneglyph can’t be fetched;
fine during short outages since popular cards are
API matches using only
already in Redis; monitor Poneglyph uptime;
downtime cached cards are
degrade gracefully with clear error messaging
unaffected

State history Store full snapshots at turn boundaries only;
Match server runs
memory compress/archive completed match histories to
out of memory
bloat DB

Sophisticated
Server authority makes most cheats impossible;
cheating Unfair matches;
behavioral detection catches the rest; reporting +
(modified player trust erodes
moderation as safety net
clients)

16. Next Steps
    Decide on frontend hosting (Vercel, Cloudflare Pages, etc.).

    Set up the Turborepo monorepo with pnpm workspaces.

    Draft the @optcg/types package with initial card and game state schemas.

    Build @optcg/cards Poneglyph API client with Redis read-through cache.

    Begin @optcg/engine with basic turn phases and vanilla card interactions.

    Write a CLI test harness to play a match against the engine in terminal.

17. Design Sweep List
    Topics that need their own deep-dive design pass before or during implementation. Tracked
    here so they don’t get lost.

        filterStateForPlayer specification — Merged into optcg-engine-spec.md section 11.
        Covers per-zone visibility for players/spectators/replays, temporary reveal events, battle

---

context, effect resolution visibility, edge cases, pseudocode, and a security checklist.

Effect system design — See optcg-effect-system.md . Covers DSL format, custom
handler escape hatch, effect runtime (queue, resolution, choices, replacements),
continuous effects layer, card addition pipeline, testing strategy, and automated
generation roadmap.

Database schema — Added as section 14 in this document. Covers users/auth, decks,
matches/replays, ratings, social, reports/moderation, indexes, and Redis vs Postgres
split.

Match server crash recovery — Added as section 13 in this document. Redis
persistence at turn boundaries, action log replay for mid-turn recovery, client
reconnection flow, failure mode table.

---
