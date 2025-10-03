const mainEditor = document.getElementById('main-editor');
const imeBar = document.getElementById('ime-bar');
const inputBufferSpan = document.getElementById('input-buffer');
const candidateListSpan = document.getElementById('candidate-list');
const modeIndicator = document.getElementById('mode-indicator');
const copyButton = document.getElementById('copy-button');
const themeToggleButton = document.getElementById('theme-toggle-button');

let inputBuffer = '';
let candidates = [];
let currentPage = 0;
const pageSize = 10;
let imeMode = 'boshiamy'; // 'boshiamy' or 'english'

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

    if (e.ctrlKey && key.toLowerCase() === 'p') {
        e.preventDefault();
        imeMode = imeMode === 'boshiamy' ? 'english' : 'boshiamy';
        clearImeState();
        updateModeIndicator();
        return;
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
                mainEditor.value += '\n';
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
    mainEditor.value = mainEditor.value.slice(0, selectionStart) + char + mainEditor.value.slice(selectionEnd);
    mainEditor.selectionStart = mainEditor.selectionEnd = selectionStart + char.length;
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
