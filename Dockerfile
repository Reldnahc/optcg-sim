FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm run build:match-server
RUN pnpm --filter @optcg/client build:ui

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile --prod --ignore-scripts
RUN node -e "const fs=require('node:fs'); for (const name of ['types','engine-core','cards','card-support','match-server']) { const path = 'packages/' + name + '/package.json'; const pkg = JSON.parse(fs.readFileSync(path, 'utf8')); pkg.exports = pkg.exports || {}; pkg.exports['.'] = { ...(pkg.exports['.'] || {}), import: './dist/index.js' }; fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n'); }"

COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/engine-core/dist ./packages/engine-core/dist
COPY --from=build /app/packages/cards/dist ./packages/cards/dist
COPY --from=build /app/packages/card-support/dist ./packages/card-support/dist
COPY --from=build /app/packages/match-server/dist ./packages/match-server/dist
COPY --from=build /app/packages/client/dist ./packages/client/dist

ENV PONEGLYPH_SIM_STATIC_DIR=/app/packages/client/dist

EXPOSE 5177

CMD ["node", "packages/match-server/dist/server.js"]
