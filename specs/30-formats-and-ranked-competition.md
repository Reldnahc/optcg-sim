---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "30-formats-and-ranked-competition"
doc_title: "Formats And Ranked Competition"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Formats and Ranked Competition

<!-- SECTION_REF: 30-formats-and-ranked-competition.s001 -->

Section Ref: `30-formats-and-ranked-competition.s001`

## Purpose

<!-- SECTION_REF: 30-formats-and-ranked-competition.s002 -->

Section Ref: `30-formats-and-ranked-competition.s002`

This document defines the canonical format model, launch format profiles, ladder identity, simple Elo policy, and disconnect discipline for ranked play.

## Format profile model

<!-- SECTION_REF: 30-formats-and-ranked-competition.s003 -->

Section Ref: `30-formats-and-ranked-competition.s003`

A `formatId` is not just a display label. It is a stable configuration profile that may define:

- deck-validation rules,
- card-pool or banlist inputs,
- the Poneglyph legality records and format mappings those rules validate against,
- match structure such as best-of-1 or best-of-3,
- queue eligibility,
- rating eligibility,
- spectator defaults or overrides where applicable.

## Canonical format shape

<!-- SECTION_REF: 30-formats-and-ranked-competition.s004 -->

Section Ref: `30-formats-and-ranked-competition.s004`

```ts
interface FormatProfile {
  formatId: string;
  displayName: string;
  matchStructure: "bo1" | "bo3";
  queueEligibleGameTypes: Array<"ranked" | "unranked">;
  ratingEligible: boolean;
  allowsUnsupportedCards: boolean;
  notes?: string;
}
```

The profile may later reference a separate deck-legality profile internally, but `formatId` is the canonical public and persistence key for the first implementation wave.

## Initial supported format profiles

<!-- SECTION_REF: 30-formats-and-ranked-competition.s005 -->

Section Ref: `30-formats-and-ranked-competition.s005`

| formatId       | Structure | Queue eligible                | Rating eligible  | Intended use                                                                   |
| -------------- | --------- | ----------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `standard-bo1` | `bo1`     | `ranked`, `unranked`          | yes              | Launch default public format                                                   |
| `standard-bo3` | `bo3`     | none in initial public queues | no in first wave | Custom lobbies and future tournaments once full match-structure support exists |
| `sandbox-open` | `bo1`     | none                          | no               | Local/dev or explicitly opted-in private custom testing only                   |

A format must be explicitly marked queue-eligible before any queue may expose it. Card legality for that format comes from Poneglyph legality data consumed through `@optcg/cards`; ranked/unranked/custom policy may further restrict allowed cards, but they do not replace Poneglyph as the base legality source.

## Ladder identity

<!-- SECTION_REF: 30-formats-and-ranked-competition.s006 -->

Section Ref: `30-formats-and-ranked-competition.s006`

Ranked Elo is keyed by `ladderId`, not by a single global account row.

Canonical derivation rule for the first implementation wave:

```text
ladderId = `ranked:${formatId}:${seasonId}`
```

This keeps multiple ranked formats or seasons from overwriting one another.

## Simple Elo v1 policy

<!-- SECTION_REF: 30-formats-and-ranked-competition.s007 -->

Section Ref: `30-formats-and-ranked-competition.s007`

The initial ranked system is simple Elo:

```text
expectedScore = 1 / (1 + 10 ^ ((opponentElo - playerElo) / 400))
nextElo = round(currentElo + 32 * (actualScore - expectedScore))
```

Launch defaults:

- initial Elo: `1200`,
- K-factor: `32`,
- win score: `1.0`,
- draw score: `0.5`,
- loss score: `0.0`,
- disconnect forfeit score: `0.0` for the forfeiting player.

Do not add provisional multipliers, rank tiers, streak bonuses, decay, or placement games until the simple ladder is proven stable.

## Ranked disconnect discipline

<!-- SECTION_REF: 30-formats-and-ranked-competition.s008 -->

Section Ref: `30-formats-and-ranked-competition.s008`

A temporary disconnect is not punished by itself. The punishable event is a **ranked disconnect forfeit**, meaning the reconnect grace window expired and the match was awarded against the disconnected player.

Default ranked discipline policy for the first wave:

| Rolling 30-day offense count | Result                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| 1                            | record event, apply ranked loss/Elo loss, no extra queue lockout                                  |
| 2                            | record event, apply ranked loss/Elo loss, 5 minute ranked queue lockout                           |
| 3                            | record event, apply ranked loss/Elo loss, 30 minute ranked queue lockout                          |
| 4+                           | record event, apply ranked loss/Elo loss, 24 hour ranked queue lockout and moderation review flag |

Service-wide incidents or administrator-reviewed infrastructure failures may suppress strike escalation or convert the result to `no_contest`.

## Disconnect outcome records

<!-- SECTION_REF: 30-formats-and-ranked-competition.s009 -->

Section Ref: `30-formats-and-ranked-competition.s009`

Every grace-expired disconnect outcome should be classified as one of:

- `grace-expired-forfeit`,
- `mutual-abandon`,
- `infrastructure-no-contest`,
- `admin-override`.

Only `grace-expired-forfeit` should feed automatic ranked strike escalation.

## Persistence and audit requirements

<!-- SECTION_REF: 30-formats-and-ranked-competition.s010 -->

Section Ref: `30-formats-and-ranked-competition.s010`

Ranked-related persistence must be able to answer:

- what `gameType` and `formatId` a match used,
- which `ladderId` was updated,
- what each player's Elo was before and after,
- whether a disconnect penalty or lockout was applied,
- whether an admin override changed the default outcome.

## Launch constraints

<!-- SECTION_REF: 30-formats-and-ranked-competition.s011 -->

Section Ref: `30-formats-and-ranked-competition.s011`

- Only queue-eligible, rating-eligible formats may be used for ranked.
- Ranked and unranked deck validation must use Poneglyph legality as the base card-legality source for the selected format.
- `unranked` and `custom` must never update Elo.
- `sandbox-open` must never appear in ranked or unranked queues.
- Ranked disconnect penalties must be enforced through server-authoritative records, not client-local heuristics.
