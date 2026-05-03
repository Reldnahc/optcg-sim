module.exports = {
  "*.{js,mjs,cjs,ts,mts,cts}": [
    "corepack pnpm exec prettier --write",
    "corepack pnpm exec eslint --max-warnings=0",
  ],
  "*.{json,md,yml,yaml}": ["corepack pnpm exec prettier --write"],
};
