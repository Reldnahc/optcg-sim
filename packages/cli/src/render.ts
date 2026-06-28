import { getLegalActions, hashCanonicalStateValue } from "@optcg/engine-core";
import type {
  CardInstance,
  CardRef,
  GameState,
  LegalAction,
  PlayerId,
  PlayerState,
} from "@optcg/types";

const sortPlayerIds = (state: GameState): PlayerId[] =>
  (Object.keys(state.players) as PlayerId[]).sort((left, right) =>
    String(left).localeCompare(String(right)),
  );

const cardLabel = (state: GameState, card: CardInstance): string => {
  const metadata = state.cardManifest.cards[card.cardId];
  const name = metadata?.name.trim();
  return name === undefined || name.length === 0 ? String(card.cardId) : name;
};

const renderCard = (state: GameState, card: CardInstance): string =>
  `${cardLabel(state, card)} [${String(card.instanceId)}]`;

const renderLeader = (state: GameState, leader: CardInstance): string =>
  `${renderCard(state, leader)} state=${leader.state ?? "unset"} attachedDon=${String(
    leader.attachedDon.length,
  )}`;

const renderIndexedCard = (
  state: GameState,
  card: CardInstance,
  index: number,
): string => `[${String(index)}] ${renderCard(state, card)}`;

const appendCardZone = (
  lines: string[],
  state: GameState,
  label: string,
  cards: readonly CardInstance[],
  indent: string,
): void => {
  if (cards.length === 0) {
    lines.push(`${indent}${label}: empty`);
    return;
  }

  lines.push(`${indent}${label} (${String(cards.length)}):`);
  cards.forEach((card, index) => {
    lines.push(`${indent}  ${renderIndexedCard(state, card, index)}`);
  });
};

const appendLifeZone = (
  lines: string[],
  state: GameState,
  life: PlayerState["life"],
  indent: string,
): void => {
  if (life.length === 0) {
    lines.push(`${indent}Life: empty`);
    return;
  }

  lines.push(`${indent}Life (${String(life.length)}):`);
  life.forEach((lifeCard, index) => {
    const visibility = lifeCard.faceUp ? "face-up" : "face-down";
    lines.push(
      `${indent}  ${renderIndexedCard(state, lifeCard.card, index)} ${visibility}`,
    );
  });
};

const renderStatus = (status: GameState["status"]): string => {
  switch (status.type) {
    case "setup":
    case "active":
      return status.type;
    case "frozen":
      return status.reason === undefined
        ? "frozen"
        : `frozen (${status.reason})`;
    case "completed":
    case "gameOver":
      return `${status.type} winner=${String(status.winner)}`;
    case "errored":
      return `errored (${status.reason})`;
  }
};

const renderPendingDecision = (state: GameState): string => {
  const decision = state.pendingDecision;
  if (decision === undefined) {
    return "Pending decision: none";
  }

  return `Pending decision: ${decision.type} ${String(decision.id)} for ${String(
    decision.playerId,
  )} - ${decision.prompt}`;
};

const renderCardRef = (ref: CardRef): string => {
  const zone =
    ref.zone === undefined
      ? ""
      : ` zone=${ref.zone.zone}${
          ref.zone.index === undefined ? "" : `[${String(ref.zone.index)}]`
        }`;
  return `${String(ref.cardId)} [${String(ref.instanceId)}] player=${String(
    ref.playerId,
  )}${zone}`;
};

const renderLegalAction = (action: LegalAction): string => {
  switch (action.type) {
    case "playCard":
      return `play-card card=${String(action.cardInstanceId)}`;
    case "activateEffect":
      return `activate-effect source=${renderCardRef(action.source)} effect=${String(
        action.effectId,
      )}`;
    case "attachDon":
      return `attach-don don=${String(action.donInstanceId)} target=${renderCardRef(
        action.target,
      )}`;
    case "declareAttack":
      return `declare-attack attacker=${renderCardRef(
        action.attacker,
      )} target=${renderCardRef(action.target)}`;
    case "activateBlocker":
      return `activate-blocker blocker=${renderCardRef(action.blocker)}`;
    case "useCounter":
      return `use-counter card=${String(action.cardInstanceId)}${
        action.effectId === undefined
          ? ""
          : ` effect=${String(action.effectId)}`
      } target=${renderCardRef(action.target)}`;
    case "endMainPhase":
      return "end-main-phase";
    case "concede":
      return `concede player=${String(action.playerId)}`;
    case "respondToDecision":
      return `respond-to-decision decision=${String(action.decisionId)}`;
  }
};

export const renderLegalActions = (
  state: GameState,
  playerId: PlayerId,
): string => {
  const legalActions = getLegalActions(state, playerId);
  const lines = [`Legal actions for ${String(playerId)}:`];

  if (legalActions.length === 0) {
    lines.push("  none");
    return lines.join("\n");
  }

  legalActions.forEach((action, index) => {
    lines.push(`  [${String(index)}] ${renderLegalAction(action)}`);
  });
  return lines.join("\n");
};

export const renderDeveloperHand = (
  state: GameState,
  playerId: PlayerId,
): string => {
  const lines = [`Developer-local hand for ${String(playerId)}`];
  const player = state.players[playerId];
  if (player === undefined) {
    lines.push("Player not found.");
    return lines.join("\n");
  }

  player.hand.forEach((card, index) => {
    lines.push(renderIndexedCard(state, card, index));
  });
  return lines.join("\n");
};

const appendPlayer = (
  lines: string[],
  state: GameState,
  playerId: PlayerId,
  player: PlayerState,
): void => {
  lines.push(`  ${String(playerId)}:`);
  lines.push(`    Leader: ${renderLeader(state, player.leader)}`);
  appendCardZone(lines, state, "Hand", player.hand, "    ");
  appendLifeZone(lines, state, player.life, "    ");
  appendCardZone(lines, state, "Deck", player.deck, "    ");
  appendCardZone(lines, state, "DON deck", player.donDeck, "    ");
  appendCardZone(lines, state, "Cost area", player.costArea, "    ");
  appendCardZone(lines, state, "Characters", player.characters, "    ");
  if (player.stage === undefined) {
    lines.push("    Stage: empty");
  } else {
    lines.push(`    Stage: ${renderCard(state, player.stage)}`);
  }
  appendCardZone(lines, state, "Trash", player.trash, "    ");
};

export const renderShow = (state: GameState): string => {
  const legalActionsPlayerId =
    state.pendingDecision?.playerId ?? state.turn.turnPlayerId;
  const lines = [
    "Developer-local terminal state",
    `State seq: ${String(state.seq)}`,
    `Status: ${renderStatus(state.status)}`,
    `Phase: ${state.turn.phase}`,
    `Turn: ${String(state.turn.turnPlayerId)} (global ${String(
      state.turn.globalTurn,
    )})`,
    renderPendingDecision(state),
    ...renderLegalActions(state, legalActionsPlayerId).split("\n"),
    `State hash: ${hashCanonicalStateValue(state)}`,
    "",
    "Players:",
  ];

  for (const playerId of sortPlayerIds(state)) {
    const player = state.players[playerId];
    if (player !== undefined) {
      appendPlayer(lines, state, playerId, player);
    }
  }

  return lines.join("\n");
};
