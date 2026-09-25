// --- CodeMirror 5 editor core + boshiamy adapter (cm5-refactor, D20/D21) ---
//
// Owns the CM5 instance, the boshiamy key interceptor, the candidate bar and
// the Markdown formatting keymap. The interceptor is a capture-phase keydown
// listener on document, gated to events targeting the CM wrapper — validated
// end-to-end in the M0 lab (real CDP key events, zero latin leak, 12/12).
//
// Engine reuse: lookupCandidates / selectByDigit / resolveSpaceCommit are the
// SAME pure functions the contenteditable version used (ime.js untouched).
// Only the I/O changed: insert = cm.replaceSelection, caret = cm.cursorCoords.

import CodeMirror from "codemirror";
import "codemirror/mode/xml/xml.js";
import "codemirror/mode/javascript/javascript.js";
import "codemirror/mode/css/css.js";
import "codemirror/mode/htmlmixed/htmlmixed.js";
import "codemirror/mode/markdown/markdown.js";
import "codemirror/addon/display/placeholder.js";
import "codemirror/lib/codemirror.css";

import { boshiamyData } from "./boshiamy-data.js";
import { lookupCandidates, selectByDigit, resolveSpaceCommit } from "./ime.js";
import {
  toggleInline,
  toggleLinePrefix,
  toggleHeading,
  toggleCodeFence,
  insertLink,
} from "./format.js";

const PAGE_SIZE = 10;

/**
 * deps:
 *   getImeMode()        -> "boshiamy" | "english" | "disabled"
 *   toggleImeMode()     -> Ctrl+P (app-level: indicator/logo/storage)
 *   saveHackmd()        -> Ctrl+S
 *   (preview toggle: Ctrl+Shift+M, handled document-level in main.js)
 * Returns the editor API.
 */
export function initEditor(deps) {
  const mount = document.getElementById("editor-cm");
  const imeBar = document.getElementById("ime-bar");
  const inputBufferSpan = document.getElementById("input-buffer");
  const candidateListSpan = document.getElementById("candidate-list");

  const cm = CodeMirror(mount, {
    // xml:false — HTML 標籤在編輯區以統一純文字顯示（主人 2026-09-25 第3輪#1：
    // 編輯模式不要顏色、直接看原始碼；色彩渲染只屬於預覽模式）。
    mode: { name: "markdown", fencedCodeBlocks: true, xml: false },
    lineWrapping: true,
    placeholder: "開始打字...",
    spellcheck: false,
    electricInputs: false,
    viewportMargin: Infinity,
    indentUnit: 2,
    tabSize: 2,
    extraKeys: buildKeymap(deps),
  });

  let inputBuffer = "";
  let candidates = [];
  let currentPage = 0;

  function clearImeState() {
    inputBuffer = "";
    candidates = [];
    currentPage = 0;
    imeBar.style.display = "none";
  }

  function commitText(char) {
    cm.replaceSelection(char);
    clearImeState();
    cm.focus();
  }

  function updateImeDisplay() {
    if (inputBuffer.length === 0) return clearImeState();
    inputBufferSpan.textContent = inputBuffer;
    if (candidates.length > 0) {
      const pageCandidates = candidates.slice(
        currentPage * PAGE_SIZE,
        currentPage * PAGE_SIZE + PAGE_SIZE,
      );
      let s = "";
      pageCandidates.forEach((char, i) => {
        s += `${i}. ${char} `;
      });
      if (candidates.length > PAGE_SIZE) {
        const total = Math.ceil(candidates.length / PAGE_SIZE);
        s += `(${currentPage + 1}/${total})`;
      }
      candidateListSpan.textContent = s.trim();
    } else {
      candidateListSpan.textContent = "（無對應字）";
    }
    imeBar.style.display = "flex";
    positionBar();
  }

  function positionBar() {
    const wrap = cm.getWrapperElement();
    const wrapRect = wrap.getBoundingClientRect();
    const coords = cm.cursorCoords(true, "window");
    if (!coords) return;

    const barH = imeBar.offsetHeight || 30;
    let top = coords.bottom - wrapRect.top + 4;
    // flip above the caret when it would overflow the editor box
    if (top + barH > wrap.clientHeight && coords.top - wrapRect.top > barH + 8) {
      top = coords.top - wrapRect.top - barH - 4;
    }
    imeBar.style.top = `${Math.max(0, top)}px`;

    // Horizontal: which half of the SCREEN the caret sits in decides the side
    // (old contenteditable behavior, item 7 主人 2026-09-25): caret left of
    // the viewport midline -> bar to its right; caret right of midline -> bar
    // anchored by its right edge so it appears to the LEFT of the caret.
    const viewMid = window.innerWidth / 2;
    if (coords.left < viewMid) {
      imeBar.style.right = "auto";
      imeBar.style.left = `${coords.left - wrapRect.left}px`;
    } else {
      imeBar.style.left = "auto";
      imeBar.style.right = `${wrapRect.right - coords.right}px`;
    }

    // one frame later the bar has real dimensions: clamp to stay inside the
    // editor box (old behavior's final boundary pass).
    requestAnimationFrame(() => {
      const r = imeBar.getBoundingClientRect();
      if (r.right > wrapRect.right - 5) {
        imeBar.style.left = "auto";
        imeBar.style.right = "5px";
      }
      if (r.left < wrapRect.left + 5) {
        imeBar.style.right = "auto";
        imeBar.style.left = "5px";
      }
    });
  }

  // --- the interceptor (validated in the M0 lab) ---
  document.addEventListener(
    "keydown",
    (e) => {
      const wrap = cm.getWrapperElement();
      if (!e.target || !wrap.contains(e.target)) return; // dialogs etc.
      if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl layer = CM keymap

      const mode = deps.getImeMode();
      if (mode !== "boshiamy") return; // english/disabled: CM handles all

      const key = e.key;
      const validChars = /^[a-z,.'[\]vrsf]$/;

      if (validChars.test(key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation(); // ← zero-leak guarantee (M0-proven)
        inputBuffer += key.toLowerCase();
        candidates = lookupCandidates(boshiamyData, inputBuffer);
        currentPage = 0;
        updateImeDisplay();
      } else if (key >= "0" && key <= "9" && candidates.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const ch = selectByDigit(candidates, currentPage, PAGE_SIZE, +key);
        if (ch !== null) commitText(ch);
      } else if (key === "Backspace") {
        if (inputBuffer.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          inputBuffer = inputBuffer.slice(0, -1);
          candidates = lookupCandidates(boshiamyData, inputBuffer);
          currentPage = 0;
          updateImeDisplay();
        }
      } else if (key === " " || key === "Spacebar") {
        if (inputBuffer.length === 0) return; // plain space → CM
        e.preventDefault();
        e.stopPropagation();
        const ch = resolveSpaceCommit(boshiamyData, inputBuffer);
        if (ch !== null) commitText(ch);
        else clearImeState();
      } else if (key === "PageDown" || key === "PageUp") {
        if (candidates.length > PAGE_SIZE) {
          e.preventDefault();
          e.stopPropagation();
          const total = Math.ceil(candidates.length / PAGE_SIZE);
          currentPage =
            key === "PageDown"
              ? (currentPage + 1) % total
              : (currentPage - 1 + total) % total;
          updateImeDisplay();
        }
      } else if (key === "Enter") {
        if (inputBuffer.length > 0) clearImeState();
      } else if (key.startsWith("Arrow")) {
        if (inputBuffer.length > 0) clearImeState();
      }
    },
    true, // capture: runs before CodeMirror's own key handling
  );

  cm.on("cursorActivity", () => {
    if (imeBar.style.display !== "none") positionBar();
  });
  cm.on("blur", clearImeState);
  if (deps.onDocChange) cm.on("change", () => deps.onDocChange());
  // A paste mid-code must not continue a stale boshiamy buffer (same as the
  // old contenteditable paste handler did).
  cm.getWrapperElement().addEventListener("paste", clearImeState);

  // --- formatting keymap plumbing: extraKeys closures call cm.__fmt ---
  cm.__fmt = (fn, ...args) => {
    applyDocEdit(
      fn(cm.getValue(), cm.getCursor("anchor"), cm.getCursor("head"), ...args),
    );
  };

  // ---------- public API ----------
  function endOfDoc() {
    const lastLine = cm.lastLine();
    return { line: lastLine, ch: cm.getLine(lastLine).length };
  }

  function applyDocEdit(result) {
    cm.operation(() => {
      cm.replaceRange(result.text, { line: 0, ch: 0 }, endOfDoc());
      cm.setSelection(result.anchor, result.head);
    });
    cm.focus();
  }

  return {
    cm,
    focus: () => cm.focus(),
    getValue: () => cm.getValue(),
    setValue: (md) => {
      cm.setValue(md || "");
      clearImeState();
    },
    hasContent: () => cm.getValue().trim().length > 0,
    clearIme: clearImeState,
    getWrapper: () => cm.getWrapperElement(),
    /** Hand back the live Doc (cursor/undo live inside it) for per-tab keep. */
    detachDoc: () => cm.getDoc(),
    /** Swap in another Doc — this IS the tab switch. */
    swapDoc: (doc) => {
      cm.swapDoc(doc);
      clearImeState();
    },
    /** D24: whole-editor font size (rem) — UI preference, not document content. */
    setFontSize: (rem) => {
      cm.getWrapperElement().style.fontSize = `${rem}rem`;
      cm.refresh();
    },
    refresh: () => cm.refresh(),
  };
}

function buildKeymap(deps) {
  // Closures call cm.__fmt (plumbed by initEditor after the instance exists).
  return {
    "Ctrl-B": (cm) => cm.__fmt(toggleInline, "**"),
    "Cmd-B": (cm) => cm.__fmt(toggleInline, "**"),
    "Ctrl-I": (cm) => cm.__fmt(toggleInline, "*"),
    "Cmd-I": (cm) => cm.__fmt(toggleInline, "*"),
    "Ctrl-1": (cm) => cm.__fmt(toggleHeading, 1),
    "Ctrl-2": (cm) => cm.__fmt(toggleHeading, 2),
    "Ctrl-3": (cm) => cm.__fmt(toggleHeading, 3),
    "Ctrl-K": (cm) => cm.__fmt(insertLink),
    "Ctrl-L": (cm) => cm.__fmt(toggleLinePrefix, "- "),
    "Ctrl-Shift-K": (cm) => cm.__fmt(toggleCodeFence, ""),
    "Ctrl-Shift-Q": (cm) => cm.__fmt(toggleLinePrefix, "> "),
    "Ctrl-P": () => deps.toggleImeMode(),
    "Cmd-P": () => deps.toggleImeMode(),
    "Ctrl-S": () => deps.saveHackmd(),
    "Cmd-S": () => deps.saveHackmd(),
  };
}
