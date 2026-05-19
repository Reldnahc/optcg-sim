# CARD-020 Parent Story Re-Review

Review assignment id: `story-review-CARD-020-parent-post-020D-2026-05-19`

Reviewed story: `stories/generated/CARD-020-generic-support-probe-diagnostics-parent.yaml`

Related child stories:

- `stories/generated/CARD-020A-generic-card-text-diagnostic-scanner.yaml`
- `stories/generated/CARD-020B-probe-report-diagnostic-integration.yaml`
- `stories/generated/CARD-020C-arbitrary-card-probe-proof-bundle.yaml`
- `stories/generated/CARD-020D-generated-support-proof-certificate-reporting.yaml`

Review type: `parent-story`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-020-story-review-parent.md`

## Disposition

`CARD-020` remains approval-ready after adding `CARD-020D`.

The parent now coordinates four independently reviewable child stories. The new
child closes the proof-chain reporting gap by requiring output to distinguish
parse completeness, generated DSL schema validation, component evidence,
runtime capability coverage, engine-proof/test-evidence status where currently
representable, and the final playable decision. The parent still does not
authorize engine behavior, runtime capability records, fixture/hash/overlay
work, support-manifest changes, generated playable support, per-card bespoke
proof logic, or exact-example templates.

The revised parent preserves the CARD-020A/B/C generic-diagnostic contract and
adds the missing invariant that parsing alone must never be described as card
works, playable, supported, or verified playable support.

## Findings By Severity

- Critical: None.
- High: None.
- Medium: None.
- Low: None.

## Required Intent Preservation Answers

1. Does CARD-020A still require generic arbitrary-card diagnostic scanning, not exact sample recognizers?
   Yes. CARD-020A still requires reusable component kinds, stable component IDs,
   source spans, variation coverage, and explicit review failure for exact
   sample text, sample-shaped templates, sample-specific regexes, or complete
   sample-effect branches.
2. Does wrapper recognition remain independent of conditional recognition?
   Yes. CARD-020A requires wrapper components, slash-combined wrapper splitting,
   activate-main wrapper candidates, and condition boundaries as separate
   diagnostic component families.
3. Does conditional recognition remain independent of body support?
   Yes. CARD-020A and CARD-020C require condition fragments/connectors to report
   independently from action/body fragments, and CARD-020B keeps parser/scanner
   diagnostics separate from generated-support certification.
4. Does body/action recognition remain independent of condition support?
   Yes. Actions, modifiers, destinations, durations, unsupported bodies, and
   residue remain separately reported component families; condition support is
   not required before body/action diagnostics can be useful.
5. Does each segment report independently where possible?
   Yes. CARD-020A requires narrow source spans and residue spans, CARD-020B
   propagates component diagnostics into probe/report output, and CARD-020C
   proves narrower diagnostics than whole-card `unparsed-span` whenever reusable
   components are present.
6. Does CARD-020B integrate scanner output without turning scanner categories into playable support?
   Yes. CARD-020B states recognized diagnostic components are not
   generated-support certification and must not create generated DSL, runtime
   capability evidence, support metadata, source integrity, or playable status.
7. Does CARD-020C prove arbitrary unsupported cards produce useful diagnostics without pre-modeling the exact full card text?
   Yes. CARD-020C keeps representative examples as proof inputs, bans exact and
   sample-shaped implementations, and requires wording/value variations for
   every major sample class.
8. Does CARD-020D make parse success distinct from verified playable support?
   Yes. CARD-020D requires an explicit proof/certificate chain and final
   playable decision derived from all gates, with parse success and schema
   validity reported independently from support.
9. Does the full set prevent the CARD-019 failure mode where the diagnostics tool only works after the exact example has been encoded?
   Yes. The full set requires component-driven scanner paths, same-path
   variation tests, proof cases for arbitrary unsupported text, metadata-driven
   proof/certificate reporting, and review-failure rules for exact or
   sample-shaped shortcuts.

## Matrix Instruction

Record the parent row as `approval-ready`. This artifact satisfies only the
`CARD-020` parent row and does not satisfy the distinct `CARD-020A`,
`CARD-020B`, `CARD-020C`, or `CARD-020D` child story-review rows.
