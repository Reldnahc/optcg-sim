# ENG-039D target-effect real-card fixture blocker

Story: ENG-039D
Date: 2026-05-10

## Blocker

ENG-039D requires a real target-effect card fixture only when checked-in
validated Poneglyph detail and reviewed text honestly support exact target KO
behavior.

The checked-in real Poneglyph detail fixtures at this point are:

- `OP01-060` Donquixote Doflamingo: leader reveal/play-rested effect, not exact
  target KO.
- `OP05-091` Rebecca: blocker plus trash-to-hand and hand-to-field sequence, not
  exact target KO.
- `EB01-023` Edward Weevil: `[On Play] Draw 1 card.`, not target KO.

No checked-in real fixture currently supports the ENG-039 target KO primitive
without inventing card text or broadening behavior beyond the reviewed payloads.

## Decision

Do not add or mark a real target-effect card as `implemented-dsl` in ENG-039D.
Keep target KO runtime coverage synthetic, and keep existing unsupported real
non-vanilla cards unsupported so public-mode deck/loadout validation fails
closed.

## Authority

- `05-effect-dsl-reference.s022`: generated or inferred definitions require
  human review before merge.
- `09-card-data-and-support-policy.s010`: a card with printed effect text but no
  implementation must be marked `unsupported`.
- `09-card-data-and-support-policy.s011`: missing or unsupported non-vanilla
  cards fail closed outside dev sandbox policy.
- `17-first-card-fixtures.s003`: each non-vanilla fixture must have an
  implementation record and understood tests.
