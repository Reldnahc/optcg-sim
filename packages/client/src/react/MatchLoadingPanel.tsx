import { useState } from "react";

export interface MatchLoadingPanelProps {
  firstPlayerSetup: boolean;
  lobbyId?: string | undefined;
  selfDeckStatus?: "missing" | "ready" | "invalid" | undefined;
  opponentDeckStatus?: "missing" | "ready" | "invalid" | undefined;
  disabled?: boolean | undefined;
  onSubmitDeckHash?: ((deckHash: string) => Promise<void>) | undefined;
}

export const MatchLoadingPanel = ({
  disabled = false,
  firstPlayerSetup,
  lobbyId,
  opponentDeckStatus,
  onSubmitDeckHash,
  selfDeckStatus,
}: MatchLoadingPanelProps): React.JSX.Element => {
  const [deckHash, setDeckHash] = useState("");
  const inLobby = lobbyId !== undefined;
  const canSubmit =
    inLobby &&
    onSubmitDeckHash !== undefined &&
    deckHash.trim().length > 0 &&
    !disabled;

  return (
    <section className="loading-panel">
      <h1>
        {firstPlayerSetup
          ? "Waiting for first-player setup"
          : lobbyId === undefined
            ? "Loading match"
            : `Waiting in lobby ${lobbyId}`}
      </h1>
      {inLobby ? (
        <form
          className="deck-hash-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = deckHash.trim();
            if (trimmed.length === 0 || onSubmitDeckHash === undefined) {
              return;
            }
            void onSubmitDeckHash(trimmed);
          }}
        >
          <label className="deck-hash-field">
            <span>Deck hash</span>
            <input
              value={deckHash}
              disabled={disabled}
              spellCheck={false}
              onChange={(event) => {
                setDeckHash(event.target.value);
              }}
            />
          </label>
          <button type="submit" disabled={!canSubmit}>
            Submit deck
          </button>
        </form>
      ) : null}
      {inLobby ? (
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
      ) : null}
    </section>
  );
};
