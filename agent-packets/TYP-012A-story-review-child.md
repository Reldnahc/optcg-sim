# TYP-012A Child Story Review

Assignment ID: `TYP-012A-child-fresh-rereview-2026-05-19`

Reviewed story path:
`stories/generated/TYP-012A-field-removal-protection-contract-shape.yaml`

Review type: `child-story`

Status: `approval-ready`

## Findings By Severity

- Critical: none.
- High: none.
- Medium: none.
- Low: none.

## Required Fixes

None.

## Disposition Summary

The revised child story now uses exact spec anchors for the previously flagged
areas:

- computed view and `ComputedCardView.protectedFrom`:
  `03-game-state-events-decisions.s003`, reinforced by computed-view modifier
  application in `04-effect-runtime.s014`
- battle K.O.: `02-engine-mechanics.s021`
- rule-process trash: `02-engine-mechanics.s038`
- costs: `04-effect-runtime.s011`
- protection and replaceable removal process shape: `04-effect-runtime.s013`,
  `05-effect-dsl-reference.s012`, `05-effect-dsl-reference.s016`

The minimum stable contract axes are explicit in the story body and acceptance
criteria: protected process family, field-removal classification, source kind,
source-controller relation, protected object scope, plus explicit exclusion or
fail-closed handling for battle K.O., rule-process trash, costs,
own/controller-owned effects, and ambiguous custom removal.

The test language is contract-only and scoped correctly. The story requires
type/serialization-shape and export tests, while explicitly forbidding
engine-core behavior or process-classification tests for this child story. That
is consistent with `AGENTS.md`, `docs/workflow/story-execution.md`,
`docs/workflow/review-gate.md`, and `docs/code-standard.md`.

Engine behavior remains out of scope in the story boundary and non-scope
sections, with matching repo rules. No runtime, parser, fixture, or broader
engine drift was found in the revised child story.

This review did not identify a better existing contract-owned projection surface
than `ComputedCardView.protectedFrom`, so the story is ready to proceed with
that surface preserved under `03-game-state-events-decisions.s003`.

Validation check: `corepack pnpm run stories:validate` passed on May 19, 2026.

This artifact satisfies only the `TYP-012A` child-story review row. It does not
satisfy the `TYP-012` parent-story review row.
