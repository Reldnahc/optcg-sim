import type {
  CardCategory,
  CardFilter,
  Effect,
  PlayerRef,
  SavedFieldObjectZone,
  SelectTargetsEffect,
  Target,
  TargetPlayerRef,
  TargetSelectionConstraint,
} from "@optcg/types";

export type PublicFieldSelectionZone = SavedFieldObjectZone;

export function fieldZoneForCategory(
  category: CardCategory | undefined,
): PublicFieldSelectionZone | undefined {
  if (category === "leader") return "leaderArea";
  if (category === "character") return "characterArea";
  if (category === "stage") return "stageArea";
  if (category === "don") return "costArea";
  return undefined;
}

export function effectSequence(
  effects: readonly Effect[],
  connector: "always" | "then" = "always",
): Effect | undefined {
  const firstEffect = effects[0];
  if (firstEffect === undefined) {
    return undefined;
  }

  return effects.length === 1
    ? firstEffect
    : {
        type: "sequence",
        effects: effects.map((effect, index) => ({
          connector: index === 0 ? "always" : connector,
          effect,
        })),
      };
}

export function savedFieldObjectTarget(options: {
  readonly selectionId: string;
  readonly player: TargetPlayerRef;
  readonly zone?: PublicFieldSelectionZone;
  readonly zones?: readonly PublicFieldSelectionZone[];
  readonly filter?: CardFilter;
}): Extract<Target, { type: "savedFieldObject" }> {
  return {
    type: "savedFieldObject",
    binding: {
      family: "selectedTargets",
      saveResultAs: options.selectionId,
    },
    ...(options.zone === undefined ? {} : { zone: options.zone }),
    ...(options.zones === undefined ? {} : { zones: options.zones }),
    player: options.player,
    ...(options.filter === undefined ? {} : { filter: options.filter }),
    visibility: "publicOnly",
    onFailure: "failClosed",
  };
}

export function selectThenApplyFieldTarget(options: {
  readonly selectionId: string;
  readonly selectId: string;
  readonly applyId?: string;
  readonly player: TargetPlayerRef;
  readonly chooser?: PlayerRef;
  readonly zone?: PublicFieldSelectionZone;
  readonly zones?: readonly PublicFieldSelectionZone[];
  readonly filter: CardFilter;
  readonly min: number;
  readonly max: number;
  readonly allowFewerIfUnavailable?: boolean;
  readonly selectionConstraints?: readonly TargetSelectionConstraint[];
  readonly apply: (target: Target) => Effect;
  readonly applyConnector?: Extract<
    Effect,
    { type: "sequence" }
  >["effects"][number]["connector"];
  readonly then?: (target: Target) => readonly Effect[];
}): Effect {
  const savedTarget = savedFieldObjectTarget({
    selectionId: options.selectionId,
    player: options.player,
    ...(options.zone === undefined ? {} : { zone: options.zone }),
    ...(options.zones === undefined ? {} : { zones: options.zones }),
  });

  return {
    type: "sequence",
    effects: [
      {
        id: options.selectId,
        connector: "always",
        saveResultAs: options.selectionId,
        effect: {
          type: "selectTargets",
          request: selectTargetsRequest({
            chooser: options.chooser ?? "self",
            player: options.player,
            ...(options.zone === undefined ? {} : { zone: options.zone }),
            ...(options.zones === undefined ? {} : { zones: options.zones }),
            filter: options.filter,
            min: options.min,
            max: options.max,
            allowFewerIfUnavailable: options.allowFewerIfUnavailable ?? true,
            ...(options.selectionConstraints === undefined
              ? {}
              : { selectionConstraints: options.selectionConstraints }),
          }),
        },
      },
      {
        ...(options.applyId === undefined ? {} : { id: options.applyId }),
        connector: options.applyConnector ?? "then",
        effect: options.apply(savedTarget),
      },
      ...(options.then?.(savedTarget).map((effect) => ({
        connector: "then" as const,
        effect,
      })) ?? []),
    ],
  };
}

function selectTargetsRequest(options: {
  readonly chooser: PlayerRef;
  readonly player: TargetPlayerRef;
  readonly zone?: PublicFieldSelectionZone;
  readonly zones?: readonly PublicFieldSelectionZone[];
  readonly filter: CardFilter;
  readonly min: number;
  readonly max: number;
  readonly allowFewerIfUnavailable: boolean;
  readonly selectionConstraints?: readonly TargetSelectionConstraint[];
}): SelectTargetsEffect["request"] {
  const base = {
    timing: "onResolution" as const,
    chooser: options.chooser,
    player: options.player,
    filter: options.filter,
    min: options.min,
    max: options.max,
    allowFewerIfUnavailable: options.allowFewerIfUnavailable,
    visibility: "public" as const,
    ...(options.selectionConstraints === undefined
      ? {}
      : { selectionConstraints: [...options.selectionConstraints] }),
  };

  return options.zones === undefined
    ? {
        ...base,
        zone: options.zone ?? "characterArea",
      }
    : {
        ...base,
        zones: [...options.zones],
      };
}
