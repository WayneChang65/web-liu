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

let inputBuffer = "";
let candidates = [];
let currentPage = 0;
const pageSize = 10;
let imeMode = "boshiamy"; // 'boshiamy' or 'english'
let currentFontSize = 1.2; // Initial font size in rem

// --- TURNDOWN SERVICE INITIALIZATION ---
const turndownService = new TurndownService();

// --- THEME LOGIC ---
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-mode");
    themeToggleButton.textContent = "切換淺色模式";
  } else {
    document.body.classList.remove("dark-mode");
    themeToggleButton.textContent = "切換深色模式";
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
immersiveToggleButton.addEventListener("click", () => {
  const isImmersive = document.body.classList.toggle("immersive-mode");
  if (isImmersive) {
    immersiveToggleButton.textContent = "離開沉浸模式";
  } else {
    immersiveToggleButton.textContent = "沉浸模式";
  }
});

// --- FONT SIZE LOGIC ---
function updateFontSize() {
  mainEditor.style.fontSize = `${currentFontSize}rem`;
}

zoomInButton.addEventListener("click", () => {
  currentFontSize += 0.1;
  updateFontSize();
});

zoomOutButton.addEventListener("click", () => {
  if (currentFontSize > 0.5) {
    // Prevent font from becoming too small
    currentFontSize -= 0.1;
    updateFontSize();
  }
});

// --- IME MODE LOGIC ---
function toggleImeMode() {
  imeMode = imeMode === "boshiamy" ? "english" : "boshiamy";
  clearImeState();
  updateModeIndicator();
}

modeIndicator.addEventListener("click", toggleImeMode);

mainEditor.addEventListener("keydown", handleKeyDown);

function updateModeIndicator() {
  if (imeMode === "boshiamy") {
    modeIndicator.textContent = "目前為：嘸蝦米模式 (Ctrl+p 切換)";
  } else {
    modeIndicator.textContent = "目前為：英數模式 (Ctrl+p 切換)";
  }
}

function handleKeyDown(e) {
  const key = e.key;

  if (e.ctrlKey || e.metaKey) {
    // Formatting shortcuts
    if (["b", "i", "u"].includes(key.toLowerCase())) {
      e.preventDefault();
      const command = { b: "bold", i: "italic", u: "underline" }[
        key.toLowerCase()
      ];
      document.execCommand(command, false, null);
      return;
    }
    // IME mode toggle
    if (key.toLowerCase() === "p") {
      e.preventDefault();
      toggleImeMode();
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
      e.preventDefault();
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        const results = boshiamyData[inputBuffer];
        candidates = results ? results.split("") : [];
        currentPage = 0;
        updateImeDisplay();
      } else {
        // If buffer is empty, perform a regular backspace
        document.execCommand("delete", false, null);
      }
    } else if (key === " " || key === "Spacebar") {
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

      if (inputBuffer.length > 0 && candidates.length > 0) {
        const totalPages = Math.ceil(candidates.length / pageSize);
        if (totalPages > 1) {
          currentPage = (currentPage + 1) % totalPages;
          updateImeDisplay();
        } else {
          commitText(candidates[0]);
        }
      }
    } else if (key === "Enter") {
      if (inputBuffer.length > 0 && candidates.length > 0) {
        e.preventDefault();
        commitText(candidates[0]);
      } else {
        // If buffer is empty, perform a regular Enter
        e.preventDefault();
        document.execCommand("insertLineBreak");

        // Use the same robust scrolling logic as the paste handler
        // to ensure the caret is always visible after a newline.
        requestAnimationFrame(() => {
          const selection = window.getSelection();
          if (!selection.rangeCount) return;

          const range = selection.getRangeAt(0);
          const tempSpan = document.createElement("span");
          range.insertNode(tempSpan);
          const spanRect = tempSpan.getBoundingClientRect();
          tempSpan.parentNode.removeChild(tempSpan);

          const editorRect = mainEditor.getBoundingClientRect();
          const editorStyle = window.getComputedStyle(mainEditor);
          const editorPaddingBottom = parseFloat(editorStyle.paddingBottom);
          const visibleEditorBottom = editorRect.bottom - editorPaddingBottom;

          if (spanRect.bottom > visibleEditorBottom) {
            mainEditor.scrollTop += spanRect.bottom - visibleEditorBottom;
          }
        });
      }
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
  // Use execCommand to insert text, which works for contenteditable divs
  document.execCommand("insertText", false, char);
  clearImeState();
  mainEditor.focus();
}

function clearImeState() {
  inputBuffer = "";
  candidates = [];
  currentPage = 0;
  imeBar.style.display = "none";
}

// Initial setup
mainEditor.focus();
updateModeIndicator();
updateFontSize(); // Set initial font size

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

  document.execCommand("insertText", false, text);

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
