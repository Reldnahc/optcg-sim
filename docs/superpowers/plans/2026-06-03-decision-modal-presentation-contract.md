# Decision Modal Presentation Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contract-first pending-decision presentation layer so modals explain why a decision exists and what each response does without client-side string guessing.

**Architecture:** Public decision presentation is produced by the engine view projection, carried through `@optcg/types`, normalized by the client interaction layer, and rendered by reusable modal header/body components. Gameplay remains unchanged; this is public view contract and client presentation work only.

**Tech Stack:** TypeScript, Vitest, React server rendering tests, existing `@optcg/types`, `@optcg/engine-core`, and `@optcg/client` packages.

---

## Spec Anchors

- `docs/superpowers/specs/2026-06-03-decision-modal-presentation-contract-design.md`
- `AGENTS.md` sections `Safety Boundaries`, `Code Standards`, and `Verification`
- `docs/code-standard.md` TypeScript strictness, package boundary, and test guidance

## Non-Goals

- No gameplay behavior changes.
- No visual redesign of every modal.
- No hidden engine metadata in public views.
- No client parsing of engine ids, effect ids, or raw effect text to invent modal meaning.
- No changes to card parsing, generated support, deck validation, timers, transport, or replay behavior.

## Required Invariants

- Every `PublicPendingDecision` has `presentation`.
- `presentation` is hidden-info safe for the receiving player.
- Client modal meaning comes from `pendingDecision.presentation`, not from `ClientActionModel.label`.
- Decision choice buttons are matched by public `responseKey`, not by array index
  or exact label text.
- Legal-action labels may remain as fallback labels for old/generic action lists.
- Existing modal body interaction semantics remain intact: card grid, zone-click, reorder, quantity, option list, and trigger picker.
- `engine-core` must not import client or React code.

## File Structure

Modify:

- `contracts/types/view.ts`
  - Add `PublicDecisionPresentation` and `PublicDecisionChoicePresentation`.
  - Add `presentation` to `PublicDecision`.
  - Add optional `responseKey` to public `respondToDecision` legal actions.
  - Keep existing specialized public decision types.

Create:

- `packages/engine-core/src/view/public-decision-presentation.ts`
  - Build hidden-info-safe presentation objects for pending decisions.
  - Format titles, instructions, and choice labels by decision family.
  - Keep this focused on public presentation only.

Modify:

- `packages/engine-core/src/view/filter-state-for-player.ts`
  - Call `publicDecisionPresentation` when building the public decision base.
  - Keep existing visibility filtering and specialized projection behavior.

Test:

- `packages/engine-core/src/view/filter-state-for-player-decision-presentation.test.ts`
  - Contract tests for projected presentation on the target decision families.

Modify:

- `packages/client/src/view-model.ts`
  - Carry public legal-action `responseKey` into `ClientActionModel`.
- `packages/client/src/interactions/decision-modal.ts`
  - Add presentation fields to `DecisionModalModel`.
  - Use presentation title/instruction/choice labels when building modal models.

Modify:

- `packages/client/src/react/DecisionModalHost.tsx`
  - Render a shared modal header from the decision presentation model.
  - Keep existing body renderers.

Modify:

- `packages/client/src/react/styles/decision-modal.css`
  - Add shared header and instruction styles for rendered presentation context.

Test:

- `packages/client/src/interactions/decision-modal.test.ts`
  - Headless modal model tests for presentation-driven labels.
- `packages/client/src/react/decision-modal-host.test.ts`
  - Server-rendered React tests for shared modal header output.

---

## Task 1: Add Public Decision Presentation Types

**Files:**

- Modify: `contracts/types/view.ts`
- Test: `packages/client/src/interactions/decision-modal.test.ts`

- [ ] **Step 1: Write a failing client fixture compile test**

Add a small assertion near the existing `baseDecision` fixture in
`packages/client/src/interactions/decision-modal.test.ts` so current fixtures
must include presentation data.

```ts
const baseDecision = {
  id: "decision-1" as DecisionId,
  playerId: p1,
  prompt: "Choose cards",
  causedBy: { type: "playerAction", actionId: "action-1" },
  presentation: {
    title: "Choose cards",
    instruction: "Choose cards",
  },
} satisfies Omit<PublicPendingDecision, "type">;
```

Expected failure before implementation: TypeScript reports that
`presentation` is not allowed on `PublicDecision`.

- [ ] **Step 2: Run the narrow client interaction test**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/interactions/decision-modal.test.ts
```

Expected: FAIL at TypeScript/typecheck transform because the public decision
type has no `presentation` field.

- [ ] **Step 3: Add presentation contract types**

In `contracts/types/view.ts`, add the public presentation types above
`PublicDecision`.

```ts
export interface PublicDecisionChoicePresentation {
  responseKey: string;
  label: string;
  description?: string;
  cards?: CardRef[];
  zones?: Zone[];
  count?: { min: number; max: number };
  disabled?: boolean;
}

export interface PublicDecisionPresentation {
  title: string;
  instruction: string;
  source?: CardRef;
  sourceLabel?: string;
  effectText?: string;
  choices?: PublicDecisionChoicePresentation[];
}
```

Then add the field to `PublicDecision`.

```ts
export interface PublicDecision<TType extends string = string> {
  id: DecisionId;
  type: TType;
  playerId: PlayerId;
  prompt: string;
  causedBy: CausalityRef;
  presentation: PublicDecisionPresentation;
  source?: CardRef;
  timeoutMs?: number;
}
```

- [ ] **Step 4: Add public response keys for decision actions**

In `contracts/types/view.ts`, update the `respondToDecision` branch of
`PublicLegalAction`.

```ts
| {
    type: "respondToDecision";
    decisionId: DecisionId;
    responseKey?: string;
  }
```

The key is public presentation routing data. It must describe the public choice,
not expose private engine internals.

- [ ] **Step 5: Run the narrow client interaction test**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/interactions/decision-modal.test.ts
```

Expected: FAIL on other test fixtures missing `presentation`.

- [ ] **Step 6: Update local test fixtures only**

Update all literal `PublicPendingDecision` fixtures in
`packages/client/src/interactions/decision-modal.test.ts` and
`packages/client/src/interactions/payment-decision.test.ts` with minimal
presentation values matching their prompt.

```ts
presentation: {
  title: "Choose cards",
  instruction: "Choose cards",
},
```

Use specific titles for fixtures that already imply a decision family:

```ts
presentation: {
  title: "Pay cost",
  instruction: "Choose whether to pay this optional cost",
},
```

- [ ] **Step 7: Run the client interaction tests**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/interactions/decision-modal.test.ts packages/client/src/interactions/payment-decision.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add contracts/types/view.ts packages/client/src/interactions/decision-modal.test.ts packages/client/src/interactions/payment-decision.test.ts
git commit -m "Add public decision presentation contract"
```

---

## Task 2: Project Presentation From Engine View Data

**Files:**

- Create: `packages/engine-core/src/view/public-decision-presentation.ts`
- Modify: `packages/engine-core/src/view/filter-state-for-player.ts`
- Test: `packages/engine-core/src/view/filter-state-for-player-decision-presentation.test.ts`

- [ ] **Step 1: Write failing projection tests**

Create `packages/engine-core/src/view/filter-state-for-player-decision-presentation.test.ts`.

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import type { DecisionId } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;

test("confirmLifeTrigger projection includes modal presentation and trigger card", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2 state");
  const lifeCard = must(p2State.life[0], "top life").card;
  const cardId = toCardId("life-trigger-card");
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "event",
  });
  state.pendingDecision = {
    id: toDecisionId("decision:life-trigger"),
    type: "confirmLifeTrigger",
    playerId: p2,
    prompt: "Activate life trigger?",
    causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
    visibility: { type: "public" },
    card: {
      instanceId: lifeCard.instanceId,
      cardId,
      playerId: p2,
      zone: lifeCard.zone,
    },
    options: ["activateTrigger", "addToHand"],
  };

  const view = filterStateForPlayer(state, p2);

  assert.equal(view.pendingDecision?.type, "confirmLifeTrigger");
  assert.equal(view.pendingDecision.presentation.title, "Life trigger");
  assert.equal(
    view.pendingDecision.presentation.instruction,
    "Choose whether to activate this trigger or add it to your hand.",
  );
  assert.deepEqual(view.pendingDecision.presentation.choices, [
    {
      responseKey: "activateTrigger",
      label: "Activate trigger",
      cards: [view.pendingDecision.card],
    },
    {
      responseKey: "addToHand",
      label: "Add to hand",
      cards: [view.pendingDecision.card],
    },
  ]);
});

test("chooseReplacement projection includes replacement option labels", () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: toDecisionId("decision:replacement"),
    type: "chooseReplacement",
    playerId: p1,
    prompt: "Choose a replacement effect.",
    causedBy: { type: "ruleProcess", name: "fieldRemovalReplacement" },
    visibility: { type: "private", playerId: p1 },
    processId: "process-1",
    replacementIds: ["replacement-a", "replacement-b"],
    replacementOptions: [
      { replacementId: "replacement-a", label: "Use first replacement" },
      { replacementId: "replacement-b", label: "Use second replacement" },
    ],
    mandatory: false,
  };

  const view = filterStateForPlayer(state, p1);

  assert.equal(view.pendingDecision?.type, "chooseReplacement");
  assert.equal(view.pendingDecision.presentation.title, "Choose replacement");
  assert.deepEqual(view.pendingDecision.presentation.choices, [
    { responseKey: "replacement-a", label: "Use first replacement" },
    { responseKey: "replacement-b", label: "Use second replacement" },
    { responseKey: "decline", label: "Do not replace" },
  ]);
  assert.equal(filterStateForPlayer(state, p2).pendingDecision, undefined);
});
```

Expected failure before implementation: `presentation` is missing or has
fallback values only.

- [ ] **Step 2: Run the projection test**

Run:

```bash
corepack pnpm --filter @optcg/engine-core exec vitest run --root ../.. packages/engine-core/src/view/filter-state-for-player-decision-presentation.test.ts
```

Expected: FAIL with missing or incorrect `presentation`.

- [ ] **Step 3: Add the presentation helper**

Create `packages/engine-core/src/view/public-decision-presentation.ts`.

```ts
import type {
  CardRef,
  PendingDecision,
  PublicDecisionPresentation,
  Zone,
} from "@optcg/types";

const zoneLabel = (zone: Zone): string => {
  switch (zone) {
    case "deck":
      return "deck";
    case "life":
      return "Life";
    case "hand":
      return "hand";
    case "trash":
      return "trash";
    case "costArea":
      return "cost area";
    case "characterArea":
      return "Character area";
    case "stageArea":
      return "Stage area";
    case "leaderArea":
      return "Leader area";
    case "donDeck":
      return "DON!! deck";
    case "noZone":
      return "revealed cards";
  }
};

const stripPeriod = (value: string): string => value.replace(/\.$/u, "");

const fallbackPresentation = (
  pending: PendingDecision,
  source: CardRef | undefined,
): PublicDecisionPresentation => ({
  title: stripPeriod(pending.prompt),
  instruction: stripPeriod(pending.prompt),
  ...(source === undefined ? {} : { source }),
});

export const publicDecisionPresentation = ({
  pending,
  source,
}: {
  pending: PendingDecision;
  source?: CardRef | undefined;
}): PublicDecisionPresentation => {
  if (pending.type === "confirmLifeTrigger") {
    return {
      title: "Life trigger",
      instruction:
        "Choose whether to activate this trigger or add it to your hand.",
      ...(source === undefined ? {} : { source }),
      choices: [
        {
          responseKey: "activateTrigger",
          label: "Activate trigger",
          cards: [pending.card],
        },
        {
          responseKey: "addToHand",
          label: "Add to hand",
          cards: [pending.card],
        },
      ],
    };
  }
  if (pending.type === "chooseReplacement") {
    return {
      title: "Choose replacement",
      instruction: stripPeriod(pending.prompt),
      ...(source === undefined ? {} : { source }),
      choices: [
        ...(pending.replacementOptions ?? []).map((option) => ({
          responseKey: option.replacementId,
          label: option.label,
        })),
        ...(pending.mandatory
          ? []
          : [{ responseKey: "decline", label: "Do not replace" }]),
      ],
    };
  }
  if (pending.type === "chooseTriggerOrder") {
    return {
      title: "Resolve trigger",
      instruction: "Choose the next trigger to resolve.",
      ...(source === undefined ? {} : { source }),
    };
  }
  if (pending.type === "chooseOptionalActivation") {
    return {
      title: "Optional effect",
      instruction: stripPeriod(pending.prompt),
      source: pending.source,
      choices: [
        { responseKey: "activate", label: "Activate effect" },
        { responseKey: "decline", label: "Decline effect" },
      ],
    };
  }
  if (pending.type === "chooseQuantity") {
    return {
      title: "Choose quantity",
      instruction: stripPeriod(pending.prompt),
      ...(source === undefined ? {} : { source }),
    };
  }
  if (pending.type === "payCost") {
    return {
      title: "Pay cost",
      instruction: stripPeriod(pending.prompt),
      ...(source === undefined ? {} : { source }),
    };
  }
  if (pending.type === "orderCards") {
    return {
      title: `Order cards for ${zoneLabel(pending.destination)}`,
      instruction: stripPeriod(pending.prompt),
      ...(source === undefined ? {} : { source }),
    };
  }
  return fallbackPresentation(pending, source);
};
```

- [ ] **Step 4: Wire the helper into projection**

In `packages/engine-core/src/view/filter-state-for-player.ts`, import the
helper.

```ts
import { publicDecisionPresentation } from "./public-decision-presentation.js";
```

Inside `toPublicDecision`, after computing `source`, add `presentation` to the
shared base.

```ts
const presentation = publicDecisionPresentation({
  pending,
  ...(source === undefined ? {} : { source }),
});
const base = {
  id: pending.id,
  type: pending.type,
  playerId: pending.playerId,
  prompt: pending.prompt,
  causedBy: toPublicDecisionCausedBy(pending),
  presentation,
  ...(source === undefined ? {} : { source }),
  ...(pending.timeoutMs === undefined ? {} : { timeoutMs: pending.timeoutMs }),
};
```

- [ ] **Step 5: Add response keys to public decision actions**

In `packages/engine-core/src/view/filter-state-for-player.ts`, add a helper near
the legal-action projection code.

```ts
const responseKeyForDecisionAction = (
  action: Extract<LegalAction, { type: "respondToDecision" }>,
): string | undefined => {
  const response = action.response;
  switch (response.type) {
    case "payment":
      return response.optionId;
    case "paymentDeclined":
      return "decline";
    case "optionalActivation":
      return response.choice;
    case "lifeTrigger":
      return response.choice;
    case "replacement":
      return response.replacementId ?? "decline";
    case "chooseQuantity":
      return String(response.quantity);
    case "effectOption":
      return response.optionId;
    case "mulligan":
      return response.keep ? "keep" : "mulligan";
    case "loopCount":
      return String(response.count);
    case "rollbackConsent":
      return response.allow ? "allow" : "deny";
    case "cards":
    case "targets":
    case "orderedIds":
    case "topBottomPlacement":
      return undefined;
  }
};
```

Where `PublicLegalAction` objects are produced for `respondToDecision`, include
the key only when defined.

```ts
const responseKey = responseKeyForDecisionAction(action);
return {
  type: "respondToDecision",
  decisionId: action.decisionId,
  ...(responseKey === undefined ? {} : { responseKey }),
};
```

- [ ] **Step 6: Run the projection test**

Run:

```bash
corepack pnpm --filter @optcg/engine-core exec vitest run --root ../.. packages/engine-core/src/view/filter-state-for-player-decision-presentation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run existing view projection tests touched by the type change**

Run:

```bash
corepack pnpm --filter @optcg/engine-core exec vitest run --root ../.. packages/engine-core/src/view/filter-state-for-player-life-trigger.test.ts packages/engine-core/src/view/filter-state-for-player-trigger-order.test.ts packages/engine-core/src/view/filter-state-for-player.optional-activation.test.ts
```

Expected: PASS after updating expected objects to include `presentation` where
they assert full pending decision equality.

- [ ] **Step 8: Commit**

```bash
git add contracts/types/view.ts packages/engine-core/src/view/public-decision-presentation.ts packages/engine-core/src/view/filter-state-for-player.ts packages/engine-core/src/view/filter-state-for-player-decision-presentation.test.ts packages/engine-core/src/view/filter-state-for-player-life-trigger.test.ts packages/engine-core/src/view/filter-state-for-player-trigger-order.test.ts packages/engine-core/src/view/filter-state-for-player.optional-activation.test.ts
git commit -m "Project pending decision presentation"
```

---

## Task 3: Use Presentation In Headless Modal Models

**Files:**

- Modify: `packages/client/src/view-model.ts`
- Modify: `packages/client/src/interactions/decision-modal.ts`
- Test: `packages/client/src/interactions/decision-modal.test.ts`

- [ ] **Step 1: Write failing modal model tests**

Add tests to `packages/client/src/interactions/decision-modal.test.ts`.

```ts
test("modal model uses presentation title and instruction instead of raw prompt", () => {
  const decision: PublicChooseQuantityDecision = {
    ...quantityDecision(),
    prompt: "Choose quantity.",
    presentation: {
      title: "Draw cards",
      instruction: "Choose how many cards to draw",
    },
  };
  const draft = createDecisionDraft(decision);
  const model = createDecisionModalModel(decision, draft);

  assert.equal(model.title, "Draw cards");
  assert.equal(model.instruction, "Choose how many cards to draw");
  assert.equal(model.prompt, "Choose quantity.");
});

test("action option modal uses presentation choice labels when response keys match", () => {
  const decision: PublicPendingDecision = {
    ...baseDecision,
    type: "chooseReplacement",
    prompt: "Choose a replacement effect.",
    presentation: {
      title: "Choose replacement",
      instruction: "Choose which replacement effect to use",
      choices: [
        { responseKey: "replacement-a", label: "Rest this Character instead" },
        { responseKey: "decline", label: "Do not replace" },
      ],
    },
  };
  const actions: readonly ClientActionModel[] = [
    {
      index: 1,
      type: "respondToDecision",
      label: "Use replacement effect",
      responseKey: "replacement-a",
    },
    {
      index: 2,
      type: "respondToDecision",
      label: "Do not replace",
      responseKey: "decline",
    },
  ];
  const model = createDecisionModalModel(
    decision,
    createDecisionDraft(decision, actions),
    actions,
  );

  assert.equal(model.kind, "actionOptions");
  assert.equal(model.title, "Choose replacement");
  assert.equal(model.instruction, "Choose which replacement effect to use");
  assert.deepEqual(model.options, [
    {
      actionIndex: 1,
      label: "Rest this Character instead",
    },
    {
      actionIndex: 2,
      label: "Do not replace",
    },
  ]);
});
```

Expected failure before implementation: `DecisionModalModel` does not expose
`title` or `instruction`, and action option labels are unchanged.

- [ ] **Step 2: Run the modal model test**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/interactions/decision-modal.test.ts
```

Expected: FAIL on missing model properties.

- [ ] **Step 3: Add shared modal presentation fields**

In `packages/client/src/view-model.ts`, add `responseKey` to the client action
model branch used for `respondToDecision`, and copy it from the public legal
action when building actions.

```ts
responseKey?: string;
```

When mapping a public action:

```ts
...(action.type === "respondToDecision" && action.responseKey !== undefined
  ? { responseKey: action.responseKey }
  : {}),
```

In `packages/client/src/interactions/decision-modal.ts`, add a shared type and
intersect it into every `DecisionModalModel` variant.

```ts
interface DecisionModalPresentationModel {
  title: string;
  instruction: string;
  prompt: string;
  source?: CardRef;
}
```

For each union member, add `& DecisionModalPresentationModel` or inline these
fields. Add a helper:

```ts
const modalPresentation = (
  decision: PublicPendingDecision,
): DecisionModalPresentationModel => ({
  title: decision.presentation.title,
  instruction: decision.presentation.instruction,
  prompt: decision.prompt,
  ...(decision.presentation.source === undefined
    ? {}
    : { source: decision.presentation.source }),
});
```

Spread `...modalPresentation(decision)` into each returned model in
`createDecisionModalModel`.

- [ ] **Step 4: Prefer keyed presentation choices for action options**

Replace `actionOptionModels` with a version that accepts the decision and uses
`ClientActionModel.responseKey`.

```ts
const actionOptionModels = (
  decision: PublicPendingDecision,
  actions: readonly ClientActionModel[],
): Array<{ actionIndex: number; label: string }> => {
  const presentationChoices = new Map(
    (decision.presentation.choices ?? []).map((choice) => [
      choice.responseKey,
      choice,
    ]),
  );
  return actions
    .filter((action) => action.type === "respondToDecision")
    .map((action) => ({
      actionIndex: action.index,
      label:
        (action.responseKey === undefined
          ? undefined
          : presentationChoices.get(action.responseKey)?.label) ?? action.label,
    }));
};
```

Update calls in `createDecisionDraft` and `createDecisionModalModel` to pass
the decision. If `responseKey` is absent, keep the current legal-action label.

- [ ] **Step 5: Run the modal model test**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/interactions/decision-modal.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/view-model.ts packages/client/src/interactions/decision-modal.ts packages/client/src/interactions/decision-modal.test.ts
git commit -m "Use decision presentation in modal models"
```

---

## Task 4: Render Shared Modal Headers

**Files:**

- Modify: `packages/client/src/react/DecisionModalHost.tsx`
- Modify: `packages/client/src/react/styles/decision-modal.css`
- Test: `packages/client/src/react/decision-modal-host.test.ts`

- [ ] **Step 1: Write failing render test**

Add this test to `packages/client/src/react/decision-modal-host.test.ts`.

```ts
test("decision modal renders shared title and instruction", () => {
  const model: DecisionModalModel = {
    kind: "chooseQuantity",
    decisionId: "decision-quantity" as never,
    title: "Draw cards",
    instruction: "Choose how many cards to draw",
    prompt: "Choose quantity.",
    min: 0,
    max: 4,
    quantity: 4,
    canConfirm: true,
  };

  const markup = renderToStaticMarkup(
    createElement(DecisionModalHost, {
      model,
      disabled: false,
      onToggleCard: () => undefined,
      onChooseTrigger: () => undefined,
      onQuantity: () => undefined,
      onOption: () => undefined,
      onActionOption: () => undefined,
      onMoveOrderedCard: () => undefined,
      onPlacementDestination: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /Draw cards/u);
  assert.match(markup, /Choose how many cards to draw/u);
});
```

Expected failure before implementation: model type mismatch or instruction not
rendered.

- [ ] **Step 2: Run the modal host test**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/decision-modal-host.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Render title and instruction**

In `DecisionModalHost.tsx`, change the frame title to `model.title`.

```tsx
return (
  <ModalFrame title={model.title} className="modal-frame-decision">
    <div className="decision-modal-context">
      <p className="decision-modal-instruction">{model.instruction}</p>
    </div>
    {/* existing body renderers remain below */}
  </ModalFrame>
);
```

Keep existing body renderers unchanged.

- [ ] **Step 4: Add minimal styles**

In `packages/client/src/react/styles/decision-modal.css`, add:

```css
.decision-modal-context {
  margin: 0 0 0.5rem;
}

.decision-modal-instruction {
  margin: 0;
  color: var(--muted-text, #c9d1d9);
  font-size: 0.9rem;
  line-height: 1.3;
}
```

- [ ] **Step 5: Update existing modal host fixtures**

Every `DecisionModalModel` literal in
`packages/client/src/react/decision-modal-host.test.ts` needs:

```ts
title: "Choose cards",
instruction: "Choose cards",
prompt: "Choose cards",
```

Use specific values already implied by each test where possible.

- [ ] **Step 6: Run the modal host test**

Run:

```bash
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/react/decision-modal-host.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/react/DecisionModalHost.tsx packages/client/src/react/styles/decision-modal.css packages/client/src/react/decision-modal-host.test.ts
git commit -m "Render decision modal presentation headers"
```

---

## Task 5: Verification And Cleanup

**Files:**

- Review: all files changed by Tasks 1-4

- [ ] **Step 1: Run focused tests**

Run:

```bash
corepack pnpm --filter @optcg/engine-core exec vitest run --root ../.. packages/engine-core/src/view/filter-state-for-player-decision-presentation.test.ts packages/engine-core/src/view/filter-state-for-player-life-trigger.test.ts packages/engine-core/src/view/filter-state-for-player-trigger-order.test.ts packages/engine-core/src/view/filter-state-for-player.optional-activation.test.ts
corepack pnpm --filter @optcg/client exec vitest run --root ../.. packages/client/src/interactions/decision-modal.test.ts packages/client/src/interactions/payment-decision.test.ts packages/client/src/react/decision-modal-host.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run package typechecks**

Run:

```bash
corepack pnpm --filter @optcg/types typecheck
corepack pnpm --filter @optcg/engine-core typecheck
corepack pnpm --filter @optcg/client typecheck
```

Expected: PASS.

- [ ] **Step 3: Run repository verification**

Run:

```bash
corepack pnpm verify
```

Expected: PASS.

- [ ] **Step 4: Inspect status and recent commits**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: clean worktree and commits for the contract, projection, client model,
and modal rendering slices.

- [ ] **Step 5: Confirm verification did not create extra changes**

Run:

```bash
git status --short
git diff --check
```

Expected: `git status --short` is empty and `git diff --check` reports no
whitespace errors. If files changed, inspect them and either commit the exact
paths with a focused message or revert only generated noise caused by the
verification command.
