# CARD-025G Real-Card Regression Evidence Scope Review

Assignment identity: Hypatia (`019e55d2-b6d9-7a81-b912-76bbd17626c5`)

Reviewed scope amendment:

- `stories/approved/CARD-025-card-layer-spec010-migration-parent.yaml`
- `stories/generated/CARD-025-card-layer-spec010-migration-parent.yaml`
- `stories/approved/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`
- `stories/generated/CARD-025G-generated-support-evaluator-proof-compatibility.yaml`

Result: approved.

Reviewer findings:

- The parent exception is narrow and allows existing real-card fixture regression callers only to pass through current generic generated-support parser-certification evidence required by the migrated index contract.
- The amendment explicitly keeps fixture selection, fixture payloads, manifests, hashes, overlays, generated manifest output, real-card promotion, and acceptance evidence out of scope.
- CARD-025G's added touch point for `real-card-fixtures.ts` is limited to the regression manifest builder pass-through and does not authorize card-shaped support authority.
- Approved and generated story copies are aligned.

Implementation may proceed within this pass-through-only boundary.

## Follow-up Narrowing Review

Assignment identity: Noether (`019e55d6-2a94-7381-9e22-bdbfd047272b`)

Reviewed follow-up amendment:

- existing real-card fixture regression callers may derive a closed generated-support candidate set from already checked-in generated-support fixture records
- callers may pass current generic parser-certification evidence into `buildGeneratedSupportIndex`
- fixture files, fixture payloads, manifests, hashes, overlays, generated manifest output, real-card promotion, and acceptance evidence remain out of scope

Result: approved after packet refresh.

Reviewer finding:

- The story amendment is coherent and tight for CARD-025G, but the active packet was stale relative to the amended story. Implementation must proceed only after regenerating and verifying `agent-packets/CARD-025G.md` and `agent-packets/active.json`.
