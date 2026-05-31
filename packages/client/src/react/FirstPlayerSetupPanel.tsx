import type { FirstPlayerSetupClientState } from "../controller.js";

export interface FirstPlayerSetupPanelProps {
  state: FirstPlayerSetupClientState;
  disabled: boolean;
  onChoose: (choice: "goFirst" | "goSecond") => void;
}

export const FirstPlayerSetupPanel = ({
  state,
  disabled,
  onChoose,
}: FirstPlayerSetupPanelProps): React.JSX.Element => {
  const chooser =
    state.firstPlayerChoice.chooserPlayerId === state.seat.playerId;

  return (
    <section className="first-player-setup-panel">
      <h2>First player</h2>
      {chooser ? (
        <>
          <p>Choose whether to take the first or second turn.</p>
          <div className="first-player-choice-actions">
            <button
              className="action-button primary-action"
              type="button"
              disabled={disabled}
              onClick={() => {
                onChoose("goFirst");
              }}
            >
              Go first
            </button>
            <button
              className="action-button"
              type="button"
              disabled={disabled}
              onClick={() => {
                onChoose("goSecond");
              }}
            >
              Go second
            </button>
          </div>
        </>
      ) : (
        <p>Waiting for the opponent to choose first or second.</p>
      )}
    </section>
  );
};
