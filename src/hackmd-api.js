// --- HackMD v1 API client (contract verified by M0 smoke test 2026-09-22) ---
//
// Same-origin calls only: the browser talks to /api/hackmd/* and the
// deployment layer rewrites to https://api.hackmd.io/v1/* (vite dev proxy in
// development, Traefik replacepathregex in production — see DEPLOY.md).
//
// Contract facts (M0, real token):
//   GET    /notes      -> 200 bare ARRAY (no wrapper; content always empty)
//   GET    /notes/{id} -> 200 bare note object, content in `content`
//   POST   /notes      -> 201 bare note object ({title, content, tags?})
//   PATCH  /notes/{id} -> 202 accepted; {content} alone is enough
//   DELETE /notes/{id} -> 204
// Legacy /v1/docs is DEAD (404 with a real token) — do not reintroduce it.
//
// The token is supplied per request from localStorage (user opt-in) and is
// never logged or persisted by this layer.

export const HACKMD_API_BASE = "/api/hackmd/notes";
export const TOKEN_KEY = "boshiamy-hackmd-token";
export const PREFS_KEY = "boshiamy-hackmd-prefs2";

export function loadHackmdToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function loadHackmdPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

/** Persist token + remember flag; unchecking remember wipes both. */
export function saveHackmdSettings({ token, remember }) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(PREFS_KEY, JSON.stringify({ remember: true }));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PREFS_KEY);
  }
}

async function request(method, url, { token, body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network-level failure: proxy down, offline, DNS, etc.
    return { ok: false, status: 0, error: "連不上 HackMD，請檢查網路或稍後再試。" };
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body; fall through to status handling */
  }

  if (res.status === 401) {
    return { ok: false, status: 401, error: "Token 無效或已失效，請重新填入。" };
  }
  if (!res.ok) {
    const detail =
      (data && (data.error || data.message)) || `HackMD 回覆錯誤（HTTP ${res.status}）`;
    return { ok: false, status: res.status, error: detail };
  }
  return { ok: true, status: res.status, data };
}

/** List notes of the token owner. Returns { ok, data: note[] } or { ok, error }. */
export function listNotes(token) {
  return request("GET", HACKMD_API_BASE, { token });
}

/** Fetch one note including its markdown `content`. */
export function getNote(token, noteId) {
  return request("GET", `${HACKMD_API_BASE}/${encodeURIComponent(noteId)}`, {
    token,
  });
}

/** Create a note. Body limited to the M0-verified fields. */
export function createNote(token, { title, content }) {
  return request("POST", HACKMD_API_BASE, {
    token,
    body: { title, content },
  });
}

/** Update note content in place (PATCH, 202 accepted). */
export function updateNoteContent(token, noteId, content) {
  return request("PATCH", `${HACKMD_API_BASE}/${encodeURIComponent(noteId)}`, {
    token,
    body: { content },
  });
}
