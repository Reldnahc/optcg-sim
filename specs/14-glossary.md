---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "14-glossary"
doc_title: "Glossary"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Glossary

<!-- SECTION_REF: 14-glossary.s001 -->

Section Ref: `14-glossary.s001`

## Action

<!-- SECTION_REF: 14-glossary.s002 -->

Section Ref: `14-glossary.s002`

A player intent submitted to the engine, such as playing a card, declaring an attack, activating an effect, or responding to a pending decision.

## Atomic mutation

<!-- SECTION_REF: 14-glossary.s003 -->

Section Ref: `14-glossary.s003`

A single low-level state transition that emits one or more `EngineEvent`s and is followed by rule processing.

## Canonical state

<!-- SECTION_REF: 14-glossary.s004 -->

Section Ref: `14-glossary.s004`

The full server-only `GameState`, including hidden information and internal engine state.

## ComputedGameView

<!-- SECTION_REF: 14-glossary.s005 -->

Section Ref: `14-glossary.s005`

A derived view created by applying continuous effects, modifiers, and restrictions to base state. Used by the engine to answer questions such as current power or whether a card can attack.

## Continuous effect

<!-- SECTION_REF: 14-glossary.s006 -->

Section Ref: `14-glossary.s006`

An effect that modifies game values or permissions over a duration, such as power changes, keywords, restrictions, or protection.

## Decision

<!-- SECTION_REF: 14-glossary.s007 -->

Section Ref: `14-glossary.s007`

A pause in engine execution requiring player input. Examples: choose target, pay cost, activate optional trigger, order simultaneous triggers.

## Effect block

<!-- SECTION_REF: 14-glossary.s008 -->

Section Ref: `14-glossary.s008`

One distinct effect on a card, identified by a stable `effectId`.

wrapper or entry-point adapter responsibilities are timing window selection, legal-action exposure or queueing, source-presence policy selection, once-per-turn marker handling, and activation commitment semantics. wrapper semantics are distinct from reusable effect body primitive semantics.

## EngineEvent

<!-- SECTION_REF: 14-glossary.s009 -->

Section Ref: `14-glossary.s009`

A structured record emitted by atomic mutations. Trigger detection, replay logging, and debugging consume events.

## Full state

<!-- SECTION_REF: 14-glossary.s010 -->

Section Ref: `14-glossary.s010`

Same as canonical state. Must not be sent to a normal client.

## Hidden information

<!-- SECTION_REF: 14-glossary.s011 -->

Section Ref: `14-glossary.s011`

Game data a player is not entitled to know: opponent hand contents, deck order, face-down life, private search results, RNG seed, and internal engine state.

## PlayerView

<!-- SECTION_REF: 14-glossary.s012 -->

Section Ref: `14-glossary.s012`

A filtered view of game state for one player. Includes only that player's legal visible information.

## Replay drift

<!-- SECTION_REF: 14-glossary.s013 -->

Section Ref: `14-glossary.s013`

A mismatch between expected and actual state hashes when replaying a historical action log.

## Source presence policy

<!-- SECTION_REF: 14-glossary.s014 -->

Section Ref: `14-glossary.s014`

A rule on queued effects that determines whether the source card must still be in the original zone, can resolve from a destination zone, can use last-known information, or does not require a source.

## StateSeq

<!-- SECTION_REF: 14-glossary.s015 -->

Section Ref: `14-glossary.s015`

Monotonic sequence number for accepted state transitions visible to the server/client protocol.

## Support status

<!-- SECTION_REF: 14-glossary.s016 -->

Section Ref: `14-glossary.s016`

The implementation classification for a card: vanilla confirmed, implemented through DSL, implemented through custom handler, unsupported, or simulator-banned.

## View engine

<!-- SECTION_REF: 14-glossary.s017 -->

Section Ref: `14-glossary.s017`

Client-safe helper layer that operates only on filtered views and never on full state.

## Poneglyph terms

<!-- SECTION_REF: 14-glossary.s018 -->

Section Ref: `14-glossary.s018`

- **Poneglyph API** - external card-data service at `api.poneglyph.one`, used for printed card metadata, images, variants, and text.
- **Poneglyph base card ID** - canonical card identifier used in decks, engine state, effect definitions, and database rows.
- **Poneglyph variant index / variant key** - cosmetic alternate-art selector. Poneglyph payloads expose `variants[].index`; the simulator generates keys like `OP01-060:v0`. It affects display only and never changes gameplay.
- **Simulator overlay** - local data keyed by Poneglyph card ID that provides effect definitions, custom handlers, support status, rulings, and banlist data.

## Loadout

<!-- SECTION_REF: 14-glossary.s019 -->

Section Ref: `14-glossary.s019`

An account-level saved object containing a gameplay decklist plus cosmetic selections such as DON!! deck art, sleeves, playmat, icon, and card variants when image assets are available.

## PendingDecision

<!-- SECTION_REF: 14-glossary.s020 -->

Section Ref: `14-glossary.s020`

The canonical engine pause object representing any required player input, including trigger ordering, optional activations, target selection, card selection, and life-trigger confirmation.

## v5 additions

<!-- SECTION_REF: 14-glossary.s021 -->

Section Ref: `14-glossary.s021`

| Term                       | Meaning                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| `stateSeq`                 | Canonical authoritative state sequence number.                              |
| `serverSeq`                | Per-recipient transport message sequence number.                            |
| `eventJournal`             | Canonical list of engine events stored in authoritative state.              |
| `variantKey`               | Simulator-generated cosmetic key `${cardId}:v${variantIndex}`.              |
| `timingWindowId`           | Identifier grouping simultaneous or related triggered effects.              |
| `generation`               | Queue-ordering level for triggers created while resolving earlier triggers. |
| `DeterministicReplayEntry` | Replay input stripped of timestamps, signatures, and transport metadata.    |
| `ReplayAuditEnvelope`      | Non-deterministic audit metadata associated with a replay entry.            |
| `delayed-filtered`         | Spectator policy that applies both delay and hidden-info filtering.         |
| `gameType`                 | Session-entry model such as `ranked`, `unranked`, or `custom`.              |
| `formatId`                 | Canonical format-profile identifier used for deck/match validation.         |
| `ladderId`                 | Ranked ladder key, typically derived from ranked + format + season.         |
| `disconnect forfeit`       | Ranked loss awarded when reconnect grace expires.                           |
