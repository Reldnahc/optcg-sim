import type { MatchId, PlayerId } from "@optcg/types";

import { botTitleForDifficulty } from "./bot-identity.js";
import { createDevUserSessionToken, type AuthContext } from "./dev-auth.js";
import type { getLocalDevSnapshot } from "./local-match.js";
import { setLocalDevMatchPlayerLabels } from "./local-match.js";
import type { FirstPlayerChoiceState } from "./session-types.js";
import type {
  CreatedDevMatchResponse,
  LocalDevMatchSeat,
} from "./dev-local-match-registry-types.js";
import type {
  ActiveLocalDevMatchSession,
  LocalDevMatchSession,
} from "./dev-local-match-session-factory.js";

export const firstPlayerChoiceResponse = (
  firstPlayerChoice: FirstPlayerChoiceState,
): CreatedDevMatchResponse["firstPlayerChoice"] => ({
  chooserPlayerId: firstPlayerChoice.chooserPlayerId,
  choices: ["goFirst", "goSecond"],
  ...(firstPlayerChoice.resolvedFirstPlayerId === undefined
    ? {}
    : { resolvedFirstPlayerId: firstPlayerChoice.resolvedFirstPlayerId }),
});

export const connectedPlayerIdsWithBots = (
  connectedPlayerIds: ReadonlySet<PlayerId>,
  botPlayerIds: ReadonlySet<PlayerId>,
): ReadonlySet<PlayerId> => {
  if (botPlayerIds.size === 0) {
    return connectedPlayerIds;
  }
  return new Set([...connectedPlayerIds, ...botPlayerIds]);
};

export const createdSeatResponse = (
  seats: Record<string, LocalDevMatchSeat>,
): CreatedDevMatchResponse["seats"] =>
  Object.fromEntries(
    Object.entries(seats).map(([key, seat]) => [
      key,
      {
        playerId: seat.playerId,
        claimed: seat.subject !== undefined,
      },
    ]),
  );

const playerLabelsFromSeats = (
  seats: Record<string, LocalDevMatchSeat>,
  virtualConnectedPlayerIds: ReadonlySet<PlayerId> = new Set(),
): ReturnType<typeof getLocalDevSnapshot>["playerLabels"] => {
  const labels = Object.fromEntries(
    Object.values(seats).flatMap((seat) => {
      const isVirtualConnectedPlayer = virtualConnectedPlayerIds.has(
        seat.playerId,
      );
      const subjectDisplayName = seat.subject?.displayName?.trim();
      const displayName =
        subjectDisplayName === undefined || subjectDisplayName.length === 0
          ? isVirtualConnectedPlayer
            ? "Bot"
            : undefined
          : subjectDisplayName;
      const connectionStatus = isVirtualConnectedPlayer
        ? "connected"
        : undefined;
      const avatar = seat.subject?.avatar;
      const title =
        seat.subject?.title ??
        (isVirtualConnectedPlayer ? botTitleForDifficulty() : undefined);
      const label = {
        displayName,
        connectionStatus,
        ...(avatar === undefined ? {} : { avatar }),
        ...(title === undefined ? {} : { title }),
      };
      return (displayName === undefined || displayName.length === 0) &&
        connectionStatus === undefined &&
        avatar === undefined &&
        title === undefined
        ? []
        : [[seat.playerId, label] as const];
    }),
  ) as ReturnType<typeof getLocalDevSnapshot>["playerLabels"];
  return labels === undefined || Object.keys(labels).length === 0
    ? undefined
    : labels;
};

export const syncActiveSessionPlayerLabels = (
  session: LocalDevMatchSession,
): void => {
  if (session.status !== "active") {
    return;
  }
  setLocalDevMatchPlayerLabels(
    session.match,
    playerLabelsFromSeats(session.seats, session.botPlayerIds),
  );
};

export const refreshSeatSubject = (
  seat: LocalDevMatchSeat,
  subject: AuthContext["subject"],
): void => {
  seat.subject = {
    ...seat.subject,
    ...subject,
    ...(subject.displayName === undefined
      ? {}
      : { displayName: subject.displayName }),
    ...(subject.avatar === undefined ? {} : { avatar: subject.avatar }),
    ...(subject.title === undefined ? {} : { title: subject.title }),
  };
};

export const sessionTokenForSubject = (
  subject: AuthContext["subject"],
): string =>
  createDevUserSessionToken(
    subject.userId,
    subject.sessionId,
    subject.displayName,
    subject.avatar,
    subject.title,
  );

export const matchSeatsWithMatchId = (
  sourceSeats: Record<string, Omit<LocalDevMatchSeat, "matchId">>,
  matchId: MatchId,
): Record<string, LocalDevMatchSeat> =>
  Object.fromEntries(
    Object.entries(sourceSeats).map(([key, seat]) => [
      key,
      {
        matchId,
        playerId: seat.playerId,
        ...(seat.subject === undefined
          ? {}
          : { subject: structuredClone(seat.subject) }),
        ...(seat.deckSubmission === undefined
          ? {}
          : { deckSubmission: structuredClone(seat.deckSubmission) }),
        ...(seat.verifiedHandoff === undefined
          ? {}
          : { verifiedHandoff: structuredClone(seat.verifiedHandoff) }),
      },
    ]),
  );

export const rematchSeatsFromSource = (
  sourceSeats: Record<string, LocalDevMatchSeat>,
): Record<string, Omit<LocalDevMatchSeat, "matchId">> =>
  Object.fromEntries(
    Object.entries(sourceSeats).map(([key, seat]) => [
      key,
      {
        playerId: seat.playerId,
        ...(seat.subject === undefined
          ? {}
          : { subject: structuredClone(seat.subject) }),
        ...(seat.deckSubmission === undefined
          ? {}
          : { deckSubmission: structuredClone(seat.deckSubmission) }),
        ...(seat.verifiedHandoff === undefined
          ? {}
          : { verifiedHandoff: structuredClone(seat.verifiedHandoff) }),
      },
    ]),
  );

export const previousLoserId = (
  session: ActiveLocalDevMatchSession,
): PlayerId | undefined => {
  const status = session.match.state.status;
  if (status.type !== "completed" && status.type !== "gameOver") {
    return undefined;
  }
  if (status.winner === "draw") {
    return undefined;
  }
  return session.setup.playerOrder.find(
    (playerId) => playerId !== status.winner,
  );
};

export const isCompletedSession = (
  session: ActiveLocalDevMatchSession,
): boolean =>
  session.match.state.status.type === "completed" ||
  session.match.state.status.type === "gameOver";
