# Deck Hash Lobby Submissions Design

## Purpose

Custom lobbies should accept Poneglyph-compatible deck hashes instead of
requiring a built-in deck builder or local `1xCARD` dev deck text files. The
hash is decoded server-side, resolved through the existing Poneglyph card
manifest path, and snapshotted into the match manifest with variant art choices
preserved for client display.

This keeps deck input production-shaped while still supporting local guest
lobbies.

## Goals

- Let each lobby guest submit their own deck hash before the match starts.
- Replace dev `deck1.txt` / `deck2.txt` list inputs with `deck1.hash` /
  `deck2.hash`.
- Decode deck hashes with `optcg-deck-hash`.
- Preserve `variant_index` for leader and main deck entries.
- Keep DON deck configuration separate from the deck hash.
- Resolve gameplay card data through the existing Poneglyph batch/cache path.
- Keep the engine unaware of deck hashes and variant art.

## Non-Goals

- No full deck builder UI.
- No account-backed deck CRUD.
- No deck ownership validation.
- No format legality enforcement beyond the existing manifest safety gates.
- No DON deck encoding in deck hashes.
- No engine gameplay changes.

## Deck Submission Model

The internal boundary is a deck submission, not a dev file format.

```ts
interface DeckSubmission {
  source: "deckHash";
  hash: string;
  status: "invalid" | "ready";
  error?: string;
  decoded: {
    leader: DeckSubmissionEntry;
    main: DeckSubmissionEntry[];
    format?: string;
  };
  donDeckCount: number;
}

interface DeckSubmissionEntry {
  cardId: CardId;
  count: number;
  variantIndex?: number;
}
```

`optcg-deck-hash` decodes entries as `{ card_number, count, variant_index? }`.
The simulator maps those to `cardId`, `count`, and `variantIndex` at the
submission boundary.

The decoded hash `don` field is ignored for match setup. DON deck size and DON
card identities remain a separate match/deck setting.

The implementation may keep invalid submissions as seat-scoped status for UI
feedback, but invalid submissions must not be eligible for match creation.

## Dev Input Files

The local dev files become:

```text
packages/match-server/dev-decks/deck1.hash
packages/match-server/dev-decks/deck2.hash
```

Each file contains one deck hash string. The files feed the same
`DeckSubmission` path used by lobby UI submissions.

The old `deck1.txt` / `deck2.txt` list format is not a supported input for new
flows. Examples should move to:

```text
packages/match-server/dev-decks/deck1.hash.example
packages/match-server/dev-decks/deck2.hash.example
```

## Lobby Flow

Each guest owns their submitted deck.

1. Guest joins `/lobbies/<lobbyId>` with local guest identity.
2. Lobby page shows a deck hash input for the current guest.
3. Guest submits a deck hash.
4. Server decodes the hash and resolves the referenced base card IDs.
5. Server stores only the current guest's validated submission on their lobby
   seat.
6. Lobby state exposes whether each seat has a valid deck, without exposing
   hidden deck contents to the opponent.
7. The match starts only after both player seats are claimed and both seats have
   valid deck submissions.

Submitting a new deck hash for the same guest replaces that guest's previous
submission. A replacement invalid hash clears readiness for that seat.

The client must not make decoded deck contents authoritative. Server-side
decoding and manifest creation are the authority.

## Variant Art Preservation

Variant choice is display metadata attached to submitted deck entries and later
to match card instances.

Required behavior:

- Preserve `variant_index` from the decoded hash for leader and main deck
  entries.
- Preserve variant choice per physical deck slot, not only per base card ID,
  because the same card ID may appear with different variant indexes in one
  deck.
- Snapshot the chosen variant index into the match setup/card instance/display
  data needed by the client.
- Client image selection prefers the chosen variant image when one exists.
- If a chosen variant index does not exist in the resolved Poneglyph card
  detail, fail deck submission with a clear error instead of silently selecting
  another art.

Variant data must not affect gameplay rules. The engine continues to consume
base card IDs and normalized gameplay card data only.

## Card Resolution

Deck submission resolution uses the existing Poneglyph batch/cache authority.

1. Collect unique base card IDs from both player submissions plus required DON
   cards.
2. Resolve via `@optcg/cards` batch/card manifest helpers.
3. Validate leader card category and leader life from resolved metadata.
4. Validate variant indexes against resolved card variants.
5. Build player setup with expanded card ID order and parallel variant metadata
   for display.

The deck hash dictionary may use the bundled `optcg-deck-hash` dictionary first.
API-backed dictionary refresh is allowed only in the deck hash decoding layer,
not during engine execution.

## Error Handling

Deck submission fails closed for:

- invalid deck hash syntax;
- unknown dictionary ID that cannot be resolved by the codec;
- missing leader;
- leader count other than one;
- missing or invalid main deck entries;
- unresolved Poneglyph card IDs;
- leader metadata that is not a leader or lacks life;
- invalid chosen `variant_index`;
- unsupported card manifest/runtime safety failures.

Errors should be seat-scoped and visible to the submitting guest. Opponents see
only whether the other seat is ready or not.

## Package Boundaries

- `match-server` owns lobby deck submission state and match setup assembly.
- `cards` owns Poneglyph card resolution, normalization, and manifest data.
- `client` owns input UI and display of submitted/ready state.
- `engine-core` does not import or know about `optcg-deck-hash`, deck hashes,
  Poneglyph API clients, or variant art.

## Testing Requirements

Server/deck submission tests:

- Decode a deck hash into leader/main entries with variant indexes preserved.
- Reject invalid deck hashes.
- Reject hashes with no leader or non-one leader count.
- Ignore decoded DON for match setup and keep DON deck count separate.
- Reject a chosen variant index missing from the resolved Poneglyph card.
- Build match setup from two deck submissions and preserve variant selections.

Lobby tests:

- A joined guest can submit a deck hash for only their own seat.
- Lobby state shows deck-ready status per seat without exposing the deck list to
  the opponent.
- A lobby with two claimed seats does not start until both seats have valid
  decks.
- Once both valid decks are submitted, match creation uses those submissions.

Client tests:

- Lobby page exposes a deck hash input for the current guest.
- Submitting a deck hash calls the deck-submission endpoint for the joined
  seat/lobby.
- Lobby waiting state distinguishes missing deck, invalid deck, and ready deck.
- Variant-selected images are preferred when the manifest includes a chosen
  variant.

Boundary tests:

- `engine-core` does not import `optcg-deck-hash`.
- Client code does not decode deck hashes for authority.
- Match-server does not read old `deck1.txt` / `deck2.txt` list files for new
  default dev setup.

## Acceptance Criteria

- A player can paste a deck hash in a custom lobby and mark their seat deck
  ready.
- Two guests can submit deck hashes and start a match without either guest
  receiving a direct seat URL.
- Dev default decks come from `.hash` files instead of `1xCARD` text files.
- Variant art selected in the hash is visible in the client when available.
- DON deck size remains separately configurable.
- The engine receives the same gameplay authority it receives today: resolved
  card IDs and manifest data, not deck hashes or variant authority.
