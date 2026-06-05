import { useEffect, useState } from "react";

import type { AccountLoadout } from "../account-client.js";
import type { LobbyClientState } from "../controller.js";
import { lobbyDeckStatuses } from "./useMatchClient-support.js";

export interface LobbyDeckPanelProps {
  lobbyState: LobbyClientState;
  disabled?: boolean | undefined;
  loadouts: readonly AccountLoadout[];
  loadoutsStatus: "idle" | "loading" | "ready" | "error";
  loadoutsError?: string | undefined;
  onSubmitLoadout: (loadoutId: string) => Promise<void>;
}

interface LoadoutGroup {
  readonly key: string;
  readonly label: string;
  readonly loadouts: readonly AccountLoadout[];
}

const unfiledLoadoutGroupKey = "__unfiled__";
const unfiledLoadoutGroupLabel = "Unfiled";

const groupLoadoutsByFolder = (
  loadouts: readonly AccountLoadout[],
): readonly LoadoutGroup[] => {
  const groups: LoadoutGroup[] = [];
  const groupIndexes = new Map<string, number>();
  for (const loadout of loadouts) {
    const key = loadout.folderId ?? unfiledLoadoutGroupKey;
    const index = groupIndexes.get(key);
    if (index === undefined) {
      groupIndexes.set(key, groups.length);
      groups.push({
        key,
        label: loadout.folderName ?? unfiledLoadoutGroupLabel,
        loadouts: [loadout],
      });
      continue;
    }
    const group = groups[index];
    if (group === undefined) {
      continue;
    }
    groups[index] = {
      ...group,
      loadouts: [...group.loadouts, loadout],
    };
  }
  return groups;
};

export const LobbyDeckPanel = ({
  disabled = false,
  lobbyState,
  loadouts,
  loadoutsStatus,
  loadoutsError,
  onSubmitLoadout,
}: LobbyDeckPanelProps): React.JSX.Element => {
  const [selectedLoadoutId, setSelectedLoadoutId] = useState(
    loadouts[0]?.id ?? "",
  );
  const { selfDeckStatus, opponentDeckStatus } = lobbyDeckStatuses(lobbyState);
  const loadoutGroups = groupLoadoutsByFolder(loadouts);
  const selectedLoadoutExists = loadouts.some(
    (loadout) => loadout.id === selectedLoadoutId,
  );
  const canSubmit = selectedLoadoutExists && !disabled;

  useEffect(() => {
    if (!selectedLoadoutExists) {
      setSelectedLoadoutId(loadouts[0]?.id ?? "");
    }
  }, [loadouts, selectedLoadoutExists]);

  return (
    <section className="lobby-deck-panel">
      <h2>Deck</h2>
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
        <label className="deck-hash-field">
          <span>Account loadout</span>
          <select
            value={selectedLoadoutId}
            disabled={disabled || loadoutsStatus !== "ready"}
            onChange={(event) => {
              setSelectedLoadoutId(event.target.value);
            }}
          >
            {loadoutGroups.map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.loadouts.map((loadout) => (
                  <option key={loadout.id} value={loadout.id}>
                    {loadout.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {loadoutsStatus === "loading" ? <p>Loading loadouts...</p> : null}
        {loadoutsStatus === "error" ? (
          <p className="error-text">
            {loadoutsError ?? "Unable to load account loadouts."}
          </p>
        ) : null}
        {loadoutsStatus === "ready" && loadouts.length === 0 ? (
          <p>No account loadouts are available.</p>
        ) : null}
        <button type="submit" disabled={!canSubmit}>
          Submit loadout
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
