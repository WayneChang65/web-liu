// --- HackMD file browser ("開啟HackMD") ---
//
// A <dialog> that lists the token owner's notes (sorted by lastChangedAt
// desc, searchable), fetches the chosen note's markdown, screens it against
// detectUnsupportedSyntax() (D7: block by default, force-open possible), and
// hands the content to the app via deps.onOpenNote().
//
// Token handling mirrors the save flow: one localStorage token, entered in
// place on 401, remembered only on opt-in.

import {
  loadHackmdToken,
  loadHackmdPrefs,
  saveHackmdSettings,
  listNotes,
  getNote,
} from "./hackmd-api.js";
import { detectUnsupportedSyntax } from "./markdown.js";

function formatDate(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sort notes by lastChangedAt desc (D8). Returns a new array. */
export function sortNotesByRecent(notes) {
  return [...notes].sort((a, b) => (b.lastChangedAt || 0) - (a.lastChangedAt || 0));
}

/** Client-side filter on title (case-insensitive substring). */
export function filterNotes(notes, query) {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) => (n.title || "").toLowerCase().includes(q));
}

/**
 * Wire the browser dialog. deps:
 *   deps.onOpenNote({ noteId, title, markdown })  — raw note source for the editor
 *   deps.editorHasContent()                   — truthy → confirm overwrite first
 *   deps.showToast(message)
 * Returns { open }.
 */
export function initHackmdBrowser(deps) {
  const { onOpenNote, editorHasContent, showToast } = deps;

  const button = document.getElementById("hackmd-open-button");
  const dialog = document.getElementById("hackmd-browser-modal");
  if (!button || !dialog) return { open: () => {} };

  const tokenRow = dialog.querySelector("#hackmd-browser-token-row");
  const tokenInput = dialog.querySelector("#hackmd-browser-token");
  const rememberInput = dialog.querySelector("#hackmd-browser-remember");
  const saveTokenButton = dialog.querySelector("#hackmd-browser-save-token");
  const searchInput = dialog.querySelector("#hackmd-browser-search");
  const refreshButton = dialog.querySelector("#hackmd-browser-refresh");
  const listEl = dialog.querySelector("#hackmd-browser-list");
  const statusEl = dialog.querySelector("#hackmd-browser-status");
  const cancelButton = dialog.querySelector("#hackmd-browser-cancel");

  let notesCache = [];
  let loading = false;

  function token() {
    return tokenInput.value.trim();
  }

  function setStatus(text) {
    statusEl.textContent = text || "";
    statusEl.style.display = text ? "block" : "none";
  }

  function renderList() {
    const shown = filterNotes(notesCache, searchInput.value);
    listEl.replaceChildren();
    for (const note of shown) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "hackmd-note-item";
      // Text-only nodes: titles from a remote service must never reach the
      // page as HTML.
      const title = document.createElement("span");
      title.className = "hackmd-note-title";
      title.textContent = note.title || "（無標題）";
      const meta = document.createElement("span");
      meta.className = "hackmd-note-meta";
      meta.textContent = formatDate(note.lastChangedAt);
      item.appendChild(title);
      item.appendChild(meta);
      item.addEventListener("click", () => openNote(note));
      listEl.appendChild(item);
    }
    if (shown.length === 0 && !loading) {
      setStatus(notesCache.length ? "沒有符合關鍵字的結果。" : "沒有筆記。");
    } else {
      setStatus("");
    }
  }

  async function loadList() {
    const t = token();
    if (!t) {
      showTokenRow("請先輸入 HackMD API Token 再載入清單。");
      return;
    }
    if (loading) return;
    loading = true;
    setStatus("載入中…");
    const result = await listNotes(t);
    loading = false;
    if (!result.ok) {
      if (result.status === 401) {
        showTokenRow("Token 無效或已失效，請重新輸入：");
        tokenInput.focus();
      } else {
        setStatus(result.error);
      }
      return;
    }
    if (rememberInput.checked && t !== loadHackmdToken()) {
      saveHackmdSettings({ token: t, remember: true });
    }
    notesCache = Array.isArray(result.data) ? result.data : [];
    hideTokenRowIfNotNeeded();
    setStatus("");
    renderList();
  }

  function showTokenRow(message) {
    tokenRow.style.display = "block";
    setStatus(message);
  }

  function hideTokenRowIfNotNeeded() {
    if (token()) tokenRow.style.display = "none";
  }

  async function openNote(note) {
    const t = token();
    setStatus("讀取筆記中…");
    const result = await getNote(t, note.id);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    const content = (result.data && result.data.content) || "";

    // cm5-refactor (source mode): hand the RAW markdown over — no HTML
    // round-trip anymore, so HackMD-specific syntax survives byte-for-byte
    // through edit+save. The D7 notice stays as an informational heads-up.
    const issues = detectUnsupportedSyntax(content);
    if (issues.length > 0) {
      const proceed = confirm(
        `《${note.title || "（無標題）"}》含有 HackMD 特殊語法：\n\n` +
          issues.map((s) => ` ・${s}`).join("\n") +
          `\n\n源碼編輯會原封不動保留這些文字，存回也不會改動它們，\n但它們在本站預覽中不會呈現效果。\n\n按「確定」開啟，按「取消」返回清單。`,
      );
      if (!proceed) {
        setStatus("");
        return;
      }
    }

    // D3/D10 flow: dirty editor → offer temp-save before overwriting.
    if (editorHasContent()) {
      const shouldSave = confirm(
        "編輯區已有內容，開啟筆記會覆蓋它。\n\n按「確定」先存入暫存再開啟。\n按「取消」放棄開啟。",
      );
      if (!shouldSave) {
        setStatus("");
        return;
      }
      deps.saveTempBeforeOpen();
    }

    onOpenNote({ noteId: note.id, title: note.title || "", markdown: content });
    dialog.close();
    showToast(`已開啟：${note.title || "（無標題）"}`);
  }

  function open() {
    const saved = loadHackmdToken();
    tokenInput.value = saved;
    rememberInput.checked = loadHackmdPrefs().remember !== false;
    searchInput.value = "";
    if (saved) {
      tokenRow.style.display = "none";
      loadList();
    } else {
      notesCache = [];
      renderList();
      showTokenRow("第一次使用請輸入 Token（於 hackmd.io「設定 → API」建立）：");
      tokenInput.focus();
    }
    dialog.showModal();
  }

  button.addEventListener("click", () => {
    open();
    const topMenu = document.getElementById("top-button-container");
    if (topMenu) topMenu.classList.remove("expanded"); // mobile drawer
  });
  searchInput.addEventListener("input", renderList);
  refreshButton.addEventListener("click", loadList);
  saveTokenButton.addEventListener("click", () => {
    saveHackmdSettings({ token: token(), remember: rememberInput.checked });
    showToast("已儲存 HackMD Token");
    hideTokenRowIfNotNeeded();
    loadList();
  });
  tokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTokenButton.click();
    }
  });
  cancelButton.addEventListener("click", () => dialog.close());

  return { open, dialog };
}
