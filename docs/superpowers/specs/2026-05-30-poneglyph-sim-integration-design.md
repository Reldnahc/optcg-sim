# Poneglyph Simulator Integration Design

## Purpose

The simulator should become a first-party Poneglyph application hosted at
`sim.poneglyph.one`. Poneglyph owns identity, card data, deck data, and match
entry orchestration. The simulator owns live match execution, hidden-information
filtering, engine state transitions, and real-time gameplay transport.

This keeps the simulator part of the Poneglyph product without collapsing
account, deck, card-data, and deterministic match-runtime authority into one
package or service.

## Product Shape

- `poneglyph.one` is the main application surface for accounts, card browsing,
  deck building, profiles, and future collection features.
- `api.poneglyph.one` is the shared API authority for authentication, card data,
  deck data, matchmaking/session creation, and production match bootstrap.
- `sim.poneglyph.one` is the simulator client application.
- The simulator match server is an authoritative live runtime service. It
  accepts validated match manifests and authenticated seat tokens; it does not
  own account identity or deck ownership.

## Repository Strategy

Keep the simulator repository separate initially.

The simulator is still changing quickly in areas that have different engineering
constraints from the main Poneglyph app: deterministic engine state, primitive
effect execution, hidden-information filtering, WebSocket match transport,
rollback, card parsing, and live decision handling. Merging repositories before
those boundaries settle would increase coupling without solving the real
integration problem.

A monorepo can be reconsidered later if shared package versioning, deployment,
or cross-repo contract drift becomes the dominant cost. Until then, integrate
through stable API and contract boundaries.

## Identity And Accounts

Poneglyph owns accounts. The simulator must not implement a separate account
system.

The production account flow should be:

1. A user signs in through Poneglyph.
2. Poneglyph establishes the authenticated user identity.
3. `sim.poneglyph.one` uses that identity to request simulator sessions.
4. Poneglyph API validates the user, deck ownership, deck legality, and match
   entry permissions.
5. Poneglyph API creates or joins a match and mints short-lived seat tokens.
6. The simulator client connects to the match server using the seat token.
7. The match server verifies the seat token and binds the connection to exactly
   one match seat.

Preferred production shape: Poneglyph API mints short-lived match/seat tokens.
This keeps full account authority out of the match server while still giving the
match server a compact, verifiable identity claim.

Shared parent-domain cookies on `.poneglyph.one` may be acceptable for browser
session continuity, but the match server should still receive a match-scoped
seat token rather than raw account-session authority.

## Match Creation Flow

Production match creation should be API-orchestrated:

1. Client requests match creation or queue entry from Poneglyph API.
2. Request includes authenticated user identity and selected deck ID.
3. Poneglyph API validates:
   - user session;
   - deck ownership or allowed deck access;
   - deck legality for the requested format;
   - card IDs against Poneglyph card data;
   - simulator support status for cards that will be allowed in the match;
   - game type, queue, lobby, or direct challenge permissions.
4. Poneglyph API builds a validated match manifest:
   - player seats;
   - deck manifests;
   - card manifest;
   - supported effect definitions;
   - cosmetic variant selections;
   - match configuration;
   - first-player chooser state.
5. Poneglyph API registers the match with the simulator match server.
6. Poneglyph API returns match ID, seat ID, and seat token to each client.
7. Simulator client opens the WebSocket to the match server.
8. Match server sends only filtered player views and public data.

The engine starts only after the match server has a fully validated manifest and
resolved setup requirements such as first-player choice.

## First-Player Choice

First-player choice is session orchestration, not engine policy.

- Game one: the server randomly chooses which player gets to choose first or
  second.
- Rematch: the previous game's loser chooses first or second.
- If the previous result has no single loser, such as draw, cancel, no-contest,
  or admin reset, rematch first-player choice must fail closed until an explicit
  session policy defines a fallback.
- The chooser submits `goFirst` or `goSecond`.
- The engine receives only the resolved `firstPlayerId`.

The client must not be able to submit an arbitrary `firstPlayerId` directly for
production matches.

## Runtime Authority Boundary

Poneglyph platform services own:

- accounts;
- sessions;
- deck CRUD;
- deck ownership;
- deck legality;
- matchmaking;
- lobby permissions;
- queue policy;
- match creation;
- card-data cache and API access;
- persisted user-facing match records.

The simulator match server owns:

- live match state;
- authoritative action validation;
- WebSocket gameplay transport;
- hidden-information filtering;
- decision routing;
- rollback request flow;
- match event log for the active match;
- persistence snapshots needed for live recovery.

The engine owns:

- deterministic game state transitions;
- legal action derivation from authoritative state;
- effect runtime execution;
- pending decision creation;
- event production;
- replay-compatible state updates.

The engine must not know about:

- OAuth;
- cookies;
- user emails;
- account profile data;
- deck ownership;
- lobby passwords;
- queue tickets;
- database credentials;
- public Poneglyph HTTP clients.

## Card And Deck Data Boundary

Poneglyph remains the card-data authority.

The simulator consumes validated card and deck manifests. The card layer may
fetch and cache Poneglyph card data where appropriate, but gameplay authority
comes from validated manifests and supported primitive effect definitions, not
from client-fetched display payloads.

Deck validation belongs outside the engine. The engine should receive:

- player IDs or seat IDs;
- resolved first player;
- validated deck manifests;
- card manifest;
- supported effect definitions;
- RNG seed or randomness source configuration;
- match/session config.

The engine should not validate deck ownership, account permissions, or format
entry rights.

## Shared Contracts

Shared contracts should be introduced before sharing implementation code.

Likely future packages:

- `@poneglyph/auth-contracts`
- `@poneglyph/card-contracts`
- `@poneglyph/deck-contracts`
- `@poneglyph/match-contracts`
- `@poneglyph/sim-contracts`

The simulator engine and card parser should not become dependencies of the main
Poneglyph web app. If the main app needs simulator status, it should consume
contracted support summaries or API responses, not engine internals.

## Security Requirements

- A seat token must authorize exactly one user, one match, and one seat.
- A client must not be able to use another player's seat token.
- A client must not be able to request hidden opponent state.
- Raw `GameState` must never be sent to ordinary clients.
- Match server responses must remain filtered by player.
- Decklists should not leak through generic card-catalog endpoints.
- Client display card data is not gameplay authority.
- Reconnects must re-bind through authenticated seat identity.

## Development Mode

Local development can keep dev-only shortcuts, but those shortcuts must sit
behind explicit dev adapters.

Dev mode may:

- use local deck text files;
- mint local anonymous seat tokens;
- bypass real account login;
- use local Redis;
- use generated dev manifests.

Dev mode must not:

- shape production APIs around anonymous local assumptions;
- put account behavior inside the engine;
- make client-held deck manifests authoritative for production;
- leak hidden state because local play is trusted.

## Initial Implementation Slices

1. Define production session contracts:
   - `userId`;
   - `matchId`;
   - `seatId`;
   - `seatToken`;
   - `deckId`;
   - validated deck manifest;
   - card manifest;
   - first-player chooser state.

2. Add match-server auth adapter seam:
   - dev adapter for local play;
   - production adapter for Poneglyph-issued seat tokens.

3. Add production match bootstrap input:
   - accepts validated manifests;
   - rejects raw client decklists;
   - starts the engine only after setup state is resolved.

4. Connect `sim.poneglyph.one` client to the production bootstrap flow.

5. Move deck selection and match creation to Poneglyph API.

6. Reevaluate repo structure after the API boundary is real.

## Non-Goals

- No immediate repository merge.
- No account implementation inside the simulator engine.
- No deck ownership validation inside the engine.
- No client-side gameplay authority.
- No direct dependency from the main Poneglyph app on engine internals.
- No production reliance on dev deck files.

## Open Questions

- Whether Poneglyph auth should use parent-domain cookies, OAuth-style tokens,
  or both.
- Whether match server seat tokens are signed JWTs or opaque Redis-backed
  tokens.
- Whether persisted completed match records live in Poneglyph API storage, match
  server storage, or a shared replay service.
- Whether simulator support status is computed on demand by the card layer or
  cached by Poneglyph card-data services.
- Whether public launch serves official images directly from Poneglyph CDN or
  through a simulator-facing proxy.
