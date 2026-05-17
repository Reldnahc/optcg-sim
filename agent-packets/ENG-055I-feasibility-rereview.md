# ENG-055I Agent Feasibility Re-Review

Review assignment id: `agent-story-review-ENG-055I-feasibility-2026-05-16`

Reviewed story: `stories/approved/ENG-055I-saved-selections-that-character-runtime.yaml`

## Verdict

`blocked`

## Findings

- High: ENG-055I requires a positive consumer for saved `selectedTargets` or
  `producedObjects` references in later generic field-object `TargetSpec`
  selection use, but engine-core has no in-scope consumer for that path.
- Medium: the current generic sequence-frame runtime does not produce saved
  `selectedTargets`; it currently writes `producedObjects` and `selectedCards`.
- The existing `TargetSpec.selection` consumer is in continuous modifier/
  restriction records, which belongs to ENG-055J. `playSelected` is explicitly
  excluded by ENG-055I and belongs to ENG-055G.

## Hook Trace

- `SequenceSavedResultReference`, `EffectExecutionFrame.savedReferences`, and
  `TargetSpec { type: "selection" }` exist.
- Current queue runtime has concrete branches for choose-target KO,
  draw/trash sequences, generic sequence frames, and search/reveal.
- Current target-decision runtime is KO-only with `target.type === "choose"`.
- No in-scope positive consumer remains inside ENG-055I's boundary.

## Required Story Change

Rewrite or split ENG-055I before implementation. Options:

- make ENG-055I a negative-only saved-reference guard story
- move positive saved field-object consumption into ENG-055J
- add a prerequisite story that authorizes a concrete non-J saved-reference
  target consumer

## Second-Pass Re-Review

Review assignment id:
`agent-story-review-ENG-055I-feasibility-rereview2-2026-05-16`

Verdict: `blocked`

The reviewer confirmed ENG-055I is still not approval-ready as written.

Concrete blockers:

- no in-scope positive consumer exists for non-`playSelected` saved field-object
  references; `playSelected` is explicitly owned by ENG-055G and excluded by
  ENG-055I
- no supported sequence-frame producer exists for saved `selectedTargets`; the
  current sequence-frame runtime records `producedObjects` for draw and
  `selectedCards` for trash-from-hand, but not positive selected-target output

Required split/story/spec action:

- add a new child story that owns a concrete same-frame saved field-object
  consumer, including target-resolution code that reads `frame.savedReferences`
  and tested legality/visibility/failure handling; if `selectedTargets` remains
  in scope, that story must also authorize a supported earlier target-selecting
  segment that can populate it
- rewrite ENG-055I to that boundary before implementation
- add spec authority if the intended consumer is not `playSelected`, because
  the current specs authorize saved references abstractly but do not provide
  concrete capability-backed authority for a non-`playSelected` field-object
  consumer
