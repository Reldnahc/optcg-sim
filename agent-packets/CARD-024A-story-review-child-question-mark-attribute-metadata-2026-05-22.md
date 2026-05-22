# CARD-024A Story Review - Child

Review assignment id: `story-review-CARD-024A-child-question-mark-attribute-metadata-2026-05-22`

Reviewed story: `stories/approved/CARD-024A-question-mark-attribute-metadata.yaml`

Parent alignment checked: `stories/approved/CARD-024-question-mark-attribute-metadata-parent.yaml`

Review type: `child-story`

Parent story: `CARD-024`

Status: `approval-ready`

Artifact identity: `agent-packets/CARD-024A-story-review-child-question-mark-attribute-metadata-2026-05-22.md`

## Disposition

`CARD-024A` is approval-ready.

The prior test-gap finding is fixed. The story now requires the direct probe
command `corepack pnpm --filter @optcg/cards support:probe -- --card OP13-079`
in addition to the focused normalization and support-probe test files, so the
required evidence matches the stated acceptance criterion for OP13-079.

The tightened spec references also align better with the intended contract:
`19-poneglyph-api-contract.s006` covers the raw Poneglyph detail shape, and
`09-card-data-and-support-policy.s014` directly states that Poneglyph
`attribute` values normalize into `attributes: Attribute[]` without collapsing
to a singular field. Retaining `09-card-data-and-support-policy.s003`,
`19-poneglyph-api-contract.s007`, `19-poneglyph-api-contract.s009`, and
`18-acceptance-tests.s011` keeps the story grounded in Poneglyph ownership,
normalized card authority, hash-boundary non-scope, and array normalization
acceptance coverage.

Scope, non-scope, and allowed touch points remain narrowly bounded to metadata
contracts, schema validation, normalization, and regression coverage. The story
still explicitly preserves fail-closed handling for arbitrary unrecognized
attributes other than literal `?`, and it does not authorize gameplay behavior,
generated-support promotion, overlays, source/behavior hash churn, deck
validation changes, or support-status drift.

## Findings

- Critical: none
- High: none
- Medium: none
- Low: none

## Matrix Instruction

Record the `CARD-024A` child row as `approval-ready`. This artifact satisfies
only the `CARD-024A` child row.
