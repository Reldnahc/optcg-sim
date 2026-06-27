import { AuthClientError, createAuthClient } from "optcg-auth-client";
import type { AuthFetchImplementation, AuthUser } from "optcg-auth-client";

export interface SimProfileAvatar {
  readonly image_source: "render" | "scan";
  readonly image_url: string;
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly size: number;
  };
}

export type SimAuthUser = AuthUser & {
  readonly profile?: {
    readonly avatar: SimProfileAvatar | null;
  };
};

export interface SimAuthSession {
  readonly user: SimAuthUser;
  readonly session: {
    readonly id: string;
    readonly expiresAt: string;
  };
}

export interface SimLoginInput {
  readonly username: string;
  readonly password: string;
}

export interface SimRegisterInput extends SimLoginInput {
  readonly email: string;
}

export interface SimAuthClient {
  readonly getSession: () => Promise<SimAuthSession | null>;
  readonly login: (input: SimLoginInput) => Promise<SimAuthSession>;
  readonly register: (input: SimRegisterInput) => Promise<SimAuthSession>;
  readonly logout: () => Promise<void>;
}

export interface CreateSimAuthClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: AuthFetchImplementation;
}

const sessionFromResponse = (response: {
  readonly data: {
    readonly user: SimAuthUser;
    readonly session: { readonly id: string; readonly expires_at: string };
  };
}): SimAuthSession => ({
  user: response.data.user,
  session: {
    id: response.data.session.id,
    expiresAt: response.data.session.expires_at,
  },
});

export const createSimAuthClient = ({
  baseUrl,
  fetch: fetchImpl,
}: CreateSimAuthClientOptions = {}): SimAuthClient => {
  const authClient = createAuthClient({
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
  return {
    async getSession() {
      try {
        return sessionFromResponse(await authClient.getSession());
      } catch (error) {
        if (error instanceof AuthClientError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    async login(input) {
      return sessionFromResponse(await authClient.login(input));
    },
    async register(input) {
      return sessionFromResponse(
        await authClient.register({
          username: input.username,
          password: input.password,
          email: input.email.length === 0 ? null : input.email,
        }),
      );
    },
    async logout() {
      await authClient.logout();
    },
  };
};
