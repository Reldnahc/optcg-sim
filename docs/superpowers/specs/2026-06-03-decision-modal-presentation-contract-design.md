# Decision Modal Presentation Contract Design

## Goal

Decision modals must explain both why a decision exists and what each response
will do. The client should not infer this from generic action labels such as
`Pay cost`, `Choose 1 card`, or `Use replacement effect`.

The fix is contract-first: public pending decisions expose hidden-info-safe
presentation data, and the client renders that data through reusable modal
components.

## Current Problem

Public pending decisions already expose `prompt`, `causedBy`, optional `source`,
and specialized payloads for several interaction shapes. Some important
decisions still project as generic public decisions, so the client must recover
meaning from legal-action labels.

That is not enough for decisions such as optional costs, replacement effects,
trigger ordering, life triggers, and quantity choices. The user can see a modal
without enough context to know what card or effect is being resolved, what zone
is involved, or what a choice actually means.

## Public Contract Shape

Every public pending decision must include a reusable presentation object.

```ts
interface PublicDecisionPresentation {
  title: string;
  instruction: string;
  source?: CardRef;
  sourceLabel?: string;
  effectText?: string;
  choices?: PublicDecisionChoicePresentation[];
}

interface PublicDecisionChoicePresentation {
  responseKey: string;
  label: string;
  description?: string;
  cards?: CardRef[];
  zones?: Zone[];
  count?: { min: number; max: number };
  disabled?: boolean;
}
```

The exact type names can be adjusted to fit the local type style, but the
boundary is fixed: modal meaning comes from public decision presentation, not
from client-side string guessing.

The projection layer must preserve hidden information. It may include visible
source cards, visible selected cards, known zones, and safe choice descriptions.
It must not expose private card identities, private unrevealed cards, hidden
effect metadata, or internal engine ids beyond values already safe for the
player view.

## Client Rendering Shape

The client must normalize each `PublicPendingDecision` into one
`DecisionPresentationModel` before rendering.

Each modal frame gets the same header:

- title
- visible source card preview, when present
- instruction
- optional safe effect/context text

The body renderer is selected by interaction shape:

- card grid for card choices
- board or zone click for visible hand, field, and life choices
- reorder list for ordered cards
- slider or yes/no control for quantity
- option list for abstract choices
- trigger card picker for simultaneous triggers
- replacement option picker for replacement effects

The modal body owns interaction mechanics only. It does not invent the meaning
of the decision.

## First Implementation Slice

Implement the presentation contract and wire it through these decision families:

- `payCost`
- `chooseReplacement`
- `chooseOptionalActivation`
- `chooseTriggerOrder`
- `confirmLifeTrigger`
- `chooseQuantity`

Keep existing specialized card, order, and quantity renderers where they work,
but feed them contract-provided title, instruction, and choice labels.

The first slice does not need to redesign modal visuals globally. It should make
the data model correct and prove that the worst-offending modals carry enough
information.

## Expected UX Outcomes

- Cost modals say what cost is being paid, such as `Trash 1 card from hand` or
  `Add 1 life to hand to pay cost`.
- Replacement modals show the available replacement choices with visible source
  context when safe.
- Trigger-order modals clearly say to choose the next trigger to resolve and
  show the visible trigger source cards.
- Quantity modals say what quantity is being chosen.
- Life trigger modals show the trigger card and explicit options.

## Tests

Add contract/projection tests proving:

- public decisions include presentation title and instruction
- cost decisions expose safe cost context without hidden card leaks
- replacement decisions expose distinct option labels and visible source context
- trigger-order decisions expose visible trigger source cards
- life-trigger decisions expose the revealed trigger card and explicit choices
- quantity decisions expose an action-specific instruction

Add client tests proving:

- modal headers render presentation data
- modal body renderers still handle card grids, trigger choices, quantity, and
  generic option choices
- legal-action labels are fallback data, not the primary source of modal meaning

## Non-Goals

- Do not change gameplay behavior.
- Do not redesign the whole modal visual system in this slice.
- Do not move hidden engine metadata into public views.
- Do not make the client parse engine ids or effect text to infer decision
  meaning.
