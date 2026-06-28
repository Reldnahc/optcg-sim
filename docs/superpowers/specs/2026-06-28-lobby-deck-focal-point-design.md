# Lobby Deck Focal Point Design

## Goal

The lobby deck selector should frame leader preview art using the crop focus stored on card image metadata.

## Scope

This is a display metadata path from auth deck-library data to the sim lobby picker. It does not change deck validation, selected loadout submission, card image URLs, or match runtime state.

## Contract

The auth deck-library response adds `leader_crop_focus` to each deck collection:

```ts
type LeaderCropFocus = {
  x: number | null;
  y: number | null;
} | null;
```

`leader_crop_focus` is `null` when the saved deck has no leader or the leader variant cannot be resolved to a `card_images` row. When resolved, `x` and `y` are the normalized `card_images.crop_focus_x` and `card_images.crop_focus_y` values and may individually be `null`.

## Data Flow

`optcg-auth` enriches `GET /v1/deck-library` by joining saved deck leader identity to English `cards` and the matching `card_images.variant_index`. `optcg-auth-client` exposes the new field on `DeckCollection`. `optcg-sim-dev` normalizes it into `AccountLoadout.leaderCropFocus`, then `DeckLoadoutPicker` maps it to `background-position`.

## Rendering

The lobby preview remains a CSS background crop. If both focus coordinates are numbers, the image uses `${x * 100}% ${y * 100}%`. Missing focus falls back to top-center, `50% 0%`, matching the existing smart crop fallback.

## Tests

Tests cover the auth response shape, the auth-client type/example fixture, sim account normalization, and rendered lobby picker markup containing the expected background position.
