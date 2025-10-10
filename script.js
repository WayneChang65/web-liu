const mainEditor = document.getElementById('main-editor');
const imeBar = document.getElementById('ime-bar');
const inputBufferSpan = document.getElementById('input-buffer');
const candidateListSpan = document.getElementById('candidate-list');
const modeIndicator = document.getElementById('mode-indicator');
const copyButton = document.getElementById('copy-button');
const themeToggleButton = document.getElementById('theme-toggle-button');
const immersiveToggleButton = document.getElementById('immersive-toggle-button');
const zoomInButton = document.getElementById('zoom-in-button');
const zoomOutButton = document.getElementById('zoom-out-button');

let inputBuffer = '';
let candidates = [];
let currentPage = 0;
const pageSize = 10;
let imeMode = 'boshiamy'; // 'boshiamy' or 'english'
let currentFontSize = 1.2; // Initial font size in rem

// --- THEME LOGIC ---
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggleButton.textContent = '切換淺色模式';
    } else {
        document.body.classList.remove('dark-mode');
        themeToggleButton.textContent = '切換深色模式';
    }
}

themeToggleButton.addEventListener('click', () => {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    const newTheme = isDarkMode ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
});

// Apply saved theme on load
const savedTheme = localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);
// --- END THEME LOGIC ---

// --- IMMERSIVE MODE LOGIC ---
immersiveToggleButton.addEventListener('click', () => {
    const isImmersive = document.body.classList.toggle('immersive-mode');
    if (isImmersive) {
        immersiveToggleButton.textContent = '離開沉浸模式';
    } else {
        immersiveToggleButton.textContent = '沉浸模式';
    }
});

// --- FONT SIZE LOGIC ---
function updateFontSize() {
    mainEditor.style.fontSize = `${currentFontSize}rem`;
}

zoomInButton.addEventListener('click', () => {
    currentFontSize += 0.1;
    updateFontSize();
});

zoomOutButton.addEventListener('click', () => {
    if (currentFontSize > 0.5) { // Prevent font from becoming too small
        currentFontSize -= 0.1;
        updateFontSize();
    }
});

// --- IME MODE LOGIC ---
function toggleImeMode() {
    imeMode = imeMode === 'boshiamy' ? 'english' : 'boshiamy';
    clearImeState();
    updateModeIndicator();
}

modeIndicator.addEventListener('click', toggleImeMode);

mainEditor.addEventListener('keydown', handleKeyDown);

function updateModeIndicator() {
    if (imeMode === 'boshiamy') {
        modeIndicator.textContent = '目前為：嘸蝦米模式 (Ctrl+p 切換)';
    } else {
        modeIndicator.textContent = '目前為：英數模式 (Ctrl+p 切換)';
    }
}

function handleKeyDown(e) {
    const key = e.key;

    if (e.ctrlKey || e.metaKey) {
        if (key.toLowerCase() === 'p') {
            e.preventDefault();
            toggleImeMode();
            return;
        }
        return; // Let browser handle other Ctrl/Meta shortcuts
    }

    if (imeMode === 'boshiamy') {
        const validChars = /^[a-z,.'\[\]]$/;

        if (validChars.test(key)) {
            e.preventDefault();
            inputBuffer += key;
            const results = boshiamyData[inputBuffer];
            candidates = results ? results.split('') : [];
            currentPage = 0;
            updateImeDisplay();
        } else if (key >= '0' && key <= '9' && candidates.length > 0) {
            e.preventDefault();
            const pageIndex = parseInt(key, 10);
            const realIndex = (currentPage * pageSize) + pageIndex;
            if (realIndex < candidates.length) {
                commitText(candidates[realIndex]);
            }
        } else if (key === 'Backspace') {
            e.preventDefault();
            if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1);
                const results = boshiamyData[inputBuffer];
                candidates = results ? results.split('') : [];
                currentPage = 0;
                updateImeDisplay();
            } else {
                const { selectionStart, selectionEnd } = mainEditor;
                if (selectionStart > 0) {
                    mainEditor.value = mainEditor.value.slice(0, selectionStart - 1) + mainEditor.value.slice(selectionEnd);
                    mainEditor.selectionStart = mainEditor.selectionEnd = selectionStart - 1;
                }
            }
        } else if (key === ' ' || key === 'Spacebar') {
            if (inputBuffer.length > 0 && candidates.length > 0) {
                e.preventDefault();
                const totalPages = Math.ceil(candidates.length / pageSize);
                if (totalPages > 1) {
                    currentPage = (currentPage + 1) % totalPages;
                    updateImeDisplay();
                } else {
                    commitText(candidates[0]);
                }
            }
        } else if (key === 'Enter') {
            if (inputBuffer.length > 0 && candidates.length > 0) {
                e.preventDefault();
                commitText(candidates[0]);
            } else {
                e.preventDefault();
                const { selectionStart, selectionEnd } = mainEditor;
                const originalScrollTop = mainEditor.scrollTop;
                const isCursorAtEnd = selectionEnd === mainEditor.value.length;

                mainEditor.value = mainEditor.value.slice(0, selectionStart) + '\n' + mainEditor.value.slice(selectionEnd);
                mainEditor.selectionStart = mainEditor.selectionEnd = selectionStart + 1;

                if (!isCursorAtEnd) {
                    mainEditor.scrollTop = originalScrollTop;
                } else {
                    mainEditor.scrollTop = mainEditor.scrollHeight;
                }
            }
        } else if (key.startsWith('Arrow')) {
            clearImeState();
        }
    }
}

function updateImeDisplay() {
    if (inputBuffer.length === 0) {
        imeBar.style.display = 'none';
        return;
    }

    inputBufferSpan.textContent = inputBuffer;

    if (candidates.length > 0) {
        const pageStart = currentPage * pageSize;
        const pageEnd = pageStart + pageSize;
        const pageCandidates = candidates.slice(pageStart, pageEnd);

        let candidateString = '';
        pageCandidates.forEach((char, index) => {
            candidateString += `${index}. ${char} `;
        });

        if (candidates.length > pageSize) {
            const totalPages = Math.ceil(candidates.length / pageSize);
            candidateString += `(${currentPage + 1}/${totalPages})`;
        }

        candidateListSpan.textContent = candidateString.trim();
        imeBar.style.display = 'flex';
    } else {
        candidates = [];
        candidateListSpan.textContent = '（無對應字）';
        imeBar.style.display = 'flex';
    }
}

function commitText(char) {
    const { selectionStart, selectionEnd } = mainEditor;
    const originalScrollTop = mainEditor.scrollTop;
    const isCursorAtEnd = selectionEnd === mainEditor.value.length;

    mainEditor.value = mainEditor.value.slice(0, selectionStart) + char + mainEditor.value.slice(selectionEnd);
    mainEditor.selectionStart = mainEditor.selectionEnd = selectionStart + char.length;

    if (!isCursorAtEnd) {
        mainEditor.scrollTop = originalScrollTop;
    } else {
        mainEditor.scrollTop = mainEditor.scrollHeight;
    }

    clearImeState();
    mainEditor.focus();
}

function clearImeState() {
    inputBuffer = '';
    candidates = [];
    currentPage = 0;
    imeBar.style.display = 'none';
}

// Initial setup
mainEditor.focus();
updateModeIndicator();
updateFontSize(); // Set initial font size

mainEditor.addEventListener('blur', () => {
    clearImeState();
});

copyButton.addEventListener('click', () => {
    const textToCopy = mainEditor.value;
    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyButton.textContent;
            copyButton.textContent = '已複製！';
            setTimeout(() => {
                copyButton.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('無法複製文字: ', err);
        });
    }
});
