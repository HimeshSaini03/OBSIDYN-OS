const { ipcRenderer } = require('electron');
const crypto = require('crypto');

// ===== STATE =====
const state = {
    authenticated: false,
    currentSection: 'dashboard',
    profile: 'PERSONAL',
    sessionStart: null,
    autoLockMinutes: 10,
    autoLockTimer: null,
    countdownTimer: null,
    vaultItems: [],
    activityLog: []
};

// ===== DOM ELEMENTS =====
const screens = {
    login: document.getElementById('login-screen'),
    app: document.getElementById('app-screen')
};

const loginEl = {
    password: document.getElementById('master-password'),
    btn: document.getElementById('authenticate-btn'),
    status: document.getElementById('login-status'),
    mode: document.getElementById('security-mode')
};

const appEl = {
    sessionTimer: document.getElementById('session-timer'),
    profile: document.getElementById('active-profile'),
    vaultStatus: document.getElementById('vault-status'),
    lockBtn: document.getElementById('lock-btn'),
    vaultList: document.getElementById('vault-list'),
    vaultCount: document.getElementById('vault-count-label'),
    dashboardVaultCount: document.getElementById('dashboard-vault-count'),
    dashboardAutoLock: document.getElementById('dashboard-autolock'),
    activityLog: document.getElementById('activity-log')
};

// ===== INITIALIZATION =====
function init() {
    setupEventListeners();
    setupNavigation();
    console.log('[OBSIDYN] System initialized');
}

function setupEventListeners() {
    // Login
    loginEl.btn.addEventListener('click', handleAuthenticate);
    loginEl.password.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuthenticate();
    });

    // System
    appEl.lockBtn.addEventListener('click', lockSystem);

    // Vault operations
    const btnLockFile = document.getElementById('btn-lock-file');
    const btnLockFolder = document.getElementById('btn-lock-folder');
    const btnRefreshVault = document.getElementById('btn-refresh-vault');
    
    if (btnLockFile) btnLockFile.addEventListener('click', () => handleVaultOp('lockFile'));
    if (btnLockFolder) btnLockFolder.addEventListener('click', () => handleVaultOp('lockFolder'));
    if (btnRefreshVault) btnRefreshVault.addEventListener('click', loadVaultList);

    // Shred
    const btnShred = document.getElementById('btn-shred-file');
    if (btnShred) btnShred.addEventListener('click', handleShred);

    // Settings
    const autoLockInput = document.getElementById('autolock-minutes');
    if (autoLockInput) {
        autoLockInput.addEventListener('change', (e) => {
            state.autoLockMinutes = parseInt(e.target.value);
            console.log(`[OBSIDYN] Auto-lock set to ${state.autoLockMinutes} minutes`);
        });
    }

    const profileSelect = document.getElementById('settings-profile');
    if (profileSelect) {
        profileSelect.addEventListener('change', (e) => {
            state.profile = e.target.value;
            if (appEl.profile) appEl.profile.textContent = state.profile;
            console.log(`[OBSIDYN] Profile changed to ${state.profile}`);
        });
    }
}

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-section');
            navigateTo(section);
        });
    });
}

// ===== NAVIGATION =====
function navigateTo(section) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-section') === section);
    });

    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === section);
    });

    state.currentSection = section;
    console.log(`[OBSIDYN] Navigated to ${section}`);

    if (section === 'vault') {
        loadVaultList();
    }
}

// ===== AUTHENTICATION =====
function handleAuthenticate() {
    const password = loginEl.password.value.trim();
    if (!password) {
        showLoginStatus('Please enter your master key', 'error');
        return;
    }

    state.profile = loginEl.mode.value.split(' ')[0];
    const hash = hashPassword(password);

    console.log('[OBSIDYN] Authenticating...');
    showLoginStatus('Authenticating...', 'info');
    
    sendCommand('AUTH', { password_hash: hash, mode: state.profile });
}

function handleAuthSuccess() {
    state.authenticated = true;
    state.sessionStart = Date.now();

    screens.login.classList.remove('active');
    screens.app.classList.add('active');

    if (appEl.profile) appEl.profile.textContent = state.profile;

    startTimers();
    loadVaultList();

    console.log('[OBSIDYN] Authentication successful');
    showLoginStatus('Access granted', 'success');
}

function lockSystem() {
    console.log('[OBSIDYN] Locking system...');

    sendCommand('LOGOUT', {});

    setTimeout(() => {
        state.authenticated = false;
        clearTimers();
        if (loginEl.password) loginEl.password.value = '';

        screens.app.classList.remove('active');
        screens.login.classList.add('active');

        showLoginStatus('System locked', 'success');
        console.log('[OBSIDYN] System locked');
    }, 100);
}

// ===== TIMERS =====
function startTimers() {
    clearTimers();

    const autoLockMs = state.autoLockMinutes * 60 * 1000;

    state.autoLockTimer = setTimeout(() => {
        console.log('[OBSIDYN] Auto-lock triggered');
        lockSystem();
    }, autoLockMs);

    state.countdownTimer = setInterval(() => {
        const elapsed = Date.now() - state.sessionStart;
        const remaining = Math.max(0, autoLockMs - elapsed);
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const display = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (appEl.sessionTimer) appEl.sessionTimer.textContent = display;
        if (appEl.dashboardAutoLock) appEl.dashboardAutoLock.textContent = display;
    }, 1000);
}

function clearTimers() {
    if (state.autoLockTimer) clearTimeout(state.autoLockTimer);
    if (state.countdownTimer) clearInterval(state.countdownTimer);
}

// ===== VAULT OPERATIONS =====
async function handleVaultOp(operation) {
    try {
        let result;

        if (operation === 'lockFile') {
            result = await ipcRenderer.invoke('select-file');
            if (result && result.length > 0) {
                const fileName = result[0].split('\\').pop();
                console.log(`[OBSIDYN] Locking file: ${fileName}`);
                sendCommand('LOCK_FILE', { path: result[0] });
                addActivity(`Locked file: ${fileName}`);
                showNotification('File locked successfully', 'success');
            }
        } else if (operation === 'lockFolder') {
            result = await ipcRenderer.invoke('select-folder');
            if (result && result.length > 0) {
                const folderName = result[0].split('\\').pop();
                console.log(`[OBSIDYN] Locking folder: ${folderName}`);
                sendCommand('LOCK_FOLDER', { path: result[0] });
                addActivity(`Locked folder: ${folderName}`);
                showNotification('Folder locked successfully', 'success');
            }
        }
    } catch (error) {
        console.error(`[OBSIDYN] Operation failed: ${error.message}`);
        showNotification('Operation failed', 'error');
    }
}

async function unlockFile(containerName) {
    try {
        const item = state.vaultItems.find(i => i.container === containerName);
        if (!item) {
            showNotification('Item not found', 'error');
            return;
        }

        const defaultName = item.original_name || 'restored_file';
        const restorePath = await ipcRenderer.invoke('select-restore-path', defaultName);
        
        if (restorePath) {
            console.log(`[OBSIDYN] Unlocking: ${containerName}`);
            sendCommand('UNLOCK_FILE', { 
                container: containerName, 
                restore_path: restorePath 
            });
            addActivity(`Unlocked: ${item.original_name}`);
            showNotification('File unlocked successfully', 'success');
        }
    } catch (error) {
        console.error(`[OBSIDYN] Unlock failed: ${error.message}`);
        showNotification('Unlock failed', 'error');
    }
}

function deleteVaultItem(containerName) {
    const item = state.vaultItems.find(i => i.container === containerName);
    if (!item) return;

    const confirmed = confirm(
        `WARNING: This will permanently delete:\n\n${item.original_name}\n\nThis action cannot be undone!`
    );

    if (confirmed) {
        console.log(`[OBSIDYN] Deleting vault item: ${containerName}`);
        sendCommand('DELETE_VAULT_ITEM', { container: containerName });
        addActivity(`Deleted: ${item.original_name}`);
        showNotification('Item permanently deleted', 'success');
    }
}

function loadVaultList() {
    console.log('[OBSIDYN] Loading vault list...');
    sendCommand('GET_VAULT_LIST', {});
}

function renderVaultList(items) {
    console.log(`[OBSIDYN] Rendering vault list: ${items.length} items`);
    
    if (!appEl.vaultList) {
        console.error('[OBSIDYN] vaultList element not found');
        return;
    }

    state.vaultItems = items || [];

    if (state.vaultItems.length === 0) {
        appEl.vaultList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔒</div>
                <p>No encrypted files yet</p>
                <span>Lock a file or folder to get started</span>
            </div>
        `;
    } else {
        appEl.vaultList.innerHTML = state.vaultItems.map(item => {
            const type = item.type === 'folder' ? '📁' : '📄';
            const size = formatBytes(item.original_size || 0);
            const lockedAt = item.locked_at ? new Date(item.locked_at).toLocaleString() : 'Unknown';
            const fileCount = item.file_count > 1 ? `(${item.file_count} files)` : '';

            return `
                <div class="vault-item">
                    <div class="vault-item-icon">${type}</div>
                    <div class="vault-item-info">
                        <div class="vault-item-name">${item.original_name || 'Unknown'}</div>
                        <div class="vault-item-meta">
                            ${size} ${fileCount ? '• ' + fileCount : ''} • Locked: ${lockedAt}
                        </div>
                    </div>
                    <div class="vault-item-actions">
                        <button class="btn-sm btn-unlock" onclick="unlockFile('${item.container}')">
                            Unlock
                        </button>
                        <button class="btn-sm btn-delete" onclick="deleteVaultItem('${item.container}')">
                            Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    const count = state.vaultItems.length;
    if (appEl.vaultCount) appEl.vaultCount.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    if (appEl.vaultStatus) appEl.vaultStatus.textContent = `${count} Items`;
    if (appEl.dashboardVaultCount) appEl.dashboardVaultCount.textContent = count;
    
    console.log(`[OBSIDYN] Vault list rendered: ${count} items`);
}

// ===== SHRED =====
async function handleShred() {
    try {
        const result = await ipcRenderer.invoke('select-file');
        if (result && result.length > 0) {
            const fileName = result[0].split('\\').pop();
            const confirmed = confirm(
                `⚠️ SECURE SHRED WARNING\n\n` +
                `File: ${fileName}\n\n` +
                `This will permanently destroy the file. Continue?`
            );

            if (confirmed) {
                console.log(`[OBSIDYN] Shredding: ${fileName}`);
                sendCommand('SHRED_FILE', { path: result[0] });
                addActivity(`Shredded: ${fileName}`);
                showNotification('File permanently destroyed', 'success');
            }
        }
    } catch (error) {
        console.error(`[OBSIDYN] Shred failed: ${error.message}`);
        showNotification('Shred failed', 'error');
    }
}

// ===== ACTIVITY LOG =====
function addActivity(message) {
    const time = new Date().toLocaleTimeString();
    state.activityLog.unshift({ time, message });

    if (state.activityLog.length > 20) {
        state.activityLog.pop();
    }

    renderActivityLog();
}

function renderActivityLog() {
    if (!appEl.activityLog) return;
    
    if (state.activityLog.length === 0) {
        appEl.activityLog.innerHTML = '<div class="activity-empty">No recent activity</div>';
        return;
    }

    appEl.activityLog.innerHTML = state.activityLog.map(item => `
        <div class="activity-item">
            <span>${item.message}</span>
            <span class="activity-time">${item.time}</span>
        </div>
    `).join('');
}

// ===== NOTIFICATIONS =====
function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.textContent = message;
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notif);

    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// ===== UTILITY =====
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function sendCommand(action, payload) {
    const cmd = JSON.stringify({ action, payload });
    ipcRenderer.send('secure-command', cmd);
    console.log(`[OBSIDYN] Command sent: ${action}`);
}

function showLoginStatus(message, type) {
    if (!loginEl.status) return;
    loginEl.status.textContent = message;
    loginEl.status.className = `status-message ${type}`;
    setTimeout(() => {
        loginEl.status.textContent = '';
    }, 3000);
}

// ===== IPC HANDLER =====
ipcRenderer.on('engine-message', (event, message) => {
    console.log(`[OBSIDYN] Received from engine: ${message.substring(0, 100)}`);
    
    try {
        const data = JSON.parse(message);
        console.log(`[OBSIDYN] Parsed response: ${data.status}`);

        switch (data.status) {
            case 'AUTH_SUCCESS':
                handleAuthSuccess();
                break;
            case 'AUTH_FAIL':
                showLoginStatus('Authentication failed', 'error');
                showNotification('Authentication failed', 'error');
                break;
            case 'SUCCESS':
                console.log(`[OBSIDYN] Success: ${data.data}`);
                showNotification(data.data, 'success');
                if (data.data && (data.data.includes('Locked') || data.data.includes('Unlocked') || data.data.includes('Deleted'))) {
                    setTimeout(() => loadVaultList(), 500);
                }
                break;
            case 'OK':
                if (data.action === 'GET_VAULT_LIST' || data.data !== undefined) {
                    const items = Array.isArray(data.data) ? data.data : [];
                    console.log(`[OBSIDYN] Vault list received: ${items.length} items`);
                    renderVaultList(items);
                }
                break;
            case 'ERROR':
                console.error(`[OBSIDYN] Error: ${data.data}`);
                showNotification(data.data, 'error');
                break;
            default:
                console.log(`[OBSIDYN] Unknown status: ${data.status}`);
        }
    } catch (e) {
        console.error(`[OBSIDYN] Failed to parse message: ${e.message}`);
    }
});

// Make functions global for HTML onclick
window.unlockFile = unlockFile;
window.deleteVaultItem = deleteVaultItem;

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
    .vault-item-icon {
        font-size: 24px;
        margin-right: 15px;
    }
    .vault-item {
        display: flex;
        align-items: center;
        padding: 15px;
        background: rgba(255,255,255,0.05);
        border-radius: 8px;
        margin-bottom: 10px;
    }
    .vault-item-info {
        flex: 1;
    }
    .vault-item-name {
        font-weight: 600;
        margin-bottom: 5px;
    }
    .vault-item-meta {
        font-size: 12px;
        opacity: 0.7;
    }
    .vault-item-actions {
        display: flex;
        gap: 8px;
    }
    .btn-sm {
        padding: 8px 16px;
        font-size: 13px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
    }
    .btn-unlock {
        background: #10b981;
        color: white;
    }
    .btn-delete {
        background: #ef4444;
        color: white;
    }
`;
document.head.appendChild(style);

// Start
init();