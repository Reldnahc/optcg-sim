# Spotlight Playback And Display Split Design

## Goal

Rework the effect spotlight client state so playback controls and pending-decision
freezing no longer fight each other. Pending decisions should behave as normal
latest spotlight entries until the playback cursor actually reaches them.

## Current Problem

`useEffectSpotlight` currently mixes three responsibilities in one state path:

- history and cursor playback (`entries`, `cursorIndex`, `paused`)
- timed display dwell (`shownAtMs`, `visibleUntilMs`)
- pending-decision pinning (`pinned`)

That coupling creates buggy interactions:

- a pending-decision spotlight can affect playback while the user is reviewing
  past entries
- fast forward can hide or clear state instead of moving to the actual latest
  spotlight
- automatic playback and pinned decision behavior require special-case cursor
  rules that are hard to reason about

## Required Behavior

- New entries append to local spotlight history.
- If the user is not at the present entry, new entries do not interrupt the
  current view.
- If playback is paused, new entries do not interrupt the current view.
- Normal play advances through entries on timing until it reaches the latest
  entry.
- Fast forward moves the cursor to the latest entry. It does not clear history
  and does not simply hide the spotlight.
- If the latest entry is a pending decision, fast forward shows that pending
  decision and the display freezes there.
- A pending decision freezes only while the playback cursor is on that live
  pending-decision entry.
- When the cursor is on a resolved entry, the display uses the normal dwell
  timing and then advances or hides.
- When there is no cursor entry, the card is hidden but controls remain
  available if there is history.

## Architecture

Keep the public `useEffectSpotlight` API stable for `MatchApp` and
`EffectSpotlight`, but split its internals into two layers.

### Playback Layer

Add an internal playback owner, implemented either as a private reducer/helper
module or a small internal hook:

- owns `entries`, `cursorIndex`, `paused`, and control commands
- appends deduplicated server-projected entries
- preserves history across fast forward and catch-up operations
- determines whether the user is reviewing the past, paused, at present, or
  hidden while caught up
- has no timer logic
- has no pending-decision pinning logic

Playback commands:

- `append`: append new entries without moving the cursor when reviewing or
  paused; seed the initial cursor from the server present key
- `rewind`: move backward; if hidden/caught up, move to the latest entry
- `stepForward`: move one entry forward when behind present
- `play`: resume timed advancement
- `pause`: stop timed advancement
- `fastForward`: set cursor to the latest entry and resume playback
- `autoAdvance`: move to the next entry; if the current resolved entry is the
  latest, clear the cursor to hide the card

### Display Layer

Add a display owner that receives the current playback entry and returns the
visible spotlight model:

- owns `shownAtMs`, `visibleUntilMs`, and display identity
- computes dwell timing for resolved entries
- freezes only when the current entry is live and the matching pending decision
  still exists
- asks playback to auto-advance only when the current display is eligible to
  move on
- does not append entries or choose history cursors

Pending decisions are not global display overrides. They are live playback
entries. Their freeze behavior applies only when the playback cursor is on that
entry.

## Data Flow

1. `MatchApp` passes server-projected spotlight history entries and the server
   present key into `useEffectSpotlight`.
2. The playback layer appends new entries and maintains the local cursor.
3. The display layer receives the current cursor entry.
4. The display layer returns a visible card model or no active card.
5. Controls dispatch playback commands.
6. Display timers dispatch `autoAdvance` when resolved entries have finished
   their dwell time.

## Testing

Add focused hook-model tests for:

- new live pending-decision entries do not interrupt while reviewing the past
- new live pending-decision entries do not interrupt while paused
- normal play advances into a pending-decision entry and freezes there
- fast forward jumps to the latest pending-decision entry
- fast forward jumps to the latest resolved entry and that resolved entry can
  finish normally
- resolved latest entries eventually hide instead of staying stuck
- rewind from hidden/caught-up state shows the latest entry
- history remains available after fast forward and after resolved entries hide

Keep existing duplicate suppression tests for repeated effects and search spans.

## Scope

This design only changes client spotlight playback/display state management.
It does not change server history projection, engine event generation, card
parsing, card rendering, or the visual layout of the spotlight controls.
