# Replay Viewer Design

## Goal

Build the in-app replay viewer as a read-only match surface, not a separate
website or marketing page. A replay URL should let a user inspect a completed
match using the existing app route and match board when the artifact contains
snapshot-backed frames.

## Current Foundation

- `/replays/:matchId` already routes to `ReplayViewerPage`.
- `/api/replays/:matchId` already returns replay detail.
- Local replay fixtures can be served through
  `PONEGLYPH_SIM_REPLAY_FIXTURE_PATH`.
- `ReplayViewerPage` can already render `MatchApp` in read-only replay mode
  when `replayFramesFromDetail` can extract snapshots from deterministic
  entries.

## First Slice

The first viewer slice should make the existing in-app route useful and clear:

- Load replay detail for the match id in the route.
- Derive replay frames from persisted snapshots when available.
- Render the existing match board in read-only replay mode for frame-backed
  artifacts.
- Provide in-app replay controls with previous/next navigation, current frame
  position, and an action label.
- Provide a replay summary and raw timeline fallback when no frame-backed board
  state is available.

## Non-Goals For This Slice

- Do not build a standalone website.
- Do not reconstruct every frame from initial state plus actions yet.
- Do not add new replay authorization behavior in the client viewer slice.
- Do not redesign the live match board.

## Data Contract

Board playback is available only when deterministic replay entries contain
`result.snapshot` data shaped like the match snapshots already consumed by the
client view model. Entries without snapshots remain useful for the timeline but
must not be treated as board frames.

Future reconstruction can use initial state, deterministic actions,
checkpoints, hashes, and final state, but that should be a separate engine-side
increment with drift verification.

## UX Shape

When frames exist, the viewer should prioritize the actual match board and keep
replay controls visible. When frames are missing, the route should not feel
broken: it should show match metadata, players, and saved deterministic/audit
entries so the artifact can still be inspected.

## Verification

Add focused tests for:

- frame-backed playback labels and navigation state
- non-frame fallback summary and timeline rendering
- route/view behavior without relying on full browser execution
