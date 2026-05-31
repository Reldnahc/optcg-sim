import { useState } from "react";

import type { LobbyClientState } from "../controller.js";
import { lobbyDeckStatuses } from "./useMatchClient-support.js";

export interface LobbyDeckPanelProps {
  lobbyState: LobbyClientState;
  disabled?: boolean | undefined;
  onSubmitDeckHash: (deckHash: string, donDeckCount: number) => Promise<void>;
}

export const LobbyDeckPanel = ({
  disabled = false,
  lobbyState,
  onSubmitDeckHash,
}: LobbyDeckPanelProps): React.JSX.Element => {
  const [deckHash, setDeckHash] = useState("");
  const [donDeckCount, setDonDeckCount] = useState(10);
  const { selfDeckStatus, opponentDeckStatus } = lobbyDeckStatuses(lobbyState);
  const canSubmit =
    deckHash.trim().length > 0 &&
    Number.isInteger(donDeckCount) &&
    donDeckCount > 0 &&
    donDeckCount <= 10 &&
    !disabled;

  return (
    <section className="lobby-deck-panel">
      <h2>Deck</h2>
      <form
        className="deck-hash-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = deckHash.trim();
          if (trimmed.length === 0) {
            return;
          }
          void onSubmitDeckHash(trimmed, donDeckCount);
        }}
      >
        <label className="deck-hash-field">
          <span>Deck hash</span>
          <textarea
            value={deckHash}
            disabled={disabled}
            spellCheck={false}
            rows={4}
            onChange={(event) => {
              setDeckHash(event.target.value);
            }}
          />
        </label>
        <label className="deck-hash-field">
          <span>DON deck size</span>
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={donDeckCount}
            disabled={disabled}
            onChange={(event) => {
              setDonDeckCount(Number(event.target.value));
            }}
          />
        </label>
        <button type="submit" disabled={!canSubmit}>
          Submit deck
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
    </section>
  );
};
