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
  onRefreshLoadouts: () => void;
  onSubmitLoadout: (loadoutId: string) => Promise<void>;
}

export const LobbyDeckPanel = ({
  disabled = false,
  lobbyState,
  loadouts,
  loadoutsStatus,
  loadoutsError,
  onRefreshLoadouts,
  onSubmitLoadout,
}: LobbyDeckPanelProps): React.JSX.Element => {
  const [selectedLoadoutId, setSelectedLoadoutId] = useState(
    loadouts[0]?.id ?? "",
  );
  const { selfDeckStatus, opponentDeckStatus } = lobbyDeckStatuses(lobbyState);
  const selectedLoadoutExists = loadouts.some(
    (loadout) => loadout.id === selectedLoadoutId,
  );
  const pickerLocked = selfDeckStatus === "ready";
  const canSubmit = selectedLoadoutExists && !disabled && !pickerLocked;
  const refreshDisabled =
    disabled || pickerLocked || loadoutsStatus === "loading";

  useEffect(() => {
    if (!selectedLoadoutExists) {
      setSelectedLoadoutId(loadouts[0]?.id ?? "");
    }
  }, [loadouts, selectedLoadoutExists]);

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
            void onSubmitLoadout(selectedLoadoutId);
          }}
        >
          <div className="deck-hash-field">
            <DeckLoadoutPicker
              selectedLoadoutId={selectedLoadoutId}
              disabled={disabled || loadoutsStatus !== "ready"}
              locked={pickerLocked}
              loadouts={loadouts}
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
              Refresh decks
            </button>
          </div>
          <button
            className="deck-loadout-submit-button"
            type="submit"
            disabled={!canSubmit}
          >
            Submit
          </button>
        </form>
        <dl className="deck-status-list">
          <div>
            <dt>Your deck</dt>
            <dd>{selfDeckStatus ?? "missing"}</dd>
          </div>
          <div>
            <dt>Opponent deck</dt>
            <dd>{opponentDeckStatus ?? "missing"}</dd>
          </div>
        </dl>
      </div>
    </ModalFrame>
  );
};
