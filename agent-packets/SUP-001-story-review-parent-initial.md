# SUP-001 Parent Story Review - Initial

Assignment ID: `story-review/SUP-001/parent/2026-05-20-a`

Story path: `stories/generated/SUP-001-don-minus-conditional-power-support-parent.yaml`

Verdict: `needs-revision`

Findings:

- High: Parent made the final promotion child impossible to approve by requiring source-integrity and behavior-hash gates while excluding real card identity, fixtures, source/behavior hash updates, overlays, manifests, and manifest regeneration. Required fix was to narrow SUP-001G to synthetic/template certification or authorize a child owning real-card provenance and source/behavior hash evidence.
- Medium: Parent is a CARD implementation story and was missing parent-level `card_source_integrity` and `engine_capability_preflight` sections.
- Medium: Parent dependency graph misbound DON-minus draw to `ENG-056B`, an On K.O. queued-body runtime story, rather than actual On Play draw support.

Disposition:

- Fixed in generated story revisions before approval handoff. Parent now has parent-level preflight sections, draw prerequisites were corrected to `ENG-012F` / `CARD-009A`, and SUP-001G is narrowed to synthetic generated-support certification with real-card promotion out of scope.
