# Combat Spotlight Design

## Purpose

Add a second spotlight entry type for combat events so attack declaration and
blocker activation can show two cards in the same spotlight queue/history system
as effect text entries.

The first version covers:

- `attackDeclared`: show the attacker and declared target.
- `blockerActivated`: show the attacker and selected blocker.

The power values should match the existing combat presentation style and be
available after refresh through server-backed spotlight history.

## Confirmed Behavior

Combat spotlight entries use the existing spotlight playback model:

- They enter the same rewind, play/pause, forward, and fast-forward history as
  effect text entries.
- Each entry gets the same minimum display timing as other spotlight entries.
- Fast-forward catches up to the current pending decision if one exists, or to an
  empty spotlight if there is no current pending decision.
- Rewinding after fast-forward can still show the most recent combat entries
  because they remain in server history.

For card pairing:

- Attack declaration renders attacker versus current declared target.
- Blocker activation renders attacker versus blocker, not the original target.

## Data Model

Generalize `EffectSpotlightHistoryEntry` into a typed spotlight history entry
union.

`effectText` entries keep the existing shape:

- single source card
- optional text kind
- active span ids
- target links
- pending/resolved metadata

`combat` entries add a dedicated presentation payload:

- event kind: `attackDeclared` or `blockerActivated`
- attacker `CardRef`
- defender `CardRef`
- attacker display power, if known
- defender display power, if known

The existing history fields remain shared:

- `id`
- `key`
- `semanticKey`
- `mode`
- `status`
- `resolvedEventId`

This avoids pretending combat is active rules text while preserving the existing
playback machinery.

## Server Projection

The server history builder should project public combat events into combat
spotlight entries.

`attackDeclared` events already include attacker and target card refs. They need
to also carry the attacker and defender power values that should be displayed.

`blockerActivated` events already include the blocker and target transition.
They need to also carry:

- the battle attacker card ref
- the blocker card ref
- the attacker's display power
- the blocker's display power

Power values should be captured when the combat event is emitted, not recovered
later from the client board view. That keeps refresh/reconnect history stable and
prevents later power changes from rewriting old spotlight entries.

If a power value cannot be determined at event creation time, the spotlight entry
should still render the two cards and omit the missing power value.

## Client Rendering

`EffectSpotlight` should branch on spotlight entry kind:

- `effectText`: current single-card rules text rendering.
- `combat`: a two-card combat rendering.

The combat renderer should:

- place the two cards in a compact face-off layout inside the existing spotlight
  shell
- keep the shared spotlight controls anchored in the same position whether or
  not an entry is visible
- show attacker and defender power using the existing combat tone thresholds
  from `BattleArrowOverlay`
- avoid rules text highlighting for combat entries

Shared power styling should be extracted instead of duplicating the tone logic in
two places.

## Error Handling And Visibility

Only public combat events should create combat spotlight entries.

Malformed combat event payloads should fail closed by skipping the combat
spotlight entry rather than rendering partial unknown cards or throwing in view
projection.

The client should tolerate older history entries that only have `effectText`
shape during local development or replay of older snapshots.

## Testing

Add focused tests for:

- `attackDeclared` creates a combat spotlight entry with attacker, target, and
  captured powers.
- `blockerActivated` creates a combat spotlight entry with attacker, blocker,
  and captured powers.
- Combat entries participate in the same history ordering as effect text entries.
- Malformed or non-public combat event payloads do not create entries.
- The React spotlight renders two card images and power labels for combat
  entries.
- Existing effect text spotlight rendering still works.

## Out Of Scope

This slice does not add separate combat controls, counter-event spotlighting, or
new combat animations outside the spotlight component.

## Self Review

- No placeholder requirements remain.
- The data model, server projection, client rendering, and tests all refer to
  the same typed combat entry shape.
- Scope is limited to attack declaration and blocker activation.
- The design explicitly chooses server-captured powers to avoid ambiguous
  refresh behavior.
