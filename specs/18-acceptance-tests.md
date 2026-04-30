---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "18-acceptance-tests"
doc_title: "Acceptance Tests"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Acceptance Tests

<!-- SECTION_REF: 18-acceptance-tests.s001 -->

Section Ref: `18-acceptance-tests.s001`

## Purpose

<!-- SECTION_REF: 18-acceptance-tests.s002 -->

Section Ref: `18-acceptance-tests.s002`

Implementation readiness should be measured by named tests, not only by prose. These tests define the minimum acceptable behavior for each milestone.

## Milestone 1 - terminal engine

<!-- SECTION_REF: 18-acceptance-tests.s003 -->

Section Ref: `18-acceptance-tests.s003`

```text
M1-001 setup creates legal starting state
M1-002 opening hand draw uses deterministic deck order
M1-003 official mulligan flow supports keep or redraw-five once per player in first-player-then-second-player order
M1-004 first player skips first draw
M1-005 first player gains only one DON!! on first turn
M1-006 second player cannot attack on their first turn
M1-007 active DON!! can be attached during Main Phase
M1-008 attached DON!! returns rested during Refresh Phase
M1-009 vanilla leader damage moves life to hand
M1-010 leader taking damage at 0 life loses at rule processing
M1-011 attacking rested character can K.O. it
M1-012 character played this turn cannot attack without Rush
M1-013 deck-out loses at rule-processing checkpoint
M1-014 concession immediately ends match and cannot be replaced
M1-015 state hash is stable for same seed and action log
M1-016 PlayerView hides opponent hand and deck order
M1-017 life setup orientation makes original deck top card bottom Life card
M1-018 attached DON!! has attached state and no active/rested state while attached
M1-019 start-of-main-phase trigger window resolves before Main Phase action priority
```

## Milestone 2 - first effect runtime

<!-- SECTION_REF: 18-acceptance-tests.s004 -->

Section Ref: `18-acceptance-tests.s004`

```text
M2-001 On Play draw queues and resolves
M2-002 When Attacking effect resolves before defender On Opponent Attack window
M2-003 blocker redirects attack and emits blockerActivated
M2-004 counter character grants battle power until end of battle
M2-005 counter event is trashed and effect resolves
M2-006 On K.O. activates on field and resolves from trash or last known info
M2-007 life Trigger resolves from no zone then moves to trash unless replaced
M2-008 simultaneous triggers controlled by same player require order decision
M2-009 turn player effect A, opponent effect B, new turn-player effect C resolves A-B-C
M2-010 damage-processing triggers wait until all damage points complete
M2-011 continuous +1000 modifier does not mutate base state
M2-012 replacement effect applies once per process
M2-013 optional effect creates chooseOptionalActivation decision
M2-014 target selection respects visibility and legal candidates
M2-015 unsupported non-vanilla card is rejected outside dev sandbox
M2-016 once-per-turn failed cost does not consume use
M2-017 once-per-turn committed effect that later fizzles still consumes use
M2-018 defender on-opponent-attack effects resolve before ordinary counter actions
M2-019 post-counter missing attacker or target skips Damage Step
M2-020 replacement choice uses chooseReplacement decision and logs replacementApplied
M2-021 replacement cannot apply twice to same process
M2-022 transient revealed card returned face-down is removed from opponent view
```

## Milestone 3 - browser prototype

<!-- SECTION_REF: 18-acceptance-tests.s005 -->

Section Ref: `18-acceptance-tests.s005`

```text
M3-001 browser renders PlayerView without raw GameState
M3-002 target prompts are driven by PendingDecision
M3-003 client discards stale stateSeq updates
M3-004 opponent hand displays count only
M3-005 search/look choices are private to choosing player
```

## Milestone 4 - match server

<!-- SECTION_REF: 18-acceptance-tests.s006 -->

Section Ref: `18-acceptance-tests.s006`

```text
M4-001 duplicate clientActionId is idempotent
M4-002 stale expectedStateSeq is rejected
M4-003 reconnect sends current filtered PlayerView
M4-004 pending decision is restored after reconnect
M4-005 disconnected player forfeits after configured timeout
M4-006 matchError freezes only one match
M4-007 spectators receive views according to configured delayed spectator policy without early leakage
M4-008 only the player currently holding up the game loses timer time
M4-009 duplicate clientActionId with different actionHash is rejected as idempotencyConflict
M4-010 all non-heartbeat server messages include monotonic serverSeq
M4-011 respondToDecision routes to resumeDecision rather than applyAction
M4-012 ranked matches are not spectatable in the initial implementation
M4-013 queue-created unranked match stamps gameType and formatId correctly
M4-014 custom lobby join rejects incorrect password
```

## Milestone 5 - Poneglyph and deck builder

<!-- SECTION_REF: 18-acceptance-tests.s007 -->

Section Ref: `18-acceptance-tests.s007`

```text
M5-001 @optcg/cards fetches Poneglyph metadata and validates with Zod
M5-002 Redis hit returns validated cached Poneglyph card data
M5-003 Poneglyph schema mismatch fails clearly
M5-004 deck validation rejects unknown Poneglyph card ID
M5-005 deck validation rejects unsupported effect card in ranked
M5-006 variant split of same base card is allowed up to base-card limit
M5-007 match creation snapshots card manifest and versions
M5-008 client-fetched Poneglyph display data has no gameplay authority
```

## Milestone 6 - replay, rollback, recovery

<!-- SECTION_REF: 18-acceptance-tests.s008 -->

Section Ref: `18-acceptance-tests.s008`

```text
M6-001 replay header stores engine/rules/card/effect/banlist/protocol/RNG versions
M6-002 replay of action log matches checkpoint hashes
M6-003 rollback before hidden-info exposure is safe in unranked/custom mode
M6-004 rollback after hidden-info exposure is blocked or judge-only in ranked
M6-005 process restart recovers match from Redis snapshot and action log
M6-006 crash-causing action uses freeze-for-review or rollback-to-pre-action
M6-007 match_lost is sent if recovery data is unavailable
M6-008 replay artifact without initialSnapshot or rngSeed plus initialDeckOrders is invalid
M6-009 deterministic replay entries exclude transport timestamps and signatures
M6-010 replay stores manifestHash and manifest snapshot/reference
```

## Global invariants

<!-- SECTION_REF: 18-acceptance-tests.s009 -->

Section Ref: `18-acceptance-tests.s009`

Run these after every accepted action and every decision resume:

```text
G-001 every card instance is in exactly one zone or attached to exactly one legal host
G-002 no duplicate instance IDs exist
G-003 each player has at most five Characters
G-004 each player has at most one Stage
G-005 each player has exactly one Leader
G-006 attached DON!! belongs to same player as host unless a future ruling says otherwise
G-007 public zones contain public card IDs in PlayerView
G-008 hidden zones are represented by counts only in opponent PlayerView
G-009 RNG state never appears in any client view
G-010 effect queue internals never appear in any client view
G-011 canonical state serializes and hashes deterministically
G-012 continuous effects are recomputed without growing duplicate modifiers
```

## Milestone 7 - public unranked alpha and custom lobbies

<!-- SECTION_REF: 18-acceptance-tests.s010 -->

Section Ref: `18-acceptance-tests.s010`

```text
M7-001 unranked queue pairs compatible players by selected format
M7-002 custom lobby with optional password can be created and joined by invitee
M7-003 custom lobby host can select only allowed spectator policies
M7-004 custom and unranked matches never update Elo or ladder history
```

## v3 Poneglyph adapter acceptance tests

<!-- SECTION_REF: 18-acceptance-tests.s011 -->

Section Ref: `18-acceptance-tests.s011`

```text
PON-001 OpenAPI fixture parses as JSON and exposes /v1/cards/{card_number}, /v1/cards/batch, /v1/search, /v1/cards/{card_number}/text, /v1/formats.
PON-002 Poneglyph detail Zod schema accepts OP01-060 and OP05-091 fixtures.
PON-003 Batch resolver chunks unique card IDs into requests of <=60 IDs.
PON-004 Batch resolver fails match creation if any requested ID is returned in missing.
PON-005 Search result DTO is rejected as a match-manifest source.
PON-006 OP01-060 variant indexes normalize to OP01-060:v0, OP01-060:v1, OP01-060:v2.
PON-007 OP05-091 variant with null product set_code and null market price normalizes without throwing.
PON-008 sourceTextHash changes when effect or trigger text changes.
PON-009 behaviorHash changes when official_faq, errata, stats, type line, effect, or trigger changes.
PON-010 Unreleased cards are rejected in public modes unless explicitly enabled by format policy.
PON-011 variant_index defaults to 0 and generated variant_key is non-null.
PON-012 search result DTO cannot be used to build MatchCardManifest.
PON-013 attributes and colors normalize as arrays.
```

## Milestone 8 - ranked ladder beta

<!-- SECTION_REF: 18-acceptance-tests.s012 -->

Section Ref: `18-acceptance-tests.s012`

```text
M8-001 ranked queue only admits queue-eligible and rating-eligible formats
M8-002 ranked win/loss updates Elo for the correct ladderId using the configured K-factor
M8-003 ranked draw applies 0.5 score to both players
M8-004 ranked disconnect after grace expiry counts as loss and opponent win
M8-005 repeated ranked disconnect forfeits create queue lockout
M8-006 ranked queue rejects player during active disconnect lockout
```

## v3 OP01-060 Donquixote Doflamingo tests

<!-- SECTION_REF: 18-acceptance-tests.s013 -->

Section Ref: `18-acceptance-tests.s013`

```text
DOFFY-001 [DON!! x2] checks attached DON!! on source leader.
DOFFY-002 ① cost requires resting one active DON!! in the cost area.
DOFFY-003 Declining or being unable to pay cost produces no reveal.
DOFFY-004 Top card is publicly revealed during resolution.
DOFFY-005 Eligible Seven Warlords Character cost <=4 may be played rested without paying cost.
DOFFY-006 Ineligible revealed card returns to the top of the deck face-down.
DOFFY-007 Eligible revealed card declined by player returns to the top of the deck face-down.
DOFFY-008 Opponent PlayerView does not retain the card ID after it returns face-down.
DOFFY-009 Played revealed card does not also return to deck.
DOFFY-010 Replay hash is stable across the reveal/play/return branches.
```

## v3 OP05-091 Rebecca tests

<!-- SECTION_REF: 18-acceptance-tests.s014 -->

Section Ref: `18-acceptance-tests.s014`

```text
REBECCA-001 [Blocker] appears in computed view while Rebecca is on field.
REBECCA-002 On Play can choose zero trash cards even when eligible targets exist.
REBECCA-003 On Play excludes cards named Rebecca from the trash selection.
REBECCA-004 On Play accepts black Character cost 3 through 7 from trash.
REBECCA-005 On Play moves selected trash card to hand before evaluating the hand-play step.
REBECCA-006 The hand-play step can play the same card added by the trash step if it is black Character cost <=3.
REBECCA-007 Played card enters rested and ignores normal cost payment.
REBECCA-008 Full character area creates a forced-trash decision before effect-play completes.
REBECCA-009 Hand selection candidates are private to Rebecca's controller.
REBECCA-010 Replay hash is stable for all choose-zero, add-only, and add-then-play branches.
```

## v6 replay and loadout tests

<!-- SECTION_REF: 18-acceptance-tests.s015 -->

Section Ref: `18-acceptance-tests.s015`

```text
RPL-001 post-game replay reveals hidden information required for exact reconstruction
RPL-002 spectator stream shows full information only after configured turn delay
RPL-003 loadout persistence stores decklist plus icon/playmat/sleeves/don-deck/variant selections
RPL-004 unavailable variant image asset is rejected from loadout validation without affecting gameplay deck legality
```

## v6 contract tests

<!-- SECTION_REF: 18-acceptance-tests.s016 -->

Section Ref: `18-acceptance-tests.s016`

```text
CONTRACT-001 canonical TypeScript contract compiles with tsc -p contracts/tsconfig.json
CONTRACT-002 all committed effect fixtures validate against contracts/effect-dsl.schema.json
CONTRACT-003 all canonical DSL fixtures use cost/typesAny/colorsAny/nameNot fields instead of deprecated aliases
CONTRACT-004 database-schema-v6.sql contains no nullable variant uniqueness constraint
CONTRACT-007 approved story files validate against contracts/story.schema.json
CONTRACT-008 story and packet examples use section-ref citations instead of heading-anchor examples
CONTRACT-005 database-schema-v6.sql requires replay reconstruction source
CONTRACT-006 README, SPEC_VERSION, and contracts agree on specVersion v6
```
