export type AuthSubject =
  | { type: "anonymousDev"; devSessionId: string }
  | { type: "user"; userId: string; sessionId: string };

export interface AuthContext {
  subject: AuthSubject;
}

export const subjectsMatch = (
  left: AuthSubject,
  right: AuthSubject,
): boolean => {
  switch (left.type) {
    case "anonymousDev":
      return (
        right.type === "anonymousDev" &&
        left.devSessionId === right.devSessionId
      );
    case "user":
      return (
        right.type === "user" &&
        left.userId === right.userId &&
        left.sessionId === right.sessionId
      );
  }
};
