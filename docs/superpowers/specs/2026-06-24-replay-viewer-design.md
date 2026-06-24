# Replay Viewer Design

## Goal

Build `/replays/:matchId` as a read-only simulator playback surface. A valid
replay should look like the live match table and behave like a step/play tool,
not like a metadata report. Users should be able to inspect board state at each
action boundary, step forward and backward, scrub, and auto-play through the
match.

## Design Correction

The viewer must not depend on persisted client snapshots as the only way to
make frames. Saved snapshots are useful as checkpoints or acceleration data, but
they are not the authority for whether replay playback is possible.

For every valid replay artifact, frame generation should start from replay data:

- `initialSnapshot`
- `initialDeckOrders`
- `deterministicEntries`
- `checkpoints`
- `finalState`
- replay hashes and version metadata

If frame reconstruction fails, that is an invalid, corrupt, unsupported, or
drifting replay artifact. The fallback page should present a clear
reconstruction failure, including the action boundary if known. It should not be
the normal experience for valid replays.

## Architecture

Replay playback should have three separate responsibilities:

- **Artifact loading:** `ReplayViewerPage` fetches replay detail from
  `/api/replays/:matchId` and passes the artifact to replay playback code.
- **Frame reconstruction:** an engine-side or shared replay module converts the
  artifact into ordered frame records by replaying deterministic entries from
  the initial state and verifying expected checkpoints/final hashes.
- **Frame presentation:** the client converts each frame into the existing
  `MatchApp`/board view model and provides read-only replay transport controls.

The React viewer should not hand-roll game rules, mutate replay state, or infer
hidden information. It should consume reconstructed frame snapshots that are
already safe for replay viewing.

## Frame Model

Each frame should include:

- frame index
- action index or setup boundary
- label suitable for transport controls
- match/client snapshot for the board
- optional deterministic entry metadata
- optional verification status for checkpoint/final hash matching

The first frame should represent the initial visible board state. Every
deterministic action boundary should add a frame after the action resolves.
Decision responses and automatic rule processing may be represented as separate
frames only when they produce inspectable user-visible state changes or useful
debug labels.

## Viewer UX

The main route should open on the simulator table whenever reconstruction
succeeds.

Replay controls should be docked over or beside the match surface, not replace
the match surface:

- previous frame
- next frame
- play/pause
- speed control
- scrubber
- current frame position
- current action label

The board remains read-only. Existing inspection behavior should keep working:
card hover/preview, collection windows, visible zone inspection, action log, and
settings that affect visual presentation. Live-game commands remain disabled.

The raw replay entries and match metadata may live in an optional docked/debug
panel. They should not be the primary viewer.

## Failure UX

Fallback metadata/raw replay rendering is reserved for failure states:

- unsupported replay format version
- missing required artifact data
- reconstruction drift against checkpoints or final hash
- corrupted deterministic entry
- client cannot project a reconstructed frame into the board model

The failure surface should say what failed and where, for example:

`Replay reconstruction failed at action 17: checkpoint hash mismatch.`

It may show match metadata and raw entries for debugging, but the error must be
prominent so this is not confused with successful playback.

## Data Contract

Saved `deterministicEntries[].result.snapshot` values may be used as existing
frame data while reconstruction is being built, but they are transitional. The
durable contract for valid replay playback is deterministic reconstruction from
the artifact plus drift verification.

The frame generator must fail closed when required data is absent or inconsistent
instead of silently skipping actions.

## Non-Goals

- Do not build a standalone website.
- Do not redesign the live match board.
- Do not make replay playback interactive in the sense of submitting gameplay
  actions.
- Do not weaken hidden-information filtering for live clients. Replay visibility
  must be explicit and safe.

## Verification

Add focused tests for:

- reconstruction creates an initial frame and per-action frames for valid replay
  artifacts
- saved snapshots are not the only path to frames
- drift or missing artifact data fails closed with a useful error
- replay transport controls step, scrub, and auto-play through frames
- `/replays/:matchId` renders `MatchApp` as the primary successful view
- fallback metadata/raw entries appear only for reconstruction failure states
