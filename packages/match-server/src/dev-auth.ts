import type { IncomingMessage } from "node:http";

export interface PlayerAvatarView {
  readonly imageUrl: string;
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly size: number;
  };
}

export type AuthSubject = {
  type: "user";
  userId: string;
  sessionId: string;
  displayName?: string;
  avatar?: PlayerAvatarView;
};

export interface AuthContext {
  subject: AuthSubject;
}

export interface AuthProvider {
  authenticate: (request: IncomingMessage) => AuthContext | undefined;
}

export const createDevUserSessionToken = (
  userId: string,
  sessionId: string,
  displayName?: string,
  avatar?: PlayerAvatarView,
): string => {
  const payload: AuthSubject = {
    type: "user",
    userId,
    sessionId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(avatar === undefined ? {} : { avatar }),
  };
  return `user-json:${encodeURIComponent(JSON.stringify(payload))}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberField = (
  record: Record<string, unknown>,
  field: string,
): number | undefined => {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

const avatarFromUnknown = (value: unknown): PlayerAvatarView | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const imageUrl = value["imageUrl"];
  const crop = value["crop"];
  if (typeof imageUrl !== "string" || !isRecord(crop)) {
    return undefined;
  }
  const x = numberField(crop, "x");
  const y = numberField(crop, "y");
  const size = numberField(crop, "size");
  return x === undefined || y === undefined || size === undefined
    ? undefined
    : { imageUrl, crop: { x, y, size } };
};

const parseJsonUserToken = (token: string): AuthSubject | undefined => {
  if (!token.startsWith("user-json:")) {
    return undefined;
  }
  const encodedPayload = token.slice("user-json:".length);
  if (encodedPayload.length === 0) {
    return undefined;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(decodeURIComponent(encodedPayload)) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(payload)) {
    return undefined;
  }
  const type = payload["type"];
  const userId = payload["userId"];
  const sessionId = payload["sessionId"];
  const displayName = payload["displayName"];
  if (
    type !== "user" ||
    typeof userId !== "string" ||
    userId.length === 0 ||
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    (displayName !== undefined && typeof displayName !== "string")
  ) {
    return undefined;
  }
  const avatar = avatarFromUnknown(payload["avatar"]);
  return {
    type,
    userId,
    sessionId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(avatar === undefined ? {} : { avatar }),
  };
};

export const parseDevSessionToken = (
  token: string,
): AuthSubject | undefined => {
  const jsonSubject = parseJsonUserToken(token);
  if (jsonSubject !== undefined) {
    return jsonSubject;
  }
  if (token.startsWith("user:")) {
    const [, encodedUserId, encodedSessionId, encodedDisplayName] =
      token.split(":");
    if (
      encodedUserId !== undefined &&
      encodedUserId.length > 0 &&
      encodedSessionId !== undefined &&
      encodedSessionId.length > 0
    ) {
      return {
        type: "user",
        userId: decodeURIComponent(encodedUserId),
        sessionId: decodeURIComponent(encodedSessionId),
        ...(encodedDisplayName === undefined
          ? {}
          : { displayName: decodeURIComponent(encodedDisplayName) }),
      };
    }
  }
  return undefined;
};

export const createDevAuthProvider = (): AuthProvider => ({
  authenticate: (request) => {
    const token = request.headers["x-optcg-session-token"];
    if (typeof token !== "string" || token.length === 0) {
      return undefined;
    }
    const subject = parseDevSessionToken(token);
    return subject === undefined ? undefined : { subject };
  },
});

export const subjectsMatch = (
  left: AuthSubject,
  right: AuthSubject,
): boolean => {
  return left.userId === right.userId && left.sessionId === right.sessionId;
};

export const subjectsOwnSameAccount = (
  left: AuthSubject,
  right: AuthSubject,
): boolean => left.userId === right.userId;
