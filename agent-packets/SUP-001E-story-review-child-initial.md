# SUP-001E Child Story Review - Initial

Assignment ID: `story-review/SUP-001E/child/2026-05-20-a`

Story path: `stories/generated/SUP-001E-don-field-count-condition-card-components.yaml`

Verdict: `needs-revision`

Findings:

- High: `engine_capability_preflight` lacked parsed condition shape, required runtime capabilities, and supported/missing groups.
- Medium: `card_source_integrity` did not explicitly state that no real-card gameplay support is enabled or changed.
- Medium: Reusability guardrails were incomplete: acceptance covered self phrases but not opponent phrasing, and tests did not require multi-threshold proof or prohibit full-effect/sample-specific branches.

Disposition:

- Fixed in generated story revision. SUP-001E now names the condition shape, expands preflight, states synthetic-only/no real-card support, requires self/opponent and multi-threshold proof, and bans full-effect/sample-specific branches.
