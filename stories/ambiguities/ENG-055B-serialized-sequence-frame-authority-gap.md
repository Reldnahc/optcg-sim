# ENG-055B Serialized Sequence Frame Authority Gap

## Status

Blocked during ENG-055B implementation.

## Story

- Parent: `stories/approved/ENG-055-generic-composed-effect-runtime-parent.yaml`
- Child: `stories/approved/ENG-055B-generic-resumable-effect-execution-frames.yaml`

## Ambiguity

ENG-055B requires generic sequence frames that can pause and resume around pending decisions while preserving deterministic replay, event order, state hash behavior, and restart safety.

The reviewed implementation attempt used a module-local frame map keyed by decision id. Code review found this is not replay/restart safe and not match-isolated:

- the frame is not serialized in `GameState`
- a replay or restored state can contain the pending decision but not the process-local frame
- two concurrent matches can collide on deterministic queue/decision ids
- two identical serialized states can behave differently depending on process-local cache contents

Existing canonical types available to ENG-055B do not provide a serialized frame-stack location on `GameState`, `EffectQueueEntry`, or another authoritative runtime structure. Adding that location requires contract/type authority outside ENG-055B's allowed touch points.

## Safe Outcome

Do not merge process-local generic sequence frame state.

ENG-055B is blocked until a follow-up contract/runtime story defines where resumable sequence frame state lives in serialized authoritative state, how it is scoped per match, and how it participates in replay/state hashing.

## Follow-Up Needed

Create a TYP/ENG follow-up that adds canonical serialized frame authority before reattempting ENG-055B implementation.
