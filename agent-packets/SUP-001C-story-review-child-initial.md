# SUP-001C Child Story Review - Initial

Assignment ID: `story-review/SUP-001C/child/2026-05-20-a`

Story path: `stories/generated/SUP-001C-don-minus-cost-wrapper-card-components.yaml`

Verdict: `needs-revision`

Findings:

- High: `engine_capability_preflight` was not substantive enough for a CARD implementation story. It did not record the parsed effect shape, enumerate runtime capabilities, or split supported and missing groups.
- Low: Acceptance/tests did not explicitly require direct capability-linkage assertion or matrix-style proof for cost wrapper output.

Disposition:

- Fixed in generated story revision. SUP-001C now names the parsed DON-minus cost-wrapper shape, lists supported return-DON capability IDs, declares missing runtime capability scope, and requires capability-linkage evidence.
