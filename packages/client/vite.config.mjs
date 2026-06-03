import { defineConfig } from "vite";

const ignoredWebSocketAbortCodes = new Set(["ECONNABORTED", "ECONNRESET"]);

const proxyErrorCode = (error) => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return error.code;
};

export default defineConfig({
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
});
