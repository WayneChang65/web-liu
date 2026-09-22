// --- "存入HackMD" — new save module (D10 replaced the broken legacy one) ---
//
// Two modes, chosen by whether the current editor tab is bound to a note:
//   bound    -> PATCH note content in place (light confirm, D3)
//   unbound  -> "另存新檔" form: title + token + remember (lean fields only)
//
// Content pipeline: editor HTML -> sanitize -> Turndown -> Markdown (same as
// the old export path, which is not part of the deleted feature).
// Tab bindings live in main.js (Map<tabId, {noteId, title}>); this module
// asks for the current binding via deps.

import {
  loadHackmdToken,
  loadHackmdPrefs,
  saveHackmdSettings,
  createNote,
  updateNoteContent,
} from "./hackmd-api.js";

/**
 * Wire the save dialog + button. deps:
 *   deps.editorEl                    — contenteditable editor
 *   deps.turndownService             — TurndownService instance (HTML → MD)
 *   deps.sanitizeEditorHtml
 *   deps.showToast(message)
 *   deps.getBinding()                — {noteId, title} | null for current tab
 *   deps.setBinding(binding|null)    — update after 另存新檔 / 開啟
 * Returns { open, dialog } for main.js wiring.
 */
export function initHackmdSave(deps) {
  const {
    editorEl,
    turndownService,
    sanitizeEditorHtml,
    showToast,
    getBinding,
    setBinding,
  } = deps;

  const button = document.getElementById("hackmd-save-button");
  const dialog = document.getElementById("hackmd-save-modal");
  if (!button || !dialog) return { open: () => {}, dialog: null };

  const heading = dialog.querySelector("#hackmd-save-heading");
  const boundNote = dialog.querySelector("#hackmd-save-bound-note");
  const titleRow = dialog.querySelector("#hackmd-save-title-row");
  const titleInput = dialog.querySelector("#hackmd-save-title");
  const tokenInput = dialog.querySelector("#hackmd-save-token");
  const rememberInput = dialog.querySelector("#hackmd-save-remember");
  const saveSettingsButton = dialog.querySelector("#hackmd-save-settings");
  const notePreview = dialog.querySelector("#hackmd-save-note");
  const form = dialog.querySelector("#hackmd-save-form");
  const submitButton = dialog.querySelector("#hackmd-save-submit");
  const cancelButton = dialog.querySelector("#hackmd-save-cancel");

  function editorMarkdown() {
    const html = sanitizeEditorHtml(editorEl.innerHTML);
    return turndownService.turndown(html);
  }

  function open() {
    const md = editorMarkdown();
    if (!md.trim()) {
      showToast("編輯區是空的，沒有可以存入的內容");
      return;
    }
    tokenInput.value = loadHackmdToken();
    rememberInput.checked = loadHackmdPrefs().remember !== false;
    const binding = getBinding();

    if (binding) {
      // Update mode: lean confirm sheet (D3).
      heading.textContent = "存入 HackMD（更新原檔）";
      boundNote.textContent = `將更新：《${binding.title || "（無標題）"}》`;
      boundNote.style.display = "block";
      titleRow.style.display = "none";
      submitButton.textContent = "更新原檔";
      notePreview.value = md;
    } else {
      // Save-as-new mode: title required.
      heading.textContent = "存入 HackMD（另存新檔）";
      boundNote.style.display = "none";
      titleRow.style.display = "block";
      submitButton.textContent = "存入新檔";
      notePreview.value = md;
      if (!titleInput.value) {
        const firstLine = (md.split("\n")[0] || "")
          .replace(/^#+\s*/, "")
          .trim();
        titleInput.value = firstLine.slice(0, 60);
      }
    }
    dialog.showModal();
  }

  button.addEventListener("click", () => {
    open();
    const topMenu = document.getElementById("top-button-container");
    if (topMenu) topMenu.classList.remove("expanded"); // mobile drawer
  });

  saveSettingsButton.addEventListener("click", () => {
    saveHackmdSettings({
      token: tokenInput.value.trim(),
      remember: rememberInput.checked,
    });
    showToast("已儲存 HackMD 設定");
  });

  cancelButton.addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async (e) => {
    // We manage closing ourselves so the dialog stays open (with the error
    // visible) when the API fails.
    e.preventDefault();

    const token = tokenInput.value.trim();
    if (!token) {
      showToast("請先填入 HackMD API Token");
      tokenInput.focus();
      return;
    }

    const binding = getBinding();
    const content = notePreview.value;

    if (!binding && !titleInput.value.trim()) {
      showToast("請填入標題");
      titleInput.focus();
      return;
    }
    if (binding) {
      const proceed = confirm(`確定要更新《${binding.title || "（無標題）"}》的內容？`);
      if (!proceed) return;
    }

    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = "存入中…";
    try {
      const result = binding
        ? await updateNoteContent(token, binding.noteId, content)
        : await createNote(token, {
            title: titleInput.value.trim(),
            content,
          });

      if (result.ok) {
        saveHackmdSettings({ token, remember: rememberInput.checked });
        if (binding) {
          showToast("已更新 HackMD 原檔");
        } else {
          const created = result.data || {};
          // 另存成功後分頁即綁定新檔，之後再存就是原地更新。
          setBinding({ noteId: created.id, title: created.title || titleInput.value.trim() });
          showToast(`已存入 HackMD：${created.shortId || created.title || ""}`);
        }
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
