# TYP-009A Story Review

Reviewed story:
`stories/approved/TYP-009A-optional-cost-clause-runtime-contracts.yaml`

## First Review

Review assignment id: `agent-story-review-TYP-009A-optional-cost-2026-05-16`

Verdict: `needs-revision`

Findings:

- High: the durable ENG-055D blocker artifact was missing from this main-based
  branch, so the downstream authority gap was not reconstructable.
- Medium: the story did not explicitly dispose of the mismatch where
  `contracts/effect-dsl.schema.json` accepts optional `returnDon` cost while
  `05-effect-dsl-reference.s029` did not list `returnDon` in the
  schema-supported cost subset.
- Medium: the cited authority list was too thin for deciding between
  `PayCostDecision`, `chooseOptionalActivation`, or a new response shape and for
  stale/malformed/wrong-player fail-closed behavior.

Disposition:

- Added `stories/ambiguities/ENG-055D-optional-cost-runtime-authority-gap.md`.
- Added explicit TYP-009A scope to reconcile the `returnDon` schema/spec
  mismatch.
- Expanded `spec_refs` to include `03-game-state-events-decisions.s011`,
  `03-game-state-events-decisions.s012`, and
  `03-game-state-events-decisions.s023`.

## Second Review

Review assignment id:
`agent-story-review-TYP-009A-optional-cost-rereview2-2026-05-16`

Verdict: `approval-ready`

Findings:

- None. The reviewer confirmed the ENG-055D ambiguity artifact is durable, the
  `returnDon` schema/spec mismatch has explicit disposition, and the
  decision/response/sequencing/error authority is now concretely anchored.

Implementation/story workflow cautions:

- Keep implementation inside the declared contract/spec/schema/types/test
  boundary; do not implement ENG-055D runtime behavior in TYP-009A.
- Generate and verify the active packet before any worker handoff.
- Use exact `SECTION_REF` citations for replay, visibility, state-hash, and
  decision/error authority additions.
