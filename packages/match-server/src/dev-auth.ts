import type { IncomingMessage } from "node:http";

export interface PlayerAvatarView {
  readonly imageUrl: string;
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly size: number;
  };
}

export interface PlayerProfileTitleView {
  readonly key: string;
  readonly label: string;
  readonly style: {
    readonly text_color?: string;
    readonly font_family?: "display" | "body" | "mono";
    readonly font_weight?: number;
    readonly gradient?: {
      readonly from: string;
      readonly via?: string;
      readonly to: string;
      readonly angle?: number;
    };
    readonly outline_color?: string;
    readonly glow_color?: string;
  };
}

export type AuthSubject = {
  type: "user";
  userId: string;
  sessionId: string;
  displayName?: string;
  avatar?: PlayerAvatarView;
  title?: PlayerProfileTitleView;
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
  title?: PlayerProfileTitleView,
): string => {
  const payload: AuthSubject = {
    type: "user",
    userId,
    sessionId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(avatar === undefined ? {} : { avatar }),
    ...(title === undefined ? {} : { title }),
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

const hexColorPattern =
  /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;

const hexColor = (value: unknown): string | undefined =>
  typeof value === "string" && hexColorPattern.test(value) ? value : undefined;

const fontFamily = (
  value: unknown,
): PlayerProfileTitleView["style"]["font_family"] | undefined =>
  value === "display" || value === "body" || value === "mono"
    ? value
    : undefined;

const fontWeight = (value: unknown): number | undefined =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 100 &&
  value <= 900
    ? value
    : undefined;

const titleGradientFromUnknown = (
  value: unknown,
): PlayerProfileTitleView["style"]["gradient"] | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const from = hexColor(value["from"]);
  const via = hexColor(value["via"]);
  const to = hexColor(value["to"]);
  const angle = numberField(value, "angle");
  if (from === undefined || to === undefined) {
    return undefined;
  }
  return {
    from,
    ...(via === undefined ? {} : { via }),
    to,
    ...(angle === undefined || angle < 0 || angle > 360 ? {} : { angle }),
  };
};

const titleStyleFromUnknown = (
  value: unknown,
): PlayerProfileTitleView["style"] | undefined => {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const textColor = hexColor(value["text_color"]);
  const titleFontFamily = fontFamily(value["font_family"]);
  const titleFontWeight = fontWeight(value["font_weight"]);
  const gradient = titleGradientFromUnknown(value["gradient"]);
  const outlineColor = hexColor(value["outline_color"]);
  const glowColor = hexColor(value["glow_color"]);
  return {
    ...(textColor === undefined ? {} : { text_color: textColor }),
    ...(titleFontFamily === undefined ? {} : { font_family: titleFontFamily }),
    ...(titleFontWeight === undefined ? {} : { font_weight: titleFontWeight }),
    ...(gradient === undefined ? {} : { gradient }),
    ...(outlineColor === undefined ? {} : { outline_color: outlineColor }),
    ...(glowColor === undefined ? {} : { glow_color: glowColor }),
  };
};

const titleFromUnknown = (
  value: unknown,
): PlayerProfileTitleView | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const key = value["key"];
  const label = value["label"];
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    typeof label !== "string" ||
    label.length === 0
  ) {
    return undefined;
  }
  const style = titleStyleFromUnknown(value["style"]);
  return style === undefined ? undefined : { key, label, style };
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
  const title = titleFromUnknown(payload["title"]);
  return {
    type,
    userId,
    sessionId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(avatar === undefined ? {} : { avatar }),
    ...(title === undefined ? {} : { title }),
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
