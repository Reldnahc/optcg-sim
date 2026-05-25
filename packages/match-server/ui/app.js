const state = {
  matchId: null,
  snapshot: null,
  cardsByPlayer: {},
  errors: [],
  menu: null,
  followupMenu: null,
  selectedDonByPlayer: {},
  confirmingConcede: null,
  actionInFlight: false,
  decisionDraft: null,
  orderDragInstanceId: null,
};

const matchApiPath = (resource) => {
  if (state.matchId === null) {
    return `/api/${resource}`;
  }
  return `/api/matches/${encodeURIComponent(state.matchId)}/${resource}`;
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      Array.isArray(body.errors) ? body.errors.join("; ") : response.statusText,
    );
  }
  return body;
};

const matchIdFromUrl = () =>
  new URL(window.location.href).searchParams.get("matchId");

const setMatchId = (matchId) => {
  state.matchId = matchId;
  const url = new URL(window.location.href);
  url.searchParams.set("matchId", matchId);
  window.history.replaceState({}, "", url);
};

const createMatch = async () => {
  const created = await requestJson("/api/matches", { method: "POST" });
  setMatchId(created.matchId);
  state.snapshot = created.snapshot;
  state.cardsByPlayer =
    (await requestJson(matchApiPath("cards"))).players ?? {};
  state.errors = [];
  state.menu = null;
  state.followupMenu = null;
  state.confirmingConcede = null;
  render();
};

const loadState = async () => {
  const urlMatchId = matchIdFromUrl();
  if (urlMatchId === null) {
    await createMatch();
    return;
  }
  state.matchId = urlMatchId;
  const [snapshot, catalog] = await Promise.all([
    requestJson(matchApiPath("state")),
    requestJson(matchApiPath("cards")),
  ]);
  state.snapshot = snapshot;
  state.cardsByPlayer = catalog.players ?? {};
  state.errors = [];
  state.followupMenu = null;
  state.confirmingConcede = null;
  render();
};

const resetMatch = async () => {
  await createMatch();
};

const usesFullscreenDecisionModal = (decision) =>
  decision?.type === "selectCards" || decision?.type === "orderCards";

const playerHasPopupFollowup = (playerId) => {
  const playerState = state.snapshot?.players[playerId];
  return (
    playerState?.view.pendingDecision !== undefined &&
    !usesFullscreenDecisionModal(playerState.view.pendingDecision) &&
    globalActions(playerState.actions).length > 0
  );
};

const applyAction = async (playerId, actionIndex, followupAnchor = null) => {
  if (state.actionInFlight) {
    return;
  }
  const expectedStateSeq = state.snapshot?.stateSeq;
  state.actionInFlight = true;
  state.menu = null;
  state.followupMenu = null;
  state.confirmingConcede = null;
  state.decisionDraft = null;
  render();
  try {
    const result = await requestJson(matchApiPath("action"), {
      method: "POST",
      body: JSON.stringify({ playerId, actionIndex, expectedStateSeq }),
    });
    const catalog = await requestJson(matchApiPath("cards"));
    state.snapshot = result.snapshot;
    state.cardsByPlayer = catalog.players ?? {};
    state.errors = result.errors;
    if (
      followupAnchor !== null &&
      result.errors.length === 0 &&
      playerHasPopupFollowup(playerId)
    ) {
      state.followupMenu = followupAnchor;
    }
  } finally {
    state.actionInFlight = false;
  }
  render();
};

const applyDecision = async (playerId, decisionId, response) => {
  state.menu = null;
  state.followupMenu = null;
  state.confirmingConcede = null;
  state.decisionDraft = null;
  const result = await requestJson(matchApiPath("decision"), {
    method: "POST",
    body: JSON.stringify({ playerId, decisionId, response }),
  });
  const catalog = await requestJson(matchApiPath("cards"));
  state.snapshot = result.snapshot;
  state.cardsByPlayer = catalog.players ?? {};
  state.errors = result.errors;
  render();
};

const selectedDonSet = (playerId) => {
  state.selectedDonByPlayer[playerId] ??= new Set();
  return state.selectedDonByPlayer[playerId];
};

const toggleSelectedDon = (playerId, instanceId) => {
  const selected = selectedDonSet(playerId);
  if (selected.has(instanceId)) {
    selected.delete(instanceId);
  } else {
    selected.add(instanceId);
  }
  state.menu = null;
  state.followupMenu = null;
  state.confirmingConcede = null;
  render();
};

const clearSelectedDon = (playerId) => {
  selectedDonSet(playerId).clear();
};

const applySelectedDonToTarget = async (playerId, targetInstanceId) => {
  const selected = [...selectedDonSet(playerId)];
  for (const donInstanceId of selected) {
    const playerState = state.snapshot?.players[playerId];
    const action = playerState?.actions.find(
      (candidate) =>
        candidate.attachment?.donInstanceId === donInstanceId &&
        candidate.attachment.targetInstanceId === targetInstanceId,
    );
    if (action !== undefined) {
      await applyAction(playerId, action.index);
    }
  }
  clearSelectedDon(playerId);
  state.menu = null;
  state.followupMenu = null;
  render();
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const cardMetadata = (playerId, cardId) =>
  state.cardsByPlayer[playerId]?.cards?.[cardId] ?? { name: cardId };

const actionButton = (playerId, action, className = "") =>
  `<button class="action-button ${className}" type="button" data-player="${escapeHtml(
    playerId,
  )}" data-action="${String(action.index)}" ${
    state.actionInFlight ? "disabled" : ""
  }>${escapeHtml(action.label)}</button>`;

const actionsForCard = (actions, card) =>
  actions.filter((action) => action.placement?.instanceId === card.instanceId);

const nonAttachActionsForCard = (actions, card) =>
  actionsForCard(actions, card).filter(
    (action) => action.attachment === undefined,
  );

const isSelectableDon = (actions, card) =>
  actions.some(
    (action) => action.attachment?.donInstanceId === card.instanceId,
  );

const selectedAttachActionCount = (playerId, card, actions) => {
  const selected = selectedDonSet(playerId);
  if (selected.size === 0) {
    return 0;
  }
  return actions.filter(
    (action) =>
      action.attachment?.targetInstanceId === card.instanceId &&
      selected.has(action.attachment.donInstanceId),
  ).length;
};

const cardMenuAttributes = (playerId, card, actionCount) =>
  actionCount === 0
    ? ""
    : ` data-menu-player="${escapeHtml(playerId)}" data-menu-instance="${escapeHtml(
        card.instanceId,
      )}"`;

const renderCard = (playerId, card, actions, size = "normal") => {
  const metadata = cardMetadata(playerId, card.cardId);
  const cardActions = nonAttachActionsForCard(actions, card);
  const selectedAttachCount = selectedAttachActionCount(
    playerId,
    card,
    actions,
  );
  const menuActionCount =
    cardActions.length + (selectedAttachCount > 0 ? 1 : 0);
  const selectableDon = isSelectableDon(actions, card);
  const selectedDon =
    selectableDon && selectedDonSet(playerId).has(card.instanceId);
  const image =
    metadata.imageUrl === undefined
      ? `<div class="card-image card-image-placeholder">${escapeHtml(
          metadata.name,
        )}</div>`
      : `<img class="card-image" src="${escapeHtml(
          metadata.imageUrl,
        )}" alt="${escapeHtml(metadata.name)}" loading="lazy" />`;
  return `
    <article class="card-tile card-tile-${size} ${
      card.state === "rested" ? "is-rested" : ""
    } ${selectedDon ? "is-selected-don" : ""}" title="${escapeHtml(
      metadata.name,
    )}"${
      selectableDon
        ? ` data-select-don-player="${escapeHtml(
            playerId,
          )}" data-select-don-instance="${escapeHtml(card.instanceId)}"`
        : cardMenuAttributes(playerId, card, menuActionCount)
    }>
      ${image}
    </article>
  `;
};

const renderCards = (playerId, cards, actions, size = "normal") => {
  if (cards.length === 0) {
    return '<span class="empty">empty</span>';
  }
  return cards
    .map((card) => renderCard(playerId, card, actions, size))
    .join("");
};

const zoneClass = (label) =>
  label.toLowerCase().replaceAll(" ", "-").replaceAll("!", "");

const renderZone = (playerId, label, cards, actions, size = "normal") => `
  <section class="zone zone-${zoneClass(label)}">
    <h3>${escapeHtml(label)}</h3>
    <div class="cards">${renderCards(playerId, cards, actions, size)}</div>
  </section>
`;

const renderActionList = (playerId, actions) => {
  if (actions.length === 0) {
    return '<span class="empty">No actions</span>';
  }
  return actions
    .map((action) => actionButton(playerId, action, "rail-action"))
    .join("");
};

const globalActions = (actions) =>
  actions.filter((action) => action.placement === undefined);

const concedeActions = (actions) =>
  globalActions(actions).filter((action) => action.type === "concede");

const nonConcedeGlobalActions = (actions) =>
  globalActions(actions).filter((action) => action.type !== "concede");

const renderConcedeActions = (playerId, actions) => {
  const concede = concedeActions(actions)[0];
  if (concede === undefined) {
    return "";
  }
  const confirming =
    state.confirmingConcede?.playerId === playerId &&
    state.confirmingConcede.actionIndex === concede.index;
  return `
    <div class="danger-actions">
      <button class="action-button concede-action ${
        confirming ? "is-confirming" : ""
      }" type="button" data-concede-player="${escapeHtml(
        playerId,
      )}" data-concede-action="${String(concede.index)}" data-concede-confirm="${
        confirming ? "true" : "false"
      }" ${state.actionInFlight ? "disabled" : ""}>
        ${confirming ? "Confirm concede" : "Concede"}
      </button>
    </div>
  `;
};

const renderDecision = (view) =>
  view.pendingDecision
    ? `<p class="decision">Decision: ${escapeHtml(
        view.pendingDecision.prompt,
      )}</p>`
    : "";

const renderHandStrip = (playerId, playerState, position) => {
  const { view, actions } = playerState;
  return `
    <section class="hand-strip hand-strip-${position}">
      <div class="hand-cards">${renderCards(
        playerId,
        view.self.hand,
        actions,
        "hand",
      )}</div>
    </section>
  `;
};

const renderBacklineZones = (playerId, view, actions) => `
  <div class="backline-zones">
    ${renderZone(playerId, "Leader", [view.self.leader], actions, "small")}
    ${renderZone(
      playerId,
      "Stage",
      view.self.stage ? [view.self.stage] : [],
      actions,
      "small",
    )}
  </div>
`;

const renderCharacterZone = (playerId, view, actions) => `
  <div class="character-zone">
    ${renderZone(playerId, "Characters", view.self.characters, actions)}
  </div>
`;

const renderCostZone = (playerId, view, actions) => `
  <div class="cost-zone">
    ${renderZone(playerId, "Cost", view.self.costArea, actions, "mini")}
  </div>
`;

const renderTrashZone = (playerId, view, actions) => `
  <div class="side-pile">
    ${renderZone(playerId, "Trash", view.self.trash, actions, "mini")}
  </div>
`;

const renderPlayerBoard = (playerId, playerState, position) => {
  const { view, actions } = playerState;
  const mainLane =
    position === "top"
      ? `${renderCostZone(playerId, view, actions)}
         ${renderBacklineZones(playerId, view, actions)}
         ${renderCharacterZone(playerId, view, actions)}`
      : `${renderCharacterZone(playerId, view, actions)}
         ${renderBacklineZones(playerId, view, actions)}
         ${renderCostZone(playerId, view, actions)}`;
  return `
    <section class="player-board player-board-${position}">
      ${renderTrashZone(playerId, view, actions)}
      <div class="player-main player-main-${position}">
        ${mainLane}
      </div>
    </section>
  `;
};

const renderControlPanel = (playerId, playerState) => {
  const { view, actions } = playerState;
  const shouldRenderGlobalActions =
    state.followupMenu?.playerId !== playerId ||
    view.pendingDecision === undefined ||
    usesFullscreenDecisionModal(view.pendingDecision);
  return `
    <section class="control-panel">
      ${renderDecision(view)}
      <div class="rail-actions">
        ${
          shouldRenderGlobalActions
            ? renderActionList(playerId, nonConcedeGlobalActions(actions))
            : '<span class="empty">Use popup</span>'
        }
      </div>
      ${renderConcedeActions(playerId, actions)}
    </section>
  `;
};

const renderMatchControls = (snapshot) => `
  <section class="match-controls">
    <button class="action-button reset-action" type="button" data-reset-match>
      New match
    </button>
    <div class="match-state">
      <span>${escapeHtml(state.matchId ?? "no match")}</span>
      <span>${escapeHtml(snapshot.status)}</span>
      <span>${escapeHtml(snapshot.turn.turnPlayerId)} / ${escapeHtml(
        snapshot.turn.phase,
      )}</span>
      <span>Active ${escapeHtml(snapshot.activePlayerId)}</span>
    </div>
    ${state.errors
      .map((error) => `<div class="error">${escapeHtml(error)}</div>`)
      .join("")}
  </section>
`;

const menuActions = () => {
  if (state.menu === null || state.snapshot === null) {
    return [];
  }
  const playerState = state.snapshot.players[state.menu.playerId];
  if (playerState === undefined) {
    return [];
  }
  return playerState.actions.filter(
    (action) =>
      action.placement?.instanceId === state.menu.instanceId &&
      action.attachment === undefined,
  );
};

const selectedAttachActions = () => {
  if (state.menu === null || state.snapshot === null) {
    return [];
  }
  const selected = selectedDonSet(state.menu.playerId);
  if (selected.size === 0) {
    return [];
  }
  const playerState = state.snapshot.players[state.menu.playerId];
  if (playerState === undefined) {
    return [];
  }
  return playerState.actions.filter(
    (action) =>
      action.attachment?.targetInstanceId === state.menu?.instanceId &&
      selected.has(action.attachment.donInstanceId),
  );
};

const followupActions = () => {
  if (state.followupMenu === null || state.snapshot === null) {
    return [];
  }
  const playerState = state.snapshot.players[state.followupMenu.playerId];
  if (
    playerState === undefined ||
    playerState.view.pendingDecision === undefined ||
    usesFullscreenDecisionModal(playerState.view.pendingDecision)
  ) {
    return [];
  }
  return nonConcedeGlobalActions(playerState.actions);
};

const renderActionMenu = () => {
  if (state.followupMenu !== null) {
    const actions = followupActions();
    if (actions.length === 0) {
      return "";
    }
    const playerState = state.snapshot?.players[state.followupMenu.playerId];
    const prompt = playerState?.view.pendingDecision?.prompt;
    return `
      <div class="action-menu action-menu-followup" style="left: ${String(
        state.followupMenu.x,
      )}px; top: ${String(state.followupMenu.y)}px;">
        ${
          prompt === undefined
            ? ""
            : `<p class="action-menu-prompt">${escapeHtml(prompt)}</p>`
        }
        ${actions
          .map((action) =>
            actionButton(state.followupMenu.playerId, action, "menu-action"),
          )
          .join("")}
      </div>
    `;
  }
  if (state.menu === null) {
    return "";
  }
  const actions = menuActions();
  const attachActions = selectedAttachActions();
  if (actions.length === 0 && attachActions.length === 0) {
    return "";
  }
  return `
    <div class="action-menu" style="left: ${String(state.menu.x)}px; top: ${String(
      state.menu.y,
    )}px;">
      ${
        attachActions.length === 0
          ? ""
          : `<button class="action-button menu-action" type="button" data-attach-player="${escapeHtml(
              state.menu.playerId,
            )}" data-attach-target="${escapeHtml(
              state.menu.instanceId,
            )}">Attach selected DON!! (${String(attachActions.length)})</button>`
      }
      ${actions
        .map((action) =>
          actionButton(state.menu.playerId, action, "menu-action"),
        )
        .join("")}
    </div>
  `;
};

const activeDecisionEntry = () => {
  if (state.snapshot === null) {
    return undefined;
  }
  return Object.entries(state.snapshot.players).find(
    ([playerId, playerState]) =>
      playerState.view.pendingDecision !== undefined &&
      playerState.view.pendingDecision.playerId === playerId,
  );
};

const ensureDecisionDraft = (decision) => {
  if (state.decisionDraft?.decisionId === decision.id) {
    return state.decisionDraft;
  }
  state.decisionDraft = {
    decisionId: decision.id,
    selectedCardIds: new Set(),
    orderedCardIds:
      decision.type === "orderCards"
        ? decision.cards.map((card) => card.instanceId)
        : [],
  };
  return state.decisionDraft;
};

const decisionCardImage = (playerId, card, selected = false) => {
  const metadata = cardMetadata(playerId, card.cardId);
  const image =
    metadata.imageUrl === undefined
      ? `<div class="card-image card-image-placeholder">${escapeHtml(
          metadata.name,
        )}</div>`
      : `<img class="card-image" src="${escapeHtml(
          metadata.imageUrl,
        )}" alt="${escapeHtml(metadata.name)}" loading="lazy" />`;
  return `
    <article class="card-tile decision-card ${
      selected ? "is-decision-selected" : ""
    }" title="${escapeHtml(metadata.name)}">
      ${image}
    </article>
  `;
};

const renderSelectCardsDecision = (playerId, decision, draft) => {
  const selected = draft.selectedCardIds;
  const canConfirm =
    selected.size >= decision.min && selected.size <= decision.max;
  return `
    <div class="decision-card-grid">
      ${decision.candidates
        .map((candidate) => {
          const selectedCard = selected.has(candidate.card.instanceId);
          return `
            <button class="decision-card-button" type="button" data-decision-select-card="${escapeHtml(
              candidate.card.instanceId,
            )}">
              ${decisionCardImage(playerId, candidate.card, selectedCard)}
            </button>
          `;
        })
        .join("")}
    </div>
    <div class="decision-modal-actions">
      <button class="action-button" type="button" data-decision-confirm ${
        canConfirm ? "" : "disabled"
      }>
        ${decision.min === 0 && selected.size === 0 ? "Take none" : "Confirm"}
      </button>
    </div>
  `;
};

const renderOrderCardsDecision = (playerId, decision, draft) => {
  const byInstanceId = new Map(
    decision.cards.map((card) => [card.instanceId, card]),
  );
  const orderedCards = draft.orderedCardIds
    .map((instanceId) => byInstanceId.get(instanceId))
    .filter((card) => card !== undefined);
  return `
    <div class="decision-order-labels">
      <span>Top of bottom group</span>
      <span>Bottom of deck</span>
    </div>
    <div class="decision-order-list" data-order-list>
      ${orderedCards
        .map(
          (card) => `
            <div class="decision-order-item ${
              state.orderDragInstanceId === card.instanceId
                ? "is-order-dragging"
                : ""
            }" draggable="true" data-order-card-instance="${escapeHtml(
              card.instanceId,
            )}">
              ${decisionCardImage(playerId, card)}
            </div>
          `,
        )
        .join("")}
    </div>
    <div class="decision-modal-actions">
      <button class="action-button" type="button" data-decision-confirm>
        Confirm order
      </button>
    </div>
  `;
};

const moveOrderedCardNear = (decision, draggedId, targetId, placement) => {
  const draft = ensureDecisionDraft(decision);
  if (draggedId === targetId) {
    return;
  }
  const withoutDragged = draft.orderedCardIds.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (
    targetIndex < 0 ||
    withoutDragged.length === draft.orderedCardIds.length
  ) {
    return;
  }
  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  draft.orderedCardIds = [
    ...withoutDragged.slice(0, insertIndex),
    draggedId,
    ...withoutDragged.slice(insertIndex),
  ];
};

const renderDecisionModal = () => {
  const entry = activeDecisionEntry();
  if (entry === undefined) {
    return "";
  }
  const [playerId, playerState] = entry;
  const decision = playerState.view.pendingDecision;
  if (decision?.type !== "selectCards" && decision?.type !== "orderCards") {
    return "";
  }
  const draft = ensureDecisionDraft(decision);
  return `
    <section class="decision-modal-backdrop" aria-modal="true" role="dialog">
      <div class="decision-modal">
        <div class="decision-modal-header">
          <h2>${escapeHtml(decision.prompt)}</h2>
          <span>${escapeHtml(playerId)}</span>
        </div>
        ${
          decision.type === "selectCards"
            ? renderSelectCardsDecision(playerId, decision, draft)
            : renderOrderCardsDecision(playerId, decision, draft)
        }
      </div>
    </section>
  `;
};

const renderMatchTable = (players) => {
  const entries = Object.entries(players);
  const bottom = entries[0];
  const top = entries[1] ?? entries[0];
  if (bottom === undefined || top === undefined) {
    return '<p class="meta">No players loaded.</p>';
  }
  const [bottomPlayerId, bottomState] = bottom;
  const [topPlayerId, topState] = top;
  return `
    <section class="match-table">
      ${renderHandStrip(topPlayerId, topState, "top")}
      <div class="table-main">
        <section class="board">
          ${renderPlayerBoard(topPlayerId, topState, "top")}
          <div class="battle-line"></div>
          ${renderPlayerBoard(bottomPlayerId, bottomState, "bottom")}
        </section>
        <aside class="control-rail">
          ${renderMatchControls(state.snapshot)}
          ${renderControlPanel(topPlayerId, topState)}
          ${renderControlPanel(bottomPlayerId, bottomState)}
        </aside>
      </div>
      ${renderHandStrip(bottomPlayerId, bottomState, "bottom")}
    </section>
  `;
};

const render = () => {
  const root = document.querySelector("#app");
  if (root === null) return;
  if (state.snapshot === null) {
    root.innerHTML = '<p class="meta">Loading match...</p>';
    return;
  }
  const { snapshot } = state;
  root.innerHTML = `
    ${renderMatchTable(snapshot.players)}
    ${renderActionMenu()}
    ${renderDecisionModal()}
  `;
};

document.querySelector("#app")?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("[data-reset-match]") instanceof HTMLElement) {
    resetMatch().catch((error) => {
      state.errors = [error instanceof Error ? error.message : String(error)];
      render();
    });
    return;
  }
  const decisionSelectTarget = target.closest("[data-decision-select-card]");
  if (decisionSelectTarget instanceof HTMLElement) {
    const entry = activeDecisionEntry();
    if (entry === undefined) return;
    const decision = entry[1].view.pendingDecision;
    if (decision?.type !== "selectCards") return;
    const instanceId = decisionSelectTarget.dataset.decisionSelectCard;
    if (instanceId === undefined) return;
    const draft = ensureDecisionDraft(decision);
    if (draft.selectedCardIds.has(instanceId)) {
      draft.selectedCardIds.delete(instanceId);
    } else if (draft.selectedCardIds.size < decision.max) {
      draft.selectedCardIds.add(instanceId);
    }
    render();
    return;
  }
  const decisionConfirmTarget = target.closest("[data-decision-confirm]");
  if (decisionConfirmTarget instanceof HTMLButtonElement) {
    if (decisionConfirmTarget.disabled) return;
    const entry = activeDecisionEntry();
    if (entry === undefined) return;
    const [playerId, playerState] = entry;
    const decision = playerState.view.pendingDecision;
    if (decision?.type !== "selectCards" && decision?.type !== "orderCards") {
      return;
    }
    const draft = ensureDecisionDraft(decision);
    const response =
      decision.type === "selectCards"
        ? {
            type: "cards",
            cards: decision.candidates
              .map((candidate) => candidate.card)
              .filter((card) => draft.selectedCardIds.has(card.instanceId)),
          }
        : { type: "orderedIds", ids: draft.orderedCardIds };
    applyDecision(playerId, decision.id, response).catch((error) => {
      state.errors = [error instanceof Error ? error.message : String(error)];
      render();
    });
    return;
  }
  const selectedDonTarget = target.closest(
    "[data-select-don-player][data-select-don-instance]",
  );
  if (selectedDonTarget instanceof HTMLElement) {
    const playerId = selectedDonTarget.dataset.selectDonPlayer;
    const instanceId = selectedDonTarget.dataset.selectDonInstance;
    if (playerId === undefined || instanceId === undefined) return;
    toggleSelectedDon(playerId, instanceId);
    return;
  }
  const attachTarget = target.closest(
    "[data-attach-player][data-attach-target]",
  );
  if (attachTarget instanceof HTMLElement) {
    const playerId = attachTarget.dataset.attachPlayer;
    const targetInstanceId = attachTarget.dataset.attachTarget;
    if (playerId === undefined || targetInstanceId === undefined) return;
    applySelectedDonToTarget(playerId, targetInstanceId).catch((error) => {
      state.errors = [error instanceof Error ? error.message : String(error)];
      render();
    });
    return;
  }
  const concedeTarget = target.closest(
    "[data-concede-player][data-concede-action]",
  );
  if (concedeTarget instanceof HTMLElement) {
    if (state.actionInFlight) return;
    const playerId = concedeTarget.dataset.concedePlayer;
    const actionIndex = Number.parseInt(
      concedeTarget.dataset.concedeAction ?? "",
      10,
    );
    if (playerId === undefined || !Number.isInteger(actionIndex)) return;
    const alreadyConfirming =
      state.confirmingConcede?.playerId === playerId &&
      state.confirmingConcede.actionIndex === actionIndex;
    if (!alreadyConfirming) {
      state.confirmingConcede = { playerId, actionIndex };
      state.menu = null;
      state.followupMenu = null;
      render();
      return;
    }
    applyAction(playerId, actionIndex).catch((error) => {
      state.errors = [error instanceof Error ? error.message : String(error)];
      render();
    });
    return;
  }
  const actionTarget = target.closest("[data-player][data-action]");
  if (actionTarget instanceof HTMLElement) {
    if (state.actionInFlight) return;
    const playerId = actionTarget.dataset.player;
    const actionIndex = Number.parseInt(actionTarget.dataset.action ?? "", 10);
    if (playerId === undefined || !Number.isInteger(actionIndex)) return;
    const popup = actionTarget.closest(".action-menu");
    const followupAnchor =
      popup instanceof HTMLElement && state.menu !== null
        ? { playerId, x: state.menu.x, y: state.menu.y }
        : popup instanceof HTMLElement && state.followupMenu !== null
          ? {
              playerId,
              x: state.followupMenu.x,
              y: state.followupMenu.y,
            }
          : null;
    applyAction(playerId, actionIndex, followupAnchor).catch((error) => {
      state.errors = [error instanceof Error ? error.message : String(error)];
      render();
    });
    return;
  }
  const menuTarget = target.closest("[data-menu-player][data-menu-instance]");
  if (!(menuTarget instanceof HTMLElement)) {
    state.menu = null;
    state.followupMenu = null;
    render();
    return;
  }
  const playerId = menuTarget.dataset.menuPlayer;
  const instanceId = menuTarget.dataset.menuInstance;
  if (playerId === undefined || instanceId === undefined) return;
  const rect = menuTarget.getBoundingClientRect();
  state.followupMenu = null;
  state.menu = {
    playerId,
    instanceId,
    x: Math.min(rect.right + 6, window.innerWidth - 174),
    y: Math.min(rect.top, window.innerHeight - 110),
  };
  render();
});

document.querySelector("#app")?.addEventListener("dragstart", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const orderCard = target.closest("[data-order-card-instance]");
  if (!(orderCard instanceof HTMLElement)) return;
  const instanceId = orderCard.dataset.orderCardInstance;
  if (instanceId === undefined) return;
  state.orderDragInstanceId = instanceId;
  event.dataTransfer?.setData("text/plain", instanceId);
  event.dataTransfer?.setDragImage(orderCard, 24, 36);
});

document.querySelector("#app")?.addEventListener("dragover", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("[data-order-card-instance]") instanceof HTMLElement) {
    event.preventDefault();
  }
});

document.querySelector("#app")?.addEventListener("drop", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const orderCard = target.closest("[data-order-card-instance]");
  if (!(orderCard instanceof HTMLElement)) return;
  event.preventDefault();
  const entry = activeDecisionEntry();
  if (entry === undefined) return;
  const decision = entry[1].view.pendingDecision;
  if (decision?.type !== "orderCards") return;
  const draggedId =
    state.orderDragInstanceId ?? event.dataTransfer?.getData("text/plain");
  const targetId = orderCard.dataset.orderCardInstance;
  if (draggedId === undefined || targetId === undefined) return;
  const rect = orderCard.getBoundingClientRect();
  const placement =
    event.clientX > rect.left + rect.width / 2 ? "after" : "before";
  moveOrderedCardNear(decision, draggedId, targetId, placement);
  state.orderDragInstanceId = null;
  render();
});

document.querySelector("#app")?.addEventListener("dragend", () => {
  state.orderDragInstanceId = null;
  render();
});

render();
loadState().catch((error) => {
  state.errors = [error instanceof Error ? error.message : String(error)];
  render();
});
