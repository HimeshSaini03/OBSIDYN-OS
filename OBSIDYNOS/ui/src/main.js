const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ===== GLOBAL VARIABLES =====
let mainWindow = null;
let engineProcess = null;
let isAppReady = false;

// ===== WINDOW CONFIGURATION =====
const WINDOW_CONFIG = {
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0f172a',
    title: 'OBSIDYN - Secure Execution Environment',
    show: false // Don't show until ready
};

// ===== CREATE MAIN WINDOW =====
function createWindow() {
    mainWindow = new BrowserWindow({
        width: WINDOW_CONFIG.width,
        height: WINDOW_CONFIG.height,
        minWidth: WINDOW_CONFIG.minWidth,
        minHeight: WINDOW_CONFIG.minHeight,
        frame: true, // Use native window controls
        backgroundColor: WINDOW_CONFIG.backgroundColor,
        title: WINDOW_CONFIG.title,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false,
            webSecurity: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    // Load the HTML file
    mainWindow.loadFile('src/index.html');

    // Show window when ready to prevent flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        isAppReady = true;
    });

    // Open DevTools in development (optional)
    // mainWindow.webContents.openDevTools();

    // Handle window close
    mainWindow.on('closed', () => {
        mainWindow = null;
        killEngine();
    });

    // Prevent navigation to external URLs
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    // Start Python engine
    startEngine();
}

// ===== START PYTHON ENGINE =====
function startEngine() {
    try {
        const enginePath = path.join(__dirname, '..', '..', 'engine', 'main.py');
        const rootPath = path.join(__dirname, '..', '..');

        // Check if engine file exists
        if (!fs.existsSync(enginePath)) {
            console.error('Engine file not found:', enginePath);
            showError('Engine file not found. Please reinstall the application.');
            return;
        }

        // Spawn Python process
        engineProcess = spawn('python', [enginePath], {
            cwd: rootPath,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        console.log('Engine started at:', enginePath);

        // Handle engine stdout (responses)
        engineProcess.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message && mainWindow) {
                mainWindow.webContents.send('engine-message', message);
            }
        });

        // Handle engine stderr (logs/errors)
        engineProcess.stderr.on('data', (data) => {
            const error = data.toString().trim();
            console.log(`[Engine Log] ${error}`);
            if (mainWindow) {
                mainWindow.webContents.send('engine-log', error);
            }
        });

        // Handle engine process errors
        engineProcess.on('error', (err) => {
            console.error('Engine process error:', err);
            showError(`Engine failed to start: ${err.message}`);
        });

        // Handle engine process exit
        engineProcess.on('exit', (code, signal) => {
            console.log(`Engine exited with code: ${code}, signal: ${signal}`);
            engineProcess = null;
            if (mainWindow) {
                mainWindow.webContents.send('engine-exit', { code, signal });
            }
        });

    } catch (error) {
        console.error('Failed to start engine:', error);
        showError(`Failed to start security engine: ${error.message}`);
    }
}

// ===== KILL ENGINE PROCESS =====
function killEngine() {
    if (engineProcess) {
        try {
            // Send graceful shutdown signal
            engineProcess.stdin.end();
            
            // Force kill after timeout
            setTimeout(() => {
                if (engineProcess && !engineProcess.killed) {
                    engineProcess.kill('SIGTERM');
                }
            }, 1000);
        } catch (error) {
            console.error('Error killing engine:', error);
        }
    }
}

// ===== SHOW ERROR DIALOG =====
function showError(message) {
    if (mainWindow) {
        dialog.showErrorBox('OBSIDYN Error', message);
    } else {
        console.error(message);
    }
}

// ===== IPC HANDLERS =====

// Secure command to engine
ipcMain.on('secure-command', (event, command) => {
    if (engineProcess && engineProcess.stdin && !engineProcess.stdin.destroyed) {
        try {
            engineProcess.stdin.write(command + '\n');
        } catch (error) {
            console.error('Failed to send command:', error);
            event.reply('engine-message', JSON.stringify({
                status: 'ERROR',
                data: 'Failed to communicate with engine'
            }));
        }
    } else {
        console.error('Engine not available');
        event.reply('engine-message', JSON.stringify({
            status: 'ERROR',
            data: 'Security engine is not running'
        }));
    }
});

// Select file to lock
ipcMain.handle('select-file', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: options.title || 'Select File to Lock',
        filters: options.filters || [],
        defaultPath: options.defaultPath || undefined
    });
    return result.filePaths;
});

// Select folder to lock
ipcMain.handle('select-folder', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: options.title || 'Select Folder to Lock',
        defaultPath: options.defaultPath || undefined
    });
    return result.filePaths;
});

// Select image file
ipcMain.handle('select-image', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: options.title || 'Select Image File',
        filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        defaultPath: options.defaultPath || undefined
    });
    return result.filePaths;
});

// Select restore path (save dialog)
ipcMain.handle('select-restore-path', async (event, defaultName = 'restored_file') => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Restore File To',
        defaultPath: defaultName,
        buttonLabel: 'Restore',
        filters: [
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result.filePath;
});

// Show notification
ipcMain.handle('show-notification', async (event, message, type = 'info') => {
    // This can be extended to show native notifications
    console.log(`[Notification] ${type}: ${message}`);
    return true;
});

// Open external URL
ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
    return true;
});

// Get app version
ipcMain.handle('get-app-version', async () => {
    const packageJson = require('../package.json');
    return packageJson.version;
});

// Get app path
ipcMain.handle('get-app-path', async (event, name) => {
    return app.getPath(name);
});

// Minimize window
ipcMain.on('minimize-window', () => {
    if (mainWindow) {
        mainWindow.minimize();
    }
});

// Maximize/restore window
ipcMain.on('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

// Close window
ipcMain.on('close-window', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

// Restart application
ipcMain.handle('restart-app', async () => {
    app.relaunch();
    app.exit(0);
});

// Quit application
ipcMain.handle('quit-app', async () => {
    killEngine();
    app.quit();
});

// ===== APP LIFECYCLE =====

app.whenReady().then(() => {
    createWindow();

    // Handle app ready
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Handle all windows closed
app.on('window-all-closed', () => {
    killEngine();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle app quit
app.on('before-quit', () => {
    killEngine();
});

// Handle app quit confirmation
app.on('will-quit', (event) => {
    // Ensure engine is killed before quit
    killEngine();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    showError(`Unexpected error: ${error.message}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ===== EXPORT FOR TESTING =====
module.exports = {
    mainWindow,
    engineProcess,
    isAppReady
};