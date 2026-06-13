import { useCallback, useEffect, useMemo, useState } from "react";

import { createPoneglyphAccountClient } from "../account-client.js";
import type { AccountLoadout } from "../account-client.js";
import { createPoneglyphApiClient } from "../poneglyph-api-client.js";
import type { PoneglyphFormat } from "../poneglyph-api-client.js";
import { poneglyphApiBaseUrlFromEnvironment } from "../poneglyph-api-environment.js";
import { appRoutePath } from "./app-route.js";
import { DeckLoadoutPicker } from "./DeckLoadoutPicker.js";

type PlayMode = "privateLobby" | "unrankedQueue" | "rankedQueue";
type ResourceStatus = "idle" | "loading" | "ready" | "error";

interface PlayModeOption {
  readonly id: PlayMode;
  readonly label: string;
  readonly badge?: string | undefined;
}

const playModeOptions: readonly PlayModeOption[] = [
  { id: "privateLobby", label: "Private Lobby" },
  { id: "unrankedQueue", label: "Unranked Queue", badge: "Soon" },
  { id: "rankedQueue", label: "Ranked Queue", badge: "Soon" },
];

const anythingGoesFormat: PoneglyphFormat = {
  name: "Anything Goes",
  description: "Private lobby sandbox format",
  hasRotation: false,
  legalBlocks: 0,
  banCount: 0,
};

const anythingGoesFormatId = "sandbox-open";

const lobbyFormatIdForSelection = (formatName: string): string =>
  formatName === anythingGoesFormat.name ? anythingGoesFormatId : formatName;

const privateLobbyHref = (
  formatName: string,
  timerDisabled: boolean,
  botOpponent: boolean,
): string => {
  const url = new URL(appRoutePath("match"), "http://localhost");
  url.searchParams.set("lobbyFormat", lobbyFormatIdForSelection(formatName));
  if (timerDisabled) {
    url.searchParams.set("timerDisabled", "1");
  }
  if (botOpponent) {
    url.searchParams.set("botOpponent", "1");
  }
  return `${url.pathname}${url.search}`;
};

export interface DashboardPageViewProps {
  readonly mode: PlayMode;
  readonly formats: readonly PoneglyphFormat[];
  readonly formatsStatus: ResourceStatus;
  readonly formatsError?: string | undefined;
  readonly selectedFormatName: string;
  readonly loadouts: readonly AccountLoadout[];
  readonly loadoutsStatus: ResourceStatus;
  readonly loadoutsError?: string | undefined;
  readonly selectedLoadoutId: string;
  readonly privateLobbyTimerDisabled: boolean;
  readonly privateLobbyBotOpponent: boolean;
  readonly onSelectMode: (mode: PlayMode) => void;
  readonly onSelectFormat: (formatName: string) => void;
  readonly onSelectLoadout: (loadoutId: string) => void;
  readonly onRefreshLoadouts: () => void;
  readonly onSetPrivateLobbyTimerDisabled: (disabled: boolean) => void;
  readonly onSetPrivateLobbyBotOpponent: (enabled: boolean) => void;
}

const isQueueMode = (mode: PlayMode): boolean => mode !== "privateLobby";

const visibleFormatsForMode = (
  mode: PlayMode,
  formats: readonly PoneglyphFormat[],
): readonly PoneglyphFormat[] =>
  isQueueMode(mode) ? formats : [anythingGoesFormat, ...formats];

const statusText = (
  status: ResourceStatus,
  readyText: string,
  loadingText: string,
  errorText: string | undefined,
): string =>
  status === "loading"
    ? loadingText
    : status === "error"
      ? (errorText ?? "Unable to load.")
      : readyText;

export const DashboardPageView = ({
  mode,
  formats,
  formatsStatus,
  formatsError,
  selectedFormatName,
  loadouts,
  loadoutsStatus,
  loadoutsError,
  selectedLoadoutId,
  privateLobbyTimerDisabled,
  privateLobbyBotOpponent,
  onSelectMode,
  onSelectFormat,
  onSelectLoadout,
  onRefreshLoadouts,
  onSetPrivateLobbyTimerDisabled,
  onSetPrivateLobbyBotOpponent,
}: DashboardPageViewProps): React.JSX.Element => {
  const queueMode = isQueueMode(mode);
  const visibleFormats = visibleFormatsForMode(mode, formats);
  const formatSelectDisabled =
    queueMode && (formatsStatus !== "ready" || visibleFormats.length === 0);
  const deckSelectVisible = queueMode;
  const deckPickerDisabled = loadoutsStatus !== "ready";
  const refreshDecksDisabled = loadoutsStatus === "loading";

  return (
    <section className="shell-page">
      <div className="shell-page-heading">
        <h1>Poneglyph Sim</h1>
        <p>Choose a play mode, format, and account deck.</p>
      </div>

      <div className="play-selector">
        <div className="play-mode-tabs" role="tablist" aria-label="Play mode">
          {playModeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`play-mode-tab ${mode === option.id ? "is-active" : ""}`}
              aria-selected={mode === option.id}
              onClick={() => {
                onSelectMode(option.id);
              }}
            >
              <span>{option.label}</span>
              {option.badge === undefined ? null : (
                <span className="play-mode-badge">{option.badge}</span>
              )}
            </button>
          ))}
        </div>

        <div className="play-selector-grid">
          <label className="play-selector-field">
            <span>Format</span>
            <select
              value={selectedFormatName}
              disabled={formatSelectDisabled}
              onChange={(event) => {
                onSelectFormat(event.currentTarget.value);
              }}
            >
              {visibleFormats.length === 0 ? (
                <option value="">Formats loading</option>
              ) : (
                visibleFormats.map((format) => (
                  <option key={format.name} value={format.name}>
                    {format.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="play-selector-status" aria-live="polite">
            {statusText(
              formatsStatus,
              selectedFormatName.length === 0
                ? "Select a format"
                : selectedFormatName,
              "Loading formats...",
              formatsError,
            )}
          </div>
        </div>

        {mode === "privateLobby" ? (
          <div className="play-selector-options">
            <label className="play-selector-checkbox">
              <input
                type="checkbox"
                checked={privateLobbyTimerDisabled}
                onChange={(event) => {
                  onSetPrivateLobbyTimerDisabled(event.currentTarget.checked);
                }}
              />
              <span>Disable timer</span>
            </label>
            <label className="play-selector-checkbox">
              <input
                type="checkbox"
                checked={privateLobbyBotOpponent}
                onChange={(event) => {
                  onSetPrivateLobbyBotOpponent(event.currentTarget.checked);
                }}
              />
              <span>Play against bot</span>
            </label>
          </div>
        ) : null}

        {deckSelectVisible ? (
          <div className="queue-loadout-section">
            <div className="queue-loadout-header">
              <div>
                <h2>Deck</h2>
                <p>
                  Queue entry will validate the selected loadout when
                  matchmaking is wired.
                </p>
              </div>
              <button
                type="button"
                className="deck-loadout-refresh-button"
                disabled={refreshDecksDisabled}
                onClick={onRefreshLoadouts}
              >
                Refresh decks
              </button>
            </div>
            {loadoutsStatus === "error" ? (
              <p className="error-text">
                {loadoutsError ?? "Unable to load account loadouts."}
              </p>
            ) : null}
            {loadoutsStatus === "ready" && loadouts.length === 0 ? (
              <p className="muted">No account loadouts are available.</p>
            ) : null}
            <DeckLoadoutPicker
              selectedLoadoutId={selectedLoadoutId}
              disabled={deckPickerDisabled}
              loadouts={loadouts}
              requirePlayableValidation={false}
              onChange={onSelectLoadout}
            />
          </div>
        ) : null}

        <div className="play-selector-actions">
          {mode === "privateLobby" ? (
            <a
              className="shell-card-action"
              href={privateLobbyHref(
                selectedFormatName,
                privateLobbyTimerDisabled,
                privateLobbyBotOpponent,
              )}
            >
              Make Lobby
            </a>
          ) : (
            <button className="shell-card-action is-disabled" disabled>
              Queue coming soon
            </button>
          )}
          <a
            className="deck-editor-link"
            href="https://poneglyph.one/decks"
            target="_blank"
            rel="noreferrer"
          >
            Open deck editor
          </a>
        </div>
      </div>
    </section>
  );
};

export const DashboardPage = (): React.JSX.Element => {
  const [mode, setMode] = useState<PlayMode>("privateLobby");
  const [formats, setFormats] = useState<readonly PoneglyphFormat[]>([]);
  const [formatsStatus, setFormatsStatus] = useState<ResourceStatus>("loading");
  const [formatsError, setFormatsError] = useState<string>();
  const [selectedFormatName, setSelectedFormatName] = useState(
    anythingGoesFormat.name,
  );
  const [loadouts, setLoadouts] = useState<readonly AccountLoadout[]>([]);
  const [loadoutsStatus, setLoadoutsStatus] = useState<ResourceStatus>("idle");
  const [loadoutsError, setLoadoutsError] = useState<string>();
  const [selectedLoadoutId, setSelectedLoadoutId] = useState("");
  const [privateLobbyTimerDisabled, setPrivateLobbyTimerDisabled] =
    useState(false);
  const [privateLobbyBotOpponent, setPrivateLobbyBotOpponent] = useState(false);
  const apiClient = useMemo(
    () =>
      createPoneglyphApiClient({
        baseUrl: poneglyphApiBaseUrlFromEnvironment(import.meta.env),
      }),
    [],
  );
  const accountClient = useMemo(() => createPoneglyphAccountClient(), []);

  useEffect(() => {
    let cancelled = false;
    setFormatsStatus("loading");
    setFormatsError(undefined);
    void apiClient
      .listFormats()
      .then((nextFormats) => {
        if (cancelled) {
          return;
        }
        setFormats(nextFormats);
        setSelectedFormatName((current) => current || anythingGoesFormat.name);
        setFormatsStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setFormats([]);
        setFormatsStatus("error");
        setFormatsError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  useEffect(() => {
    if (mode === "privateLobby") {
      return;
    }
    if (selectedFormatName === anythingGoesFormat.name) {
      setSelectedFormatName(formats[0]?.name ?? "");
    }
  }, [formats, mode, selectedFormatName]);

  const refreshLoadouts = useCallback((): void => {
    if (!isQueueMode(mode)) {
      return;
    }
    setLoadoutsStatus("loading");
    setLoadoutsError(undefined);
    void accountClient
      .listLoadouts()
      .then((nextLoadouts) => {
        setLoadouts(nextLoadouts);
        setSelectedLoadoutId((current) =>
          nextLoadouts.some((loadout) => loadout.id === current)
            ? current
            : (nextLoadouts[0]?.id ?? ""),
        );
        setLoadoutsStatus("ready");
      })
      .catch((error: unknown) => {
        setLoadouts([]);
        setSelectedLoadoutId("");
        setLoadoutsStatus("error");
        setLoadoutsError(
          error instanceof Error ? error.message : String(error),
        );
      });
  }, [accountClient, mode]);

  useEffect(() => {
    if (!isQueueMode(mode)) {
      return;
    }
    if (loadoutsStatus === "idle") {
      refreshLoadouts();
    }
  }, [loadoutsStatus, mode, refreshLoadouts]);

  return (
    <DashboardPageView
      mode={mode}
      formats={formats}
      formatsStatus={formatsStatus}
      formatsError={formatsError}
      selectedFormatName={selectedFormatName}
      loadouts={loadouts}
      loadoutsStatus={loadoutsStatus}
      loadoutsError={loadoutsError}
      selectedLoadoutId={selectedLoadoutId}
      privateLobbyTimerDisabled={privateLobbyTimerDisabled}
      privateLobbyBotOpponent={privateLobbyBotOpponent}
      onSelectMode={setMode}
      onSelectFormat={setSelectedFormatName}
      onSelectLoadout={setSelectedLoadoutId}
      onRefreshLoadouts={refreshLoadouts}
      onSetPrivateLobbyTimerDisabled={setPrivateLobbyTimerDisabled}
      onSetPrivateLobbyBotOpponent={setPrivateLobbyBotOpponent}
    />
  );
};
