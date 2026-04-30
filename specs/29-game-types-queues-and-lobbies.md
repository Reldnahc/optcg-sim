---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "29-game-types-queues-and-lobbies"
doc_title: "Game Types Queues And Lobbies"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Game Types, Queues, and Lobbies

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s001 -->

Section Ref: `29-game-types-queues-and-lobbies.s001`

## Purpose

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s002 -->

Section Ref: `29-game-types-queues-and-lobbies.s002`

This document closes an important product and implementation ambiguity: **game type** is the session-entry and fairness model, while **format** is the rules/deck/match profile selected for that session.

The public launch game types are `ranked`, `unranked`, and `custom`.

## Game type versus format

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s003 -->

Section Ref: `29-game-types-queues-and-lobbies.s003`

- `gameType` answers **how players enter and what competitive guarantees apply**.
- `formatId` answers **what gameplay/deck validation/match structure profile the session uses**.

A ranked and unranked match may use the same `formatId` while differing in rating, disconnect discipline, spectator defaults, and rollback policy.

## Canonical public game types

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s004 -->

Section Ref: `29-game-types-queues-and-lobbies.s004`

| gameType   | Entry model | Rating | Spectator default                       | Rollback posture                                                      | Notes                          |
| ---------- | ----------- | ------ | --------------------------------------- | --------------------------------------------------------------------- | ------------------------------ |
| `ranked`   | Queue only  | Elo    | `disabled`                              | judge/admin only after hidden info                                    | Strictest fairness mode        |
| `unranked` | Queue only  | none   | `live-filtered`                         | mutual consent before hidden info, otherwise admin/server policy      | Public practice without rating |
| `custom`   | Lobby only  | none   | host-configurable within allowed bounds | host/mutual consent before hidden info, otherwise admin/server policy | Optional password support      |

`Local/dev sandbox` remains a development environment, not a public game type. `Tournament` remains a future organizer-managed overlay that will usually build on custom-lobby/session primitives.

## Queue-backed game types

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s005 -->

Section Ref: `29-game-types-queues-and-lobbies.s005`

`ranked` and `unranked` are canonical queue-backed entry flows.

Rules:

1. Clients do not create queue matches directly. They submit queue intent and the server creates the match after deck/loadout/format validation.
2. Queue tickets are keyed by at least `gameType` and `formatId`.
3. Ranked queues may only use formats that are both queue-eligible and rating-eligible.
4. Unranked queues may use queue-eligible formats but never attach ladder/rating updates.
5. Queue-created matches do not expose host-tunable fairness knobs such as custom passwords or arbitrary spectator modes.

## Queue ticket contract

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s006 -->

Section Ref: `29-game-types-queues-and-lobbies.s006`

```ts
interface QueueTicket {
  ticketId: string;
  playerId: UserId;
  gameType: "ranked" | "unranked";
  formatId: string;
  deckId: string;
  loadoutId?: string;
  ladderId?: string;
  createdAt: string;
  regionHint?: string;
}
```

`ladderId` is required for `ranked` and absent for `unranked`.

## Custom lobbies

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s007 -->

Section Ref: `29-game-types-queues-and-lobbies.s007`

`custom` sessions are created through a lobby service, not a matchmaking queue.

Capabilities:

- host-created lobby metadata,
- optional password requirement,
- explicit invite/share code,
- host-selected format from allowed profiles,
- host-selected spectator mode within configured bounds,
- rematch-friendly workflow.

Custom lobbies are never rated in the initial product, even if they use the same format as ranked.

## Lobby configuration contract

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s008 -->

Section Ref: `29-game-types-queues-and-lobbies.s008`

```ts
interface LobbyConfig {
  lobbyId: string;
  hostUserId: UserId;
  name?: string;
  visibility: "public" | "friends" | "private" | "invite-only";
  passwordRequired: boolean;
  passwordHash?: string;
  formatId: string;
  allowSpectators: boolean;
  spectatorPolicyMode: "disabled" | "live-filtered";
  allowRematch: boolean;
}
```

Passwords must be stored and compared as hashes. Plaintext passwords must not be written to durable logs, replay artifacts, or client telemetry.

## Match creation requirements

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s009 -->

Section Ref: `29-game-types-queues-and-lobbies.s009`

Every created match must carry canonical session metadata:

- `gameType`,
- `formatId`,
- `ladderId` when applicable,
- queue snapshot or lobby configuration reference,
- disconnect policy,
- spectator policy.

The match server must treat those values as immutable once the match begins.

## Launch defaults

<!-- SECTION_REF: 29-game-types-queues-and-lobbies.s010 -->

Section Ref: `29-game-types-queues-and-lobbies.s010`

Initial product defaults:

- launch public queue types: `ranked`, `unranked`,
- launch hosted session type: `custom`,
- launch custom-lobby password support: optional and host-controlled,
- launch ranked entry: queue only,
- launch custom entry: lobby only,
- no client may bypass server validation by constructing a match directly.
