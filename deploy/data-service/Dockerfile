FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

ENV NODE_ENV=production
WORKDIR /app

# Dedicated, locked server dependencies: no wallet CLIs or broker dependencies.
COPY deploy/data-service/package.json deploy/data-service/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Explicit source allowlist. No project environment files or local state.
COPY services/data-service.ts ./services/data-service.ts
COPY src/lib/contracts.ts ./src/lib/contracts.ts
COPY src/lib/integrations/hedera.ts ./src/lib/integrations/hedera.ts
RUN mkdir -p /var/lib/obolos && chown node:node /var/lib/obolos

USER node
EXPOSE 4402
CMD ["./node_modules/.bin/tsx", "services/data-service.ts"]
