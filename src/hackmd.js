// --- HACKMD EXPORT ---
//
// Posts the editor content (converted to Markdown) to HackMD via the official
// API. HackMD's API sends no CORS headers, so requests go through a
// same-origin proxy mounted at /api/hackmd (vite dev proxy in development,
// the sidecar container in production — see proxy/server.js).
//
// The API token is supplied by the user and forwarded per-request; the proxy
// never persists it. It is kept in localStorage only when the user opts in
// via the "記住" checkbox.

const HACKMD_API_PATH = "/api/hackmd/v1/docs";
const TOKEN_KEY = "boshiamy-hackmd-token";
const PREFS_KEY = "boshiamy-hackmd-prefs";
const PERMALINK_RE = /^[A-Za-z0-9_-]{3,100}$/;

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

/** Persist token + form defaults; unchecking remember wipes both. */
function saveSettings({ token, remember, permission, permaLink }) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ permission, permaLink, remember: true }),
    );
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PREFS_KEY);
  }
}

/**
 * Assemble the HackMD POST body. Optional fields are omitted when empty so
 * the API applies its own defaults.
 */
export function buildHackmdPayload({
  title,
  description,
  note,
  permission,
  permaLink,
}) {
  const payload = { title, note };
  if (description) payload.description = description;
  if (permission) payload.permission = permission;
  if (permaLink) payload.permaLink = permaLink;
  return payload;
}

/**
 * POST a payload to HackMD through the same-origin proxy.
 * Returns { ok, data } on success or { ok: false, error } on failure —
 * never throws, so the caller only deals with user-visible messages.
 */
export async function postHackmdDoc({ token, payload }) {
  let res;
  try {
    res = await fetch(HACKMD_API_PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Network-level failure: proxy down, offline, DNS, etc.
    return { ok: false, error: "連不上 HackMD 代理，請稍後再試。" };
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body; fall through to status-based error */
  }

  if (res.ok && data && data.ok && data.data) {
    return { ok: true, data: data.data };
  }

  const error =
    (data && data.error) || `HackMD 回覆錯誤（HTTP ${res.status}）`;
  return { ok: false, error };
}

/**
 * Wire the "存入HackMD" dialog. `deps` injects everything this module needs
 * from the page so it stays independently testable.
 *   deps.editorEl    — contenteditable editor
 *   deps.turndownService — TurndownService instance (HTML → Markdown)
 *   deps.sanitizeEditorHtml — allowlist sanitizer for editor HTML
 *   deps.showToast(message)
 *
 * Returns { open, dialog } for callers (e.g. main.js) that trigger the modal.
 */
export function initHackmd(deps) {
  const { editorEl, turndownService, sanitizeEditorHtml, showToast } = deps;

  const button = document.getElementById("hackmd-button");
  const dialog = document.getElementById("hackmd-modal");
  if (!button || !dialog) return { open: () => {}, dialog: null };

  const form = dialog.querySelector("#hackmd-form");
  const tokenInput = dialog.querySelector("#hackmd-token");
  const titleInput = dialog.querySelector("#hackmd-title");
  const descInput = dialog.querySelector("#hackmd-description");
  const permissionSelect = dialog.querySelector("#hackmd-permission");
  const permaLinkInput = dialog.querySelector("#hackmd-permalink");
  const noteInput = dialog.querySelector("#hackmd-note");
  const rememberInput = dialog.querySelector("#hackmd-remember");
  const saveSettingsButton = dialog.querySelector("#hackmd-save-settings");
  const submitButton = dialog.querySelector("#hackmd-submit");
  const cancelButton = dialog.querySelector("#hackmd-cancel");

  function currentSettings() {
    return {
      token: tokenInput.value.trim(),
      remember: rememberInput.checked,
      permission: permissionSelect.value,
      permaLink: permaLinkInput.value.trim(),
    };
  }

  function open() {
    // Prefill token/prefs from localStorage.
    const prefs = loadHackmdPrefs();
    tokenInput.value = loadHackmdToken();
    rememberInput.checked = prefs.remember !== false;
    if (prefs.permission) permissionSelect.value = prefs.permission;
    if (prefs.permaLink) permaLinkInput.value = prefs.permaLink;

    // Prefill content: sanitized editor HTML → Markdown, description prepended
    // happens server-side via the description field, so note stays pure content.
    const html = sanitizeEditorHtml(editorEl.innerHTML);
    noteInput.value = turndownService.turndown(html);
    if (!titleInput.value) {
      // Sensible default title: first non-empty line, truncated.
      const firstLine = (turndownService.turndown(html).split("\n")[0] || "")
        .replace(/^#+\s*/, "")
        .trim();
      titleInput.value = firstLine.slice(0, 60);
    }

    dialog.showModal();
  }

  button.addEventListener("click", () => {
    open();
    const topMenu = document.getElementById("top-button-container");
    if (topMenu) topMenu.classList.remove("expanded"); // mobile drawer
  });

  saveSettingsButton.addEventListener("click", () => {
    saveSettings(currentSettings());
    showToast("已儲存 HackMD 設定");
  });

  cancelButton.addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async (e) => {
    // <form method="dialog"> would close on submit; we manage closing ourselves
    // so the dialog stays open (with the error visible) when the API fails.
    e.preventDefault();

    const token = tokenInput.value.trim();
    if (!token) {
      showToast("請先填入 HackMD API Token");
      tokenInput.focus();
      return;
    }
    if (!titleInput.value.trim()) {
      showToast("請填入標題");
      titleInput.focus();
      return;
    }
    const permaLink = permaLinkInput.value.trim();
    if (permaLink && !PERMALINK_RE.test(permaLink)) {
      showToast("自有代稱僅限英文、數字、底線與連字號（3-100 字）");
      permaLinkInput.focus();
      return;
    }

    const payload = buildHackmdPayload({
      title: titleInput.value.trim(),
      description: descInput.value.trim(),
      note: noteInput.value,
      permission: permissionSelect.value,
      permaLink,
    });

    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = "存入中…";
    try {
      const result = await postHackmdDoc({ token, payload });
      if (result.ok) {
        saveSettings(currentSettings());
        showToast(`已存入 HackMD：${result.data.permaLink || result.data.shortId}`);
        dialog.close();
      } else {
        showToast(result.error);
      }
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });

  return { open, dialog };
}
