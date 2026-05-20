# SUP-001F Child Story Review - Initial

Assignment ID: `story-review/SUP-001F/child/2026-05-20-a`

Story path: `stories/generated/SUP-001F-conditional-opponent-power-modifier-card-components.yaml`

Verdict: `needs-revision`

Findings:

- High: Story hid required runtime/composition authority for conditioned When Attacking support by omitting `ENG-058B` and `CARD-019B`.
- Medium: `engine_capability_preflight` was too thin and did not split parsed shape and supported/missing capability groups.
- Low: `spec_refs` were not exact for Attack Step and schema-coverage authority.

Disposition:

- Fixed in generated story revision. SUP-001F now depends on `CARD-019B` and `ENG-058B`, cites Attack Step and schema coverage refs, and expands preflight across conditional wrapper, target, modifyPower, and zero-choice capabilities.
