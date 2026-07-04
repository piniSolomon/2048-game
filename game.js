// ============================================
// 2048 — Slide & Merge Puzzle
// A browser-based clone of the classic 2048 game
// ============================================

const GAME_VERSION = '1.1.0';
const GRID_SIZE = 4;
const STORAGE_KEY = '2048_best';
const STATE_KEY = '2048_state';
const DARK_KEY = '2048_dark';

// --- DOM ---
const boardEl = document.getElementById('game-board');
const tilesEl = document.getElementById('tiles');
const gridBgEl = document.getElementById('grid-bg');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const newGameBtn = document.getElementById('new-game-btn');
const undoBtn = document.getElementById('undo-btn');
const darkModeBtn = document.getElementById('dark-mode-btn');
const messageEl = document.getElementById('game-message');
const messageText = document.getElementById('message-text');
const messageBtn = document.getElementById('message-btn');

// --- State ---
var grid = [];        // 4x4 array of values (0 = empty)
var score = 0;
var best = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
var gameOver = false;
var won = false;
var keepPlaying = false;
var moving = false;   // animation lock
var moveCount = 0;

// Undo history (stores previous state before each move)
var undoStack = [];
const MAX_UNDO = 5;

// Dark mode
var darkMode = localStorage.getItem(DARK_KEY) === 'true';
if (darkMode) document.body.classList.add('dark');

// --- Audio (Web Audio API) ---
var audioCtx = null;

function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { /* no audio */ }
}

function playSlideSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, audioCtx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
}

function playMergeSound(value) {
    if (!audioCtx) return;
    // Higher pitch for higher merges
    const baseFreq = 300 + Math.min(Math.log2(value) * 80, 800);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

function playGameOverSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

function playWinSound() {
    if (!audioCtx) return;
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        const t = audioCtx.currentTime + i * 0.1;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
    });
}

bestEl.textContent = best;

// --- Grid background ---
for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    gridBgEl.appendChild(cell);
}

// --- Tile rendering ---
var tileElements = {}; // id -> DOM element
var nextTileId = 1;

function getTileSize() {
    const boardRect = tilesEl.getBoundingClientRect();
    const gap = GRID_SIZE === 4 ? 12 : 10;
    const totalGap = gap * (GRID_SIZE - 1);
    return (boardRect.width - totalGap) / GRID_SIZE;
}

function getTilePos(row, col) {
    const boardRect = tilesEl.getBoundingClientRect();
    const gap = GRID_SIZE === 4 ? 12 : 10;
    const totalGap = gap * (GRID_SIZE - 1);
    const tileSize = (boardRect.width - totalGap) / GRID_SIZE;
    return {
        left: col * (tileSize + gap),
        top: row * (tileSize + gap),
        size: tileSize
    };
}

function createTileEl(id, value, row, col, isNew) {
    const el = document.createElement('div');
    const pos = getTilePos(row, col);
    const fontSize = value >= 1024 ? pos.size * 0.28 : value >= 128 ? pos.size * 0.35 : pos.size * 0.42;

    el.className = `tile tile-${value <= 2048 ? value : 'super'}${isNew ? ' new' : ''}`;
    el.textContent = value;
    el.style.width = pos.size + 'px';
    el.style.height = pos.size + 'px';
    el.style.left = pos.left + 'px';
    el.style.top = pos.top + 'px';
    el.style.fontSize = fontSize + 'px';
    el.style.lineHeight = pos.size + 'px';
    el.dataset.id = id;

    tilesEl.appendChild(el);
    tileElements[id] = el;
    return el;
}

function updateTileEl(id, value, row, col, merged) {
    const el = tileElements[id];
    if (!el) return;

    const pos = getTilePos(row, col);
    const fontSize = value >= 1024 ? pos.size * 0.28 : value >= 128 ? pos.size * 0.35 : pos.size * 0.42;

    el.style.left = pos.left + 'px';
    el.style.top = pos.top + 'px';
    el.textContent = value;
    el.className = `tile tile-${value <= 2048 ? value : 'super'}`;
    el.style.fontSize = fontSize + 'px';

    if (merged) {
        // Trigger pop animation
        el.classList.add('merged');
        setTimeout(() => el.classList.remove('merged'), 200);
    }
}

function removeTileEl(id) {
    const el = tileElements[id];
    if (el) {
        el.remove();
        delete tileElements[id];
    }
}

function clearAllTiles() {
    tilesEl.innerHTML = '';
    tileElements = {};
}

// --- Game logic ---

// Internal grid stores objects: { id, value } or null
var tileGrid = []; // 4x4 of { id, value } | null

function initGrid() {
    tileGrid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        tileGrid[r] = [];
        for (let c = 0; c < GRID_SIZE; c++) {
            tileGrid[r][c] = null;
        }
    }
}

function emptyCells() {
    const cells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (!tileGrid[r][c]) cells.push({ r, c });
        }
    }
    return cells;
}

function addRandomTile() {
    const empty = emptyCells();
    if (empty.length === 0) return null;
    const cell = empty[Math.floor(Math.random() * empty.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    const id = nextTileId++;
    tileGrid[cell.r][cell.c] = { id, value };
    createTileEl(id, value, cell.r, cell.c, true);
    return { r: cell.r, c: cell.c, value };
}

function canMove() {
    // Any empty cell?
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (!tileGrid[r][c]) return true;
        }
    }
    // Any adjacent same value?
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const val = tileGrid[r][c].value;
            if (r < GRID_SIZE - 1 && tileGrid[r + 1][c] && tileGrid[r + 1][c].value === val) return true;
            if (c < GRID_SIZE - 1 && tileGrid[r][c + 1] && tileGrid[r][c + 1].value === val) return true;
        }
    }
    return false;
}

function move(direction) {
    if (moving || gameOver) return false;

    initAudio();

    // direction: 'up', 'down', 'left', 'right'
    const vectors = {
        up:    { dr: -1, dc: 0 },
        down:  { dr: 1,  dc: 0 },
        left:  { dr: 0,  dc: -1 },
        right: { dr: 0,  dc: 1 },
    };

    const vec = vectors[direction];
    if (!vec) return false;

    // Build traversal order
    const rows = [], cols = [];
    for (let i = 0; i < GRID_SIZE; i++) { rows.push(i); cols.push(i); }
    if (vec.dr === 1) rows.reverse();
    if (vec.dc === 1) cols.reverse();

    let moved = false;
    const mergedIds = new Set();
    const toRemove = []; // tile IDs to remove after animation

    // Save undo state before move
    const undoState = {
        grid: tileGrid.map(row => row.map(cell => cell ? { value: cell.value } : null)),
        score: score,
        gameOver: gameOver,
        won: won,
        keepPlaying: keepPlaying,
        moveCount: moveCount,
    };

    for (const r of rows) {
        for (const c of cols) {
            const tile = tileGrid[r][c];
            if (!tile) continue;

            let nr = r, nc = c;
            // Slide as far as possible
            while (true) {
                const tr = nr + vec.dr;
                const tc = nc + vec.dc;
                if (tr < 0 || tr >= GRID_SIZE || tc < 0 || tc >= GRID_SIZE) break;

                const target = tileGrid[tr][tc];
                if (!target) {
                    nr = tr;
                    nc = tc;
                } else if (target.value === tile.value && !mergedIds.has(target.id)) {
                    // Merge
                    nr = tr;
                    nc = tc;
                    break;
                } else {
                    break;
                }
            }

            if (nr !== r || nc !== c) {
                moved = true;
                const target = tileGrid[nr][nc];

                if (target && target.value === tile.value) {
                    // Merge: tile absorbs into target
                    const newValue = tile.value * 2;
                    target.value = newValue;
                    mergedIds.add(target.id);

                    // Move tile visually to target position then remove
                    updateTileEl(tile.id, tile.value, nr, nc, false);
                    toRemove.push(tile.id);

                    // Update target visually
                    updateTileEl(target.id, newValue, nr, nc, true);

                    tileGrid[r][c] = null;

                    score += newValue;
                    if (score > best) {
                        best = score;
                        localStorage.setItem(STORAGE_KEY, String(best));
                        bestEl.textContent = best;
                    }
                    scoreEl.textContent = score;

                    // Score popup
                    showScorePopup(nr, nc, newValue);
                    playMergeSound(newValue);

                    // Check win
                    if (newValue === 2048 && !won && !keepPlaying) {
                        won = true;
                    }
                } else {
                    // Just slide
                    tileGrid[nr][nc] = tile;
                    tileGrid[r][c] = null;
                    updateTileEl(tile.id, tile.value, nr, nc, false);
                }
            }
        }
    }

    if (moved) {
        // Push undo state
        undoStack.push(undoState);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        updateUndoBtn();
        moveCount++;
        playSlideSound();

        moving = true;
        setTimeout(() => {
            // Remove absorbed tiles
            for (const id of toRemove) {
                removeTileEl(id);
            }

            addRandomTile();

            if (won) {
                showMessage('You win!', true);
                playWinSound();
                if (typeof trackEvent === 'function') {
                    trackEvent('game_win', { score, best, moves: moveCount });
                }
            } else if (!canMove()) {
                gameOver = true;
                showMessage('Game over!', false);
                playGameOverSound();
                if (typeof trackEvent === 'function') {
                    trackEvent('game_over', { score, best, moves: moveCount });
                }
            }

            saveState();
            moving = false;
        }, 130); // match CSS transition duration
    } else {
        // No move happened — check if board is full with no merges
        if (!canMove()) {
            gameOver = true;
            showMessage('Game over!', false);
            playGameOverSound();
            if (typeof trackEvent === 'function') {
                trackEvent('game_over', { score, best, moves: moveCount });
            }
            saveState();
        }
    }

    return moved;
}

function showScorePopup(row, col, value) {
    const pos = getTilePos(row, col);
    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.textContent = '+' + value;
    popup.style.left = (pos.left + pos.size / 2 - 20) + 'px';
    popup.style.top = pos.top + 'px';
    tilesEl.appendChild(popup);
    setTimeout(() => popup.remove(), 600);
}

function showMessage(text, isWin) {
    messageText.textContent = text;
    messageEl.classList.remove('hidden', 'win');
    if (isWin) {
        messageEl.classList.add('win');
        messageBtn.textContent = 'Keep going';
    } else {
        messageBtn.textContent = 'Try again';
    }
}

function hideMessage() {
    messageEl.classList.add('hidden');
}

// --- New game ---
function newGame() {
    initGrid();
    clearAllTiles();
    score = 0;
    gameOver = false;
    won = false;
    keepPlaying = false;
    moveCount = 0;
    undoStack = [];
    updateUndoBtn();
    scoreEl.textContent = '0';
    hideMessage();

    addRandomTile();
    addRandomTile();

    saveState();

    if (typeof trackEvent === 'function') {
        trackEvent('game_start', { game: '2048' });
    }
}

// --- Undo ---
function updateUndoBtn() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
}

function undo() {
    if (undoStack.length === 0 || moving) return;

    const prev = undoStack.pop();
    updateUndoBtn();

    initGrid();
    clearAllTiles();

    score = prev.score;
    gameOver = prev.gameOver;
    won = prev.won;
    keepPlaying = prev.keepPlaying;
    moveCount = prev.moveCount;

    scoreEl.textContent = score;

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = prev.grid[r][c];
            if (cell) {
                const id = nextTileId++;
                tileGrid[r][c] = { id, value: cell.value };
                createTileEl(id, cell.value, r, c, false);
            }
        }
    }

    hideMessage();
    saveState();
}

// --- Dark mode ---
function toggleDarkMode() {
    darkMode = !darkMode;
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem(DARK_KEY, String(darkMode));
}

// --- Save / Load state ---
function saveState() {
    const state = {
        grid: tileGrid.map(row => row.map(cell => cell ? cell.value : 0)),
        score,
        best,
        gameOver,
        won,
        keepPlaying,
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadState() {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return false;

    try {
        const state = JSON.parse(raw);
        if (!state.grid || state.grid.length !== GRID_SIZE) return false;

        initGrid();
        clearAllTiles();
        score = state.score || 0;
        best = state.best || best;
        gameOver = state.gameOver || false;
        won = state.won || false;
        keepPlaying = state.keepPlaying || false;

        scoreEl.textContent = score;
        bestEl.textContent = best;

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const val = state.grid[r][c];
                if (val > 0) {
                    const id = nextTileId++;
                    tileGrid[r][c] = { id, value: val };
                    createTileEl(id, val, r, c, false);
                }
            }
        }

        if (gameOver) showMessage('Game over!', false);
        else if (won && !keepPlaying) showMessage('You win!', true);

        return true;
    } catch (e) {
        return false;
    }
}

// --- Input handling ---

// Keyboard
window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const dir = e.key.replace('Arrow', '').toLowerCase();
        move(dir);
    }
    // Ctrl+Z / Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    }
});

// Touch / Swipe
var touchStartX = 0, touchStartY = 0;
var touchActive = false;

boardEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchActive = true;
    e.preventDefault();
}, { passive: false });

boardEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

boardEl.addEventListener('touchend', (e) => {
    if (!touchActive) return;
    touchActive = false;

    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const minSwipe = 30;

    if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return;

    if (Math.abs(dx) > Math.abs(dy)) {
        move(dx > 0 ? 'right' : 'left');
    } else {
        move(dy > 0 ? 'down' : 'up');
    }
}, { passive: false });

// Mouse drag (for desktop without keyboard)
var mouseDown = false, mouseStartX = 0, mouseStartY = 0;

boardEl.addEventListener('mousedown', (e) => {
    mouseDown = true;
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
});

window.addEventListener('mouseup', (e) => {
    if (!mouseDown) return;
    mouseDown = false;

    const dx = e.clientX - mouseStartX;
    const dy = e.clientY - mouseStartY;
    const minSwipe = 30;

    if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return;

    if (Math.abs(dx) > Math.abs(dy)) {
        move(dx > 0 ? 'right' : 'left');
    } else {
        move(dy > 0 ? 'down' : 'up');
    }
});

// Buttons
newGameBtn.addEventListener('click', newGame);
if (undoBtn) undoBtn.addEventListener('click', undo);
if (darkModeBtn) darkModeBtn.addEventListener('click', toggleDarkMode);
messageBtn.addEventListener('click', () => {
    if (won && !keepPlaying) {
        keepPlaying = true;
        hideMessage();
        saveState();
    } else {
        newGame();
    }
});

// Handle resize — reposition all tiles
window.addEventListener('resize', () => {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const tile = tileGrid[r] && tileGrid[r][c];
            if (tile) {
                const el = tileElements[tile.id];
                if (el) {
                    const pos = getTilePos(r, c);
                    const fontSize = tile.value >= 1024 ? pos.size * 0.28 : tile.value >= 128 ? pos.size * 0.35 : pos.size * 0.42;
                    el.style.left = pos.left + 'px';
                    el.style.top = pos.top + 'px';
                    el.style.width = pos.size + 'px';
                    el.style.height = pos.size + 'px';
                    el.style.fontSize = fontSize + 'px';
                    el.style.lineHeight = pos.size + 'px';
                }
            }
        }
    }
});

// --- Init ---
if (!loadState()) {
    newGame();
}
