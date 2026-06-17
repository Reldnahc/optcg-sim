import type {
  CardRef,
  ContinuousEffectRecord,
  Effect,
  GameState,
  TargetSpec,
} from "@optcg/types";

import {
  getUnsupportedProtectionReason,
  unsupportedProtectionMessage,
} from "../../replacement/protection-capabilities.js";
import {
  isDonPhasePlacementEffect,
  toSupportedDonPhasePlacementModifier,
} from "./don-phase-placement-modifier.js";
import { toInvalidateEffectsModifier } from "./effect-invalidation-modifier.js";
import { toPermanentBasePowerModifier } from "./permanent-base-power.js";
import {
  isSupportedCostModifierEffect,
  isSupportedDerivedKeyword,
  isSupportedDuration,
  isSupportedTarget,
} from "./support.js";
import {
  resolveDynamicNumberValue,
  resolvePowerValue,
} from "./value-resolution.js";

export const unsupportedDerivedMessage = (reason: string): string =>
  `Unsupported continuous effect materialization: ${reason}.`;

export const costModifierTargetForEffect = (
  effect: Extract<Effect, { type: "modifyCost" }>,
): TargetSpec => {
  if (effect.target !== undefined) {
    return effect.target;
  }
  return {
    type: "allMatching",
    zone: effect.sourceZone ?? "hand",
    player: effect.player,
    ...(effect.filter === undefined ? {} : { filter: effect.filter }),
  };
};

export const effectToDerivedModifier = (
  state: GameState,
  source: CardRef,
  effect: Effect,
): ContinuousEffectRecord["modifier"] | null => {
  if (effect.type === "modifyPower") {
    const value = resolvePowerValue(state, effect.value, {
      controllerId: source.playerId,
      source,
    });
    if (value === null) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported dynamic power value"),
      );
    }
    if (
      effect.target.type !== "self" &&
      effect.target.type !== "myLeader" &&
      !(effect.target.type === "all" && isSupportedTarget(effect.target))
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported power target"),
      );
    }
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported power duration"),
      );
    }
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(unsupportedDerivedMessage("unsupported power value"));
    }
    return {
      layer: "powerAdd",
      target: effect.target,
      operation: { type: "addPower", value },
    };
  }
  if (effect.type === "giveKeyword") {
    if (effect.target.type !== "self" && effect.target.type !== "myLeader") {
      if (!(effect.target.type === "all" && isSupportedTarget(effect.target))) {
        throw new TypeError(
          unsupportedDerivedMessage("unsupported keyword target"),
        );
      }
    }
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported keyword duration"),
      );
    }
    if (!isSupportedDerivedKeyword(effect.keyword)) {
      throw new TypeError(unsupportedDerivedMessage("unsupported keyword"));
    }
    return {
      layer: "keywordAdd",
      target: effect.target,
      operation: { type: "addKeyword", keyword: effect.keyword },
    };
  }
  if (effect.type === "setPowerToZero") {
    if (!isSupportedTarget(effect.target)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported power set target"),
      );
    }
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported power set duration"),
      );
    }
    return {
      layer: "powerSet",
      target: effect.target,
      operation: { type: "setPower", value: 0 },
    };
  }
  if (effect.type === "allowAttackActiveCharacters") {
    if (
      effect.target.type !== "self" &&
      effect.target.type !== "myLeader" &&
      !(effect.target.type === "all" && isSupportedTarget(effect.target))
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported attack permission target"),
      );
    }
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported attack permission duration"),
      );
    }
    return {
      layer: "attackPermission",
      target: effect.target,
      operation: {
        type: "attackPermission",
        permission: "attackActiveCharacters",
      },
    };
  }
  if (effect.type === "giveAttribute") {
    if (effect.target.type !== "self" && effect.target.type !== "myLeader") {
      if (!(effect.target.type === "all" && isSupportedTarget(effect.target))) {
        throw new TypeError(
          unsupportedDerivedMessage("unsupported attribute target"),
        );
      }
    }
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported attribute duration"),
      );
    }
    return {
      layer: "attributeAdd",
      target: effect.target,
      operation: { type: "addAttribute", attribute: effect.attribute },
    };
  }
  if (effect.type === "setBasePower") {
    return toPermanentBasePowerModifier(
      state,
      source,
      effect,
      unsupportedDerivedMessage,
    );
  }
  if (effect.type === "modifyCost") {
    if (!isSupportedCostModifierEffect(effect)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported cost modifier shape"),
      );
    }
    const value = resolveDynamicNumberValue(state, effect.value, {
      controllerId: source.playerId,
      source,
    });
    if (value === null) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported dynamic cost value"),
      );
    }
    return {
      layer: "costAdd",
      target: costModifierTargetForEffect(effect),
      operation: { type: "addCost", value },
    };
  }
  if (effect.type === "modifyCounter") {
    if (
      effect.player !== "self" ||
      effect.sourceZone !== "hand" ||
      !Number.isSafeInteger(effect.value) ||
      effect.value < 0
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported counter modifier shape"),
      );
    }
    return {
      layer: "counterSet",
      target: {
        type: "allMatching",
        zone: "hand",
        player: effect.player,
        ...(effect.filter === undefined ? {} : { filter: effect.filter }),
      },
      operation: { type: "setCounter", value: effect.value },
    };
  }
  if (isDonPhasePlacementEffect(effect)) {
    return toSupportedDonPhasePlacementModifier(effect, {
      supportsDuration: isSupportedDuration(effect.duration),
    });
  }
  if (effect.type === "invalidateEffects") {
    return toInvalidateEffectsModifier(effect);
  }
  if (effect.type === "invalidateEffectEntryPoint") {
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage(
          "unsupported effect entry-point invalidation",
        ),
      );
    }
    return {
      layer: "effectInvalidation",
      target: { type: "player", player: effect.player },
      operation: {
        type: "invalidateEffectEntryPoint",
        effectEntryPoint: effect.effectEntryPoint,
      },
    };
  }
  if (effect.type === "protectFromKO") {
    if (
      !isSupportedTarget(effect.target) ||
      !isSupportedDuration(effect.duration)
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported ko protection shape"),
      );
    }
    return {
      layer: "protection",
      target: effect.target,
      operation: {
        type: "protection",
        protection: {
          process: "ko",
          ...(effect.sourceKind === undefined
            ? {}
            : { sourceKind: effect.sourceKind }),
          ...(effect.sourceControllerRelation === undefined
            ? {}
            : { sourceControllerRelation: effect.sourceControllerRelation }),
          ...(effect.sourceCardCategories === undefined
            ? {}
            : { sourceCardCategories: effect.sourceCardCategories }),
        },
      },
    };
  }
  if (
    effect.type === "cannotAttack" ||
    effect.type === "cannotAttackTarget" ||
    effect.type === "attackCost" ||
    effect.type === "cannotBlock" ||
    effect.type === "preventBlockerActivation" ||
    effect.type === "preventPlayByEffects" ||
    effect.type === "cannotBecomeActive"
  ) {
    if (
      (!(
        effect.type === "preventBlockerActivation" &&
        effect.target.type === "myLeader"
      ) &&
        !(
          effect.type === "cannotAttackTarget" &&
          effect.target.type === "myLeader"
        ) &&
        !isSupportedTarget(effect.target)) ||
      !isSupportedDuration(effect.duration)
    ) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported restriction shape"),
      );
    }
    return {
      layer: "restriction",
      target: effect.target,
      operation:
        effect.type === "attackCost"
          ? { type: "attackCost", cost: effect.cost }
          : effect.type === "cannotAttackTarget"
            ? {
                type: "targetRestriction",
                restriction: "cannotAttack",
                attackTarget: effect.attackTarget,
              }
            : { type: "restriction", restriction: effect.type },
    };
  }
  if (effect.type === "enterRested") {
    if (!isSupportedDuration(effect.duration)) {
      throw new TypeError(
        unsupportedDerivedMessage("unsupported entry-state shape"),
      );
    }
    return {
      layer: "playEntryState",
      target: { type: "player", player: effect.player },
      operation: { type: "enterRested", filter: effect.filter },
    };
  }
  if (effect.type !== "giveProtection") {
    return null;
  }
  if (
    !isSupportedTarget(effect.target) ||
    !isSupportedDuration(effect.duration)
  ) {
    throw new TypeError(
      unsupportedDerivedMessage("unsupported protection shape"),
    );
  }
  const unsupportedProtectionReason = getUnsupportedProtectionReason(
    effect.protection,
  );
  if (unsupportedProtectionReason !== undefined) {
    throw new TypeError(
      unsupportedProtectionMessage(unsupportedProtectionReason, {
        fallbackMessage: unsupportedDerivedMessage(
          "unsupported protection shape",
        ),
      }),
    );
  }
  return {
    layer: "protection",
    target: effect.target,
    operation: { type: "protection", protection: effect.protection },
  };
};
