import { useEffect, useState } from "react";

import type { AccountLoadout } from "../account-client.js";
import type { LobbyClientState } from "../controller.js";
import { DeckLoadoutPicker } from "./DeckLoadoutPicker.js";
import { ModalFrame } from "./ModalFrame.js";
import { lobbyDeckStatuses } from "./useMatchClient-support.js";

export interface LobbyDeckPanelProps {
  lobbyState: LobbyClientState;
  disabled?: boolean | undefined;
  loadouts: readonly AccountLoadout[];
  loadoutsStatus: "idle" | "loading" | "ready" | "error";
  loadoutsError?: string | undefined;
  preferredLoadoutId?: string | undefined;
  requirePlayableValidation?: boolean | undefined;
  onRefreshLoadouts: () => void;
  onSubmitLoadout: (loadoutId: string) => Promise<void>;
}

const initialSelectedLoadoutId = (
  loadouts: readonly AccountLoadout[],
  preferredLoadoutId: string | undefined,
): string =>
  preferredLoadoutId !== undefined &&
  loadouts.some((loadout) => loadout.id === preferredLoadoutId)
    ? preferredLoadoutId
    : (loadouts[0]?.id ?? "");

export const LobbyDeckPanel = ({
  disabled = false,
  lobbyState,
  loadouts,
  loadoutsStatus,
  loadoutsError,
  preferredLoadoutId,
  requirePlayableValidation = true,
  onRefreshLoadouts,
  onSubmitLoadout,
}: LobbyDeckPanelProps): React.JSX.Element => {
  const [selectedLoadoutId, setSelectedLoadoutId] = useState(() =>
    initialSelectedLoadoutId(loadouts, preferredLoadoutId),
  );
  const { selfDeckStatus } = lobbyDeckStatuses(lobbyState);
  const selectedLoadout = loadouts.find(
    (loadout) => loadout.id === selectedLoadoutId,
  );
  const selectedLoadoutExists = loadouts.some(
    (loadout) => loadout.id === selectedLoadoutId,
  );
  const pickerLocked = selfDeckStatus === "ready";
  const selectedLoadoutPlayable =
    !requirePlayableValidation ||
    selectedLoadout?.validation?.status === "playable" ||
    selectedLoadout?.validation?.status === "unchecked";
  const submitLabel = pickerLocked ? "Waiting for opponent" : "Submit";
  const canSubmit =
    selectedLoadoutExists &&
    selectedLoadoutPlayable &&
    !disabled &&
    !pickerLocked;
  const refreshDisabled =
    disabled || pickerLocked || loadoutsStatus === "loading";

  useEffect(() => {
    if (!selectedLoadoutExists) {
      setSelectedLoadoutId(
        initialSelectedLoadoutId(loadouts, preferredLoadoutId),
      );
    }
  }, [loadouts, preferredLoadoutId, selectedLoadoutExists]);

  return (
    <ModalFrame className="lobby-deck-modal">
      <div className="lobby-deck-panel">
        <form
          className="deck-hash-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedLoadoutExists) {
              return;
            }
            if (!selectedLoadoutPlayable) {
              return;
            }
            void onSubmitLoadout(selectedLoadoutId);
          }}
        >
          <div className="deck-loadout-form-content">
            <div className="deck-hash-field">
              <DeckLoadoutPicker
                selectedLoadoutId={selectedLoadoutId}
                disabled={disabled || loadoutsStatus !== "ready"}
                locked={pickerLocked}
                loadouts={loadouts}
                requirePlayableValidation={requirePlayableValidation}
                onChange={setSelectedLoadoutId}
              />
            </div>
            {loadoutsStatus === "error" ? (
              <p className="error-text">
                {loadoutsError ?? "Unable to load account loadouts."}
              </p>
            ) : null}
            {loadoutsStatus === "ready" && loadouts.length === 0 ? (
              <p>No account loadouts are available.</p>
            ) : null}
            <div className="deck-loadout-actions">
              <a
                className="deck-editor-link"
                href="https://poneglyph.one/decks"
                target="_blank"
                rel="noreferrer"
              >
                Open deck editor
              </a>
              <span className="deck-loadout-loading">
                {loadoutsStatus === "loading" ? "Loading loadouts..." : ""}
              </span>
              <button
                className="deck-loadout-refresh-button"
                type="button"
                disabled={refreshDisabled}
                onClick={onRefreshLoadouts}
              >
                <span className="deck-loadout-refresh-icon" aria-hidden="true">
                  ↻
                </span>
                <span>Refresh decks</span>
              </button>
            </div>
          </div>
          <div className="deck-loadout-submit-footer">
            <button
              className="deck-loadout-submit-button modal-submit-button"
              type="submit"
              disabled={!canSubmit}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
};
