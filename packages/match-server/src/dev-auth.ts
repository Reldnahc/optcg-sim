import type { IncomingMessage } from "node:http";

export type AuthSubject = {
  type: "user";
  userId: string;
  sessionId: string;
  displayName?: string;
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
): string =>
  [
    "user",
    encodeURIComponent(userId),
    encodeURIComponent(sessionId),
    ...(displayName === undefined ? [] : [encodeURIComponent(displayName)]),
  ].join(":");

export const parseDevSessionToken = (
  token: string,
): AuthSubject | undefined => {
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
