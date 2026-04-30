---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "17-first-card-fixtures"
doc_title: "First Card Fixtures"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# First Card Fixtures

<!-- SECTION_REF: 17-first-card-fixtures.s001 -->

Section Ref: `17-first-card-fixtures.s001`

## Purpose

<!-- SECTION_REF: 17-first-card-fixtures.s002 -->

Section Ref: `17-first-card-fixtures.s002`

The first fixture pool should cover engine mechanics, effect timing, hidden information, and DSL primitives without requiring the full card pool. Use Poneglyph-shaped IDs and metadata so migration to real Poneglyph records is easy.

## Fixture policy

<!-- SECTION_REF: 17-first-card-fixtures.s003 -->

Section Ref: `17-first-card-fixtures.s003`

- Use real-looking Poneglyph base IDs if testing with actual card data, or clearly prefixed fixture IDs if avoiding real cards.
- Each non-vanilla fixture has an implementation record.
- Each fixture has at least one test.
- The pool should be small enough that every interaction is understood.

## Recommended 20-card coverage set

<!-- SECTION_REF: 17-first-card-fixtures.s004 -->

Section Ref: `17-first-card-fixtures.s004`

| Slot | Fixture purpose                  | Mechanics covered                                          |
| ---: | -------------------------------- | ---------------------------------------------------------- |
|    1 | Vanilla Leader                   | Setup, life, attacks, leader damage.                       |
|    2 | Vanilla Character 2-cost         | Basic play, cost payment, summoning sickness.              |
|    3 | Vanilla Character high power     | Character battle and K.O.                                  |
|    4 | Vanilla Stage                    | Stage play and stage replacement.                          |
|    5 | Character with counter value     | Counter step, hand trash, temporary battle power.          |
|    6 | `[Blocker]` Character            | Block window, blocker rests, target redirection.           |
|    7 | `[Rush]` Character               | Can attack turn played.                                    |
|    8 | `[Rush: Character]` Character    | Can attack rested Characters but not Leader on play turn.  |
|    9 | `[Double Attack]` Character      | Multiple damage points and damage deferral.                |
|   10 | `[Banish]` Character             | Replacement of life-to-hand/trigger path.                  |
|   11 | `[On Play] Draw 1`               | Auto trigger, draw event, rule processing.                 |
|   12 | `[When Attacking]` Draw/discard  | Attack trigger, sequence effect, private discard decision. |
|   13 | `[On K.O.]` Draw 1               | Source leaves field, resolves from trash/last known info.  |
|   14 | `[Trigger]` Life effect          | Reveal from life, no-zone resolution, trash after trigger. |
|   15 | `[Counter]` Event + power        | Counter event cost/trash/effect.                           |
|   16 | `[Main]` Event K.O. low-cost     | Main event play, target selection, K.O. effect.            |
|   17 | Permanent +1000 during your turn | Computed continuous effect, no state mutation.             |
|   18 | Search/look top cards            | Hidden-information private choice and reveal policy.       |
|   19 | Protection/replacement effect    | Replacement priority and one-use-per-process rule.         |
|   20 | Custom-handler card              | Escape hatch, handler registry, handler tests.             |

## Minimal implementation records

<!-- SECTION_REF: 17-first-card-fixtures.s005 -->

Section Ref: `17-first-card-fixtures.s005`

```json
{
  "FX-001": {
    "status": "vanilla-confirmed",
    "tested": true,
    "rulesVersion": "1.2.0",
    "cardDataVersion": "fixture-v1",
    "sourceTextHash": "fixture"
  },
  "FX-011": {
    "status": "implemented-dsl",
    "effectDefinitionId": "FX-011@v1",
    "tested": true,
    "rulesVersion": "1.2.0",
    "cardDataVersion": "fixture-v1",
    "sourceTextHash": "fixture"
  }
}
```

## Fixture acceptance interactions

<!-- SECTION_REF: 17-first-card-fixtures.s006 -->

Section Ref: `17-first-card-fixtures.s006`

These interactions should exist as golden scripts:

- Vanilla Leader vs vanilla Leader match reaches a legal winner.
- Sixth Character rule-process trash does not fire `[On K.O.]`.
- Blocker redirects an attack and then the blocker can be K.O.'d.
- Double Attack processes two life cards before deferred triggers resolve.
- Banish trashes life and prevents normal trigger/hand path.
- `[On K.O.]` source leaves field and still resolves correctly.
- Search/look effect does not leak candidates to opponent.
- Permanent +1000 does not stack every recomputation.
- Replacement effect applies once to a process.
- Custom handler replay hash is deterministic.

## Real Poneglyph-backed fixtures added in v3

<!-- SECTION_REF: 17-first-card-fixtures.s007 -->

Section Ref: `17-first-card-fixtures.s007`

Use these two real card payloads immediately because they test the card-data adapter and effect DSL more effectively than pure fake cards.

| Card                             | Fixture path                                                   | Why it is included early                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OP01-060` Donquixote Doflamingo | `fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json` | Tests variant index `0`, source-attached DON!! condition, paid attack trigger, public reveal, optional effect-play rested, and FAQ-driven face-down return. |
| `OP05-091` Rebecca               | `fixtures/poneglyph/cards/OP05-091.rebecca.json`               | Tests nullable variant fields, `[Blocker]`, trash-to-hand, then hand-to-field sequence, `other than [Rebecca]`, and FAQ-confirmed same-card play.           |

These do not replace the 20-card coverage set. They anchor it to actual Poneglyph payloads so the adapter, effect DSL, and tests evolve together.

## Updated first fixture slice

<!-- SECTION_REF: 17-first-card-fixtures.s008 -->

Section Ref: `17-first-card-fixtures.s008`

For the first implementation sprint, use this tighter subset:

```text
1. FX-LEADER-VANILLA      - fake vanilla leader for minimal combat
2. FX-CHAR-VANILLA        - fake vanilla character for play/K.O.
3. FX-BLOCKER             - fake blocker if Rebecca is not yet loaded
4. FX-ONPLAY-DRAW         - simple on-play draw primitive
5. OP01-060               - real Doflamingo fixture, implemented after transient reveal primitives
6. OP05-091               - real Rebecca fixture, implemented after sequence-local selections
```

The fake cards keep the CLI loop simple. The real cards prove that the Poneglyph adapter and DSL are not drifting away from actual card payloads.
