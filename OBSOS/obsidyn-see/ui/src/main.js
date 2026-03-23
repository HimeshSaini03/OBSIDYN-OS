const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let mainWindow = null;
let engineProcess = null;

function candidateWorks(command, args = []) {
    if (!command) {
        return false;
    }

    const isAbsolute = path.isAbsolute(command);
    if (isAbsolute && !fs.existsSync(command)) {
        return false;
    }

    const result = spawnSync(command, [...args, '--version'], {
        stdio: 'ignore',
        shell: false
    });
    return !result.error && result.status === 0;
}

function resolvePython(rootPath) {
    const candidates = [
        process.env.OBSIDYN_PYTHON ? { command: process.env.OBSIDYN_PYTHON, args: [] } : null,
        { command: path.join(rootPath, 'venv', 'Scripts', 'python.exe'), args: [] },
        { command: path.join(rootPath, 'venv', 'bin', 'python'), args: [] },
        { command: 'py', args: ['-3'] },
        { command: 'python', args: [] },
        { command: 'python3', args: [] }
    ].filter(Boolean);

    return candidates.find((candidate) => candidateWorks(candidate.command, candidate.args)) || null;
}

function emitEngineError(message) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const payload = JSON.stringify({ status: 'ERROR', data: message }) + '\n';
        mainWindow.webContents.send('engine-message', payload);
    }
}

function startEngine(rootPath) {
    const runtime = resolvePython(rootPath);
    const enginePath = path.join(rootPath, 'engine', 'main.py');

    if (!runtime) {
        emitEngineError('Python runtime not found. Set OBSIDYN_PYTHON or install Python 3.');
        dialog.showErrorBox('OBSIDYN Runtime', 'Python runtime not found. Set OBSIDYN_PYTHON or install Python 3 to start the engine.');
        return;
    }

    engineProcess = spawn(runtime.command, [...runtime.args, enginePath], {
        cwd: rootPath,
        env: {
            ...process.env,
            OBSIDYN_LOG_LEVEL: process.env.OBSIDYN_LOG_LEVEL || 'ERROR',
            PYTHONIOENCODING: 'utf-8'
        },
        windowsHide: true
    });

    engineProcess.stdout.on('data', (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('engine-message', data.toString());
        }
    });

    engineProcess.stderr.on('data', (data) => {
        console.debug(`[Engine] ${data.toString().trim()}`);
    });

    engineProcess.on('error', (error) => {
        console.error('Engine process error:', error);
        emitEngineError('Engine failed to start. Check the runtime configuration.');
    });

    engineProcess.on('exit', (code, signal) => {
        console.log(`Engine exited with code ${code}, signal ${signal}`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1480,
        height: 960,
        minWidth: 1280,
        minHeight: 760,
        frame: true,
        backgroundColor: '#050816',
        title: 'OBSIDYN',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    startEngine(path.join(__dirname, '..', '..'));
}

ipcMain.on('secure-command', (_event, command) => {
    if (engineProcess?.stdin?.writable) {
        engineProcess.stdin.write(command + '\n');
    }
});

ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Select File'
    });
    return result.filePaths;
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Folder'
    });
    return result.filePaths;
});

ipcMain.handle('select-restore-path', async (_event, defaultName = 'restored_file') => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Select Output Path',
        defaultPath: defaultName,
        buttonLabel: 'Confirm'
    });
    return result.filePath;
});

ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Select Image',
        filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result.filePaths;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (engineProcess) {
        engineProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (engineProcess) {
        engineProcess.kill();
    }
});
