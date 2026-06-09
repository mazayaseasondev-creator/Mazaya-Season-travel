# Mazaya Season Travel — production image.
# Runs the Express server, which also serves the static front-end from the repo
# root (one origin). Build from the repository root: `docker build -t mazaya .`
FROM node:22-alpine

WORKDIR /app

# Install server dependencies first (better layer caching).
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy the application (server code + static site).
COPY . .

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Document storage lives here; mount a volume to persist it.
VOLUME ["/app/server/uploads"]

CMD ["node", "server/src/index.js"]
