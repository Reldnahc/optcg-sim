# SUP-001D Child Story Review - Initial

Assignment ID: `story-review/SUP-001D/child/2026-05-20-a`

Story path: `stories/generated/SUP-001D-don-minus-draw-generated-support.yaml`

Verdict: `needs-revision`

Findings:

- High: `engine_capability_preflight` cited wrong draw runtime authority by naming `ENG-056B`, which is scoped to On K.O. queued bodies rather than On Play draw.
- Medium: Preflight was structurally incomplete and did not split parsed shape, supported capabilities, and missing capabilities.
- Medium: Acceptance did not explicitly bind stale source hash, stale behavior hash, and missing runtime-capability evidence to non-playable outcomes.
- Low: Synthetic-only `card_source_integrity` wording was too terse.

Disposition:

- Fixed in generated story revision. SUP-001D now depends on `ENG-012F` / `CARD-009A` for draw support, expands preflight, explicitly covers stale hash and missing capability gates, and clarifies synthetic-only source authority.
