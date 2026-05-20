# SUP-001B Child Story Review - Initial

Assignment ID: `story-review/SUP-001B/child/2026-05-20-a`

Story path: `stories/generated/SUP-001B-don-field-count-condition-runtime.yaml`

Verdict: `needs-revision`

Findings:

- High: Cost-area-plus-attached DON counting rule was not fully grounded in exact public-zone spec authority. Review requested `02-engine-mechanics.s005` and/or `06-visibility-security.s004` while retaining `02-engine-mechanics.s036` for attached DON semantics.
- Medium: Event coverage was implicit and did not explicitly require emitted/suppressed event assertions for true/false conditional branches.
- Medium: `allowed_touch_points` included `packages/types/src/**`, weakening the contract/runtime split from SUP-001A.

Disposition:

- Fixed in generated story revision. SUP-001B now cites exact public-zone refs, removes packages/types touch points, and requires event-order tests for condition-passing body resolution and condition-failing no-resolution branches.
