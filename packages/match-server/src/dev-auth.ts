export type AuthSubject = { type: "user"; userId: string; sessionId: string };

export interface AuthContext {
  subject: AuthSubject;
}

export const createDevUserSessionToken = (
  userId: string,
  sessionId: string,
): string =>
  `user:${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}`;

export const parseDevSessionToken = (
  token: string,
): AuthSubject | undefined => {
  if (token.startsWith("user:")) {
    const [, encodedUserId, encodedSessionId] = token.split(":");
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
      };
    }
  }
  return undefined;
};

export const subjectsMatch = (
  left: AuthSubject,
  right: AuthSubject,
): boolean => {
  return left.userId === right.userId && left.sessionId === right.sessionId;
};
