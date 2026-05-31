# Seatless Custom Lobbies Design

## Purpose

Custom lobby invite links should identify the lobby, not a specific player seat.
The browser identity claims a seat through the server. Today that identity is a
local guest identity; later it becomes a Poneglyph account session.

This removes the dev-only requirement that a joining player receive a direct
`p2` link.

## Goals

- Allow a player to join a custom lobby from a seatless lobby URL.
- Store a local guest identity for anonymous development play.
- Let the server assign the first open lobby seat to a new guest identity.
- Let the same guest identity rejoin the same lobby and receive the same seat.
- Keep current match seat token authorization for live match actions.
- Keep the existing match board as the gameplay surface.

## Non-Goals

- No production account implementation.
- No spectator mode.
- No lobby browser.
- No lobby password or permission system.
- No deck selection or ready-check redesign.
- No engine, card parsing, gameplay, or hidden-information changes.

## Authority Model

The URL is not the player authority.

Lobby URL authority:

- identifies the lobby;
- may be shared with either player;
- does not choose `p1` or `p2`;
- does not carry a match seat token.

Identity authority:

- today: a locally generated guest identity token;
- later: an authenticated Poneglyph account/session;
- is sent to the lobby join endpoint;
- determines whether the caller already owns a lobby seat.

Server authority:

- assigns the first open lobby seat to a new identity;
- returns the already-owned seat for a returning identity;
- creates the match once both player seats are claimed;
- keeps match seat tokens scoped to one match and one player seat.

## Route Shape

Primary custom lobby route:

- `/lobbies/<lobbyId>`

The route renders the lobby page and joins or resumes that lobby with the local
guest identity.

Compatibility behavior:

- existing `?lobbyId=<id>&seat=<playerId>` links may continue to work as a dev
  fallback;
- new UI should create and share seatless lobby links;
- new code should not require `seat` to join a lobby.

## Guest Identity

The client owns a small guest identity store.

Required behavior:

- On first lobby use, generate and persist a guest token.
- Reuse the same token across reloads in the same browser profile.
- Send the token when joining a lobby.
- Do not expose another player’s token through lobby or match views.

The guest token is development identity only. It should be isolated behind a
client identity helper so a future account-backed identity provider can replace
it without rewriting lobby or match UI.

## Lobby Join Flow

Creating a lobby:

1. Client requests a new lobby.
2. Server creates an empty lobby with player seats.
3. Client joins the lobby using its guest identity.
4. Server assigns the first open seat.
5. Client URL becomes the seatless lobby URL.
6. Client opens a live lobby connection for updates.

Joining an existing lobby:

1. Client loads `/lobbies/<lobbyId>`.
2. Client resolves or creates local guest identity.
3. Client asks server to join the lobby with that identity.
4. Server returns the caller’s seat:
   - existing seat if the identity already claimed one;
   - first open seat if available;
   - full-lobby error if no seat is available.
5. Client stores the returned lobby seat locally.
6. If the lobby is ready and has a match ID, client claims the matching match
   seat using the guest identity token path and enters the match flow.

## Server Behavior

The local dev lobby registry should track seat ownership by identity subject,
not only by claimed boolean.

Required outcomes:

- A new guest can claim the first open seat.
- The same guest can rejoin idempotently.
- A different guest cannot claim an occupied seat.
- Once all player seats are claimed, the lobby creates a match.
- Lobby sync messages still omit private session tokens.

The registry may still expose `claimed` for UI status, but support decisions
must use identity ownership internally.

## Client Behavior

The Lobbies page becomes the user-facing custom lobby entry point.

Required behavior:

- “Create Custom Lobby” creates a lobby and navigates to the seatless lobby URL.
- A seatless lobby URL joins or resumes the lobby.
- Waiting state shows the lobby ID and shareable link.
- When the second player joins, both clients transition to setup or match
  without manual refresh.
- Match route remains responsible for the board once a match exists.

The client should keep route parsing and session identity separate from
rendering. Page modules should ask controller/session helpers to create or join,
not hand-roll transport calls in UI components.

## Error Handling

- Unknown lobby: show a clear lobby-not-found state.
- Full lobby: show a clear full-lobby state.
- Guest identity storage unavailable: fail closed with a visible error.
- Live lobby connection failure: keep the lobby page usable through explicit
  refresh or retry, but do not silently claim a different seat.
- Existing match seat token mismatch: fail closed through current match
  authorization errors.

## Testing Requirements

Server tests:

- Creating a lobby returns a lobby with no claimed seats.
- Joining without specifying a seat claims the first open seat.
- A second identity claims the next open seat.
- Rejoining with the same identity returns the same seat.
- Joining a full lobby fails closed.
- Lobby response and lobby sync do not include private guest tokens.

Client/controller tests:

- Guest identity is generated once and reused.
- Creating a lobby claims a seat using guest identity and stores the lobby seat.
- Joining a seatless lobby claims or resumes a seat without `seat` in the URL.
- Existing direct-seat lobby links still work as a compatibility fallback.
- When lobby sync includes a match ID, the client claims the matching match seat.

Route/UI tests:

- `/lobbies/<lobbyId>` renders the lobby route.
- The Lobbies page exposes a create custom lobby action.
- Generated share links do not include `seat`.
- The app shell does not import match-server or engine-core modules.

## Acceptance Criteria

- A player can create a custom lobby and receive a shareable seatless lobby URL.
- A second browser can open that URL and join without being given `p2`.
- Refreshing either browser preserves its guest identity and seat.
- Once both seats are claimed, both clients transition into setup or match.
- Existing match action authorization still requires the proper match seat token.
- The implementation does not add production account assumptions that would make
  replacing guest identity harder later.
