import { useState } from "react";

export type AuthSessionStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthSubmitStatus = "idle" | "submitting";

export interface AuthCredentials {
  readonly username: string;
  readonly password: string;
}

export interface RegisterCredentials extends AuthCredentials {
  readonly email: string;
}

export interface AuthGateProps {
  readonly sessionStatus: AuthSessionStatus;
  readonly submitStatus: AuthSubmitStatus;
  readonly error?: string | undefined;
  readonly onLogin: (input: AuthCredentials) => Promise<void>;
  readonly onRegister: (input: RegisterCredentials) => Promise<void>;
  readonly children: React.ReactNode;
}

type AuthMode = "login" | "register";

export const AuthGate = ({
  sessionStatus,
  submitStatus,
  error,
  onLogin,
  onRegister,
  children,
}: AuthGateProps): React.JSX.Element => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  if (sessionStatus === "authenticated") {
    return <>{children}</>;
  }

  if (sessionStatus === "loading") {
    return (
      <main className="auth-gate">
        <section className="auth-panel">
          <h1>Checking session</h1>
        </section>
      </main>
    );
  }

  const submitting = submitStatus === "submitting";

  return (
    <main className="auth-gate">
      <section className="auth-panel">
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
            }}
          >
            Create account
          </button>
        </div>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === "login") {
              void onLogin({ username, password });
              return;
            }
            void onRegister({ username, password, email });
          }}
        >
          <label>
            <span>Username</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              disabled={submitting}
              onChange={(event) => {
                setUsername(event.target.value);
              }}
            />
          </label>
          {mode === "register" ? (
            <label>
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                disabled={submitting}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </label>
          ) : null}
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              disabled={submitting}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </label>
          {error === undefined ? null : <p className="error-text">{error}</p>}
          <button type="submit" disabled={submitting}>
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
};
