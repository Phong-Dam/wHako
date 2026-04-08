const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

// ============================================================
// Configuration
// ============================================================
// Load environment variables if dotenv is available
let BASE_URL = 'https://docln.sbs';
try {
    require('dotenv').config();
    if (process.env.BASE_URL) BASE_URL = process.env.BASE_URL;
} catch (_) { /* dotenv optional */ }

// isDev is determined after app is ready to ensure app.isPackaged is accurate
let isDev = false;

// ============================================================
// App Lifecycle
// ============================================================
let mainWindow;
let autoUpdater = null;

// Bỏ qua lỗi SSL cho Chromium (hình ảnh từ docln.sbs)
if (app && app.commandLine) {
    app.commandLine.appendSwitch('ignore-certificate-errors');
    app.commandLine.appendSwitch('ignore-certificate-errors-spki-list');
}

// Import scraper
const scraper = require('./scraper');

// ============================================================
// Auto-Update Setup
// ============================================================
function setupAutoUpdater() {
    // Skip auto-update in development
    if (isDev) {
        console.log('[AutoUpdate] Skipping auto-update in development mode');
        return;
    }

    try {
        const { autoUpdater: updater } = require('electron-updater');
        autoUpdater = updater;

        // Configure auto-updater
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = true;

        // Event handlers
        autoUpdater.on('checking-for-update', () => {
            console.log('[AutoUpdate] Checking for updates...');
        });

        autoUpdater.on('update-available', (info) => {
            console.log('[AutoUpdate] Update available:', info.version);
            // Auto download the update
            autoUpdater.downloadUpdate();
        });

        autoUpdater.on('update-not-available', () => {
            console.log('[AutoUpdate] No updates available');
        });

        autoUpdater.on('download-progress', (progress) => {
            console.log(`[AutoUpdate] Download: ${Math.round(progress.percent)}%`);
        });

        autoUpdater.on('update-downloaded', (info) => {
            console.log('[AutoUpdate] Update downloaded:', info.version);
            // Notify renderer that update is ready
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-downloaded', info);
            }
        });

        autoUpdater.on('error', (err) => {
            console.error('[AutoUpdate] Error:', err.message);
        });

        // Check for updates after app starts
        setTimeout(() => {
            autoUpdater.checkForUpdates().catch(err => {
                console.error('[AutoUpdate] Check failed:', err.message);
            });
        }, 3000);

        console.log('[AutoUpdate] Initialized');
    } catch (err) {
        console.log('[AutoUpdate] Not available:', err.message);
    }
}

// IPC handler for manual update check
function registerUpdateIpcHandlers() {
    ipcMain.handle('check-for-updates', async () => {
        if (!autoUpdater) return { error: 'Auto-update not available' };
        try {
            await autoUpdater.checkForUpdates();
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('install-update', () => {
        if (autoUpdater) {
            autoUpdater.quitAndInstall();
        }
    });
}

// ============================================================
// Menu
// ============================================================
function createAppMenu() {
    // Always hide the menu bar (File, View, Window)
    Menu.setApplicationMenu(null);
}

// ============================================================
// Window
// ============================================================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0a0a0a',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, '..', 'preload', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: !isDev,
        },
        autoHideMenuBar: true,
        frame: true,
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    });

    // Load the index.html from renderer folder
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        //mainWindow.setFullScreen(true);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle external links - whitelist domains for security
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const allowedDomains = ['docln.sbs', 'google.com'];
            const parsed = new URL(url);
            if (allowedDomains.some(d => parsed.hostname.includes(d))) {
                require('electron').shell.openExternal(url);
            } else {
                console.warn('[Security] Blocked external link:', url);
            }
        } catch (_) {
            require('electron').shell.openExternal(url);
        }
        return { action: 'deny' };
    });
}

// ============================================================
// App Events
// ============================================================
app.whenReady().then(() => {
    // Determine isDev after app is ready — app.isPackaged is now reliable
    isDev = !app.isPackaged;

    createAppMenu();
    createWindow();

    const userDataPath = app.getPath('userData');
    scraper.registerIpcHandlers(mainWindow, BASE_URL, userDataPath);
    registerUpdateIpcHandlers();
    setupAutoUpdater();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Clear memory cache when app quits
app.on('will-quit', () => {
    scraper.clearCacheDir();
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ============================================================
// IPC Handlers
// ============================================================
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
    return app.getAppPath();
});

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
        try {
            const parsedUrl = new URL(navigationUrl);
            if (parsedUrl.protocol !== 'file:') {
                event.preventDefault();
            }
        } catch (_) {
            event.preventDefault();
        }
    });
});

ipcMain.handle('get-userdata-path', () => {
    return app.getPath('userData');
});
