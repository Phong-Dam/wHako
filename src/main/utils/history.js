// ============================================================
// Reading History Management
// ============================================================
const path = require('path');
const fs = require('fs');
const { MAX_HISTORY } = require('./constants');

function historyFilePath(userDataPath) {
    return path.join(userDataPath, 'history.json');
}

function loadHistory(userDataPath) {
    return new Promise((resolve) => {
        try {
            const file = historyFilePath(userDataPath);
            if (fs.existsSync(file)) {
                const data = fs.readFileSync(file, 'utf-8');
                resolve(JSON.parse(data));
                return;
            }
        } catch (e) { /* ignore */ }
        resolve([]);
    });
}

function saveHistory(userDataPath, history) {
    return new Promise((resolve) => {
        try {
            const filePath = historyFilePath(userDataPath);
            fs.writeFile(filePath, JSON.stringify(history, null, 2), 'utf-8', (err) => {
                if (err) console.error('saveHistory error:', err);
                resolve();
            });
        } catch (e) {
            console.error('saveHistory error:', e);
            resolve();
        }
    });
}

async function addHistoryEntry(userDataPath, entry) {
    const history = await loadHistory(userDataPath);
    const filtered = history.filter(h => h.chapterUrl !== entry.chapterUrl);
    filtered.unshift({ ...entry, readAt: Date.now() });
    const trimmed = filtered.slice(0, MAX_HISTORY);
    await saveHistory(userDataPath, trimmed);
    return trimmed;
}

module.exports = {
    historyFilePath,
    loadHistory,
    saveHistory,
    addHistoryEntry
};
