import type { MatchId, PlayerId } from "@optcg/types";

export interface ClientSeatIdentity {
  matchId: MatchId;
  playerId: PlayerId;
}

export interface ClientSeatCredential extends ClientSeatIdentity {
  sessionToken: string;
}

export interface ClientGuestIdentity {
  guestToken: string;
}

export interface ClientStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface ClientSessionStore {
  setCurrentSeat: (seat: ClientSeatIdentity) => void;
  loadCurrentSeat: () => ClientSeatIdentity | undefined;
  saveClaimedSeat: (credential: ClientSeatCredential) => void;
  loadClaimedSeat: () => ClientSeatCredential | undefined;
  loadGuestIdentity: () => ClientGuestIdentity | undefined;
  loadOrCreateGuestIdentity: () => ClientGuestIdentity;
  clear: () => void;
}

const currentSeatKey = "optcg:client:current-seat";
const credentialKey = "optcg:client:seat-credential";
const guestIdentityKey = "optcg:client:guest-identity";

const createGuestToken = (): string => `guest:${crypto.randomUUID()}`;

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every((entry) => typeof entry === "string");

const parseJsonRecord = (
  value: string | null,
): Record<string, string> | undefined => {
  if (value === null) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isStringRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const loadSeatIdentity = (
  storage: ClientStorage,
): ClientSeatIdentity | undefined => {
  const parsed = parseJsonRecord(storage.getItem(currentSeatKey));
  const matchId = parsed?.["matchId"];
  const playerId = parsed?.["playerId"];
  if (matchId === undefined || playerId === undefined) {
    return undefined;
  }
  return { matchId: matchId as MatchId, playerId: playerId as PlayerId };
};

const loadCredential = (
  storage: ClientStorage,
): ClientSeatCredential | undefined => {
  const parsed = parseJsonRecord(storage.getItem(credentialKey));
  const matchId = parsed?.["matchId"];
  const playerId = parsed?.["playerId"];
  const sessionToken = parsed?.["sessionToken"];
  if (
    matchId === undefined ||
    playerId === undefined ||
    sessionToken === undefined
  ) {
    return undefined;
  }
  return {
    matchId: matchId as MatchId,
    playerId: playerId as PlayerId,
    sessionToken,
  };
};

const loadGuestIdentity = (
  storage: ClientStorage,
): ClientGuestIdentity | undefined => {
  const parsed = parseJsonRecord(storage.getItem(guestIdentityKey));
  const guestToken = parsed?.["guestToken"];
  return guestToken === undefined ? undefined : { guestToken };
};

export const createClientSessionStore = ({
  storage,
}: {
  storage: ClientStorage;
}): ClientSessionStore => ({
  setCurrentSeat(seat) {
    const current = loadCredential(storage);
    storage.setItem(currentSeatKey, JSON.stringify(seat));
    if (
      current !== undefined &&
      (current.matchId !== seat.matchId || current.playerId !== seat.playerId)
    ) {
      storage.removeItem(credentialKey);
    }
  },
  loadCurrentSeat() {
    return loadSeatIdentity(storage);
  },
  saveClaimedSeat(credential) {
    storage.setItem(
      currentSeatKey,
      JSON.stringify({
        matchId: credential.matchId,
        playerId: credential.playerId,
      }),
    );
    storage.setItem(credentialKey, JSON.stringify(credential));
  },
  loadClaimedSeat() {
    const credential = loadCredential(storage);
    const current = loadSeatIdentity(storage);
    if (
      credential === undefined ||
      current === undefined ||
      credential.matchId !== current.matchId ||
      credential.playerId !== current.playerId
    ) {
      return undefined;
    }
    return credential;
  },
  loadGuestIdentity() {
    return loadGuestIdentity(storage);
  },
  loadOrCreateGuestIdentity() {
    const existing = loadGuestIdentity(storage);
    if (existing !== undefined) {
      return existing;
    }
    const guest = { guestToken: createGuestToken() };
    storage.setItem(guestIdentityKey, JSON.stringify(guest));
    return guest;
  },
  clear() {
    storage.removeItem(currentSeatKey);
    storage.removeItem(credentialKey);
    storage.removeItem(guestIdentityKey);
  },
});

export const createMemoryClientStorage = (): ClientStorage => {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
};
