// @ts-check
const { test, expect } = require('@playwright/test');

// Helper: start fresh game
async function freshGame(page) {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    await page.click('#new-game-btn');
    await page.waitForTimeout(100);
}

// ============================================
// Test: Game loads
// ============================================
test('game loads and shows title', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    await expect(page.locator('h1')).toHaveText('2048');
    await expect(page.locator('#score')).toHaveText('0');
});

// ============================================
// Test: Version is defined
// ============================================
test('game version is defined', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    const version = await page.evaluate(() => GAME_VERSION);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
});

// ============================================
// Test: Grid has 16 background cells
// ============================================
test('grid has 16 background cells', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    const cells = await page.locator('.grid-cell').count();
    expect(cells).toBe(16);
});

// ============================================
// Test: Game starts with 2 tiles
// ============================================
test('game starts with 2 tiles', async ({ page }) => {
    await freshGame(page);
    const tiles = await page.locator('.tile').count();
    expect(tiles).toBe(2);
});

// ============================================
// Test: Initial tiles are 2 or 4
// ============================================
test('initial tiles have value 2 or 4', async ({ page }) => {
    await freshGame(page);
    const values = await page.evaluate(() => {
        const vals = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (tileGrid[r][c]) vals.push(tileGrid[r][c].value);
            }
        }
        return vals;
    });
    expect(values.length).toBe(2);
    for (const v of values) {
        expect([2, 4]).toContain(v);
    }
});

// ============================================
// Test: Arrow keys move tiles
// ============================================
test('arrow keys move tiles', async ({ page }) => {
    await freshGame(page);
    const before = await page.evaluate(() => JSON.stringify(tileGrid.map(r => r.map(c => c ? c.value : 0))));
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => JSON.stringify(tileGrid.map(r => r.map(c => c ? c.value : 0))));
    // Grid should have changed (new tile spawned even if nothing merged)
    expect(after).not.toBe(before);
});

// ============================================
// Test: New tile spawns after move
// ============================================
test('new tile spawns after valid move', async ({ page }) => {
    await freshGame(page);
    const beforeCount = await page.evaluate(() => {
        let count = 0;
        for (let r = 0; r < GRID_SIZE; r++)
            for (let c = 0; c < GRID_SIZE; c++)
                if (tileGrid[r][c]) count++;
        return count;
    });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const afterCount = await page.evaluate(() => {
        let count = 0;
        for (let r = 0; r < GRID_SIZE; r++)
            for (let c = 0; c < GRID_SIZE; c++)
                if (tileGrid[r][c]) count++;
        return count;
    });
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
});

// ============================================
// Test: Merging tiles adds to score
// ============================================
test('merging tiles increases score', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    // Set up a guaranteed merge: two 2s in same column
    await page.evaluate(() => {
        initGrid();
        clearAllTiles();
        score = 0;
        gameOver = false;
        won = false;
        scoreEl.textContent = '0';
        const id1 = nextTileId++;
        const id2 = nextTileId++;
        tileGrid[0][0] = { id: id1, value: 2 };
        tileGrid[1][0] = { id: id2, value: 2 };
        createTileEl(id1, 2, 0, 0, false);
        createTileEl(id2, 2, 1, 0, false);
    });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const newScore = await page.evaluate(() => score);
    expect(newScore).toBe(4); // 2 + 2 = 4 points
});

// ============================================
// Test: Merged tile has correct value
// ============================================
test('merged tile has doubled value', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        initGrid();
        clearAllTiles();
        score = 0;
        gameOver = false;
        won = false;
        scoreEl.textContent = '0';
        const id1 = nextTileId++;
        const id2 = nextTileId++;
        tileGrid[0][0] = { id: id1, value: 4 };
        tileGrid[2][0] = { id: id2, value: 4 };
        createTileEl(id1, 4, 0, 0, false);
        createTileEl(id2, 4, 2, 0, false);
    });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    const topVal = await page.evaluate(() => tileGrid[0][0] ? tileGrid[0][0].value : 0);
    expect(topVal).toBe(8);
});

// ============================================
// Test: Game over detection
// ============================================
test('game over when no moves possible', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    // Fill grid with all different values — no merges possible
    await page.evaluate(() => {
        initGrid();
        clearAllTiles();
        score = 0;
        gameOver = false;
        won = false;
        keepPlaying = false;
        scoreEl.textContent = '0';
        const vals = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2, 4, 8, 16, 32, 64];
        let i = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const id = nextTileId++;
                tileGrid[r][c] = { id, value: vals[i] };
                createTileEl(id, vals[i], r, c, false);
                i++;
            }
        }
    });
    // Try to move — should trigger game over
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const isOver = await page.evaluate(() => gameOver);
    expect(isOver).toBe(true);
    // Message should be visible
    await expect(page.locator('#game-message')).not.toHaveClass(/hidden/);
});

// ============================================
// Test: Win detection at 2048
// ============================================
test('win is detected when 2048 tile created', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        initGrid();
        clearAllTiles();
        score = 0;
        gameOver = false;
        won = false;
        keepPlaying = false;
        scoreEl.textContent = '0';
        const id1 = nextTileId++;
        const id2 = nextTileId++;
        tileGrid[0][0] = { id: id1, value: 1024 };
        tileGrid[1][0] = { id: id2, value: 1024 };
        createTileEl(id1, 1024, 0, 0, false);
        createTileEl(id2, 1024, 1, 0, false);
    });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    const hasWon = await page.evaluate(() => won);
    expect(hasWon).toBe(true);
    await expect(page.locator('#message-text')).toHaveText('You win!');
});

// ============================================
// Test: New Game button resets
// ============================================
test('new game button resets the board', async ({ page }) => {
    await freshGame(page);
    // Make some moves
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const scoreBefore = await page.evaluate(() => score);

    await page.click('#new-game-btn');
    await page.waitForTimeout(200);

    const scoreAfter = await page.evaluate(() => score);
    const tileCount = await page.evaluate(() => {
        let count = 0;
        for (let r = 0; r < GRID_SIZE; r++)
            for (let c = 0; c < GRID_SIZE; c++)
                if (tileGrid[r][c]) count++;
        return count;
    });

    expect(scoreAfter).toBe(0);
    expect(tileCount).toBe(2);
});

// ============================================
// Test: Best score persists
// ============================================
test('best score is saved to localStorage', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    // Set up a merge to create score
    await page.evaluate(() => {
        localStorage.removeItem('2048_best');
        initGrid();
        clearAllTiles();
        score = 0;
        best = 0;
        gameOver = false;
        won = false;
        scoreEl.textContent = '0';
        bestEl.textContent = '0';
        const id1 = nextTileId++;
        const id2 = nextTileId++;
        tileGrid[0][0] = { id: id1, value: 2 };
        tileGrid[1][0] = { id: id2, value: 2 };
        createTileEl(id1, 2, 0, 0, false);
        createTileEl(id2, 2, 1, 0, false);
    });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const savedBest = await page.evaluate(() => localStorage.getItem('2048_best'));
    expect(parseInt(savedBest)).toBeGreaterThanOrEqual(4);
});

// ============================================
// Test: State saves and loads
// ============================================
test('game state persists across reload', async ({ page }) => {
    await freshGame(page);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const scoreBefore = await page.evaluate(() => score);
    const gridBefore = await page.evaluate(() =>
        JSON.stringify(tileGrid.map(r => r.map(c => c ? c.value : 0)))
    );

    // Reload page
    await page.reload();
    await page.waitForTimeout(300);

    const scoreAfter = await page.evaluate(() => score);
    const gridAfter = await page.evaluate(() =>
        JSON.stringify(tileGrid.map(r => r.map(c => c ? c.value : 0)))
    );

    expect(scoreAfter).toBe(scoreBefore);
    expect(gridAfter).toBe(gridBefore);
});

// ============================================
// Test: Keep playing after win
// ============================================
test('keep playing button allows continued play after win', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        initGrid();
        clearAllTiles();
        score = 0;
        gameOver = false;
        won = false;
        keepPlaying = false;
        scoreEl.textContent = '0';
        const id1 = nextTileId++;
        const id2 = nextTileId++;
        tileGrid[0][0] = { id: id1, value: 1024 };
        tileGrid[1][0] = { id: id2, value: 1024 };
        createTileEl(id1, 1024, 0, 0, false);
        createTileEl(id2, 1024, 1, 0, false);
    });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);

    // Click "Keep going"
    await page.click('#message-btn');
    await page.waitForTimeout(100);

    const kp = await page.evaluate(() => keepPlaying);
    expect(kp).toBe(true);
    await expect(page.locator('#game-message')).toHaveClass(/hidden/);
});

// ============================================
// Test: Tiles slide to edges
// ============================================
test('tiles slide to the correct edge', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        initGrid();
        clearAllTiles();
        score = 0;
        gameOver = false;
        won = false;
        scoreEl.textContent = '0';
        const id1 = nextTileId++;
        tileGrid[1][1] = { id: id1, value: 2 };
        createTileEl(id1, 2, 1, 1, false);
    });
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    const leftTile = await page.evaluate(() => tileGrid[1][0] ? tileGrid[1][0].value : 0);
    expect(leftTile).toBe(2);
});

// ============================================
// Test: canMove detects available moves
// ============================================
test('canMove returns true when moves exist', async ({ page }) => {
    await freshGame(page);
    const result = await page.evaluate(() => canMove());
    expect(result).toBe(true);
});

// ============================================
// Test: Score display updates
// ============================================
test('score display updates after merge', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        initGrid();
        clearAllTiles();
        score = 0;
        gameOver = false;
        won = false;
        scoreEl.textContent = '0';
        const id1 = nextTileId++;
        const id2 = nextTileId++;
        tileGrid[0][0] = { id: id1, value: 8 };
        tileGrid[1][0] = { id: id2, value: 8 };
        createTileEl(id1, 8, 0, 0, false);
        createTileEl(id2, 8, 1, 0, false);
    });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    await expect(page.locator('#score')).toHaveText('16');
});

// ============================================
// Test: Undo restores previous state
// ============================================
test('undo restores score and grid after a merge', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    // Set up a merge
    await page.evaluate(() => {
        initGrid();
        clearAllTiles();
        score = 0;
        gameOver = false;
        won = false;
        moveCount = 0;
        undoStack = [];
        scoreEl.textContent = '0';
        const id1 = nextTileId++;
        const id2 = nextTileId++;
        tileGrid[0][0] = { id: id1, value: 2 };
        tileGrid[1][0] = { id: id2, value: 2 };
        createTileEl(id1, 2, 0, 0, false);
        createTileEl(id2, 2, 1, 0, false);
    });
    // Make a move (merge)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    const scoreAfterMove = await page.evaluate(() => score);
    expect(scoreAfterMove).toBe(4);

    // Undo
    await page.evaluate(() => undo());
    await page.waitForTimeout(100);
    const scoreAfterUndo = await page.evaluate(() => score);
    expect(scoreAfterUndo).toBe(0);
});

// ============================================
// Test: Undo button is disabled when no history
// ============================================
test('undo button is disabled at game start', async ({ page }) => {
    await freshGame(page);
    const disabled = await page.evaluate(() => document.getElementById('undo-btn').disabled);
    expect(disabled).toBe(true);
});

// ============================================
// Test: Undo button enabled after a move
// ============================================
test('undo button enabled after a move', async ({ page }) => {
    await freshGame(page);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const disabled = await page.evaluate(() => document.getElementById('undo-btn').disabled);
    expect(disabled).toBe(false);
});

// ============================================
// Test: Dark mode toggles
// ============================================
test('dark mode toggle adds dark class to body', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    // Clear dark mode state
    await page.evaluate(() => { localStorage.removeItem('2048_dark'); document.body.classList.remove('dark'); });

    const beforeDark = await page.evaluate(() => document.body.classList.contains('dark'));
    expect(beforeDark).toBe(false);

    await page.click('#dark-mode-btn');
    await page.waitForTimeout(100);

    const afterDark = await page.evaluate(() => document.body.classList.contains('dark'));
    expect(afterDark).toBe(true);
});

// ============================================
// Test: Dark mode persists in localStorage
// ============================================
test('dark mode persists in localStorage', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => { localStorage.removeItem('2048_dark'); document.body.classList.remove('dark'); });

    await page.click('#dark-mode-btn');
    await page.waitForTimeout(100);

    const stored = await page.evaluate(() => localStorage.getItem('2048_dark'));
    expect(stored).toBe('true');
});

// ============================================
// Test: Move count increments
// ============================================
test('move count increments on valid move', async ({ page }) => {
    await freshGame(page);
    const before = await page.evaluate(() => moveCount);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => moveCount);
    expect(after).toBe(before + 1);
});

// ============================================
// Test: Version is 1.1.0
// ============================================
test('game version is 1.1.0', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(300);
    const version = await page.evaluate(() => GAME_VERSION);
    expect(version).toBe('1.1.0');
});
