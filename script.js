const mainEditor = document.getElementById("main-editor");
const imeBar = document.getElementById("ime-bar");
const inputBufferSpan = document.getElementById("input-buffer");
const candidateListSpan = document.getElementById("candidate-list");
const modeIndicator = document.getElementById("mode-indicator");
const copyButton = document.getElementById("copy-button");
const themeToggleButton = document.getElementById("theme-toggle-button");
const immersiveToggleButton = document.getElementById(
  "immersive-toggle-button"
);
const zoomInButton = document.getElementById("zoom-in-button");
const zoomOutButton = document.getElementById("zoom-out-button");
const saveMdButton = document.getElementById("save-md-button");
const restoreButton = document.getElementById("restore-button");
const buttonContainer = document.querySelector(".button-container");
const buttonToggle = document.getElementById("button-toggle");
const editorTabs = document.getElementById("editor-tabs");

let currentEditorId = 1;
let editorContents = {
  1: "",
  2: "",
  3: "",
};

let inputBuffer = "";
let candidates = [];
let currentPage = 0;
const pageSize = 10;
let imeMode = "boshiamy"; // 'boshiamy' or 'english'
let currentFontSize = 1.2; // Initial font size in rem
let inactivityTimer;
let zoomInterval = null;
let persistentSaveListenersAttached = false;

function attachPersistentSaveListeners() {
  if (persistentSaveListenersAttached) return;

  // Ensure content is saved when the user leaves the page
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      autoSaveChanges();
    }
  });

  persistentSaveListenersAttached = true;
}

// --- DEBOUNCE UTILITY ---
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// --- TURNDOWN SERVICE INITIALIZATION ---
const turndownService = new TurndownService({ headingStyle: 'atx' });

// --- TURNDOWN SERVICE CUSTOM RULES ---

// Keep underline tags since Markdown doesn't have a standard equivalent
turndownService.addRule('underline', {
  filter: 'u',
  replacement: function (content) {
    return '<u>' + content + '</u>';
  }
});

// Keep spans used for font size
turndownService.addRule('fontSizeSpan', {
  filter: function (node) {
    return node.nodeName === 'SPAN' && node.style.fontSize;
  },
  replacement: function (content, node) {
    // Preserve the inline style for font size
    return '<span style="' + node.getAttribute('style') + '">' + content + '</span>';
  }
});

// Ensure em/i tags are converted to asterisks for italics
turndownService.addRule('italic', {
    filter: ['em', 'i'],
    replacement: function (content) {
        return '*' + content + '*';
    }
});

// --- STYLE TOGGLE LOGIC ---
function toggleStyle(style) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const selectedText = range.toString();

  if (!selectedText) return; // Don't apply styles to empty selections

  const parentElement =
    range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  const tagMap = {
    bold: "STRONG",
    italic: "EM",
    underline: "U",
  };
  const tagName = tagMap[style];
  const isAlreadyStyled = parentElement.closest(tagName);

  if (isAlreadyStyled) {
    // This is a simplification: it unwraps the entire styled element.
    // A more robust solution would split the nodes, but this avoids execCommand.
    const text = document.createTextNode(isAlreadyStyled.textContent);
    isAlreadyStyled.parentNode.replaceChild(text, isAlreadyStyled);
    // Restore selection around the new text node
    range.selectNodeContents(text);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    const newNode = document.createElement(tagName);
    try {
      // surroundContents is the ideal way to wrap a selection
      range.surroundContents(newNode);
    } catch (e) {
      // If selection spans across different nodes, surroundContents fails.
      // As a fallback, we apply the style via a less precise method.
      console.warn("surroundContents failed, falling back.", e);
      const fragment = range.extractContents();
      newNode.appendChild(fragment);
      range.insertNode(newNode);
    }
    // After styling, re-select the content within the new node to ensure the next toggle check works.
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(newNode);
    selection.addRange(newRange);
  }
}

function changeSelectionFontSize(direction) {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;

  // Find if the selection is already inside one of our sizing spans
  const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  const existingSpan = element.closest('span[data-font-sized="true"]');

  if (existingSpan) {
    // Case 1: We are inside a span we created. Modify it.
    const currentFontSize = parseFloat(window.getComputedStyle(existingSpan).fontSize);
    const newSize = direction === 'increase' ? currentFontSize + 1 : currentFontSize - 1;
    
    if (newSize > 0) {
        existingSpan.style.fontSize = `${newSize}px`;
    }
    // After modifying, re-select the original range to allow consecutive operations.
    selection.removeAllRanges();
    selection.addRange(range);

  } else {
    // Case 2: It's plain text or text styled in some other way. Wrap it in a new span.
    const parentForStyle = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    const computedStyle = window.getComputedStyle(parentForStyle);
    const currentFontSize = parseFloat(computedStyle.fontSize);
    const newSize = direction === 'increase' ? currentFontSize + 1 : currentFontSize - 1;

    if (newSize > 0) {
        const newSpan = document.createElement('span');
        newSpan.dataset.fontSized = 'true'; // Add the marker attribute
        newSpan.style.fontSize = `${newSize}px`;
        try {
            const fragment = range.extractContents();
            newSpan.appendChild(fragment);
            range.insertNode(newSpan);

            // Reselect the modified text
            selection.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(newSpan);
            selection.addRange(newRange);
        } catch (e) { 
            console.error("Could not apply font size change:", e);
        }
    }
  }
}

// --- THEME LOGIC ---
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-mode");
    themeToggleButton.textContent = "淺色模式";
  } else {
    document.body.classList.remove("dark-mode");
    themeToggleButton.textContent = "深色模式";
  }
}

themeToggleButton.addEventListener("click", () => {
  const isDarkMode = document.body.classList.toggle("dark-mode");
  const newTheme = isDarkMode ? "dark" : "light";
  localStorage.setItem("theme", newTheme);
  applyTheme(newTheme);
});

// Apply saved theme on load
const savedTheme = localStorage.getItem("theme") || "light";
applyTheme(savedTheme);
// --- END THEME LOGIC ---

// --- IMMERSIVE MODE LOGIC ---
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

const activityListeners = ["mousemove", "keydown", "scroll"];

const addActivityListeners = () => {
  activityListeners.forEach((event) => {
    window.addEventListener(event, resetInactivityTimer);
  });
};

const removeActivityListeners = () => {
  activityListeners.forEach((event) => {
    window.removeEventListener(event, resetInactivityTimer);
  });
};

immersiveToggleButton.addEventListener("click", () => {
  const isImmersive = document.body.classList.toggle("immersive-mode");
  if (isImmersive) {
    immersiveToggleButton.textContent = "離開沉浸模式";
    addActivityListeners();
    resetInactivityTimer();
  } else {
    immersiveToggleButton.textContent = "沉浸模式";
    buttonContainer.classList.remove("expanded");
    clearTimeout(inactivityTimer);
    removeActivityListeners();
  }
});

buttonToggle.addEventListener("click", () => {
  buttonContainer.classList.toggle("expanded");
  // If user manually expands, clear the timer. It will restart on next activity.
  if (buttonContainer.classList.contains("expanded")) {
    clearTimeout(inactivityTimer);
  } else {
    resetInactivityTimer();
  }
});

// --- FONT SIZE LOGIC ---
function updateFontSize() {
  mainEditor.style.fontSize = `${currentFontSize}rem`;
  updateModeIndicator();
}

const zoomIn = () => {
  currentFontSize += 0.1;
  updateFontSize();
};

const zoomOut = () => {
  if (currentFontSize > 0.5) {
    currentFontSize -= 0.1;
    updateFontSize();
  }
};

const stopZoom = () => {
  if (zoomInterval) {
    clearInterval(zoomInterval);
    zoomInterval = null;
  }
};

zoomInButton.addEventListener('mousedown', () => {
  zoomIn(); // Zoom once immediately
  zoomInterval = setInterval(zoomIn, 100); // Then zoom continuously
});

zoomOutButton.addEventListener('mousedown', () => {
  zoomOut(); // Zoom once immediately
  zoomInterval = setInterval(zoomOut, 100); // Then zoom continuously
});

zoomInButton.addEventListener('mouseup', stopZoom);
zoomInButton.addEventListener('mouseleave', stopZoom);
zoomOutButton.addEventListener('mouseup', stopZoom);
zoomOutButton.addEventListener('mouseleave', stopZoom);

// --- IME MODE LOGIC ---
function toggleImeMode() {
  imeMode = imeMode === "boshiamy" ? "english" : "boshiamy";
  clearImeState();
  updateModeIndicator();
}

modeIndicator.addEventListener("click", toggleImeMode);

mainEditor.addEventListener("keydown", handleKeyDown);

function updateModeIndicator() {
  const modeText = imeMode === "boshiamy" ? "嘸蝦米模式" : "英數模式";
  const modeClass = imeMode === "boshiamy" ? "boshiamy" : "english";
  const fontSizeDisplay = Math.round(currentFontSize * 10);
  modeIndicator.innerHTML = `目前為：<span class="mode-text ${modeClass}">${modeText}</span> (Ctrl+p 切換), 字型大小：${fontSizeDisplay}`;
}

function handleKeyDown(e) {
  const key = e.key;

  if (e.ctrlKey || e.metaKey) {
    // Formatting shortcuts
    if (["b", "i", "u"].includes(key.toLowerCase())) {
      e.preventDefault();
      const style = { b: "bold", i: "italic", u: "underline" }[
        key.toLowerCase()
      ];
      toggleStyle(style);
      return;
    }
    // IME mode toggle
    if (key.toLowerCase() === "p") {
      e.preventDefault();
      toggleImeMode();
      return;
    }

    // Font size shortcuts
    if (key === '[' || (e.shiftKey && key === '<') || key === '9') { // Ctrl+[ or Ctrl+Shift+< or Ctrl+9
      e.preventDefault();
      changeSelectionFontSize('decrease');
      return;
    }
    if (key === ']' || (e.shiftKey && key === '>') || key === '0') { // Ctrl+] or Ctrl+Shift+> or Ctrl+0
      e.preventDefault();
      changeSelectionFontSize('increase');
      return;
    }

    // Allow other Ctrl/Meta shortcuts like Ctrl+A, Ctrl+C, etc.
    return;
  }

  if (imeMode === "boshiamy") {
    const validChars = /^[a-z,.'\[\]v]$/;

    if (validChars.test(key)) {
      e.preventDefault();
      inputBuffer += key;
      const results = boshiamyData[inputBuffer];
      candidates = results ? results.split("") : [];
      currentPage = 0;
      updateImeDisplay();
    } else if (key >= "0" && key <= "9" && candidates.length > 0) {
      e.preventDefault();
      const pageIndex = parseInt(key, 10);
      const realIndex = currentPage * pageSize + pageIndex;
      if (realIndex < candidates.length) {
        commitText(candidates[realIndex]);
      }
    } else if (key === "Backspace") {
      if (inputBuffer.length > 0) {
        // If the IME buffer has content, we handle it and prevent default browser action.
        e.preventDefault();
        inputBuffer = inputBuffer.slice(0, -1);
        const results = boshiamyData[inputBuffer];
        candidates = results ? results.split("") : [];
        currentPage = 0;
        updateImeDisplay();
      }
      // If buffer is empty, do nothing and let the browser handle the default backspace.
    } else if (key === " " || key === "Spacebar") {
      // If buffer is empty, do nothing and let the default space character be inserted.
      if (inputBuffer.length === 0) {
        return;
      }

      // If we're here, the buffer is not empty, so we handle IME logic.
      e.preventDefault();

      if (inputBuffer.length > 1 && inputBuffer.endsWith("v")) {
        const root = inputBuffer.slice(0, -1);
        const rootHasCandidates =
          boshiamyData.hasOwnProperty(root) && boshiamyData[root].length > 1;
        const bufferHasCandidates = boshiamyData.hasOwnProperty(inputBuffer);

        // Only treat 'v' as a special selector if the root code exists
        // and the full code (with 'v') does NOT exist as a valid code.
        if (rootHasCandidates && !bufferHasCandidates) {
          const rootCandidates = boshiamyData[root];
          commitText(rootCandidates.split("")[1]); // Commit 2nd candidate of the root
          return;
        }
        // Otherwise, fall through to treat the buffer (e.g., 'lonv') as a normal code.
      }

      if (candidates.length > 0) {
        const totalPages = Math.ceil(candidates.length / pageSize);
        if (totalPages > 1) {
          currentPage = (currentPage + 1) % totalPages;
          updateImeDisplay();
        } else {
          commitText(candidates[0]);
        }
      } else {
        // If there are no candidates, clear the buffer so the user can re-type.
        clearImeState();
      }
      // If there's an input buffer but no candidates, space does nothing.
    } else if (key === "Enter") {
      if (inputBuffer.length > 0 && candidates.length > 0) {
        e.preventDefault();
        commitText(candidates[0]);
      }
      // If buffer is empty, do nothing and let the browser handle the default Enter action.
    } else if (key.startsWith("Arrow")) {
      clearImeState();
    }
  }
}

function updateImeDisplay() {
  if (inputBuffer.length === 0) {
    imeBar.style.display = "none";
    return;
  }

  inputBufferSpan.textContent = inputBuffer;

  if (candidates.length > 0) {
    const pageStart = currentPage * pageSize;
    const pageEnd = pageStart + pageSize;
    const pageCandidates = candidates.slice(pageStart, pageEnd);

    let candidateString = "";
    pageCandidates.forEach((char, index) => {
      candidateString += `${index}. ${char} `;
    });

    if (candidates.length > pageSize) {
      const totalPages = Math.ceil(candidates.length / pageSize);
      candidateString += `(${currentPage + 1}/${totalPages})`;
    }

    candidateListSpan.textContent = candidateString.trim();
    imeBar.style.display = "flex";
  } else {
    candidates = [];
    candidateListSpan.textContent = "（無對應字）";
    imeBar.style.display = "flex";
  }
}

function commitText(char) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  range.deleteContents(); // Delete selected text if any

  const textNode = document.createTextNode(char);
  range.insertNode(textNode);

  // Move cursor after the inserted text
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);

  clearImeState();
  mainEditor.focus();
}

function clearImeState() {
  inputBuffer = "";
  candidates = [];
  currentPage = 0;
  imeBar.style.display = "none";
}

// --- EDITOR TAB LOGIC ---
editorTabs.addEventListener('click', (e) => {
  const target = e.target.closest('.tab-button');
  if (!target) return;

  const newEditorId = parseInt(target.dataset.editor, 10);
  if (newEditorId === currentEditorId) return;

  // 1. Save current editor's content to memory
  editorContents[currentEditorId] = mainEditor.innerHTML;

  // 2. Update active button in UI
  const currentActive = editorTabs.querySelector('.active');
  if (currentActive) {
    currentActive.classList.remove('active');
  }
  target.classList.add('active');

  // 3. Switch to the new editor
  currentEditorId = newEditorId;

  // 4. Load new editor's content from memory
  mainEditor.innerHTML = editorContents[currentEditorId] || '';

  // 5. Update UI states for the new editor
  updateRestoreButtonState();
  mainEditor.focus();
});


// Function to restore content from localStorage
function autoRestore(editorId) {
  const savedContent = localStorage.getItem(getStorageKey(editorId));
  if (savedContent) {
    mainEditor.innerHTML = savedContent;
    editorContents[editorId] = savedContent; // Prime the in-memory cache
  }
}

// Initial setup
mainEditor.focus();
updateModeIndicator();
updateFontSize(); // Set initial font size

// Check if returning from description page
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('action') === 'restore') {
  // Clean the URL so a refresh doesn't re-trigger the restore
  history.replaceState(null, '', window.location.pathname);
}

// Defer the initial button state update to allow the DOM to process any restores
setTimeout(() => {
  updateRestoreButtonState();
}, 0);

mainEditor.addEventListener("blur", () => {
  clearImeState();
});

copyButton.addEventListener("click", () => {
  // Use innerText for contenteditable div to get plain text

  const textToCopy = mainEditor.innerText;

  if (textToCopy) {
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        const originalText = copyButton.textContent;

        copyButton.textContent = "已複製！";

        setTimeout(() => {
          copyButton.textContent = originalText;
        }, 2000);
      })
      .catch((err) => {
        console.error("無法複製文字: ", err);
      });
  }
});

// --- PASTE HANDLING ---

// Intercept paste events to sanitize content to plain text

mainEditor.addEventListener("paste", (e) => {
  // Prevent the default paste action which might insert rich text

  e.preventDefault();

  // Get the plain text from the clipboard

  const text = (e.clipboardData || window.clipboardData).getData("text/plain");

  // Insert the sanitized plain text into the editor
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);

  // Move cursor to the end of pasted text
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);

  // After pasting, use a hybrid approach to ensure the caret is visible.

  requestAnimationFrame(() => {
    const selection = window.getSelection();

    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);

    // 1. Insert a temporary element to get a reliable position.

    const tempSpan = document.createElement("span");

    range.insertNode(tempSpan);

    const spanRect = tempSpan.getBoundingClientRect();

    tempSpan.parentNode.removeChild(tempSpan); // Clean up immediately

    // 2. Perform the precise calculation using the reliable coordinates.

    const editorRect = mainEditor.getBoundingClientRect();

    const editorStyle = window.getComputedStyle(mainEditor);

    const editorPaddingBottom = parseFloat(editorStyle.paddingBottom);

    const visibleEditorBottom = editorRect.bottom - editorPaddingBottom;

    // 3. Scroll by the calculated amount if needed.

    if (spanRect.bottom > visibleEditorBottom) {
      mainEditor.scrollTop += spanRect.bottom - visibleEditorBottom;
    }
  });
});

// --- SAVE AS MARKDOWN LOGIC ---

saveMdButton.addEventListener("click", () => {
  const content = mainEditor.innerHTML;

  if (content) {
    // Convert the HTML content from the editor to Markdown

    const markdown = turndownService.turndown(content);

    // Create a Blob from the Markdown string

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-t" });

    // Create a temporary link element to trigger the download

    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);

    link.download = "document.md";

    // Append to the document, click, and then remove

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    // Clean up the object URL

    URL.revokeObjectURL(link.href);
  }
});

// --- AUTOSAVE AND RESTORE LOGIC ---
function getStorageKey(id) {
  return `boshiamy-editor-content-${id}`;
}

function updateRestoreButtonState() {
  const isEditorEmpty = mainEditor.innerText.trim() === '';
  const hasSavedContent = !!localStorage.getItem(getStorageKey(currentEditorId));
  restoreButton.disabled = !isEditorEmpty || !hasSavedContent;
}

const autoSaveChanges = () => {
  const content = mainEditor.innerHTML;
  editorContents[currentEditorId] = content; // Update in-memory cache
  localStorage.setItem(getStorageKey(currentEditorId), content);
  updateRestoreButtonState(); // Update button state after saving
};

// Debounce the save function to avoid excessive writes
const debouncedSave = debounce(autoSaveChanges, 500);

mainEditor.addEventListener("keyup", () => {
  updateRestoreButtonState();
  debouncedSave();
  attachPersistentSaveListeners(); // Activate aggressive save on first interaction
});

restoreButton.addEventListener("click", () => {
  const savedContent = localStorage.getItem(getStorageKey(currentEditorId));
  if (savedContent) {
    mainEditor.innerHTML = savedContent;
    updateRestoreButtonState(); // Disable button after restoring

    // Provide user feedback
    const originalText = restoreButton.textContent;
    restoreButton.textContent = "已讀回！";
    setTimeout(() => {
      restoreButton.textContent = originalText;
    }, 2000);
  }
});
