# Web Audio SFX Design

## Goal

Replace the current card-movement-only sound layer with a Web Audio based SFX
system that can cover gameplay movement, UI interaction, turn ownership, and
out-of-tab attention cues. The first asset set may be generated placeholder
WAVs, but the cue contract and playback behavior should be stable enough that
real assets can replace them later without changing planner logic.

## Current State

The client sound system is under
`packages/client/src/react/presentation-effects/`.

- `sound-planner.ts` maps card movement intents to a small set of cue names.
- `event-presentation-intents.ts` maps selected engine events to sound cues.
- `sound-assets.ts` maps thirteen cue names onto four reused WAV files.
- `sound-controller.ts` plays assets with `new Audio(url)` and uses Web Audio
  oscillator tones only as a fallback when no asset exists.
- `use-presentation-effects.ts` combines movement and event sound intents and
  sends them to the controller with the persisted sound volume setting.

This makes the system simple, but it limits quality: many distinct game actions
share one file, repeated sounds are identical, burst timing is coarse, and
non-movement UI/attention sounds have no clear home.

## Cue Domains

Sound cues should be grouped by behavior domain while still sharing one playback
engine.

### Movement Cues

Movement cues describe visible card/game-object motion:

- `draw`
- `play`
- `trash`
- `move`
- `attach`
- `return`
- `rest`
- `ko`
- `damage`
- `reveal`
- `shuffle`

Movement bursts may be coalesced so multiple simultaneous moves produce one
representative sound instead of many stacked sounds.

### Effect And Combat Cues

These cues describe game-state meaning rather than card movement:

- `trigger`
- `counter`

They should have higher priority than ordinary movement so they remain audible
when an effect causes movement at the same time.

### Interaction Cues

These cues describe local UI interaction:

- `emptyClick`: clicking an inert board area or attempting a no-op interaction.
- `invalidClick`: clicking something that is not legal for the current prompt.
- `select`: selecting a legal card/option.
- `confirm`: confirming a modal or explicit action.

Interaction cues should be routed from client interaction handlers, not from the
engine, because they describe local input feedback.

### Turn And Attention Cues

These cues describe user attention:

- `yourTurn`: it becomes the local player's turn or decision while the tab is
  visible and focused.
- `attention`: it becomes the local player's turn or decision while
  `document.hidden` is true or the window is not focused.

The attention cue should be distinct and more noticeable than normal gameplay
SFX, but rate-limited to avoid reconnect or snapshot spam.

## Playback Engine

The primary playback implementation should use the Web Audio API.

- Create one shared `AudioContext` lazily after the user has interacted with the
  page or when the browser allows playback.
- Load each asset URL once and decode it with `decodeAudioData`.
- Cache decoded `AudioBuffer`s by cue.
- For each playback, create an `AudioBufferSourceNode`, connect it through a
  per-cue `GainNode`, and then into a master gain controlled by the existing
  sound volume setting.
- Apply small per-playback `playbackRate` jitter for cues that repeat often,
  especially `move`, `attach`, `rest`, and `draw`.
- Schedule with `audioContext.currentTime` so bursts can be spaced by a few
  milliseconds instead of all starting at exactly the same time.
- Fall back to `HTMLAudioElement` only if Web Audio is unavailable or a decoded
  buffer cannot be obtained.

The playback API should remain cue-based. Callers should not know whether a cue
is currently backed by a placeholder WAV, a future polished asset, or fallback
HTML audio.

## Cue Profiles

Each cue should have a profile:

- asset URL
- base volume multiplier
- pitch variation range
- minimum interval per cue
- priority
- optional burst spacing

Profiles should live in one table so asset replacement and tuning happen in a
single place. The user's persisted sound volume remains the master multiplier.

Suggested behavior:

- `attention`, `yourTurn`, `trigger`, `counter`, `damage`, and `ko` have higher
  priority.
- `emptyClick` and `invalidClick` are quiet and short.
- `attention` has a longer cooldown than normal cues.
- `move`, `attach`, and `rest` tolerate short cooldowns but should not stack
  dozens of identical sounds.

## Planning And Routing

Movement and engine-event planning should remain separate from playback.

- `sound-planner.ts` continues to convert movement intents into movement cues.
- `event-presentation-intents.ts` continues to convert engine events into
  semantic event cues.
- A new client-side interaction/attention planner should produce interaction
  and turn cues from local UI state transitions.
- `use-presentation-effects.ts` should merge cue intents from movement, events,
  interactions, and attention, then send the merged list to the controller.

The attention planner should compare prior and current player-visible state so
it only fires when the local player newly becomes active. A snapshot refresh
where the player was already active must not replay the cue.

## Placeholder Assets

The initial implementation may generate placeholder WAV files and commit them
under `packages/client/src/react/presentation-effects/sounds/`.

Requirements:

- Every cue has a distinct asset file.
- Asset filenames match cue names or a clear profile key.
- Assets are small enough to be reasonable for client bundling.
- The generator script, if kept, should be a developer utility and not runtime
  code.

Polished assets can replace these files later without changing cue names,
planner output, or tests other than asset size/snapshot expectations if those
exist.

## Error Handling

Sound failures must not affect gameplay.

- Failed asset fetch or decode disables only that asset and falls back when
  possible.
- Playback promise rejection is swallowed after recording local non-production
  diagnostics if the repo has an approved diagnostics path.
- The sound controller must return without throwing when audio APIs are missing.
- Disabled sound volume or user sound-disabled state should short-circuit before
  asset playback.

## Tests

Add focused tests for:

- Every declared cue has a profile and asset URL.
- Web Audio playback creates buffer sources, applies gain, applies playback
  rate, and schedules start times.
- Fallback playback still works when Web Audio is unavailable.
- Cooldowns suppress repeated cue spam without suppressing higher-priority cue
  families.
- Movement bursts still coalesce.
- Interaction cues can be planned independently from engine movement.
- Visible active-player transition emits `yourTurn`.
- Hidden or unfocused active-player transition emits `attention`.
- Repeated snapshots while already active do not emit additional turn/attention
  cues.

## Non-Goals

- Choosing final polished sound assets.
- Adding per-cue user settings.
- Adding music, ambience, voice, or announcer sounds.
- Changing gameplay rules, server events, or replay behavior.
- Reworking the settings UI beyond preserving the existing master sound volume.

## Acceptance Criteria

- The client uses Web Audio as the primary SFX path.
- Existing movement and event sounds still work.
- New interaction, turn, and attention cues are supported.
- Placeholder WAVs exist for every cue.
- Playback remains controlled by the existing sound volume setting.
- Sound failures cannot crash or block the match UI.
- Focused sound tests pass.
