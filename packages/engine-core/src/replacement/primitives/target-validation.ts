import type { CardRef, EngineError, GameState } from "@optcg/types";

import { cardRefsEqual } from "../field-removal-targets.js";
import { failure } from "./errors.js";
import { findCardByInstanceId } from "./source-lookup.js";
import type { ValidatedReplacementTarget } from "./types.js";

export const validateKoReplacementTarget = (
  state: GameState,
  effectId: string,
  target: CardRef,
):
  | ({ ok: true } & ValidatedReplacementTarget)
  | {
      ok: false;
      error: EngineError;
    } => {
  const located = findCardByInstanceId(state, target.instanceId);
  if (located === null) return failure(effectId, "missing-card");
  if (
    located.zone === "hand" ||
    located.zone === "deck" ||
    located.zone === "donDeck" ||
    located.zone === "life"
  ) {
    return failure(effectId, "private-target");
  }
  if (located.zone !== "characterArea" && located.zone !== "stageArea") {
    return failure(
      effectId,
      located.zone === "leaderArea" ? "non-character-target" : "stale-target",
    );
  }

  const ref: CardRef = {
    instanceId: located.card.instanceId,
    cardId: located.card.cardId,
    playerId: located.playerId,
    zone: located.card.zone,
  };
  if (!cardRefsEqual(target, ref)) return failure(effectId, "stale-target");

  const resolved = state.cardManifest.cards[located.card.cardId];
  if (resolved === undefined) return failure(effectId, "missing-card");
  if (
    (located.zone === "characterArea" && resolved.category !== "character") ||
    (located.zone === "stageArea" && resolved.category !== "stage")
  ) {
    return failure(effectId, "non-character-target");
  }
  return { ok: true, located, ref, resolved };
};

export const validateKoReplacementTargets = (
  state: GameState,
  effectId: string,
  targets: readonly CardRef[],
):
  | { ok: true; targets: readonly ValidatedReplacementTarget[] }
  | { ok: false; error: EngineError } => {
  if (targets.length === 0) {
    return failure(effectId, "unsupported-replacement-process");
  }
  const validated: ValidatedReplacementTarget[] = [];
  for (const target of targets) {
    const lookup = validateKoReplacementTarget(state, effectId, target);
    if (!lookup.ok) {
      return lookup;
    }
    validated.push(lookup);
  }
  return { ok: true, targets: validated };
};
