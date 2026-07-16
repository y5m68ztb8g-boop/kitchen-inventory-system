FROM node:22-bookworm-slim AS dependencies

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@11.10.0

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS runtime

RUN npm install --global pnpm@11.10.0

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./package.json
COPY --from=dependencies /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY . .
RUN mkdir -p /app/local-data && chown -R node:node /app

USER node
EXPOSE 4174
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "4174", "--strictPort"]
