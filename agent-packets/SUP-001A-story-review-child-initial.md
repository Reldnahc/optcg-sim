# SUP-001A Child Story Review - Initial

Assignment ID: `story-review/SUP-001A/child/2026-05-20-a`

Story path: `stories/generated/SUP-001A-don-field-count-condition-contract-authorability.yaml`

Verdict: `needs-revision`

Findings:

- High: Story was framed as adding missing contract/schema authorability, but existing DSL authority already exposes `fieldCount` and schema-supported filter axes. The story did not identify a real missing delta and risked redundant churn or a DON-specific primitive.
- Medium: Contract shape was underspecified for existing `fieldCount` plus `CardFilter`, and allowed touch points included runtime/type files despite the boundary excluding runtime capability work.

Disposition:

- Fixed in generated story revision. SUP-001A is now a narrow existing-authority fixture/contract story that pins `fieldCount` plus `CardFilter`, forbids a new DON-specific primitive, and trims runtime touch points.
