import { useCallback, useEffect, useMemo, useState } from "react";

import { createSimAuthClient } from "../sim-auth-client.js";
import type {
  SimAuthClient,
  SimAuthSession,
  SimLoginInput,
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

export const simAuthSessionToken = (session: SimAuthSession): string =>
  `user:${encodeURIComponent(session.user.id)}:${encodeURIComponent(
    session.session.id,
  )}`;

const registerInput = (input: RegisterCredentials): SimRegisterInput => ({
  username: input.username,
  password: input.password,
  displayName: input.displayName,
  email: input.email,
});

export const useSimAuth = (
  authClientOverride?: SimAuthClient,
): UseSimAuthState => {
  const defaultAuthClient = useMemo(() => createSimAuthClient(), []);
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
