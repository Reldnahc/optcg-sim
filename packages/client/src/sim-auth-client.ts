import { AuthClientError, createAuthClient } from "optcg-auth-client";
import type { AuthFetchImplementation, AuthUser } from "optcg-auth-client";
import type { SimAccessEnvironment } from "./sim-environment.js";

export interface SimProfileAvatar {
  readonly image_source: "render" | "scan";
  readonly image_url: string;
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly size: number;
  };
}

export type SimProfileTitleStyle = {
  readonly text_color?: string;
  readonly font_family?: "display" | "body" | "mono";
  readonly font_weight?: number;
  readonly gradient?: {
    readonly from: string;
    readonly via?: string;
    readonly to: string;
    readonly angle?: number;
  } | null;
  readonly outline_color?: string | null;
  readonly glow_color?: string | null;
  readonly animation?: "none" | "shine" | "pulse";
};

export interface SimProfileTitle {
  readonly key: string;
  readonly label: string;
  readonly style: SimProfileTitleStyle;
}

export type SimAuthUser = AuthUser & {
  readonly profile?: {
    readonly avatar: SimProfileAvatar | null;
    readonly title?: SimProfileTitle | null;
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
  readonly simAccessEnvironment?: SimAccessEnvironment;
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
  simAccessEnvironment = "dev",
}: CreateSimAuthClientOptions = {}): SimAuthClient => {
  const authClient = createAuthClient({
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
  return {
    async getSession() {
      try {
        const session = sessionFromResponse(await authClient.getSession());
        await authClient.fetch("/sim/access", {
          environment: simAccessEnvironment,
        });
        return session;
      } catch (error) {
        if (error instanceof AuthClientError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    async login(input) {
      const session = sessionFromResponse(await authClient.login(input));
      await authClient.fetch("/sim/access", {
        environment: simAccessEnvironment,
      });
      return session;
    },
    async register(input) {
      const session = sessionFromResponse(
        await authClient.register({
          username: input.username,
          password: input.password,
          email: input.email.length === 0 ? null : input.email,
        }),
      );
      await authClient.fetch("/sim/access", {
        environment: simAccessEnvironment,
      });
      return session;
    },
    async logout() {
      await authClient.logout();
    },
  };
};
