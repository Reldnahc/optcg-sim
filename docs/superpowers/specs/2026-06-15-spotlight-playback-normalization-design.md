# Spotlight Playback Normalization Design

## Context

The current effect spotlight flow mixes three separate responsibilities:

- Projecting a durable spotlight history from engine events and pending decisions.
- Deciding which spotlight entry the local viewer is currently watching.
- Timing and pinning the visible spotlight card.

That coupling caused repeated regressions around search effects, pending
decisions, fast-forward, and rewind. Server history, client fallback source
generation, playback suppression, and display pinning all infer semantic state
from string keys. A fix at one layer can disagree with another layer.

The normalized design separates durable game state from local playback state.

## Goals

- Preserve full durable spotlight history across refreshes.
- Let the local viewer rewind and replay all spotlight entries.
- Show every entry for at least 2 seconds whenever the cursor enters it,
  including entries reached by rewind.
- Pin only the current pending-decision entry after its minimum dwell.
- Make fast-forward clear the local playback backlog without deleting durable
  history.
- Stop using "seen" or span-signature suppression as the primary playback rule.
- Remove duplicated semantic spotlight projection from the client path when
  server history is available.

## Non-Goals

- Do not redesign the spotlight visual layout or controls.
- Do not change effect runtime span selection unless tests prove the runtime
  emits the wrong active span ids.
- Do not make the server track per-browser playback, consumed entries, or seen
  entries.

## Architecture

### Server Timeline

The server projects a replayable spotlight timeline from visible engine events
and the current pending decision.

The timeline is durable view data. It answers:

- What spotlight entries exist?
- In what order should they be replayed?
- Which entry represents the current pending decision, if any?

It does not answer:

- What has this browser already watched?
- Is the user paused?
- Where is this browser's rewind cursor?
- Has an entry already satisfied its 2 second dwell?

Entries should have stable semantic identity derived from structured gameplay
data where possible:

- queue entry id
- effect block id
- source card ref
- text kind
- active span ids
- resolved event id, for resolved entries
- pending decision id, for the current live pending entry

Keep the existing `key` string as a compatibility field during migration, but
client playback must not parse it to determine pending identity.

### Client Playback

The client owns local playback state:

- cursor position
- paused or playing
- whether the viewer is at present
- local fast-forward state

The client never mutates the durable server timeline. It only points at entries
within that timeline or at an empty present state.

Playback rules:

- Initial load with a current pending decision starts at that pending entry.
- Initial load without a current pending decision starts empty, with history
  available through rewind.
- New timeline entries append silently while the user is rewound or paused.
- New timeline entries auto-play only when the local cursor is at present and
  playback is not paused.
- Pressing rewind moves to earlier timeline entries regardless of whether they
  were already displayed.
- Pressing play from a rewound cursor walks forward through every entry.
- Pressing right steps forward one entry only if the cursor is behind present.
- Reaching present with no current pending decision eventually clears to empty.
- Reaching present with a current pending decision shows that entry and pins it
  after the minimum dwell.

### Display Session

The display session owns timing for the entry currently under the local cursor.

Every time the cursor enters an entry, the client starts a fresh display
session:

- `shownAtMs` is reset.
- `visibleUntilMs` is set to `shownAtMs + 2000`.
- The entry cannot auto-advance before that minimum dwell expires.

If the cursor entry is the current pending decision, the display still gets its
minimum dwell first, then stays pinned while that same pending decision remains
current.

If the current pending decision changes while an older entry is displaying, the
older entry is not interrupted. It finishes its local minimum dwell, then normal
playback advances to the newer pending entry.

## Fast-Forward Semantics

Fast-forward clears only local playback state.

When pressed:

- If there is a current pending decision, the cursor moves to that pending
  entry and starts a fresh 2 second display session. After the minimum dwell,
  it remains pinned while the decision is current.
- If there is no current pending decision, the cursor becomes empty and the
  spotlight shows nothing.
- Durable timeline entries remain available for rewind and replay.

After fast-forward:

- If currently pinned on a pending decision, rewind goes to the entry before
  that pending entry.
- If currently empty because there is no pending decision, rewind goes to the
  latest timeline entry.

## Search Effect Behavior

Searcher effects with text like:

`Look at N cards from the top of your deck; reveal up to 1 ... and add it to your hand. Then, place the rest at the bottom of your deck in any order.`

should produce distinct spotlight entries for:

- the selection/reveal portion
- the remaining-card placement portion

Expected flow:

1. The selection pending decision shows the selection span for at least 2
   seconds and pins while that decision is current.
2. After the player selects a card, if the remainder placement decision becomes
   current, the selection spotlight is not interrupted mid-dwell.
3. Once the selection spotlight dwell expires, playback advances to the
   remaining placement spotlight.
4. The remaining placement spotlight shows for at least 2 seconds and pins
   while that decision is current.
5. The resolved selection entry must not display twice during normal forward
   playback, but it must remain replayable through rewind.

## Testing Strategy

Add tests at the state boundaries rather than only at rendered behavior:

- Server timeline projection keeps resolved and current pending entries in the
  correct order without semantic duplicates.
- Client initial load starts empty when no pending decision exists.
- Client initial load starts on the pending entry when one exists.
- Rewind starts a fresh 2 second display session even for already displayed
  entries.
- Play from the beginning displays every timeline entry for 2 seconds.
- Fast-forward clears local playback to pending-or-empty without deleting
  history.
- Rewind after fast-forward lands on the latest or second-latest entry according
  to whether a pending decision is pinned.
- Search selection advances to search remainder only after the selection dwell
  expires.
- Search remainder pins when it is the latest pending decision.

## Implementation Notes

- Keep server projection in `engine-core` as the canonical semantic owner.
- Keep client fallback only for missing server history, or shrink it to a thin
  adapter that does not duplicate server semantics.
- Replace signature-based suppression with cursor/timeline rules for server
  timelines. Limit signature suppression to the legacy fallback path when no
  server timeline is available.
- Keep display timing tied to cursor entry transitions, not to whether a key was
  previously consumed.
