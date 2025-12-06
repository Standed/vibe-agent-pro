import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import serve from 'electron-serve';
import fs from 'fs';

const loadURL = serve({ directory: 'out' });
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

// Ensure user data directory exists
// This is where IndexedDB data will be stored across updates
const userDataPath = app.getPath('userData');
console.log('User data path:', userDataPath);

// Create backup directory for extra safety
const backupPath = path.join(userDataPath, 'backups');
if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        titleBarStyle: 'hiddenInset',
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        loadURL(mainWindow);
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:') || url.startsWith('http:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // Auto Updater configuration - check for updates after window loads
    if (!isDev) {
        // Delay update check to ensure app is fully loaded
        setTimeout(() => {
            autoUpdater.checkForUpdatesAndNotify();
        }, 5000);
    }
}

app.on('ready', () => {
    createWindow();

    // Configure auto-updater
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        console.log('Checking for updates...');
        if (mainWindow) {
            mainWindow.webContents.send('update_checking');
        }
    });

    autoUpdater.on('update-available', (info) => {
        console.log('Update available:', info);
        if (mainWindow) {
            mainWindow.webContents.send('update_available', info);
        }
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log('No updates available');
        if (mainWindow) {
            mainWindow.webContents.send('update_not_available', info);
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        console.log(`Download progress: ${progressObj.percent}%`);
        if (mainWindow) {
            mainWindow.webContents.send('download_progress', progressObj);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('Update downloaded:', info);
        if (mainWindow) {
            mainWindow.webContents.send('update_downloaded', info);
        }
    });

    autoUpdater.on('error', (err) => {
        console.error('Auto-updater error:', err);
        if (mainWindow) {
            mainWindow.webContents.send('update_error', err);
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC handlers
ipcMain.on('app_version', (event) => {
    event.sender.send('app_version', { version: app.getVersion() });
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.on('check_for_updates', () => {
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

ipcMain.handle('get_user_data_path', () => {
    return userDataPath;
});

ipcMain.handle('get_app_info', () => {
    return {
        version: app.getVersion(),
        name: app.getName(),
        userDataPath: userDataPath,
        backupPath: backupPath,
    };
});
