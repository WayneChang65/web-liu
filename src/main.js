// --- main.js (cm5-refactor) — app wiring around the CM5 editor core ---
//
// Architecture after the refactor (D20–D25):
//   editor.js    CM5 instance + boshiamy interceptor + formatting keymap
//   preview.js   markdown → sanitized preview HTML (KaTeX via marked ext)
//   diagram.js   mermaid placeholders → sandboxed iframe SVGs
//   hackmd*.js   open/save flows (now Markdown-native end to end)
// This file keeps everything app-level: tabs (one CM Doc per tab), draft
// storage (v2 = markdown source; v1 = legacy rich HTML, migrated once),
// theme/immersive/drawer, font size (D24: whole editor), preview toggle,
// toast, mode indicator/logo.

import "./style.css";
import "katex/dist/katex.min.css";
import CodeMirror from "codemirror";
import TurndownService from "turndown";
import { initEditor } from "./editor.js";
import { renderPreviewMarkdown, sanitizePreviewHtml } from "./preview.js";
import { hydrateMermaidBlocks } from "./diagram.js";
import { initHackmdSave } from "./hackmd.js";
import { initHackmdBrowser } from "./hackmd-browser.js";
import { sanitizeEditorHtml } from "./sanitize.js";

const modeIndicator = document.getElementById("mode-indicator");
const copyButton = document.getElementById("copy-button");
const themeToggleButton = document.getElementById("theme-toggle-button");
const immersiveToggleButton = document.getElementById(
  "immersive-toggle-button",
);
const zoomInButton = document.getElementById("zoom-in-button");
const zoomOutButton = document.getElementById("zoom-out-button");
const saveMdButton = document.getElementById("save-md-button");
const buttonContainer = document.querySelector(".button-container");
const buttonToggle = document.getElementById("button-toggle");
const editorTabs = document.getElementById("editor-tabs");
const topButtonContainer = document.getElementById("top-button-container");
const topButtonToggle = document.getElementById("top-button-toggle");
const logoContainer = document.getElementById("logo-container");
const logoImage = logoContainer.querySelector("img");
const modeTextEl = document.getElementById("mode-text");
const fontSizeIndicatorEl = document.getElementById("font-size-indicator");
const previewPane = document.getElementById("preview-pane");
const viewModePill = document.getElementById("view-mode-pill");
const descriptionButton = document.getElementById("description-button");
const toastEl = document.getElementById("toast");

// --- USER FEEDBACK (TOAST) ---
let toastTimer;
function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 3000);
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error("localStorage.setItem failed:", err);
    showToast("暫存失敗：瀏覽器儲存空間不足，請縮短內容後再試。");
    return false;
  }
}

// --- DRAFT STORAGE: v2 = markdown source; v1 (legacy) = contenteditable HTML ---
function storageKey(id) {
  return `boshiamy-editor-content-v2-${id}`;
}
function legacyStorageKey(id) {
  return `boshiamy-editor-content-${id}`;
}

// turndown stays ONLY for migrating legacy HTML drafts (and nothing else —
// the editor pipeline is markdown-native now). Rules mirror the old export.
const turndownService = new TurndownService({ headingStyle: "atx" });
turndownService.addRule("keepUnderline", {
  filter: "u",
  replacement: (content) => "<u>" + content + "</u>",
});
turndownService.addRule("keepFontSizeSpan", {
  filter: (node) => node.nodeName === "SPAN" && node.style.fontSize,
  replacement: (content, node) =>
    '<span style="' + node.getAttribute("style") + '">' + content + "</span>",
});
turndownService.addRule("asteriskItalic", {
  filter: ["em", "i"],
  replacement: (content) => "*" + content + "*",
});

function migrateLegacyDraft(id) {
  const legacy = localStorage.getItem(legacyStorageKey(id));
  if (legacy === null) return null; // nothing to migrate
  let md = "";
  try {
    md = turndownService.turndown(sanitizeEditorHtml(legacy));
  } catch (err) {
    console.error("legacy draft migration failed:", err);
  }
  safeSetItem(storageKey(id), md);
  localStorage.removeItem(legacyStorageKey(id));
  return md;
}

function loadTabDraft(id) {
  const stored = localStorage.getItem(storageKey(id));
  if (stored !== null) return stored;
  const migrated = migrateLegacyDraft(id);
  return migrated === null ? "" : migrated;
}

// --- IME MODE (app-level state; the engine itself lives in editor.js) ---
let imeMode = localStorage.getItem("boshiamy-ime-mode") || "boshiamy";
let lastActiveImeMode = imeMode === "disabled" ? "boshiamy" : imeMode;

function updateModeIndicator() {
  let modeText, modeClass;
  if (imeMode === "boshiamy") {
    modeText = "嘸蝦米模式";
    modeClass = "boshiamy";
  } else if (imeMode === "english") {
    modeText = "英數模式";
    modeClass = "english";
  } else {
    modeText = "無效模式";
    modeClass = "disabled";
  }
  modeTextEl.textContent = modeText;
  modeTextEl.className = `mode-text ${modeClass}`;
  fontSizeIndicatorEl.textContent = `, 字型大小：${Math.round(currentFontSize * 10)}`;
}

function updateLogoState() {
  if (imeMode === "disabled") {
    logoImage.classList.add("disabled-logo");
    logoContainer.title = "點擊啟用輸入法";
  } else {
    logoImage.classList.remove("disabled-logo");
    logoContainer.title = "點擊暫停輸入法 (無效模式)";
  }
}

function toggleImeMode() {
  if (imeMode === "disabled") {
    // Ctrl-P while disabled swaps the "background" mode (old semantics).
    lastActiveImeMode =
      lastActiveImeMode === "boshiamy" ? "english" : "boshiamy";
  } else {
    imeMode = imeMode === "boshiamy" ? "english" : "boshiamy";
    lastActiveImeMode = imeMode;
    safeSetItem("boshiamy-ime-mode", imeMode);
  }
  editor.clearIme();
  updateModeIndicator();
}

function toggleDisabledMode() {
  if (imeMode === "disabled") {
    imeMode = lastActiveImeMode;
  } else {
    lastActiveImeMode = imeMode;
    imeMode = "disabled";
  }
  safeSetItem("boshiamy-ime-mode", imeMode);
  editor.clearIme();
  updateModeIndicator();
  updateLogoState();
}

modeIndicator.addEventListener("click", toggleImeMode);
modeIndicator.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleImeMode();
  }
});
logoContainer.addEventListener("click", toggleDisabledMode);
if (viewModePill) {
  viewModePill.addEventListener("click", togglePreview);
  viewModePill.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      togglePreview();
    }
  });
}

// --- THEME ---
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-mode");
    themeToggleButton.textContent = "淺色模式";
  } else {
    document.body.classList.remove("dark-mode");
    themeToggleButton.textContent = "深色模式";
  }
}
applyTheme(localStorage.getItem("theme") || "light");

themeToggleButton.addEventListener("click", () => {
  const isDarkMode = document.body.classList.toggle("dark-mode");
  const newTheme = isDarkMode ? "dark" : "light";
  safeSetItem("theme", newTheme);
  applyTheme(newTheme);
  topButtonContainer.classList.remove("expanded");
  if (previewActive) refreshPreview(); // diagrams/theme react to mode flip
});

// --- IMMERSIVE MODE (unchanged behavior) ---
let inactivityTimer;
const collapseImmersiveButtons = () => {
  if (document.body.classList.contains("immersive-mode")) {
    buttonContainer.classList.remove("expanded");
  }
};
const resetInactivityTimer = () => {
  clearTimeout(inactivityTimer);
  if (document.body.classList.contains("immersive-mode")) {
    inactivityTimer = setTimeout(collapseImmersiveButtons, 3000);
  }
};
const activityEvents = ["mousemove", "keydown", "scroll"];
immersiveToggleButton.addEventListener("click", () => {
  const isImmersive = document.body.classList.toggle("immersive-mode");
  if (isImmersive) {
    immersiveToggleButton.textContent = "離開沉浸模式";
    activityEvents.forEach((ev) =>
      window.addEventListener(ev, resetInactivityTimer),
    );
    resetInactivityTimer();
  } else {
    immersiveToggleButton.textContent = "沉浸模式";
    buttonContainer.classList.remove("expanded");
    clearTimeout(inactivityTimer);
    activityEvents.forEach((ev) =>
      window.removeEventListener(ev, resetInactivityTimer),
    );
  }
  topButtonContainer.classList.remove("expanded");
});

buttonToggle.addEventListener("click", () => {
  buttonContainer.classList.toggle("expanded");
  if (buttonContainer.classList.contains("expanded")) {
    clearTimeout(inactivityTimer);
  } else {
    resetInactivityTimer();
  }
});

// --- TOP DRAWER (mobile) ---
topButtonToggle.addEventListener("click", () => {
  topButtonContainer.classList.toggle("expanded");
});
document.addEventListener("click", (event) => {
  if (
    topButtonContainer.classList.contains("expanded") &&
    !topButtonContainer.contains(event.target)
  ) {
    topButtonContainer.classList.remove("expanded");
  }
});

// --- FONT SIZE (D24: whole-editor zoom; UI preference, not document) ---
const MIN_FONT_SIZE = 0.5;
const MAX_FONT_SIZE = 3;
let currentFontSize =
  parseFloat(localStorage.getItem("boshiamy-font-size")) || 1.2;
let zoomInterval = null;

function updateFontSize() {
  editor.setFontSize(currentFontSize);
  // item 2 (主人 2026-09-25): 放大/縮小 must work in preview mode too —
  // preview base is 1.05rem against the editor's 1.2rem, keep that ratio.
  previewPane.style.fontSize = `${Math.round(currentFontSize * 0.875 * 100) / 100}rem`;
  safeSetItem("boshiamy-font-size", currentFontSize);
  updateModeIndicator();
}
const zoomIn = () => {
  if (currentFontSize >= MAX_FONT_SIZE) return;
  currentFontSize = Math.round((currentFontSize + 0.1) * 10) / 10;
  updateFontSize();
};
const zoomOut = () => {
  if (currentFontSize > MIN_FONT_SIZE) {
    currentFontSize = Math.round((currentFontSize - 0.1) * 10) / 10;
    updateFontSize();
  }
};
const stopZoom = () => {
  if (zoomInterval) {
    clearInterval(zoomInterval);
    zoomInterval = null;
  }
};
const holdRepeat = (btn, fn) => {
  btn.addEventListener("mousedown", () => {
    fn();
    zoomInterval = setInterval(fn, 100);
  });
  btn.addEventListener("mouseup", stopZoom);
  btn.addEventListener("mouseleave", stopZoom);
  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    fn();
    zoomInterval = setInterval(fn, 100);
  });
  btn.addEventListener("touchend", stopZoom);
  btn.addEventListener("touchcancel", stopZoom);
};
holdRepeat(zoomInButton, zoomIn);
holdRepeat(zoomOutButton, zoomOut);

// --- PREVIEW MODE (D22: whole-page toggle, live refresh while open) ---
let previewActive = false;
let previewTimer = null;

async function refreshPreview() {
  const md = editor.getValue();
  const html = sanitizePreviewHtml(renderPreviewMarkdown(md));
  // inert parse → import (never innerHTML-from-untrusted-string)
  const doc = new DOMParser().parseFromString(html, "text/html");
  while (previewPane.firstChild) previewPane.removeChild(previewPane.firstChild);
  for (const node of Array.from(doc.body.childNodes)) {
    previewPane.appendChild(
      previewPane.ownerDocument.importNode(node, true),
    );
  }
  hydrateMermaidBlocks(previewPane).catch((err) =>
    console.error("mermaid hydrate failed:", err),
  );
}

function setPreview(active) {
  previewActive = active;
  editor.clearIme();
  // 狀態膠囊永遠告訴主人現在是「編輯」還是「預覽」（第2輪#2）
  if (viewModePill) {
    viewModePill.textContent = active ? "預覽" : "編輯";
    viewModePill.classList.toggle("preview", active);
  }
  if (active) {
    refreshPreview();
    previewPane.hidden = false;
    editor.getWrapper().style.display = "none";
  } else {
    previewPane.hidden = true;
    editor.getWrapper().style.display = "";
    editor.focus();
  }
}

function togglePreview() {
  setPreview(!previewActive);
}

function schedulePreviewRefresh() {
  if (!previewActive) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 300);
}

// Document-level keys, handled at CAPTURE phase before CodeMirror sees them:
//  - Ctrl+Shift+M toggles preview in BOTH directions (item 3, 主人 2026-09-25:
//    Ctrl+Enter was intercepted by other functions → new combo, M = Markdown).
//  - D24 zoom keys (item 2 semantics restored): Ctrl+] / Ctrl+Shift+> / Ctrl+0
//    zoom IN, Ctrl+[ / Ctrl+Shift+< / Ctrl+9 zoom OUT — same directions as the
//    contenteditable build. Capture + preventDefault also neutralises CM's
//    built-in Ctrl-[/] indent bindings so muscle memory is 1:1.
document.addEventListener(
  "keydown",
  (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    // typing inside real form controls (token fields, search, ...) is sacred;
    // CM's own editing surface is allowed through (it is not a form control)
    const t = e.target;
    const inCM = t && editor && editor.getWrapper().contains(t);
    if (
      !inCM &&
      t &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")
    ) {
      return;
    }
    if (e.code === "KeyM" && e.shiftKey) {
      e.preventDefault();
      togglePreview();
      return;
    }
    const zoomOutKeys = ["[", "<", "9"];
    const zoomInKeys = ["]", ">", "0"];
    if (zoomOutKeys.includes(e.key)) {
      e.preventDefault();
      zoomOut();
    } else if (zoomInKeys.includes(e.key)) {
      e.preventDefault();
      zoomIn();
    }
  },
  true, // capture
);

// --- HACKMD BINDINGS (in-memory per tab, same as before the refactor) ---
const hackmdBindings = { 1: null, 2: null, 3: null };

function updateHackmdTabBadges() {
  for (const btn of editorTabs.querySelectorAll(".tab-button")) {
    const id = parseInt(btn.dataset.editor, 10);
    const bound = hackmdBindings[id];
    btn.classList.toggle("hackmd-bound", !!bound);
    btn.title = bound ? `已綁定 HackMD：${bound.title || "（無標題）"}` : "";
  }
}

// --- EDITOR + THREE-TAB DOC MANAGEMENT ---
let currentEditorId = parseInt(localStorage.getItem("boshiamy-active-tab")) || 1;
if (!(currentEditorId >= 1 && currentEditorId <= 3)) currentEditorId = 1;

function makeDoc(content) {
  return CodeMirror.Doc(content, {
    name: "markdown",
    fencedCodeBlocks: true,
  });
}

const editor = initEditor({
  getImeMode: () => imeMode,
  toggleImeMode,
  saveHackmd: () => hackmdSaveApi.open(),
  togglePreview,
  onDocChange: () => {
    schedulePreviewRefresh();
    scheduleDraftSave();
  },
});

// --- item 1 (主人 2026-09-25): the manual 存入/讀回暫存 buttons are gone.
// Drafts now AUTOSAVE: every edit writes the tab's draft (debounced), tab
// switches and page hide flush immediately. Content can no longer be lost
// by forgetting to press a button.
let draftSaveTimer = null;
function flushDraft() {
  safeSetItem(storageKey(currentEditorId), editor.getValue());
  localStorage.removeItem(legacyStorageKey(currentEditorId));
}
function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(flushDraft, 500);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushDraft();
});
window.addEventListener("pagehide", flushDraft);

// Doc-per-tab: CM Docs are full documents (cursor/undo included), so tab
// switching just swaps the Doc — no serialization round-trip.
const tabDocs = { 1: null, 2: null, 3: null };

function showTab(newId) {
  if (newId === currentEditorId) return;
  flushDraft(); // persist the tab we are leaving while its doc is still live
  tabDocs[currentEditorId] = editor.detachDoc();
  currentEditorId = newId;
  safeSetItem("boshiamy-active-tab", newId);
  if (!tabDocs[newId]) tabDocs[newId] = makeDoc(loadTabDraft(newId));
  editor.swapDoc(tabDocs[newId]);
  updateHackmdTabBadges();
  if (previewActive) refreshPreview();
}

editorTabs.addEventListener("click", (e) => {
  const target = e.target.closest(".tab-button");
  if (!target) return;
  const newId = parseInt(target.dataset.editor, 10);
  if (newId === currentEditorId) return;
  const currentActive = editorTabs.querySelector(".active");
  if (currentActive) currentActive.classList.remove("active");
  target.classList.add("active");
  showTab(newId);
  editor.focus();
});

// --- COPY / EXPORT (source is markdown already) ---
copyButton.addEventListener("click", () => {
  const textToCopy = editor.getValue();
  if (!textToCopy) return;
  navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
      const originalText = copyButton.textContent;
      copyButton.textContent = "已複製！";
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 2000);
    })
    .catch((err) => console.error("無法複製文字: ", err));
});

saveMdButton.addEventListener("click", () => {
  const md = editor.getValue();
  if (!md) return;
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "document.md";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
});

// --- DESCRIPTION PAGE NAV (temp-save first, same UX as before) ---
// Autosave makes the round-trip safe: flush, go, no confirm dialog.
descriptionButton.addEventListener("click", (e) => {
  e.preventDefault();
  flushDraft();
  window.location.assign("description.html");
});

// (description.html back-link used to carry ?action=restore; with autosave the
// draft is already loaded at mount, so we just clean the URL when present.)
if (new URLSearchParams(window.location.search).get("action") === "restore") {
  history.replaceState(null, "", window.location.pathname);
}

// --- HACKMD wiring (Markdown end-to-end now; no turndown/sanitize in the path) ---
const hackmdSaveApi = initHackmdSave({
  getMarkdown: () => editor.getValue(),
  showToast,
  getBinding: () => hackmdBindings[currentEditorId],
  setBinding: (binding) => {
    hackmdBindings[currentEditorId] = binding;
    updateHackmdTabBadges();
  },
});

initHackmdBrowser({
  showToast,
  editorHasContent: () => editor.hasContent(),
  saveTempBeforeOpen: () => flushDraft(),
  onOpenNote: ({ noteId, title, markdown }) => {
    editor.setValue(markdown);
    hackmdBindings[currentEditorId] = { noteId, title };
    updateHackmdTabBadges();
    if (previewActive) refreshPreview();
    editor.focus();
  },
});

// --- INITIAL MOUNT ---
if (currentEditorId !== 1) {
  const defaultActive = editorTabs.querySelector(".active");
  if (defaultActive) defaultActive.classList.remove("active");
  const newActive = editorTabs.querySelector(
    `.tab-button[data-editor="${currentEditorId}"]`,
  );
  if (newActive) newActive.classList.add("active");
}

updateModeIndicator();
updateLogoState();
updateFontSize();
updateHackmdTabBadges();
editor.focus();
