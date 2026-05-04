# Reporting And GitHub Sync Procedure

This document is mandatory workflow guidance linked from `AGENTS.md`. It contains reporting and GitHub/board sync rules.

## Reporting Format

Every implementation or review note should include:

- exact files changed
- tests run
- assumptions
- blockers or ambiguities
- whether the patch stayed inside `allowed_touch_points`

## GitHub And Board Sync

GitHub Issues and board items are projections of local story files, not the authority.

- Use the native GitHub connector as the default GitHub integration surface for repository reads, pull requests, comments, review threads, status checks, labels, and merges.
- Use `gh` CLI only as a fallback when the native connector is unavailable, missing access, or returns an operational failure that blocks progress.
- When falling back to `gh` CLI, record the reason in the implementation note or PR trail so the workflow failure is visible.
- Sync board state through `tools/spec_board_sync.ts`.
- Write sync metadata under `stories/.sync/`.
- If board state drifts from the approved story file, fix the story or re-run sync.

Do not treat manual board edits as authoritative requirements.
