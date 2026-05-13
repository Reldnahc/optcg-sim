# CARD-009B Trash From Hand Effect DSL Schema Blocker

CARD-009B must certify generated parser, capability, support-index, and report
behavior for `Draw N cards and trash M card(s) from your hand` templates using
ENG-050 runtime capability evidence.

The ENG-050 runtime path accepts only the narrow ordered sequence whose second
segment is `{ type: "trashFromHand", player: "self", chooser: "self", count: M }`.
Using a generated `custom` effect for the trash step would not match the runtime
shape and would incorrectly mark unsupported generated DSL as supported.

Changing the parser to emit the runtime-facing `trashFromHand` effect exposes a
contract gap: `contracts/types/effects.ts` and the runtime include
`trashFromHand`, but `contracts/effect-dsl.schema.json` does not currently
permit that effect shape. Generated support index validation therefore blocks
the CARD-009B accepted templates with `invalid-dsl-schema`.

CARD-009B's approved `allowed_touch_points` do not include contract schema files,
and its story boundary says to own only cards-package generated-support parser,
capability, support-index, and report behavior. The workflow requires stopping
and splitting or raising an ambiguity instead of broadening the patch when the
needed work crosses concerns.

Resolution required before CARD-009B can proceed:

- add or approve a narrow prerequisite story that updates
  `contracts/effect-dsl.schema.json` for the existing `trashFromHand` effect
  type, with contract validation coverage; or
- formally revise CARD-009B authority to include that exact contract touch point,
  then regenerate and verify the active packet before implementation continues.

Until then, CARD-009B must not be moved to human review and must not certify the
draw-then-trash templates through a `custom` trash fallback.
