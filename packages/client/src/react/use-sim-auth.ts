import { useCallback, useEffect, useMemo, useState } from "react";

import { createSimAuthClient } from "../sim-auth-client.js";
import { simAccessEnvironmentForLocation } from "../sim-environment.js";
import type { PlayerAvatarView, PlayerProfileTitleView } from "../transport.js";
import type {
  SimAuthClient,
  SimAuthSession,
  SimLoginInput,
  SimProfileTitleStyle,
  SimRegisterInput,
} from "../sim-auth-client.js";
import type { RegisterCredentials } from "./AuthGate.js";

export type SimAuthStatus = "loading" | "authenticated" | "unauthenticated";
export type SimAuthSubmitStatus = "idle" | "submitting";

export interface UseSimAuthState {
  readonly status: SimAuthStatus;
  readonly submitStatus: SimAuthSubmitStatus;
  readonly session?: SimAuthSession | undefined;
  readonly error?: string | undefined;
  readonly login: (input: SimLoginInput) => Promise<void>;
  readonly register: (input: RegisterCredentials) => Promise<void>;
  readonly logout: () => Promise<void>;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const sessionDisplayName = (session: SimAuthSession): string =>
  session.user.display_name.length === 0
    ? session.user.username
    : session.user.display_name;

const sessionAvatar = (
  session: SimAuthSession,
): PlayerAvatarView | undefined =>
  session.user.profile?.avatar === null ||
  session.user.profile?.avatar === undefined
    ? undefined
    : {
        imageUrl: session.user.profile.avatar.image_url,
        crop: { ...session.user.profile.avatar.crop },
      };

const sessionTitleStyle = (
  style: SimProfileTitleStyle,
): PlayerProfileTitleView["style"] => ({
  ...(style.text_color === undefined ? {} : { text_color: style.text_color }),
  ...(style.font_family === undefined
    ? {}
    : { font_family: style.font_family }),
  ...(style.font_weight === undefined
    ? {}
    : { font_weight: style.font_weight }),
  ...(style.gradient === null || style.gradient === undefined
    ? {}
    : { gradient: { ...style.gradient } }),
  ...(style.outline_color === null || style.outline_color === undefined
    ? {}
    : { outline_color: style.outline_color }),
  ...(style.glow_color === null || style.glow_color === undefined
    ? {}
    : { glow_color: style.glow_color }),
});

const sessionTitle = (
  session: SimAuthSession,
): PlayerProfileTitleView | undefined =>
  session.user.profile?.title === null ||
  session.user.profile?.title === undefined
    ? undefined
    : {
        key: session.user.profile.title.key,
        label: session.user.profile.title.label,
        style: sessionTitleStyle(session.user.profile.title.style),
      };

export const simAuthSessionToken = (session: SimAuthSession): string => {
  const avatar = sessionAvatar(session);
  const title = sessionTitle(session);
  return `user-json:${encodeURIComponent(
    JSON.stringify({
      type: "user",
      userId: session.user.id,
      sessionId: session.session.id,
      displayName: sessionDisplayName(session),
      ...(avatar === undefined ? {} : { avatar }),
      ...(title === undefined ? {} : { title }),
    }),
  )}`;
};

const registerInput = (input: RegisterCredentials): SimRegisterInput => ({
  username: input.username,
  password: input.password,
  email: input.email,
});

export const useSimAuth = (
  authClientOverride?: SimAuthClient,
): UseSimAuthState => {
  const simAccessEnvironment = useMemo(
    () =>
      typeof window === "undefined"
        ? "dev"
        : simAccessEnvironmentForLocation(window.location),
    [],
  );
  const defaultAuthClient = useMemo(
    () => createSimAuthClient({ simAccessEnvironment }),
    [simAccessEnvironment],
  );
  const authClient = authClientOverride ?? defaultAuthClient;
  const [status, setStatus] = useState<SimAuthStatus>("loading");
  const [submitStatus, setSubmitStatus] = useState<SimAuthSubmitStatus>("idle");
  const [session, setSession] = useState<SimAuthSession>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(undefined);
    void authClient
      .getSession()
      .then((nextSession) => {
        if (cancelled) {
          return;
        }
        if (nextSession === null) {
          setSession(undefined);
          setStatus("unauthenticated");
          return;
        }
        setSession(nextSession);
        setStatus("authenticated");
      })
      .catch((nextError: unknown) => {
        if (cancelled) {
          return;
        }
        setSession(undefined);
        setStatus("unauthenticated");
        setError(errorMessage(nextError));
      });
    return () => {
      cancelled = true;
    };
  }, [authClient]);

  const login = useCallback(
    async (input: SimLoginInput): Promise<void> => {
      setSubmitStatus("submitting");
      setError(undefined);
      try {
        const nextSession = await authClient.login(input);
        setSession(nextSession);
        setStatus("authenticated");
      } catch (nextError) {
        setSession(undefined);
        setStatus("unauthenticated");
        setError(errorMessage(nextError));
      } finally {
        setSubmitStatus("idle");
      }
    },
    [authClient],
  );

  const register = useCallback(
    async (input: RegisterCredentials): Promise<void> => {
      setSubmitStatus("submitting");
      setError(undefined);
      try {
        const nextSession = await authClient.register(registerInput(input));
        setSession(nextSession);
        setStatus("authenticated");
      } catch (nextError) {
        setSession(undefined);
        setStatus("unauthenticated");
        setError(errorMessage(nextError));
      } finally {
        setSubmitStatus("idle");
      }
    },
    [authClient],
  );

  const logout = useCallback(async (): Promise<void> => {
    setSubmitStatus("submitting");
    setError(undefined);
    try {
      await authClient.logout();
      setSession(undefined);
      setStatus("unauthenticated");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setSubmitStatus("idle");
    }
  }, [authClient]);

  return {
    status,
    submitStatus,
    session,
    error,
    login,
    register,
    logout,
  };
};
