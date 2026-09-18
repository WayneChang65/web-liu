# Production sidecar for the "存入HackMD" feature: forwards same-origin
# /api/hackmd/* to https://api.hackmd.io/v1/*. See proxy/server.js.
FROM node:22-alpine

# Non-root by default: the built-in 'node' user cannot bind <1024, and the
# server listens on 8088 (matches the liu-web convention).
WORKDIR /app
COPY server.js .

USER node
EXPOSE 8088
CMD ["node", "server.js"]
