export type AuthSubject = {
  type: "user";
  userId: string;
  sessionId: string;
  displayName?: string;
};

export interface AuthContext {
  subject: AuthSubject;
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

export const subjectsMatch = (
  left: AuthSubject,
  right: AuthSubject,
): boolean => {
  return left.userId === right.userId && left.sessionId === right.sessionId;
};
