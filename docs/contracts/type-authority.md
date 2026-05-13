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
- Sync write entrypoint: `corepack pnpm run types:sync:write`
- Stale-output check entrypoint: `corepack pnpm run types:sync:check`
- The stale-output check entrypoint is not yet wired into root `verify` in this story.

## Change Authority Rule

Contract shape changes require edits in canonical contract modules under separate approved authority, not one-sided package patches.

## Downstream Disposition Record (TYP-005C)

```json
{
  "storyId": "TYP-005C",
  "dispositions": [
    {
      "field": "Action.respondToDecision.playerId",
      "disposition": "package_drift_or_engine_internal",
      "followUpStory": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s016",
        "22-v6-implementation-tightening.s006"
      ],
      "canonicalShape": "Canonical Action.respondToDecision includes decisionId and response only.",
      "packageOrDownstreamShape": "Downstream package/consumer assumptions previously expected Action.respondToDecision.playerId.",
      "downstreamConsumerSummary": "Field mismatch blocks projection-aligned downstream action typing and requires consumer migration away from package-only action metadata."
    },
    {
      "field": "PublicCardView.currentPower",
      "disposition": "package_drift_or_engine_internal",
      "followUpStory": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s003",
        "06-visibility-security.s004"
      ],
      "canonicalShape": "Canonical PublicCardView includes stable public board fields and excludes computed currentPower.",
      "packageOrDownstreamShape": "packages/types/src/view.ts currently includes PublicCardView.currentPower as an optional field.",
      "downstreamConsumerSummary": "Compile blockers arise where downstream view consumers rely on package-only currentPower instead of canonical public DTO shape."
    },
    {
      "field": "BattleState.counterPower",
      "disposition": "package_drift_or_engine_internal",
      "followUpStory": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "06-visibility-security.s004"
      ],
      "canonicalShape": "Canonical runtime BattleState tracks attacker/target/blocker/step/damageCount without counterPower.",
      "packageOrDownstreamShape": "packages/types/src/runtime.ts adds optional BattleState.counterPower.",
      "downstreamConsumerSummary": "Engine-adjacent consumers depending on package-only counterPower fail against canonical runtime types."
    },
    {
      "field": "BattleState.damageProcess",
      "disposition": "package_drift_or_engine_internal",
      "followUpStory": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "03-game-state-events-decisions.s003"
      ],
      "canonicalShape": "Canonical BattleState omits damageProcess and keeps process internals outside the public/runtime battle contract.",
      "packageOrDownstreamShape": "packages/types/src/runtime.ts includes optional BattleState.damageProcess metadata.",
      "downstreamConsumerSummary": "Downstream compile failures occur when package-only damageProcess is treated as canonical battle-state authority."
    },
    {
      "field": "TransientCardSet.ownerId",
      "disposition": "package_drift_or_engine_internal",
      "followUpStory": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "06-visibility-security.s021"
      ],
      "canonicalShape": "Canonical TransientCardSet includes id/cards/origin/visibility/cleanupPolicy and no ownerId.",
      "packageOrDownstreamShape": "packages/types/src/runtime.ts adds TransientCardSet.ownerId.",
      "downstreamConsumerSummary": "Package-only owner metadata causes downstream transient-set typings to diverge from canonical runtime contracts."
    },
    {
      "field": "TransientCardSet.controllerId",
      "disposition": "package_drift_or_engine_internal",
      "followUpStory": "TYP-005E",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "06-visibility-security.s021"
      ],
      "canonicalShape": "Canonical TransientCardSet does not include controllerId.",
      "packageOrDownstreamShape": "packages/types/src/runtime.ts adds TransientCardSet.controllerId.",
      "downstreamConsumerSummary": "Downstream consumers typed to package-only controller metadata block canonical-package parity for transient sets."
    },
    {
      "field": "ReplacementAppliedEventPayload",
      "disposition": "canonical_contract_omission",
      "followUpStory": "TYP-005D",
      "specRefs": [
        "03-game-state-events-decisions.s002",
        "22-v6-implementation-tightening.s006"
      ],
      "canonicalShape": "Canonical EngineEvent uses payload: unknown and does not define ReplacementAppliedEventPayload.",
      "packageOrDownstreamShape": "packages/types/src/events.ts defines ReplacementAppliedEventPayload with process and payload hash fields.",
      "downstreamConsumerSummary": "Replacement event payload consumers compile against package-only payload typing, signaling a canonical contract omission for shared event payload structure."
    },
    {
      "field": "PublicDecision.processId",
      "disposition": "canonical_contract_omission",
      "followUpStory": "TYP-005D",
      "specRefs": [
        "06-visibility-security.s004",
        "06-visibility-security.s007"
      ],
      "canonicalShape": "Canonical PublicDecision omits processId while canonical replacement decision state includes processId in PendingDecision.",
      "packageOrDownstreamShape": "packages/types/src/view.ts adds optional PublicDecision.processId for projected replacement decisions.",
      "downstreamConsumerSummary": "Projection and consumer typing rely on this field to render replacement choice context, creating a canonical view-contract omission."
    },
    {
      "field": "PublicDecision.replacementIds",
      "disposition": "canonical_contract_omission",
      "followUpStory": "TYP-005D",
      "specRefs": [
        "06-visibility-security.s004",
        "06-visibility-security.s007"
      ],
      "canonicalShape": "Canonical PublicDecision omits replacementIds even though replacement-choice decisions track candidate IDs internally.",
      "packageOrDownstreamShape": "packages/types/src/view.ts adds optional PublicDecision.replacementIds.",
      "downstreamConsumerSummary": "Downstream replacement UI/decision handlers compile against package-only replacementIds, indicating a canonical projection omission."
    },
    {
      "field": "PublicDecision.mandatory",
      "disposition": "canonical_contract_omission",
      "followUpStory": "TYP-005D",
      "specRefs": [
        "06-visibility-security.s004",
        "06-visibility-security.s007"
      ],
      "canonicalShape": "Canonical PublicDecision omits mandatory despite replacement decision state tracking whether choice is mandatory.",
      "packageOrDownstreamShape": "packages/types/src/view.ts adds optional PublicDecision.mandatory.",
      "downstreamConsumerSummary": "Consumer compile paths that differentiate forced vs optional replacement responses depend on package-only mandatory field."
    }
  ]
}
```
