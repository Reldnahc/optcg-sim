# Server Spotlight History Design

## Goal

Spotlight playback history must survive page refresh and reconnect. A player
should be able to refresh the dev UI, keep the spotlight controls, and rewind
through already visible effect entries instead of losing the queue because the
React hook remounted.

The desired refresh behavior is full server-projected history with the cursor
defaulting to the present entry. Refresh should not replay the whole history from
the beginning, but the user should be able to go backward through it.

## Current Problem

The server already sends visible engine events through `PlayerView.events`, and
those events include safe `effectResolved` and `replacementApplied`
presentations. The client currently derives spotlight entries from these events
inside React.

The playback queue, cursor, pause state, consumed keys, and duplicate
suppression state are all local hook state. On a fresh mount the hook seeds the
existing resolved event keys as consumed, which intentionally avoids replaying
old events but also makes refresh lose spotlight history.

## Public Contract Shape

Add a public, hidden-info-safe spotlight history field to `PlayerView`.

```ts
interface EffectSpotlightHistoryEntry {
  key: string;
  mode: "live" | "resolved";
  active: ActiveEffectTextPresentation;
}

interface EffectSpotlightHistory {
  entries: readonly EffectSpotlightHistoryEntry[];
  presentKey?: string;
}
```

The exact type names can be adjusted to match local style, but the boundary is
fixed: the server/view layer projects the visible spotlight history, and the
client consumes that projection.

The projection must be derived only from public/player-visible state:

- visible `effectResolved` event presentations
- visible `replacementApplied` event presentations
- visible pending-decision active effect text
- visible source cards already allowed in `PlayerView`

It must not expose raw effect queue entries, execution frames, private decision
candidate internals, hidden card identities, or private event payload fields.

## Playback Semantics

On a fresh client mount or refresh:

- seed playback entries from `view.effectSpotlightHistory.entries`
- set the cursor to `presentKey` when present, otherwise the last entry
- keep controls visible when history exists
- do not auto-replay earlier entries from the beginning

During an active session:

- append newly projected entries in server order
- preserve the user's cursor and pause state when they are reviewing older
  entries
- suppress stale live-to-resolved duplicates without suppressing later repeated
  effects with distinct keys
- keep the fast-forward control clearing the visible backlog locally without
  deleting server history

## Implementation Boundary

The first implementation slice should be contract-first:

- add the public type contract in `@optcg/types`
- project spotlight history in the engine view layer beside `PlayerView.events`
- switch the client to use `view.effectSpotlightHistory` instead of deriving
  history only from local event scans
- keep existing client controls and card rendering behavior

No database migration is needed for this slice because live refresh/reconnect
uses the current server state snapshot. Completed replay history can continue to
use event history unless a later replay-specific requirement needs the new
field.

## Tests

Add focused tests proving:

- `PlayerView` can carry spotlight history entries
- `filterStateForPlayer` projects resolved spotlight history from visible
  effect presentations
- hidden source presentations do not appear in another player's spotlight
  history
- the client seeds playback from server history and starts at the present entry
  after refresh
- new entries do not interrupt a user who has rewound into older history

Existing duplicate and repeated-effect spotlight tests should remain green.

## Non-Goals

- Persisting user-local cursor, paused state, or dismissed backlog on the server
- Adding a new server command for spotlight controls
- Changing card text rendering or spotlight visual layout
- Reworking replay storage
