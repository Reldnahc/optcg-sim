import { defineConfig } from "vite";

const ignoredWebSocketAbortCodes = new Set(["ECONNABORTED", "ECONNRESET"]);

const proxyErrorCode = (error) => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return error.code;
};

export default defineConfig(({ command }) => {
  const clientBase =
    process.env.OPTCG_CLIENT_BASE ??
    (command === "serve" ? "/sim-runtime/" : "/");

  return {
    base: clientBase,
    server: {
      proxy: {
        "/api": {
          target: process.env.OPTCG_MATCH_SERVER_URL ?? "http://127.0.0.1:5177",
          changeOrigin: true,
          ws: true,
          configure: (proxy) => {
            proxy.on("error", (error) => {
              if (ignoredWebSocketAbortCodes.has(proxyErrorCode(error))) {
                return;
              }
              throw error;
            });
          },
        },
      },
    },
  };
});
