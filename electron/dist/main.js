"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
var path_1 = __importDefault(require("path"));
var electron_updater_1 = require("electron-updater");
var electron_serve_1 = __importDefault(require("electron-serve"));
var loadURL = (0, electron_serve_1.default)({ directory: 'out' });
var isDev = !electron_1.app.isPackaged || process.env.NODE_ENV === 'development';
var mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path_1.default.join(__dirname, 'preload.js'),
        },
        titleBarStyle: 'hiddenInset',
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    }
    else {
        loadURL(mainWindow);
    }
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(function (_a) {
        var url = _a.url;
        if (url.startsWith('https:') || url.startsWith('http:')) {
            electron_1.shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    // Auto Updater events
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
}
electron_1.app.on('ready', function () {
    createWindow();
    electron_updater_1.autoUpdater.on('update-available', function () {
        if (mainWindow) {
            mainWindow.webContents.send('update_available');
        }
    });
    electron_updater_1.autoUpdater.on('update-downloaded', function () {
        if (mainWindow) {
            mainWindow.webContents.send('update_downloaded');
        }
    });
});
electron_1.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
// IPC handlers can be added here
electron_1.ipcMain.on('app_version', function (event) {
    event.sender.send('app_version', { version: electron_1.app.getVersion() });
});
electron_1.ipcMain.on('restart_app', function () {
    electron_updater_1.autoUpdater.quitAndInstall();
});
