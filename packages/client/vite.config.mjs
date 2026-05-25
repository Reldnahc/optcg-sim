import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: process.env.OPTCG_MATCH_SERVER_URL ?? "http://127.0.0.1:5177",
        changeOrigin: true,
      },
    },
  },
});
