# SUP-001G Child Story Review - Initial

Assignment ID: `story-review/SUP-001G/child/2026-05-20-a`

Story path: `stories/generated/SUP-001G-don-minus-conditional-power-generated-support-promotion.yaml`

Verdict: `needs-revision`

Findings:

- High: `engine_capability_preflight` was not substantive enough for a CARD implementation gate and did not split parsed shape, prerequisite components, supported capabilities, and missing groups.
- Medium: Story used promotion/final-playability language while source integrity was synthetic-only, risking confusion between generic proof-gate coverage and real-card support authority.

Disposition:

- Fixed in generated story revision. SUP-001G is now synthetic generated-support certification, not real-card implemented-dsl promotion, and explicitly states real-card promotion requires a separate reviewed CARD story with fixture/source-integrity evidence.
