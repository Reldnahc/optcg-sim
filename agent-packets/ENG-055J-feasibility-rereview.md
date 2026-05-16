# ENG-055J Agent Feasibility Re-Review

Review assignment id: `agent-story-review-ENG-055J-feasibility-2026-05-16`

Reviewed story: `stories/approved/ENG-055J-duration-modifier-restriction-runtime.yaml`

## Verdict

`needs-revision`

## Findings

- High: positive `choose` target scope is not approval-ready. There is no
  durable representation for "this specific chosen field card has a temporary
  modifier/restriction until cleanup"; current target-choice runtime is KO-only.
- Medium: `05-effect-dsl-reference.s029` still lists some ENG-055J shapes as
  planned/not fixture-authorable while ENG-055J relies on completed TYP-007E
  authorability. Higher-layer spec wording should be reconciled before the story
  is treated as approval-ready.

## Hook Trace

- `ContinuousEffectRecord`, `Modifier`, `TargetSpec`, and `Duration` exist.
- `GameState.continuousEffects` exists.
- `computeView` owns computed power, `canAttack`, `canBlock`, and legal attack
  target projection.
- Battle legality routes through computed view and currently fails closed around
  restrictions/continuous effects.
- Duration cleanup seams exist for battle cleanup and turn/phase transitions.
- Concrete hooks exist for `self` and likely `all`; `choose` is the gap.

## Required Story Change

Revise ENG-055J to drop/narrow positive `choose` target scope, or add a
prerequisite contract/runtime story for durable chosen-target carrier semantics.
Also reconcile stale schema coverage wording in the cited spec.

## Second-Pass Re-Review

Review assignment id:
`agent-story-review-ENG-055J-feasibility-rereview2-2026-05-16`

Verdict: `approval-ready`

The revised story now authorizes positive `cannotAttack`/`cannotBlock` runtime
only for `self` and `all` targets, and explicitly fail-closes `choose` until a
later story adds durable selected-target carrier and cleanup semantics. The
stale `05-effect-dsl-reference.s029` wording was reconciled so the schema
coverage list matches completed TYP-007D/TYP-007E fixture authorability while
still stating that schema authorability does not imply runtime/generator
support.

Implementation cautions:

- keep `choose` out of scope; do not route modifier/restriction application
  through the existing select-target continuation path
- add expiry handling only at the cited battle, end-turn, and refresh cleanup
  boundaries
- preserve fail-closed behavior for unsupported/private `all` target resolution
  shapes unless tested support is explicitly implemented

## Third-Pass Re-Review With `choose` In Scope

Review assignment id:
`agent-story-review-ENG-055J-feasibility-rereview3-choose-2026-05-16`

Verdict: `approval-ready`

The story was revised again because `choose` targets are intended scope for
ENG-055J. The reviewer found no remaining authority blocker after the story
explicitly required:

- a `selectTargets` pending-decision pause/resume flow for `choose`
  modifier/restriction targets
- a durable continuous-effect target carrier for the exact chosen field object
  until expiry
- target-selection and runtime type touch points needed to implement that carrier

Implementation cautions:

- do not persist the continuous-effect target as dynamic
  `Target.type = "choose"` or as a frame-local saved reference
- add or use a canonical exact-card continuous-effect target shape for the chosen
  field object
- reuse the existing `selectTargets` validation path and `state.seq` semantics
- preserve hidden-info behavior and keep target resolution fail-closed outside
  the authorized public field-object target space
