const { contextBridge, ipcRenderer } = require('electron');

let cachedImageMap = {};

contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    getUserDataPath: () => ipcRenderer.invoke('get-userdata-path'),
    isElectron: true,

    // Scraper API
    scrapeComics: (options) => ipcRenderer.invoke('scrape-comics', options),
    scrapePage: (options) => ipcRenderer.invoke('scrape-page', options),
    scrapeDetail: (options) => ipcRenderer.invoke('scrape-detail', options),
    scrapeChapter: (options) => ipcRenderer.invoke('scrape-chapter', options),
    getSortOptions: () => ipcRenderer.invoke('get-sort-options'),
    getConfig: () => ipcRenderer.invoke('get-config'),

    // Debug API - để kiểm tra HTML
    debugHtml: (options) => ipcRenderer.invoke('debug-html', options),

    // Image cache: save/load cached path map
    getCachedImageMap: async () => {
        const map = await ipcRenderer.invoke('get-cached-image-map');
        cachedImageMap = map || {};
        return cachedImageMap;
    },
    getCachedImageUrl: (remoteUrl) => {
        if (!remoteUrl) return remoteUrl;
        const localPath = cachedImageMap[remoteUrl];
        if (localPath) return 'file:///' + localPath.replace(/\\/g, '/');
        return remoteUrl;
    },

    // TTS via Node.js (bypasses CORS)
    fetchTTS: (options) => ipcRenderer.invoke('tts-google', options),

    // Lịch sử đọc
    getHistory: () => ipcRenderer.invoke('history-get'),
    addHistory: (entry) => ipcRenderer.invoke('history-add', entry),
    removeHistory: (chapterUrl) => ipcRenderer.invoke('history-remove', chapterUrl),
    clearHistory: () => ipcRenderer.invoke('history-clear'),

    // Auto-update
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', (event, info) => callback(info));
    },
});
