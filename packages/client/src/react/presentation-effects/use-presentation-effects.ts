import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { EngineEvent } from "@optcg/types";

import type { BoardViewModel } from "../../view-model.js";
import { planAttentionSoundIntent } from "./attention-sound-planner.js";
import { planPresentationEventIntents } from "./event-presentation-intents.js";
import { planEventSoundIntents } from "./event-sound-planner.js";
import {
  planCardMovementIntents,
  type CardMovementIntent,
  type PresentationSnapshot,
} from "./movement-planner.js";
import { collectPresentationSnapshot } from "./position-registry.js";
import { playPresentationSoundIntents } from "./sound-controller.js";
import { planSoundIntents } from "./sound-planner.js";

const movementDurationMs = 150;

export interface PresentationEffectsController {
  movements: readonly CardMovementIntent[];
}

export const usePresentationEffects = (input: {
  rootRef: RefObject<HTMLElement | null>;
  board: BoardViewModel;
  events: readonly EngineEvent[];
  soundEnabled?: boolean | undefined;
}): PresentationEffectsController => {
  const previousSnapshotRef = useRef<PresentationSnapshot | undefined>(
    undefined,
  );
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const clearTimerRef = useRef<number | undefined>(undefined);
  const previousLocalActiveRef = useRef<boolean>(false);
  const [movements, setMovements] = useState<readonly CardMovementIntent[]>([]);

  useLayoutEffect(() => {
    const root = input.rootRef.current;
    if (root === null) {
      return;
    }

    const currentSnapshot = collectPresentationSnapshot(root, input.board);
    const newEvents = input.events.filter((event) => {
      const id = String(event.id);
      if (seenEventIdsRef.current.has(id)) {
        return false;
      }
      seenEventIdsRef.current.add(id);
      return true;
    });
    const presentationEventIntents = planPresentationEventIntents({
      events: newEvents,
      currentPlayerId: input.board.playerId,
    });
    const plannedMovements = planCardMovementIntents({
      previous: previousSnapshotRef.current,
      current: currentSnapshot,
      events: newEvents,
      presentationEventIntents,
      currentPlayerId: input.board.playerId,
    });
    previousSnapshotRef.current = currentSnapshot;

    const movementSoundIntents = planSoundIntents(plannedMovements);
    const movementEventIds = new Set(
      plannedMovements.flatMap((movement) =>
        movement.eventId === undefined ? [] : [movement.eventId],
      ),
    );
    const eventSoundIntents = planEventSoundIntents({
      intents: presentationEventIntents,
      movementEventIds,
      currentPlayerId: input.board.playerId,
    });
    const currentLocalActive =
      input.board.selfIsTurnPlayer ||
      (input.board.activeCardInstanceIds !== undefined &&
        input.board.activeCardInstanceIds.length > 0);
    const activationKey =
      input.board.statusBanner === undefined
        ? `active:${String(currentLocalActive)}`
        : `turn:${String(input.board.statusBanner.turnNumber)}:${input.board.statusBanner.tone}`;
    const attentionSoundIntents = planAttentionSoundIntent({
      previousLocalActive: previousLocalActiveRef.current,
      currentLocalActive,
      documentHidden: typeof document !== "undefined" ? document.hidden : false,
      windowFocused:
        typeof document !== "undefined" &&
        typeof document.hasFocus === "function"
          ? document.hasFocus()
          : true,
      activationKey,
    });
    previousLocalActiveRef.current = currentLocalActive;
    const soundIntents = [
      ...movementSoundIntents,
      ...eventSoundIntents,
      ...attentionSoundIntents,
    ];

    if (plannedMovements.length > 0) {
      setMovements(plannedMovements);
    }
    if (soundIntents.length > 0) {
      playPresentationSoundIntents(soundIntents, {
        enabled: input.soundEnabled ?? true,
      });
    }
    if (plannedMovements.length === 0) {
      return;
    }
    if (clearTimerRef.current !== undefined) {
      window.clearTimeout(clearTimerRef.current);
    }
    clearTimerRef.current = window.setTimeout(() => {
      setMovements([]);
      clearTimerRef.current = undefined;
    }, movementDurationMs);
  }, [input.board, input.events, input.rootRef, input.soundEnabled]);

  return { movements };
};
