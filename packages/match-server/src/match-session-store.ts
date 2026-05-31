import type { MatchId } from "@optcg/types";

export interface MatchSessionStore<TSession> {
  get(matchId: MatchId): TSession | undefined;
  set(matchId: MatchId, session: TSession): void;
  delete(matchId: MatchId): void;
  listMatchIds(): MatchId[];
}

export const createInMemoryMatchSessionStore = <
  TSession,
>(): MatchSessionStore<TSession> => {
  const sessions = new Map<MatchId, TSession>();
  return {
    get(matchId) {
      return sessions.get(matchId);
    },
    set(matchId, session) {
      sessions.set(matchId, session);
    },
    delete(matchId) {
      sessions.delete(matchId);
    },
    listMatchIds() {
      return [...sessions.keys()];
    },
  };
};
