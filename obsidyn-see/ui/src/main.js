const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow = null;
let engineProcess = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        frame: true,
        backgroundColor: '#0f172a',
        title: 'OBSIDYN - Secure Execution Environment',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('src/index.html');

    const enginePath = path.join(__dirname, '..', '..', 'engine', 'main.py');
    const rootPath = path.join(__dirname, '..', '..');

    engineProcess = spawn('python', [enginePath], {
        cwd: rootPath
    });

    engineProcess.stdout.on('data', (data) => {
        mainWindow.webContents.send('engine-message', data.toString());
    });

    engineProcess.stderr.on('data', (data) => {
        console.log(`[Engine] ${data}`);
    });

    engineProcess.on('error', (err) => {
        console.error('Engine process error:', err);
    });

    engineProcess.on('exit', (code, signal) => {
        console.log(`Engine exited with code: ${code}, signal: ${signal}`);
    });
}

ipcMain.on('secure-command', (event, command) => {
    if (engineProcess && engineProcess.stdin) {
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

ipcMain.handle('select-restore-path', async (event, defaultName = 'restored_file') => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Restore File To',
        defaultPath: defaultName,
        buttonLabel: 'Restore'
    });
    return result.filePath;
});
// Select image file (FOR STEGANOGRAPHY)
ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Select Image',
        filters: [
            { 
                name: 'Images', 
                extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] 
            },
            { 
                name: 'All Files', 
                extensions: ['*'] 
            }
        ]
    });
    return result.filePaths;
});

// Scan image for hidden data (returns info, doesn't extract)
ipcMain.handle('scan-image-info', async (event, imagePath) => {
    // This is a placeholder - actual scan happens in engine
    // Return basic info for UI display
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(imagePath)) {
        return { error: 'File not found' };
    }
    
    const stats = fs.statSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    
    return {
        exists: true,
        size: stats.size,
        format: ext.replace('.', '').toUpperCase(),
        modified: stats.mtime
    };
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