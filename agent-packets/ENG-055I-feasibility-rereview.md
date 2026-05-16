# ENG-055I Implementation Feasibility Re-Review

Review assignment id: `implementation-feasibility-rereview-ENG-055I-2026-05-16`

Reviewed story: `stories/approved/ENG-055I-saved-selections-that-character-runtime.yaml`

## Verdict

Blocked.

## Hook Trace

- `SequenceSavedResultReference` supports `selectedTargets` and
  `producedObjects`.
- `EffectExecutionFrame.savedReferences` serializes saved references.
- `TargetSpec` supports `{ type: "selection"; selection: SelectionId }`.
- Existing concrete `TargetSpec` consumers are continuous modifier/restriction
  records, which are owned by ENG-055J.
- `Effect.Target` used by KO/trash/rest style effect DSL does not include a
  saved-selection target form.
- `PlaySelectedEffect` consumes `SelectionId`, but ENG-055I explicitly excludes
  playSelected saved hand-selection consumption because that belongs to
  ENG-055G.

## Blocking Gap

ENG-055I requires positive saved-reference runtime tests for "generic
field-object `TargetSpec` selection consumers in the same supported execution
frame," while also excluding the concrete consumer families currently available
in the codebase:

- modifier/restriction targets are deferred to ENG-055J
- playSelected hand-selection consumption is ENG-055G
- `Target`-based effect primitives do not have a saved-reference target shape

That leaves no concrete in-scope positive consumer to prove the story without
inventing a new DSL/runtime consumer.

## Required Follow-Up

Split or rewrite ENG-055I before implementation. Safe options:

- make ENG-055I a negative-only saved-reference guard story, and move positive
  saved field-object consumption into ENG-055J or a new target-consumer story
- add a prerequisite TYP/ENG story that authorizes a concrete non-J
  saved-reference target consumer
- merge the positive saved-reference consumer work into ENG-055J if the intended
  consumer is continuous modifier/restriction `TargetSpec.selection`
