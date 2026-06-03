import { useMemo, useState, type SyntheticEvent } from "react";

import {
  createPoneglyphAccountClient,
  type AccountLoadout,
  type PoneglyphAccountClient,
} from "../account-client.js";

const DEFAULT_IMPORTED_DECK_NAME = "Imported deck";

export interface DecksPageProps {
  readonly accountClient?: PoneglyphAccountClient | undefined;
}

export const DecksPage = ({
  accountClient: providedAccountClient,
}: DecksPageProps = {}): React.JSX.Element => {
  const accountClient = useMemo(
    () => providedAccountClient ?? createPoneglyphAccountClient(),
    [providedAccountClient],
  );
  const [name, setName] = useState(DEFAULT_IMPORTED_DECK_NAME);
  const [deckHash, setDeckHash] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [savedLoadout, setSavedLoadout] = useState<AccountLoadout | null>(null);

  const submitDeckHash = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedDeckHash = deckHash.trim();
    if (!trimmedDeckHash) {
      setStatus("error");
      setMessage("Deck hash is required.");
      setSavedLoadout(null);
      return;
    }

    setStatus("saving");
    setMessage(null);
    setSavedLoadout(null);
    try {
      const loadout = await accountClient.createLoadoutFromDeckHash({
        name: name.trim() || DEFAULT_IMPORTED_DECK_NAME,
        deckHash: trimmedDeckHash,
      });
      setSavedLoadout(loadout);
      setStatus("saved");
      setMessage(`Saved ${loadout.name}.`);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save deck configuration.",
      );
    }
  };

  const isSaving = status === "saving";

  return (
    <section className="shell-page">
      <div className="shell-page-heading">
        <h1>Decks</h1>
        <p>
          Save a deck hash as an account loadout. Account API validates the hash
          and applies default DON deck and cosmetic choices.
        </p>
      </div>

      <form
        className="shell-page-card deck-import-card"
        onSubmit={(event) => {
          void submitDeckHash(event);
        }}
      >
        <h3>Save Deck Configuration</h3>
        <label className="deck-import-field">
          <span>Name</span>
          <input
            name="name"
            value={name}
            maxLength={80}
            disabled={isSaving}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
          />
        </label>
        <label className="deck-import-field">
          <span>Deck hash</span>
          <textarea
            name="deckHash"
            value={deckHash}
            rows={4}
            disabled={isSaving}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setDeckHash(event.currentTarget.value);
            }}
          />
        </label>
        <button className="shell-card-action" type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Deck Configuration"}
        </button>
        {message ? (
          <p
            className={`deck-import-status ${
              status === "error" ? "is-error" : "is-success"
            }`}
          >
            {message}
          </p>
        ) : null}
        {savedLoadout ? (
          <p className="deck-import-status">
            Loadout ID: <code>{savedLoadout.id}</code>
          </p>
        ) : null}
      </form>
    </section>
  );
};
