import { AuthClientError, createAuthClient } from "optcg-auth-client";
import type {
  AuthFetchImplementation,
  AuthUser,
  RegisterInput,
} from "optcg-auth-client";

export interface SimAuthSession {
  readonly user: AuthUser;
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
    readonly user: AuthUser;
    readonly session: { readonly id: string; readonly expires_at: string };
  };
}): SimAuthSession => ({
  user: response.data.user,
  session: {
    id: response.data.session.id,
    expiresAt: response.data.session.expires_at,
  },
});

const registerPayload = (input: SimRegisterInput): RegisterInput => ({
  username: input.username,
  password: input.password,
  // Compatibility with optcg-auth-client 0.1.3. The shared package owns this
  // derivation starting in 0.1.4.
  display_name: input.username,
  email: input.email.length === 0 ? null : input.email,
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
        await authClient.register(registerPayload(input)),
      );
    },
    async logout() {
      await authClient.logout();
    },
  };
};
