// Minimal HackMD API forwarder — production sidecar for the "存入HackMD"
// feature (web-liu front-end calls same-origin /api/hackmd/*; the Apache
// container is static-only, so Traefik routes /api to this service).
//
// Design constraints:
//   - Zero dependencies (node:http + node:https only).
//   - Whitelist forward: ONLY /api/hackmd/* → https://api.hackmd.io/v1/*
//     (no arbitrary URLs → no SSRF surface).
//   - Only the headers HackMD needs are forwarded; the bearer token passes
//     through and is never logged or persisted.
//   - Response body capped (MAX_BODY_BYTES) so a bad upstream can't OOM us.

const http = require("node:http");
const https = require("node:https");

const PORT = parseInt(process.env.PORT, 10) || 8088;
const UPSTREAM_HOST = "api.hackmd.io";
const PREFIX = "/api/hackmd";
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB — plenty for a markdown note
const ALLOWED_METHODS = new Set(["POST", "OPTIONS"]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // Path parsing: exact prefix or prefix + "/" only. Reject traversal-ish
  // paths and anything that doesn't map onto /v1.
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) {
    return send(res, 404, '{"error":"not found"}');
  }
  const downstream = "/v1" + path.slice(PREFIX.length) + url.search;

  if (!ALLOWED_METHODS.has(req.method)) {
    return send(res, 405, '{"error":"method not allowed"}');
  }

  let bodySize = 0;
  const chunks = [];
  req.on("data", (chunk) => {
    bodySize += chunk.length;
    if (bodySize > MAX_BODY_BYTES) {
      send(res, 413, '{"error":"content too large"}');
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("error", () => {
    if (!res.headersSent) send(res, 400, '{"error":"bad request"}');
  });

  req.on("end", () => {
    if (res.writableEnded) return;

    const upstreamReq = https.request(
      {
        hostname: UPSTREAM_HOST,
        path: downstream,
        method: req.method,
        headers: {
          "Content-Type": req.headers["content-type"] || "application/json",
          ...(req.headers.authorization
            ? { Authorization: req.headers.authorization }
            : {}),
        },
      },
      (upstreamRes) => {
        const status = upstreamRes.statusCode || 502;
        const outHeaders = {
          "Content-Type":
            upstreamRes.headers["content-type"] ||
            "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        };
        res.writeHead(status, outHeaders);
        upstreamRes.pipe(res);
      },
    );

    upstreamReq.on("error", () => {
      if (!res.headersSent) {
        send(res, 502, '{"error":"upstream unreachable"}');
      } else {
        res.end();
      }
    });

    if (chunks.length) upstreamReq.write(Buffer.concat(chunks));
    upstreamReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`hackmd-proxy listening on ${PORT} -> https://${UPSTREAM_HOST}/v1`);
});
