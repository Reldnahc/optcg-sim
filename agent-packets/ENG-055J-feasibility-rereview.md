# ENG-055J Implementation Feasibility Re-Review

Review assignment id: `implementation-feasibility-rereview-ENG-055J-2026-05-16`

Reviewed story: `stories/approved/ENG-055J-duration-modifier-restriction-runtime.yaml`

## Verdict

Proceed.

## Hook Trace

- `ContinuousEffectRecord`, `Modifier`, `ModifierOperation`, `TargetSpec`, and
  `Duration` exist in canonical/package types.
- `GameState.continuousEffects` already exists and participates in canonical
  state.
- `compute-view.ts` already applies a narrow continuous power modifier subset,
  making it the correct seam for broader temporary power modifier support.
- `ComputedCardView` already exposes `currentPower`, `canAttack`, and
  `canBlock`.
- `ComputedGameView.restrictions` exists.
- Battle legality paths already call computed-view and currently fail closed
  when restrictions are present, so ENG-055J has concrete enforcement seams for
  cannotAttack/cannotBlock.
- `battle-support.ts`, phase/turn cleanup paths, and battle cleanup already
  provide duration-expiry hooks to extend.

## Feasibility Notes

This is a broad runtime story, but it has concrete type and engine seams. The
main implementation risk is blast radius across battle legality and duration
cleanup. Keep the story to `modifyPower`, `cannotAttack`, `cannotBlock`, and the
listed duration families; preserve fail-closed behavior for every excluded
target, duration, and restriction family.

## Required Follow-Up

No spec/story rewrite needed before implementation.
