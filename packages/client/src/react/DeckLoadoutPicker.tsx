import { useEffect, useMemo, useState } from "react";

import type { AccountLoadout } from "../account-client.js";

export interface DeckLoadoutPickerProps {
  readonly disabled?: boolean | undefined;
  readonly loadouts: readonly AccountLoadout[];
  readonly selectedLoadoutId: string;
  readonly onChange: (loadoutId: string) => void;
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

const searchMatchesLoadout = (
  loadout: AccountLoadout,
  normalizedSearch: string,
): boolean => {
  if (normalizedSearch.length === 0) {
    return true;
  }
  return [
    loadout.name,
    loadout.folderName ?? "",
    loadout.leaderCardId ?? "",
  ].some((value) => value.toLowerCase().includes(normalizedSearch));
};

const loadoutMeta = (loadout: AccountLoadout | undefined): string =>
  loadout === undefined
    ? "No deck selected"
    : [
        loadout.leaderCardId === null ? "No leader" : loadout.leaderCardId,
        loadout.folderName ?? unfiledLoadoutGroupLabel,
      ].join(" / ");

const LeaderCrop = ({
  loadout,
}: {
  readonly loadout: AccountLoadout | undefined;
}): React.JSX.Element => (
  <span
    className="deck-loadout-leader-crop"
    style={
      loadout?.leaderImageUrl === undefined || loadout.leaderImageUrl === null
        ? undefined
        : { backgroundImage: `url("${loadout.leaderImageUrl}")` }
    }
    aria-hidden="true"
  >
    {loadout?.leaderImageUrl === undefined || loadout.leaderImageUrl === null
      ? (loadout?.leaderCardId ?? "")
      : ""}
  </span>
);

export const DeckLoadoutPicker = ({
  disabled = false,
  loadouts,
  selectedLoadoutId,
  onChange,
}: DeckLoadoutPickerProps): React.JSX.Element => {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [closedFolderKeys, setClosedFolderKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const selectedLoadout = loadouts.find(
    (loadout) => loadout.id === selectedLoadoutId,
  );
  const normalizedSearch = search.trim().toLowerCase();
  const groups = useMemo(
    () =>
      groupLoadoutsByFolder(
        loadouts.filter((loadout) =>
          searchMatchesLoadout(loadout, normalizedSearch),
        ),
      ),
    [loadouts, normalizedSearch],
  );

  useEffect(() => {
    setClosedFolderKeys(
      (current) =>
        new Set(
          [...current].filter((key) => groups.some((g) => g.key === key)),
        ),
    );
  }, [groups]);

  return (
    <div className="deck-loadout-picker">
      <button
        className="deck-loadout-selected"
        type="button"
        disabled={disabled || loadouts.length === 0}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <LeaderCrop loadout={selectedLoadout} />
        <span className="deck-loadout-selected-copy">
          <span className="deck-loadout-selected-label">
            {selectedLoadout?.name ?? "Choose a deck loadout"}
            {selectedLoadout?.favorite === true ? (
              <span className="deck-loadout-favorite" aria-label="favorite">
                Favorite
              </span>
            ) : null}
          </span>
          <span className="deck-loadout-selected-meta">
            {loadoutMeta(selectedLoadout)}
          </span>
        </span>
      </button>
      {open ? (
        <div className="deck-loadout-menu">
          <input
            className="deck-loadout-search"
            type="search"
            value={search}
            placeholder="Search deck loadouts"
            disabled={disabled}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
          <div className="deck-loadout-folder-list">
            {groups.length === 0 ? (
              <p className="muted">No deck loadouts match your search.</p>
            ) : null}
            {groups.map((group) => {
              const closed = closedFolderKeys.has(group.key);
              return (
                <section className="deck-loadout-folder" key={group.key}>
                  <button
                    className="deck-loadout-folder-header"
                    type="button"
                    disabled={disabled}
                    aria-expanded={!closed}
                    onClick={() => {
                      setClosedFolderKeys((current) => {
                        const next = new Set(current);
                        if (next.has(group.key)) {
                          next.delete(group.key);
                        } else {
                          next.add(group.key);
                        }
                        return next;
                      });
                    }}
                  >
                    <span>{closed ? "+" : "-"}</span>
                    <span>{group.label}</span>
                    <span>{String(group.loadouts.length)}</span>
                  </button>
                  {closed ? null : (
                    <div className="deck-loadout-options">
                      {group.loadouts.map((loadout) => (
                        <button
                          key={loadout.id}
                          className={`deck-loadout-option ${
                            loadout.id === selectedLoadoutId
                              ? "is-selected"
                              : ""
                          } ${loadout.favorite ? "is-favorite" : ""}`}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            onChange(loadout.id);
                            setOpen(false);
                          }}
                        >
                          <LeaderCrop loadout={loadout} />
                          <span className="deck-loadout-option-copy">
                            <span className="deck-loadout-option-name">
                              {loadout.name}
                              {loadout.favorite ? (
                                <span
                                  className="deck-loadout-favorite"
                                  aria-label="favorite"
                                >
                                  Favorite
                                </span>
                              ) : null}
                            </span>
                            <span className="deck-loadout-option-meta">
                              {loadoutMeta(loadout)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
