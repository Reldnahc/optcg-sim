# Lobby Deck Focal Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed leader image crop focus from auth deck-library responses into the sim lobby deck selector.

**Architecture:** Auth enriches saved deck rows with `leader_crop_focus` from `card_images`. Auth-client exposes the public field. Sim normalizes the field to `AccountLoadout.leaderCropFocus` and applies it to the existing CSS background preview.

**Tech Stack:** TypeScript, Fastify JSON schemas, PostgreSQL via `optcg-db`, React server-render tests, Vitest/Node tests.

---

## File Map

- Modify `optcg-auth/src/repos/deckLibrary.ts`: add `leader_crop_focus` to `DeckCollectionRow` and query it in `getDeckLibrary`.
- Modify `optcg-auth/src/schemas/deckLibrary.ts`: add `leader_crop_focus` to the public deck collection schema.
- Modify `optcg-auth/test/deck-library-routes.test.mjs`: prove the route returns the new field.
- Modify `optcg-auth-client/src/index.ts`: add the new field to `DeckCollection`.
- Modify `optcg-auth-client/test/client.test.mjs`: prove the typed example accepts and returns `leader_crop_focus`.
- Modify `optcg-sim-dev/packages/client/src/account-client.ts`: add `leaderCropFocus` to `AccountLoadout` and normalize the auth field.
- Modify `optcg-sim-dev/packages/client/src/account-client.test.ts`: prove normalization preserves focus and fallback.
- Modify `optcg-sim-dev/packages/client/src/react/DeckLoadoutPicker.tsx`: map `leaderCropFocus` to background position.
- Modify `optcg-sim-dev/packages/client/src/react/lobby-deck-panel.test.ts`: prove rendered markup includes the expected background position.

---

### Task 1: Auth Deck Library Contract

- [ ] Add a failing route test in `optcg-auth/test/deck-library-routes.test.mjs` that expects a deck collection to include `leader_crop_focus: { x: 0.42, y: 0.18 }`.
- [ ] Update `DeckCollectionRow` in `optcg-auth/src/repos/deckLibrary.ts` with `leader_crop_focus: { x: number | null; y: number | null } | null`.
- [ ] Update `getDeckLibrary` to left join English `cards` and matching `card_images`, selecting:

```sql
CASE
  WHEN ci.id IS NULL THEN NULL
  ELSE jsonb_build_object('x', ci.crop_focus_x, 'y', ci.crop_focus_y)
END AS leader_crop_focus
```

- [ ] Update `optcg-auth/src/schemas/deckLibrary.ts` so `leader_crop_focus` is required and may be `null` or an object with nullable numeric `x` and `y`.
- [ ] Run `npm test` in `optcg-auth`; expected result is exit `0`.
- [ ] Commit with message `Add leader crop focus to deck library`.

### Task 2: Auth Client Contract

- [ ] Add `leader_crop_focus` to `DeckCollection` in `optcg-auth-client/src/index.ts`.
- [ ] Update `optcg-auth-client/test/client.test.mjs` deck-library fixtures to include `leader_crop_focus`.
- [ ] Run `npm test` in `optcg-auth-client`; expected result is exit `0`.
- [ ] Commit with message `Expose deck leader crop focus in auth client`.

### Task 3: Sim Lobby Rendering

- [ ] Add `leaderCropFocus` to `AccountLoadout` in `optcg-sim-dev/packages/client/src/account-client.ts`.
- [ ] Normalize `leader_crop_focus` from `DeckCollection` into `leaderCropFocus`.
- [ ] Add parsing helpers that accept only finite numeric `x` and `y`; malformed or missing focus becomes `null`.
- [ ] Update `DeckLoadoutPicker.tsx` so leader image style includes:

```ts
backgroundPosition: loadout.leaderCropFocus === null
  ? "50% 0%"
  : `${String(loadout.leaderCropFocus.x * 100)}% ${String(loadout.leaderCropFocus.y * 100)}%`;
```

- [ ] Update sim tests to assert normalized focus and rendered `background-position`.
- [ ] Run `pnpm test -- account-client.test.ts lobby-deck-panel.test.ts` in `optcg-sim-dev`; expected result is exit `0`.
- [ ] Run `pnpm typecheck` in `optcg-sim-dev`; expected result is exit `0`.
- [ ] Commit with message `Use leader crop focus in lobby deck picker`.

### Task 4: Final Verification

- [ ] Check all three repos with `git status --short`.
- [ ] Report commits and exact verification commands.
