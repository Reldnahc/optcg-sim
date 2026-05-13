# Package Type Authority Strategy (`@optcg/types`)

## Canonical Source Of Truth

The canonical source of truth for `@optcg/types` contract shapes is:

- `contracts/canonical-types.ts`
- `contracts/types/*`

Package type projection files are derived artifacts that must remain aligned to these canonical modules.

## Selected Strategy

Selected model: checked-in package type files generated/synced from canonical contract modules.

Under current repository constraints, direct re-export from `contracts/*` into the `@optcg/types` package would require broad package-boundary changes. The package currently declares `src` as its source boundary and publishes type entry points from `src`.

## Current Repo Constraints (Proof)

`packages/types/package.json` currently declares:

- `types`: `./src/index.ts`
- `.` export `types`: `./src/index.ts`

`packages/types/tsconfig.json` currently declares:

- `rootDir`: `src`
- `include`: `["src/**/*.ts"]`

These constraints keep `@optcg/types` centered on `packages/types/src/*` and prevent adopting cross-package direct re-export as a narrow story-local change.

## Canonical-To-Package Module Mapping

Canonical module to package module mapping is one-to-one by filename:

- `contracts/types/primitives.ts` -> `packages/types/src/primitives.ts`
- `contracts/types/card-metadata.ts` -> `packages/types/src/card-metadata.ts`
- `contracts/types/events.ts` -> `packages/types/src/events.ts`
- `contracts/types/view.ts` -> `packages/types/src/view.ts`
- `contracts/types/game-state.ts` -> `packages/types/src/game-state.ts`
- `contracts/types/effects.ts` -> `packages/types/src/effects.ts`
- `contracts/types/decisions.ts` -> `packages/types/src/decisions.ts`
- `contracts/types/runtime.ts` -> `packages/types/src/runtime.ts`
- `contracts/canonical-types.ts` -> `packages/types/src/index.ts` export surface alignment

## Generated Output Ownership And Edit Policy

- Only canonical projection modules are generated/synced output in this strategy:
  - `packages/types/src/index.ts`
  - `packages/types/src/primitives.ts`
  - `packages/types/src/card-metadata.ts`
  - `packages/types/src/events.ts`
  - `packages/types/src/view.ts`
  - `packages/types/src/game-state.ts`
  - `packages/types/src/effects.ts`
  - `packages/types/src/decisions.ts`
  - `packages/types/src/runtime.ts`
- Tests, manifests, and support files under `packages/types/src` are not generated canonical projections unless a later approved story explicitly includes them (for example `*.test.ts` and `export-ownership.manifest.ts`).
- Manual edits to generated canonical projection files are non-authoritative.
- Later sync verification must overwrite or reject manual-only drift in package outputs.
- A stale-output check entrypoint is expected in later stories as part of repository verification lanes.

## Change Authority Rule

Contract shape changes require edits in canonical contract modules under separate approved authority, not one-sided package patches.
