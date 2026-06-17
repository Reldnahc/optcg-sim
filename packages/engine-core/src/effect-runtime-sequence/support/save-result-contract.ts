import type {
  Effect,
  SavedFieldObjectReferenceFamily,
  SequenceSaveResultKind,
} from "@optcg/types";

import {
  savedSelectedCardsKindForSelectCardsSegment,
  savedSelectedCardsKindForSelectTargetsSegment,
  type SavedSelectedCardsKind,
} from "./selection.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
export type SequenceSegment = SequenceEffect["effects"][number];

export type SelectedCardsCapability = {
  readonly kind: "selectedCards";
  readonly cardKind: SavedSelectedCardsKind;
  readonly max?: number;
};

export type SavedReferenceCapability =
  | SelectedCardsCapability
  | { readonly kind: "selectedTargets" }
  | { readonly kind: "paidCost" }
  | { readonly kind: "producedObjects" }
  | { readonly kind: "chosenNumber" };

export interface StaticSavedReferenceCapabilities {
  readonly capabilities: readonly SavedReferenceCapability[];
}

export interface StaticSavedResultState {
  readonly references: ReadonlyMap<string, StaticSavedReferenceCapabilities>;
  readonly transientSets: ReadonlySet<string>;
}

export const emptyStaticSavedResultState = (
  initial: Record<string, readonly SavedReferenceCapability[]> = {},
): StaticSavedResultState => ({
  references: new Map(
    Object.entries(initial).map(([id, capabilities]) => [id, { capabilities }]),
  ),
  transientSets: new Set(),
});

export const cloneStaticSavedResultState = (
  state: StaticSavedResultState,
): StaticSavedResultState => ({
  references: new Map(
    [...state.references.entries()].map(([id, value]) => [
      id,
      { capabilities: [...value.capabilities] },
    ]),
  ),
  transientSets: new Set(state.transientSets),
});

const sameCapability = (
  a: SavedReferenceCapability,
  b: SavedReferenceCapability,
): boolean =>
  a.kind === b.kind &&
  (a.kind !== "selectedCards" ||
    (b.kind === "selectedCards" &&
      a.cardKind === b.cardKind &&
      a.max === b.max));

export const addCapability = (
  state: StaticSavedResultState,
  id: string,
  capability: SavedReferenceCapability,
): StaticSavedResultState => {
  const existing = state.references.get(id)?.capabilities ?? [];
  const capabilities = existing.some((item) => sameCapability(item, capability))
    ? existing
    : [...existing, capability];

  return {
    references: new Map(state.references).set(id, { capabilities }),
    transientSets: new Set(state.transientSets),
  };
};

export const addTransientSet = (
  state: StaticSavedResultState,
  id: string,
): StaticSavedResultState => ({
  references: new Map(state.references),
  transientSets: new Set(state.transientSets).add(id),
});

export const hasReferenceCapability = (
  state: StaticSavedResultState,
  id: unknown,
  predicate: (capability: SavedReferenceCapability) => boolean,
): boolean =>
  state.references.get(String(id))?.capabilities.some(predicate) ?? false;

const addCapabilities = (
  state: StaticSavedResultState,
  id: string,
  capabilities: readonly SavedReferenceCapability[],
): StaticSavedResultState =>
  capabilities.reduce(
    (nextState, capability) => addCapability(nextState, id, capability),
    state,
  );

const selectedCardsKindToSaveResultKind = (
  kind: SavedSelectedCardsKind,
): SequenceSaveResultKind => `selectedCards:${kind}`;

const inferredSaveResultKindsForSegment = (
  segment: SequenceSegment,
): readonly SequenceSaveResultKind[] | null => {
  const kinds: SequenceSaveResultKind[] = [];
  const saveResultAs = segment.saveResultAs;
  if (segment.effect.type === "selectCards") {
    const selectedCardsKind = savedSelectedCardsKindForSelectCardsSegment(
      segment.effect,
    );
    if (selectedCardsKind !== undefined) {
      kinds.push(selectedCardsKindToSaveResultKind(selectedCardsKind));
    } else {
      return null;
    }
  } else if (saveResultAs !== undefined) {
    if (segment.effect.type === "selectTargets") {
      kinds.push("selectedTargets");
      const selectedTargetsCardsKind =
        savedSelectedCardsKindForSelectTargetsSegment(segment.effect);
      if (selectedTargetsCardsKind !== undefined) {
        kinds.push(selectedCardsKindToSaveResultKind(selectedTargetsCardsKind));
      }
    } else if (segment.effect.type === "selectAllTargets") {
      kinds.push("selectedTargets");
    } else if (segment.effect.type === "payCost") {
      kinds.push("paidCost");
    } else if (
      segment.effect.type === "draw" ||
      segment.effect.type === "playSelected"
    ) {
      kinds.push("producedObjects");
    } else if (
      segment.effect.type === "trashFromHand" ||
      segment.effect.type === "trashFromHandUntilCount"
    ) {
      kinds.push("selectedCards:hand");
    } else if (
      segment.effect.type !== "revealTop" &&
      segment.effect.type !== "selectFromSet" &&
      segment.effect.type !== "chooseNumber" &&
      segment.effect.type !== "drawUpTo"
    ) {
      return null;
    }
  }
  if (segment.effect.type === "revealTop") {
    kinds.push("selectedCards:set");
  }
  if (segment.effect.type === "selectFromSet") {
    kinds.push("selectedCards:set");
  }
  if (segment.effect.type === "chooseNumber") {
    kinds.push("chosenNumber");
  }
  if (
    segment.effect.type === "drawUpTo" &&
    saveAsFromEffect(segment.effect) !== undefined
  ) {
    kinds.push("chosenNumber");
  }
  if (segment.effect.type === "forEachSavedTarget") {
    kinds.push("selectedTargets");
  }
  return kinds;
};

const sameSaveResultKindSet = (
  actual: readonly SequenceSaveResultKind[],
  expected: readonly SequenceSaveResultKind[],
): boolean => {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return (
    actualSet.size === expectedSet.size &&
    [...actualSet].every((kind) => expectedSet.has(kind))
  );
};

const hasMatchingExplicitSaveResultKinds = (
  segment: SequenceSegment,
): boolean => {
  const explicit = segment.saveResultKinds;
  if (explicit === undefined) {
    return true;
  }
  const inferred = inferredSaveResultKindsForSegment(segment);
  return inferred !== null && sameSaveResultKindSet(explicit, inferred);
};

const saveAsFromEffect = (effect: Effect): string | undefined => {
  if ("saveAs" in effect && typeof effect.saveAs === "string") {
    return effect.saveAs;
  }
  return undefined;
};

const recordSaveResultAsProducer = (
  state: StaticSavedResultState,
  segment: SequenceSegment,
): StaticSavedResultState | null => {
  if (segment.effect.type === "selectCards") {
    const selectedCardsKind = savedSelectedCardsKindForSelectCardsSegment(
      segment.effect,
    );
    return selectedCardsKind === undefined
      ? null
      : addCapability(state, segment.effect.saveAs, {
          kind: "selectedCards",
          cardKind: selectedCardsKind,
          max: segment.effect.max,
        });
  }

  const saveResultAs = segment.saveResultAs;
  if (saveResultAs === undefined) {
    return state;
  }

  if (segment.effect.type === "selectTargets") {
    const selectedTargetsCapabilities: SavedReferenceCapability[] = [
      { kind: "selectedTargets" },
    ];
    const selectedTargetsCardsKind =
      savedSelectedCardsKindForSelectTargetsSegment(segment.effect);
    if (selectedTargetsCardsKind !== undefined) {
      selectedTargetsCapabilities.push({
        kind: "selectedCards",
        cardKind: selectedTargetsCardsKind,
        max: segment.effect.request.max,
      });
    }
    return addCapabilities(state, saveResultAs, selectedTargetsCapabilities);
  }

  if (segment.effect.type === "selectAllTargets") {
    return addCapability(state, saveResultAs, {
      kind: "selectedTargets",
    });
  }

  if (segment.effect.type === "payCost") {
    return addCapability(state, saveResultAs, { kind: "paidCost" });
  }

  if (
    segment.effect.type === "draw" ||
    segment.effect.type === "playSelected"
  ) {
    return addCapability(state, saveResultAs, {
      kind: "producedObjects",
    });
  }
  if (
    segment.effect.type === "trashFromHand" ||
    segment.effect.type === "trashFromHandUntilCount"
  ) {
    const maxCount =
      segment.effect.type === "trashFromHand"
        ? segment.effect.count
        : undefined;
    if (maxCount !== undefined && typeof maxCount !== "number") {
      return null;
    }
    const capability: SelectedCardsCapability = {
      kind: "selectedCards",
      cardKind: "hand",
      ...(maxCount === undefined ? {} : { max: maxCount }),
    };
    return addCapability(state, saveResultAs, capability);
  }
  if (
    segment.effect.type === "revealTop" ||
    segment.effect.type === "selectFromSet" ||
    segment.effect.type === "chooseNumber" ||
    segment.effect.type === "drawUpTo"
  ) {
    return state;
  }

  return null;
};

export const recordProducer = (
  state: StaticSavedResultState,
  segment: SequenceSegment,
): StaticSavedResultState | null => {
  if (!hasMatchingExplicitSaveResultKinds(segment)) {
    return null;
  }
  const saveResultState = recordSaveResultAsProducer(state, segment);
  if (saveResultState === null) {
    return null;
  }

  if (segment.effect.type === "revealTop") {
    const saveAs = segment.effect.saveAs;
    return addTransientSet(
      addCapability(saveResultState, saveAs, {
        kind: "selectedCards",
        cardKind: "set",
      }),
      saveAs,
    );
  }
  if (segment.effect.type === "selectFromSet") {
    return addCapability(saveResultState, segment.effect.saveAs, {
      kind: "selectedCards",
      cardKind: "set",
      max: segment.effect.max,
    });
  }
  if (segment.effect.type === "chooseNumber") {
    return addCapability(saveResultState, segment.effect.saveAs, {
      kind: "chosenNumber",
    });
  }
  if (segment.effect.type === "drawUpTo") {
    const saveAs = saveAsFromEffect(segment.effect);
    return saveAs === undefined
      ? saveResultState
      : addCapability(saveResultState, saveAs, { kind: "chosenNumber" });
  }
  if (segment.effect.type === "forEachSavedTarget") {
    return addCapability(saveResultState, segment.effect.saveCurrentAs, {
      kind: "selectedTargets",
    });
  }
  return saveResultState;
};

export const canConsumeSelectedCards = (
  state: StaticSavedResultState,
  selection: unknown,
  allowed: readonly SavedSelectedCardsKind[],
  options: { readonly max?: number } = {},
): boolean =>
  hasReferenceCapability(
    state,
    selection,
    (capability) =>
      capability.kind === "selectedCards" &&
      allowed.includes(capability.cardKind) &&
      (options.max === undefined ||
        (capability.max !== undefined && capability.max <= options.max)),
  );

export const canConsumeSavedFieldObject = (
  state: StaticSavedResultState,
  family: SavedFieldObjectReferenceFamily,
  saveResultAs: string,
): boolean => {
  const expected: Record<
    SavedFieldObjectReferenceFamily,
    SavedReferenceCapability["kind"]
  > = {
    selectedTargets: "selectedTargets",
    forEachSavedTarget: "selectedTargets",
    producedObjects: "producedObjects",
    paidCost: "paidCost",
  };

  return hasReferenceCapability(
    state,
    saveResultAs,
    (capability) => capability.kind === expected[family],
  );
};

export const canConsumeNumber = (
  state: StaticSavedResultState,
  selection: unknown,
): boolean =>
  hasReferenceCapability(
    state,
    selection,
    (capability) => capability.kind === "chosenNumber",
  );

export const canConsumeTransientSet = (
  state: StaticSavedResultState,
  set: unknown,
): boolean => state.transientSets.has(String(set));

export const canConstrainByOwner = (
  state: StaticSavedResultState,
  selection: unknown,
): boolean =>
  hasReferenceCapability(
    state,
    selection,
    (capability) =>
      capability.kind === "selectedCards" ||
      capability.kind === "selectedTargets",
  );
