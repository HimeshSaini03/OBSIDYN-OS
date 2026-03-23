const { ipcRenderer } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
    authenticated: false,
    currentSection: "dashboard",
    profile: "PERSONAL",
    sessionStart: null,
    autoLockMinutes: 10,
    autoLockTimer: null,
    countdownTimer: null,
    pollTimer: null,
    vaultItems: [],
    activityLog: [],
    selectedFileForShred: null,
    engineBuffer: "",
    decoyTargetPath: "",
    monitorActive: false,
    authStatus: null,
    appSettings: null,
    operatorProfile: null,
    recoveryConfigured: false,
    failedPasswordAttempts: 0,
    recoveryTriggerAttempts: 0,
    cameraStream: null,
    cameraMode: null,
    recoveryReady: false,
    recoveryPipelineActive: false,
    recoveryPipelineMode: null,
    recoveryPipelineProgress: 0,
    recoveryPipelineTimer: null,
    recoveryPipelineStages: [],
    captures: {
        face: null,
        gesture: null
    },
    keystroke: {
        startedAt: null,
        keydowns: [],
        dwellTimes: [],
        flightTimes: [],
        correctionCount: 0,
        sequence: 0,
        pending: []
    }
};

const screens = {
    login: $("login-screen"),
    app: $("app-screen")
};

const loginEl = {
    password: $("master-password"),
    button: $("authenticate-btn"),
    status: $("login-status"),
    mode: $("security-mode")
};

const appEl = {
    sessionTimer: $("session-timer"),
    profile: $("active-profile"),
    vaultStatus: $("vault-status"),
    lockButton: $("lock-btn"),
    vaultList: $("vault-list"),
    vaultCount: $("vault-count-label"),
    dashboardVaultCount: $("dashboard-vault-count"),
    dashboardAutoLock: $("dashboard-autolock"),
    dashboardSecurityLevel: $("dashboard-security-level"),
    activityLog: $("activity-log")
};

function init() {
    mountAtmosphere();
    mountOperationalSections();
    normalizeUiCopy();
    bindCoreEvents();
    bindShredEvents();
    renderActivityLog();
    updateDashboardState();
    resetKeystrokeTrace();
    loadAppSettings();
    loadAuthStatus();
    document.body.classList.add("ui-ready");
}

function mountAtmosphere() {
    if (screens.login?.querySelector(".ambient-layer")) {
        return;
    }

    const binaryRows = Array.from({ length: 14 }, (_, index) => {
        const seed = (index + 3).toString(2).padStart(6, "0");
        const stream = `${seed}0101000010100000110010110100101000011010`.repeat(4).slice(0, 96);
        return `<div class="ambient-binary-row" style="--row-delay:${(index * -1.35).toFixed(2)}s; --row-offset:${index % 2 === 0 ? "-6%" : "6%"};">${stream}</div>`;
    }).join("");

    const ambient = document.createElement("div");
    ambient.className = "ambient-layer";
    ambient.innerHTML = `
        <div class="ambient-grid"></div>
        <div class="ambient-binary">${binaryRows}</div>
        <div class="ambient-scanline"></div>
    `;
    screens.login?.prepend(ambient);
}

function mountOperationalSections() {
    const vaultNav = document.querySelector('.nav-item[data-section="vault"]');
    if (vaultNav && !document.querySelector('.nav-item[data-section="operator"]')) {
        vaultNav.insertAdjacentHTML(
            "beforebegin",
            `
            <button class="nav-item" data-section="operator">
                <span class="nav-icon">OP</span>
                <span class="nav-label">Operator</span>
            </button>
            `
        );
    }

    const secureShredNav = document.querySelector('.nav-item[data-section="secure-shred"]');
    if (secureShredNav && !document.querySelector('.nav-item[data-section="deception"]')) {
        secureShredNav.insertAdjacentHTML(
            "beforebegin",
            `
            <button class="nav-item" data-section="deception">
                <span class="nav-icon">DC</span>
                <span class="nav-label">Decoy Ops</span>
            </button>
            <button class="nav-item" data-section="signals">
                <span class="nav-icon">SG</span>
                <span class="nav-label">Signals</span>
            </button>
            `
        );
    }

    const vaultSection = $("vault-section");
    if (vaultSection && !$("operator-section")) {
        vaultSection.insertAdjacentHTML(
            "beforebegin",
            `
            <section id="operator-section" class="content-section">
                <div class="section-header">
                    <h2>Operator Control</h2>
                    <p class="section-subtitle">Private dossier, note vault, recovery controls, and session policy.</p>
                </div>

                <div class="settings-grid ops-grid operator-grid">
                    <div class="settings-card operator-card">
                        <div class="operator-card-head">
                            <h3>Operator Dossier</h3>
                            <button id="btn-save-operator-profile" class="btn-primary">Seal Dossier</button>
                        </div>
                        <div class="operator-form-grid">
                            <div class="setting-control">
                                <label for="operator-call-sign">Call sign</label>
                                <input type="text" id="operator-call-sign" placeholder="OBSIDYN-01">
                            </div>
                            <div class="setting-control">
                                <label for="operator-full-name">Full name</label>
                                <input type="text" id="operator-full-name" placeholder="Encrypted operator record">
                            </div>
                            <div class="setting-control">
                                <label for="operator-organization">Organization</label>
                                <input type="text" id="operator-organization" placeholder="Cell / org / unit">
                            </div>
                            <div class="setting-control">
                                <label for="operator-designation">Designation</label>
                                <input type="text" id="operator-designation" placeholder="Role / desk / specialization">
                            </div>
                            <div class="setting-control">
                                <label for="operator-email">Email</label>
                                <input type="text" id="operator-email" placeholder="Private contact">
                            </div>
                            <div class="setting-control">
                                <label for="operator-phone">Phone</label>
                                <input type="text" id="operator-phone" placeholder="Emergency line">
                            </div>
                            <div class="setting-control operator-form-grid-wide">
                                <label for="operator-location">Location</label>
                                <input type="text" id="operator-location" placeholder="Hidden operating location">
                            </div>
                            <div class="setting-control operator-form-grid-wide">
                                <label for="operator-hint">Recovery phrase hint</label>
                                <input type="text" id="operator-hint" placeholder="Something only you understand">
                            </div>
                        </div>
                    </div>

                    <div class="settings-card operator-card">
                        <div class="operator-card-head">
                            <h3>Private Notes</h3>
                            <span class="vault-pill">Encrypted at rest</span>
                        </div>
                        <div class="setting-control">
                            <label for="operator-mission-notes">Mission notes</label>
                            <textarea id="operator-mission-notes" rows="5" placeholder="Short operational brief or reminders."></textarea>
                        </div>
                        <div class="setting-control">
                            <label for="operator-private-notes">Deep storage notes</label>
                            <textarea id="operator-private-notes" rows="8" placeholder="Anything you want sealed inside OBSIDYN only."></textarea>
                        </div>
                    </div>
                </div>

                <div class="settings-grid ops-grid operator-grid">
                    <div class="settings-card operator-card">
                        <div class="operator-card-head">
                            <h3>Session & Rhythm Policy</h3>
                            <button id="btn-save-security-controls" class="btn-secondary">Apply Controls</button>
                        </div>
                        <div class="operator-form-grid">
                            <div class="setting-control">
                                <label for="operator-auto-lock">Auto-lock minutes</label>
                                <input type="number" id="operator-auto-lock" min="1" max="60" value="10">
                            </div>
                            <div class="setting-control">
                                <label for="operator-security-profile">Security profile</label>
                                <select id="operator-security-profile">
                                    <option value="PERSONAL">Personal</option>
                                    <option value="WORK">Work</option>
                                    <option value="PUBLIC">Public</option>
                                </select>
                            </div>
                            <div class="setting-control">
                                <label for="operator-training-target">Rhythm training attempts</label>
                                <input type="number" id="operator-training-target" min="3" max="15" value="5">
                            </div>
                            <div class="setting-control">
                                <label for="operator-threshold">Rhythm sensitivity</label>
                                <input type="number" id="operator-threshold" min="1" max="8" step="0.1" value="3.4">
                            </div>
                        </div>
                        <div id="operator-auth-policy" class="status-message info">Rhythm Lock policy pending sync.</div>
                    </div>

                    <div class="settings-card operator-card">
                        <div class="operator-card-head">
                            <h3>Master Key Rotation</h3>
                            <span class="vault-pill is-warn">Retraining required</span>
                        </div>
                        <div class="setting-control">
                            <label for="operator-current-password">Current master key</label>
                            <input type="password" id="operator-current-password" placeholder="Current master key">
                        </div>
                        <div class="setting-control">
                            <label for="operator-new-password">New master key</label>
                            <input type="password" id="operator-new-password" placeholder="New master key">
                        </div>
                        <div class="setting-control">
                            <label for="operator-confirm-password">Confirm new master key</label>
                            <input type="password" id="operator-confirm-password" placeholder="Confirm new master key">
                        </div>
                        <button id="btn-rotate-master-key" class="btn-primary">Rotate Master Key</button>
                        <div id="operator-password-status" class="status-message info">Key rotation will re-encrypt vault containers and reset Rhythm Lock samples.</div>
                    </div>
                </div>

                <div class="settings-grid ops-grid operator-grid">
                    <div class="settings-card operator-card">
                        <div class="operator-card-head">
                            <h3>Visual Recovery Override</h3>
                            <div class="toolbar recovery-toolbar">
                                <button id="btn-start-recovery-enroll" class="btn-secondary">Capture Enrollment</button>
                                <button id="btn-delete-recovery-profile" class="btn-secondary">Delete Signature</button>
                            </div>
                        </div>
                        <div class="operator-form-grid">
                            <div class="setting-control">
                                <label for="recovery-gesture-label">Gesture label</label>
                                <input type="text" id="recovery-gesture-label" placeholder="Example: split-finger cross" value="Custom signature">
                            </div>
                            <label class="setting-toggle operator-inline-toggle operator-form-grid-wide">
                                <div>
                                    <strong>Enable visual recovery</strong>
                                    <span>Keep face + gesture recovery available on the login screen.</span>
                                </div>
                                <input type="checkbox" id="operator-recovery-enabled" checked>
                            </label>
                        </div>
                        <div id="operator-recovery-status" class="status-message info">Visual recovery not enrolled.</div>
                        <div class="ops-list" id="operator-recovery-metrics">
                            <div class="activity-empty">Face plus hand-signature enrollment will appear here.</div>
                        </div>
                    </div>
                </div>
            </section>
            `
        );
    }

    const secureShredSection = $("secure-shred-section");
    if (secureShredSection && !$("deception-section")) {
        secureShredSection.insertAdjacentHTML(
            "beforebegin",
            `
            <section id="deception-section" class="content-section">
                <div class="section-header">
                    <h2>Deception Operations</h2>
                    <p class="section-subtitle">Deploy decoy vaults and monitor honeyfiles for unauthorized touches.</p>
                </div>

                <div class="toolbar">
                    <button id="btn-decoy-select-dir" class="btn-secondary">Select Deployment Directory</button>
                    <button id="btn-create-decoy" class="btn-primary">Seed Decoy Vault</button>
                    <button id="btn-refresh-decoy" class="btn-secondary">Refresh Status</button>
                </div>

                <div class="settings-grid ops-grid">
                    <div class="settings-card">
                        <h3>Deployment Profile</h3>
                        <div class="setting-control">
                            <label for="decoy-target-path">Target directory</label>
                            <input type="text" id="decoy-target-path" placeholder="Default internal decoy store" readonly>
                        </div>
                        <div class="setting-control">
                            <label for="decoy-profile">Bait profile</label>
                            <select id="decoy-profile">
                                <option value="operations">Operations</option>
                                <option value="finance">Finance</option>
                                <option value="research">Research</option>
                            </select>
                        </div>
                        <div class="setting-control">
                            <label for="decoy-file-count">Honeyfiles</label>
                            <input type="number" id="decoy-file-count" min="1" max="3" value="3">
                        </div>
                        <div id="decoy-summary" class="status-message info">No decoy vault deployed.</div>
                    </div>

                    <div class="settings-card">
                        <h3>Active Decoy Vaults</h3>
                        <div id="decoy-vaults" class="ops-list">
                            <div class="activity-empty">No decoy vaults deployed.</div>
                        </div>
                    </div>
                </div>

                <div class="activity-panel">
                    <h3>Honey Alerts</h3>
                    <div id="decoy-alerts" class="activity-log">
                        <div class="activity-empty">No honey alerts recorded.</div>
                    </div>
                </div>
            </section>

            <section id="signals-section" class="content-section">
                <div class="section-header">
                    <h2>System Signals</h2>
                    <p class="section-subtitle">Trace process churn and correlate it with live deception alerts.</p>
                </div>

                <div class="toolbar">
                    <button id="btn-start-monitor" class="btn-primary">Start Trace</button>
                    <button id="btn-stop-monitor" class="btn-secondary">Stop Trace</button>
                    <button id="btn-refresh-monitor" class="btn-secondary">Refresh Snapshot</button>
                </div>

                <div class="dashboard-grid ops-metrics">
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">SG</span>
                            <h3>Monitor State</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="monitor-state">OFFLINE</div>
                            <div class="metric-label">Trace switch</div>
                        </div>
                    </div>
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">PR</span>
                            <h3>Observed Processes</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="monitor-process-count">0</div>
                            <div class="metric-label">Current set</div>
                        </div>
                    </div>
                    <div class="info-card">
                        <div class="card-header">
                            <span class="card-icon">HY</span>
                            <h3>Honey Alerts</h3>
                        </div>
                        <div class="card-body">
                            <div class="metric-value" id="monitor-alert-count">0</div>
                            <div class="metric-label">Triggered files</div>
                        </div>
                    </div>
                </div>

                <div class="settings-grid ops-grid">
                    <div class="settings-card">
                        <h3>Signal Events</h3>
                        <div id="monitor-events" class="ops-list">
                            <div class="activity-empty">Tracing is offline.</div>
                        </div>
                    </div>
                    <div class="settings-card">
                        <h3>Process Snapshot</h3>
                        <div id="monitor-processes" class="ops-list">
                            <div class="activity-empty">No process data captured yet.</div>
                        </div>
                    </div>
                </div>
            </section>
            `
        );
    }

    if (!$("rhythm-lock-status")) {
        const loginForm = document.querySelector(".login-form");
        if (loginForm) {
            const container = document.createElement("div");
            container.className = "status-message info rhythm-lock-panel";
            container.id = "rhythm-lock-status";
            container.textContent = "Loading Rhythm Lock profile...";
            loginForm.appendChild(container);

            const recoveryButton = document.createElement("button");
            recoveryButton.className = "btn-secondary hidden";
            recoveryButton.id = "btn-login-recovery";
            recoveryButton.textContent = "Visual Recovery Unavailable";
            recoveryButton.disabled = true;
            loginForm.appendChild(recoveryButton);
        }
    }

    if ($("dashboard-section") && !$("dashboard-operator-panel")) {
        const panel = document.createElement("div");
        panel.className = "activity-panel operator-brief-panel";
        panel.id = "dashboard-operator-panel";
        panel.innerHTML = `
            <div class="operator-card-head">
                <h3>Operator Brief</h3>
                <span class="vault-pill">Encrypted dossier</span>
            </div>
            <div id="dashboard-operator-summary" class="ops-list">
                <div class="activity-empty">Authenticate to load operator dossier.</div>
            </div>
        `;
        $("dashboard-section").appendChild(panel);
    }

    if (!$("camera-capture-modal")) {
        const modal = document.createElement("div");
        modal.id = "camera-capture-modal";
        modal.className = "camera-modal hidden";
        modal.innerHTML = `
            <div class="camera-shell">
                <div class="operator-card-head">
                    <div>
                        <h3 id="camera-modal-title">Visual Recovery Capture</h3>
                        <div id="camera-modal-subtitle" class="ops-item-submeta">Capture face and hand signature in sequence.</div>
                    </div>
                    <button id="btn-camera-close" class="btn-icon" title="Close capture">X</button>
                </div>
                <div class="camera-enrollment-steps">
                    <div class="camera-step" id="camera-step-face">
                        <span class="camera-step-index">1</span>
                        <div>
                            <strong>Capture face</strong>
                            <div class="ops-item-submeta">Front-facing frame in clear light</div>
                        </div>
                    </div>
                    <div class="camera-step" id="camera-step-gesture">
                        <span class="camera-step-index">2</span>
                        <div>
                            <strong>Capture gesture</strong>
                            <div class="ops-item-submeta">Hold your chosen hand signature steady</div>
                        </div>
                    </div>
                    <div class="camera-step" id="camera-step-enable">
                        <span class="camera-step-index">3</span>
                        <div>
                            <strong>Enable recovery</strong>
                            <div class="ops-item-submeta">Save both captures into secure recovery enrollment</div>
                        </div>
                    </div>
                </div>
                <div class="camera-grid">
                    <div class="camera-stage">
                        <video id="camera-preview" autoplay muted playsinline></video>
                        <div class="camera-controls">
                            <button id="btn-capture-face" class="btn-secondary">Capture Face</button>
                            <button id="btn-capture-gesture" class="btn-secondary">Capture Gesture</button>
                        </div>
                    </div>
                    <div class="camera-stage">
                        <div class="camera-capture-box">
                            <span class="ops-item-submeta">Face frame</span>
                            <canvas id="camera-face-canvas" width="320" height="240"></canvas>
                        </div>
                        <div class="camera-capture-box">
                            <span class="ops-item-submeta">Gesture frame</span>
                            <canvas id="camera-gesture-canvas" width="320" height="240"></canvas>
                        </div>
                    </div>
                </div>
                <div id="camera-capture-status" class="status-message info">Camera idle.</div>
                <div id="camera-processing-panel" class="camera-processing hidden">
                    <div class="camera-processing-head">
                        <strong id="camera-processing-label">Recovery pipeline idle</strong>
                        <span id="camera-processing-value">0%</span>
                    </div>
                    <div class="camera-processing-track">
                        <div id="camera-processing-bar" class="camera-processing-bar"></div>
                    </div>
                    <div id="camera-processing-feed" class="camera-processing-feed"></div>
                </div>
                <div class="camera-action-bar">
                    <div id="camera-enrollment-summary" class="ops-item-submeta">Waiting for face and gesture capture.</div>
                    <div class="toolbar">
                        <button id="btn-camera-reset" class="btn-secondary">Reset Frames</button>
                        <button id="btn-camera-submit" class="btn-primary" disabled>Enable Visual Recovery</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function normalizeUiCopy() {
    const iconMap = {
        dashboard: "BR",
        operator: "OP",
        vault: "VT",
        deception: "DC",
        signals: "SG",
        "secure-shred": "XR",
        steganography: "PX",
        settings: "CT"
    };

    const metricIcons = ["AE", "VA", "SL", "TM"];
    const sectionTitles = {
        dashboard: "Operational Briefing",
        operator: "Operator Control",
        vault: "Vault Control",
        deception: "Deception Operations",
        signals: "System Signals",
        "secure-shred": "Oblivion Shredder",
        steganography: "Pixel Veil",
        settings: "Control"
    };

    const sectionSubtitles = {
        dashboard: "Session posture, seal counts, and current defensive state.",
        operator: "Private dossier, note storage, recovery enrollment, and behavioral controls.",
        vault: "Seal and restore assets while reducing visible host traces.",
        deception: "Deploy bait vaults and watch honeyfiles for interference.",
        signals: "Track process churn and correlate it with bait interaction.",
        "secure-shred": "Controlled destruction for assets you choose to erase.",
        steganography: "Embed or extract concealed payloads with encrypted transport.",
        settings: "Behavioral lock and session configuration."
    };

    const loginTitle = document.querySelector(".brand-logo h1");
    if (loginTitle) {
        loginTitle.textContent = "OBSIDYN";
    }
    const tagline = document.querySelector("#login-screen .tagline");
    if (tagline) {
        tagline.textContent = "Silent vault. Behavioral gate. Minimal trace.";
    }
    const indicator = document.querySelector(".security-indicator");
    if (indicator) {
        indicator.textContent = "Privacy-first runtime active";
    }

    $$(".logo-icon").forEach((icon) => {
        icon.textContent = "OX";
    });

    $$(".nav-item").forEach((item) => {
        const icon = item.querySelector(".nav-icon");
        const section = item.dataset.section;
        if (icon && iconMap[section]) {
            icon.textContent = iconMap[section];
        }
    });

    $$(".card-icon").forEach((icon, index) => {
        icon.textContent = metricIcons[index] || "OB";
    });

    $$(".content-section").forEach((section) => {
        const key = section.id.replace("-section", "");
        const title = section.querySelector(".section-header h2");
        const subtitle = section.querySelector(".section-subtitle");
        if (title && sectionTitles[key]) {
            title.textContent = sectionTitles[key];
        }
        if (subtitle && sectionSubtitles[key]) {
            subtitle.textContent = sectionSubtitles[key];
        }
    });

    if ($("authenticate-btn")) {
        $("authenticate-btn").innerHTML = "<span>Establish Session</span>";
    }
    if ($("btn-lock-file")) {
        $("btn-lock-file").innerHTML = "<span>Seal File</span>";
    }
    if ($("btn-lock-folder")) {
        $("btn-lock-folder").innerHTML = "<span>Seal Folder</span>";
    }
}

function bindCoreEvents() {
    loginEl.button?.addEventListener("click", handleAuthenticate);
    loginEl.password?.addEventListener("keydown", onPasswordKeydown);
    loginEl.password?.addEventListener("keyup", onPasswordKeyup);
    loginEl.password?.addEventListener("input", onPasswordInput);
    loginEl.password?.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            handleAuthenticate();
        }
    });

    appEl.lockButton?.addEventListener("click", lockSystem);

    $$(".nav-item").forEach((item) => {
        item.addEventListener("click", () => navigateTo(item.dataset.section));
    });

    $$(".steg-tab").forEach((tab) => {
        tab.addEventListener("click", () => switchStegTab(tab.dataset.tab));
    });

    $("btn-lock-file")?.addEventListener("click", () => handleVaultOp("file"));
    $("btn-lock-folder")?.addEventListener("click", () => handleVaultOp("folder"));
    $("btn-refresh-vault")?.addEventListener("click", loadVaultList);

    $("btn-select-data-file")?.addEventListener("click", () => selectFile("hide-data-file"));
    $("btn-select-carrier")?.addEventListener("click", () => selectImage("hide-carrier-image"));
    $("btn-select-output")?.addEventListener("click", () => selectSavePath("hide-output-path"));
    $("btn-select-extract-image")?.addEventListener("click", () => selectImage("extract-image"));
    $("btn-select-extract-output")?.addEventListener("click", () => selectSavePath("extract-output-path"));
    $("btn-select-scan-image")?.addEventListener("click", () => selectImage("scan-image"));

    $("btn-execute-hide")?.addEventListener("click", executeHide);
    $("btn-execute-extract")?.addEventListener("click", executeExtract);
    $("btn-execute-scan")?.addEventListener("click", executeScan);

    $("btn-decoy-select-dir")?.addEventListener("click", selectDecoyDirectory);
    $("btn-create-decoy")?.addEventListener("click", createDecoyVault);
    $("btn-refresh-decoy")?.addEventListener("click", loadDecoyStatus);

    $("btn-start-monitor")?.addEventListener("click", startMonitoring);
    $("btn-stop-monitor")?.addEventListener("click", stopMonitoring);
    $("btn-refresh-monitor")?.addEventListener("click", loadMonitorStatus);

    $("autolock-minutes")?.addEventListener("change", (event) => {
        const nextValue = Number.parseInt(event.target.value, 10);
        state.autoLockMinutes = Number.isFinite(nextValue) ? nextValue : 10;
        if (state.authenticated) {
            startTimers();
        }
    });

    $("settings-profile")?.addEventListener("change", (event) => {
        state.profile = event.target.value;
        syncProfileUi();
        updateDashboardState();
    });
    $("settings-visual-recovery-enabled")?.addEventListener("change", handleRecoveryToggleSync);
    $("operator-recovery-enabled")?.addEventListener("change", handleRecoveryToggleSync);

    $("operator-security-profile")?.addEventListener("change", (event) => {
        state.profile = event.target.value;
        syncProfileUi();
    });
    $("operator-auto-lock")?.addEventListener("change", (event) => {
        const nextValue = Number.parseInt(event.target.value, 10);
        state.autoLockMinutes = Number.isFinite(nextValue) ? nextValue : 10;
        syncSettingsUi();
    });
    $("btn-save-operator-profile")?.addEventListener("click", saveOperatorProfile);
    $("btn-save-app-settings")?.addEventListener("click", saveAppSettings);
    $("btn-save-security-controls")?.addEventListener("click", saveSecurityControls);
    $("btn-rotate-master-key")?.addEventListener("click", rotateMasterKey);
    $("btn-start-recovery-enroll")?.addEventListener("click", () => openCameraWorkflow("enroll"));
    $("btn-delete-recovery-profile")?.addEventListener("click", deleteVisualRecoveryProfile);
    $("btn-settings-open-recovery")?.addEventListener("click", () => navigateTo("operator"));
    $("btn-login-recovery")?.addEventListener("click", () => openCameraWorkflow("login-recovery"));
    $("btn-camera-close")?.addEventListener("click", closeCameraWorkflow);
    $("btn-camera-reset")?.addEventListener("click", resetCameraCaptures);
    $("btn-capture-face")?.addEventListener("click", () => captureCameraFrame("face"));
    $("btn-capture-gesture")?.addEventListener("click", () => captureCameraFrame("gesture"));
    $("btn-camera-submit")?.addEventListener("click", submitCameraWorkflow);
}
function bindShredEvents() {
    $("btn-shred-file")?.addEventListener("click", async () => {
        const files = await ipcRenderer.invoke("select-file");
        if (files && files[0]) {
            selectFileForShred(files[0]);
        }
    });

    $("btn-remove-file")?.addEventListener("click", resetShredUi);
    $("btn-execute-shred")?.addEventListener("click", executeSecureShred);
    $("btn-shred-another")?.addEventListener("click", resetShredUi);

    const dropZone = $("shred-drop-zone");
    dropZone?.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropZone.classList.add("drag-over");
    });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone?.addEventListener("drop", (event) => {
        event.preventDefault();
        dropZone.classList.remove("drag-over");
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            selectFileForShred(file.path || file.name);
        }
    });
}

function onPasswordInput(event) {
    if (!state.keystroke.startedAt && event.target.value) {
        state.keystroke.startedAt = performance.now();
    }
    if (!event.target.value) {
        resetKeystrokeTrace();
    }
}

function onPasswordKeydown(event) {
    if (event.repeat) {
        return;
    }
    if (!state.keystroke.startedAt) {
        state.keystroke.startedAt = performance.now();
    }
    const timestamp = performance.now();
    const keyRecord = {
        id: state.keystroke.sequence++,
        key: event.key,
        time: timestamp
    };

    if (event.key === "Backspace" || event.key === "Delete") {
        state.keystroke.correctionCount += 1;
    }

    const previous = state.keystroke.keydowns[state.keystroke.keydowns.length - 1];
    if (previous) {
        state.keystroke.flightTimes.push(timestamp - previous.time);
    }

    state.keystroke.keydowns.push(keyRecord);
    state.keystroke.pending.push(keyRecord);
}

function onPasswordKeyup(event) {
    const timestamp = performance.now();
    const pendingIndex = [...state.keystroke.pending]
        .reverse()
        .findIndex((entry) => entry.key === event.key);

    if (pendingIndex === -1) {
        return;
    }

    const actualIndex = state.keystroke.pending.length - 1 - pendingIndex;
    const match = state.keystroke.pending.splice(actualIndex, 1)[0];
    state.keystroke.dwellTimes.push(timestamp - match.time);
}

function resetKeystrokeTrace() {
    state.keystroke = {
        startedAt: null,
        keydowns: [],
        dwellTimes: [],
        flightTimes: [],
        correctionCount: 0,
        sequence: 0,
        pending: []
    };
}

function buildKeystrokeSample() {
    const finishedAt = performance.now();
    return {
        dwell_times: state.keystroke.dwellTimes.map((value) => Math.round(value)),
        flight_times: state.keystroke.flightTimes.map((value) => Math.round(value)),
        total_duration: Math.round(
            (state.keystroke.startedAt ? finishedAt - state.keystroke.startedAt : 0)
        ),
        correction_count: state.keystroke.correctionCount,
        key_count: state.keystroke.keydowns.length
    };
}

function navigateTo(section) {
    state.currentSection = section;
    $$(".nav-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.section === section);
    });
    $$(".content-section").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `${section}-section`);
    });

    if (section === "vault") {
        loadVaultList();
    } else if (section === "operator") {
        loadOperatorProfile();
        loadAppSettings();
        loadAuthStatus();
    } else if (section === "deception") {
        loadDecoyStatus();
    } else if (section === "signals") {
        loadMonitorStatus();
    }
}

function switchStegTab(tabName) {
    $$(".steg-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.tab === tabName);
    });
    $$(".steg-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `steg-${tabName}-panel`);
    });
}

async function selectFile(inputId) {
    try {
        const files = await ipcRenderer.invoke("select-file");
        if (!files || !files[0]) {
            return;
        }
        const input = $(inputId);
        if (input) {
            input.value = path.basename(files[0]);
            input.dataset.path = files[0];
        }
        updateCapacityDisplay();
    } catch (_error) {
        showNotification("Unable to select file.", "error");
    }
}

async function selectImage(inputId) {
    try {
        const files = await ipcRenderer.invoke("select-image");
        if (!files || !files[0]) {
            return;
        }
        const input = $(inputId);
        if (input) {
            input.value = path.basename(files[0]);
            input.dataset.path = files[0];
        }
        updateCapacityDisplay();
    } catch (_error) {
        showNotification("Unable to select image.", "error");
    }
}

async function selectSavePath(inputId) {
    try {
        const defaultName = inputId.includes("hide")
            ? "hidden_image.png"
            : "extracted_file.bin";
        const filePath = await ipcRenderer.invoke("select-restore-path", defaultName);
        if (!filePath) {
            return;
        }
        const input = $(inputId);
        if (input) {
            input.value = path.basename(filePath);
            input.dataset.path = filePath;
        }
    } catch (_error) {
        showNotification("Unable to choose output path.", "error");
    }
}

function updateCapacityDisplay() {
    const carrierPath = $("hide-carrier-image")?.dataset.path;
    const dataPath = $("hide-data-file")?.dataset.path;
    const display = $("capacity-display");
    if (!display) {
        return;
    }

    if (!carrierPath || !dataPath) {
        display.innerHTML =
            '<span class="capacity-text">Select a payload and carrier image to preview transfer size.</span>';
        return;
    }

    try {
        const fileSize = fs.statSync(dataPath).size;
        display.innerHTML = `
            <span class="capacity-text">Payload: <strong>${formatBytes(fileSize)}</strong></span>
            <span class="capacity-value">Carrier: ${path.basename(carrierPath)}</span>
        `;
    } catch (_error) {
        display.innerHTML =
            '<span class="capacity-text">Capacity preview unavailable for the selected files.</span>';
    }
}

function executeHide() {
    const dataFile = $("hide-data-file")?.dataset.path;
    const carrierImage = $("hide-carrier-image")?.dataset.path;
    const outputPath = $("hide-output-path")?.dataset.path || null;
    const password = $("hide-password")?.value || null;

    if (!dataFile || !carrierImage) {
        showNotification("Choose a payload and carrier image.", "error");
        return;
    }

    startLoadingAnimation("Embedding payload");
    sendCommand("HIDE_DATA", {
        data_file: dataFile,
        image_file: carrierImage,
        output_path: outputPath,
        password
    });
}

function executeExtract() {
    const imageFile = $("extract-image")?.dataset.path;
    const outputPath = $("extract-output-path")?.dataset.path || null;
    const password = $("extract-password")?.value || null;

    if (!imageFile) {
        showNotification("Choose an image to extract from.", "error");
        return;
    }

    startLoadingAnimation("Recovering payload");
    sendCommand("EXTRACT_DATA", {
        image_file: imageFile,
        output_path: outputPath,
        password
    });
}

function executeScan() {
    const imageFile = $("scan-image")?.dataset.path;
    if (!imageFile) {
        showNotification("Choose an image to inspect.", "error");
        return;
    }
    $("scan-result")?.classList.remove("hidden");
    sendCommand("SCAN_IMAGE", { image_file: imageFile });
}

function startLoadingAnimation(status = "Processing secure task") {
    let overlay = $("steg-loading");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "steg-loading";
        overlay.className = "steg-loading hidden";
        overlay.innerHTML = `
            <div class="loading-container">
                <div class="loading-title">OBSIDYN Runtime</div>
                <div class="pixel-grid" id="pixel-grid"></div>
                <div class="loading-progress"><div class="progress-bar" id="progress-bar"></div></div>
                <div class="loading-status" id="loading-status">${status}</div>
            </div>
        `;
        document.body.appendChild(overlay);
        const grid = $("pixel-grid");
        for (let index = 0; index < 256; index += 1) {
            const pixel = document.createElement("div");
            pixel.className = "pixel";
            grid.appendChild(pixel);
        }
    }

    $("loading-status").textContent = status;
    $("progress-bar").style.width = "8%";
    overlay.classList.remove("hidden");
    $$(".pixel").forEach((pixel) => pixel.classList.add("pixel-live"));
    requestAnimationFrame(() => {
        $("progress-bar").style.width = "72%";
    });
}

function stopLoadingAnimation() {
    const overlay = $("steg-loading");
    if (!overlay) {
        return;
    }
    $("progress-bar").style.width = "100%";
    setTimeout(() => {
        overlay.classList.add("hidden");
        $$(".pixel").forEach((pixel) => pixel.classList.remove("pixel-live"));
    }, 180);
}

async function handleVaultOp(kind) {
    try {
        const selector = kind === "folder" ? "select-folder" : "select-file";
        const result = await ipcRenderer.invoke(selector);
        if (!result || !result[0]) {
            return;
        }
        const targetPath = result[0];
        sendCommand(kind === "folder" ? "LOCK_FOLDER" : "LOCK_FILE", { path: targetPath });
        addActivity(`Queued ${kind} seal: ${path.basename(targetPath)}`);
        showNotification(`${kind === "folder" ? "Folder" : "File"} queued for sealing.`, "info");
    } catch (_error) {
        showNotification("Vault action failed to start.", "error");
    }
}

async function unlockFile(containerName) {
    const item = state.vaultItems.find((entry) => entry.container === containerName);
    if (!item) {
        showNotification("Vault item not found.", "error");
        return;
    }
    const restorePath = await ipcRenderer.invoke(
        "select-restore-path",
        item.original_name || "restored_file"
    );
    if (!restorePath) {
        return;
    }
    const action = item.type === "folder" ? "UNLOCK_FOLDER" : "UNLOCK_FILE";
    sendCommand(action, { container: containerName, restore_path: restorePath });
    addActivity(`Restore requested: ${item.original_name || containerName}`);
}

function deleteVaultItem(containerName) {
    const item = state.vaultItems.find((entry) => entry.container === containerName);
    if (!item) {
        return;
    }
    const approved = window.confirm(
        `Delete ${item.original_name || containerName}? This cannot be undone.`
    );
    if (!approved) {
        return;
    }
    sendCommand("DELETE_VAULT_ITEM", { container: containerName });
    addActivity(`Deletion requested: ${item.original_name || containerName}`);
}

function loadVaultList() {
    sendCommand("GET_VAULT_LIST", {});
}

function renderVaultList(response) {
    const items = Array.isArray(response.data) ? response.data : [];
    state.vaultItems = items;

    if (!appEl.vaultList) {
        return;
    }

    if (items.length === 0) {
        appEl.vaultList.innerHTML = `
            <div class="empty-state empty-state-rich">
                <div class="empty-icon">VT</div>
                <p>Vault inventory is clear.</p>
                <span>Seal a file or folder to create a hidden record.</span>
            </div>
        `;
    } else {
        appEl.vaultList.innerHTML = items
            .map((item) => {
                const label = item.type === "folder" ? "Folder" : "File";
                const meta = `${formatBytes(item.original_size || 0)} | ${item.file_count || 1} item${item.file_count === 1 ? "" : "s"}`;
                return `
                    <article class="vault-item ${item.type === "folder" ? "is-folder" : "is-file"}">
                        <div class="vault-item-icon">${item.type === "folder" ? "FD" : "FL"}</div>
                        <div class="vault-item-info">
                            <div class="vault-item-head">
                                <div class="vault-item-name">${escapeHtml(item.original_name || "Unknown asset")}</div>
                                <div class="vault-item-pills">
                                    <span class="vault-pill">${label}</span>
                                    <span class="vault-pill ${item.exists ? "is-ok" : "is-warn"}">${item.exists ? "sealed" : "missing"}</span>
                                </div>
                            </div>
                            <div class="vault-item-meta">${meta}</div>
                            <div class="vault-item-submeta">Locked ${item.locked_at ? new Date(item.locked_at).toLocaleString() : "recently"}</div>
                        </div>
                        <div class="vault-item-actions">
                            <button class="btn-sm btn-unlock" onclick="unlockFile('${item.container}')">Unlock</button>
                            <button class="btn-sm btn-delete" onclick="deleteVaultItem('${item.container}')">Delete</button>
                        </div>
                    </article>
                `;
            })
            .join("");
    }

    updateDashboardState();
}
async function selectDecoyDirectory() {
    const result = await ipcRenderer.invoke("select-folder");
    if (!result || !result[0]) {
        return;
    }
    state.decoyTargetPath = result[0];
    if ($("decoy-target-path")) {
        $("decoy-target-path").value = state.decoyTargetPath;
    }
}

function createDecoyVault() {
    const profile = $("decoy-profile")?.value || "operations";
    const fileCount = Number.parseInt($("decoy-file-count")?.value || "3", 10);
    sendCommand("CREATE_DECOY_VAULT", {
        target_dir: state.decoyTargetPath || null,
        profile,
        file_count: fileCount
    });
}

function loadDecoyStatus() {
    sendCommand("GET_DECOY_STATUS", {});
}

function renderDecoyStatus(data) {
    const vaults = Array.isArray(data.vaults) ? data.vaults : [];
    const alerts = Array.isArray(data.alerts) ? data.alerts : [];

    if ($("decoy-summary")) {
        $("decoy-summary").textContent = vaults.length
            ? `${vaults.length} decoy vault${vaults.length === 1 ? "" : "s"} active.`
            : "No decoy vault deployed.";
    }

    if ($("decoy-vaults")) {
        $("decoy-vaults").innerHTML = vaults.length
            ? vaults
                  .map(
                      (vault) => `
                <div class="ops-item">
                    <div class="ops-item-head">
                        <strong>${escapeHtml(vault.label)}</strong>
                        <span class="vault-pill">${escapeHtml(vault.profile)}</span>
                    </div>
                    <div class="ops-item-meta">${vault.file_count} honeyfiles | ${escapeHtml(vault.path)}</div>
                    <div class="ops-item-submeta">Created ${formatTimestamp(vault.created_at)}</div>
                </div>
            `
                  )
                  .join("")
            : '<div class="activity-empty">No decoy vaults deployed.</div>';
    }

    if ($("decoy-alerts")) {
        $("decoy-alerts").innerHTML = alerts.length
            ? alerts
                  .slice()
                  .reverse()
                  .map(
                      (alert) => `
                <div class="activity-item">
                    <div class="activity-copy">${escapeHtml(alert.kind)}: ${escapeHtml(alert.file || alert.message)}</div>
                    <span class="activity-time">${formatTimestamp(alert.timestamp, true)}</span>
                </div>
            `
                  )
                  .join("")
            : '<div class="activity-empty">No honey alerts recorded.</div>';
    }
}

function startMonitoring() {
    sendCommand("START_MONITORING", {});
}

function stopMonitoring() {
    sendCommand("STOP_MONITORING", {});
}

function loadMonitorStatus() {
    sendCommand("GET_MONITOR_STATUS", {});
}

function renderMonitorStatus(data) {
    const events = Array.isArray(data.events) ? data.events : [];
    const processes = Array.isArray(data.processes) ? data.processes : [];
    const honeyAlerts = Array.isArray(data.honey_alerts) ? data.honey_alerts : [];

    state.monitorActive = Boolean(data.active);
    if ($("monitor-state")) {
        const posture = (data.trace_posture || "nominal").toUpperCase();
        $("monitor-state").textContent = data.active ? `ONLINE | ${posture}` : "OFFLINE";
    }
    if ($("monitor-process-count")) {
        $("monitor-process-count").textContent = String(data.process_count || 0);
    }
    if ($("monitor-alert-count")) {
        $("monitor-alert-count").textContent = String(honeyAlerts.length);
    }

    if ($("monitor-events")) {
        $("monitor-events").innerHTML = events.length
            ? events
                  .slice()
                  .reverse()
                  .map(
                      (event) => `
                <div class="ops-item">
                    <div class="ops-item-head">
                        <strong>${escapeHtml(event.kind)}</strong>
                        <span class="ops-item-time">${formatTimestamp(event.timestamp, true)}</span>
                    </div>
                    <div class="ops-item-meta">${escapeHtml(event.message)}</div>
                </div>
            `
                  )
                  .join("")
            : `<div class="activity-empty">${data.active ? "No process churn captured." : "Tracing is offline."}</div>`;
    }

    if ($("monitor-processes")) {
        $("monitor-processes").innerHTML = processes.length
            ? processes
                  .map(
                      (process) => `
                <div class="ops-item">
                    <div class="ops-item-head">
                        <strong>${escapeHtml(process.image_name)}</strong>
                        <span class="vault-pill ${process.watch_tags?.length ? "is-warn" : ""}">${escapeHtml(process.pid)}</span>
                    </div>
                    <div class="ops-item-meta">${formatBytes((process.memory_kb || 0) * 1024)} | Session ${escapeHtml(process.session_name)}</div>
                    <div class="ops-item-submeta">${process.watch_tags?.length ? escapeHtml(process.watch_tags.join(", ")) : "No watchlist match"}</div>
                </div>
            `
                  )
                  .join("")
            : '<div class="activity-empty">No process data captured yet.</div>';
    }
}

function selectFileForShred(filePath) {
    state.selectedFileForShred = filePath;
    const stats = safeStat(filePath);
    $("shred-filename").textContent = path.basename(filePath);
    $("shred-filepath").textContent = filePath;
    $("shred-filesize").textContent = stats ? formatBytes(stats.size) : "Unavailable";
    $("shred-file-info")?.classList.remove("hidden");
    $("shred-options")?.classList.remove("hidden");
    $("btn-execute-shred")?.classList.remove("hidden");
}

async function executeSecureShred() {
    if (!state.selectedFileForShred) {
        showNotification("Choose a file first.", "error");
        return;
    }
    if (!$("shred-confirm-check")?.checked) {
        showNotification("Confirm the irreversible action first.", "error");
        return;
    }
    $("shred-progress-modal")?.classList.remove("hidden");
    await simulateShredProgress();
    sendCommand("SHRED_FILE", { path: state.selectedFileForShred });
}

async function simulateShredProgress() {
    const steps = ["step-1", "step-2", "step-3", "step-4"];
    for (let index = 0; index < steps.length; index += 1) {
        const step = $(steps[index]);
        const bar = step?.querySelector(".step-progress");
        step?.classList.add("active");
        for (let progress = 0; progress <= 100; progress += 10) {
            if (bar) {
                bar.style.width = `${progress}%`;
            }
            await wait(40);
        }
        step?.classList.remove("active");
        step?.classList.add("completed");
        $("shred-pass").textContent = `${Math.min(index + 1, 3)}/3`;
        $("shred-percent").textContent = `${Math.round(((index + 1) / steps.length) * 100)}%`;
        if ($("shred-progress-bar")) {
            $("shred-progress-bar").style.width = `${Math.round(((index + 1) / steps.length) * 100)}%`;
        }
    }
    $("shred-time").textContent = "00:00";
}

function handleShredSuccess() {
    $("shred-progress-modal")?.classList.add("hidden");
    $("shred-success-modal")?.classList.remove("hidden");
    const wipeText = $("shred-wipe-name")?.checked ? " Filename wipe requested as well." : "";
    $("shred-success-message").textContent = `${path.basename(state.selectedFileForShred || "Selected file")} removed from the visible workspace.${wipeText}`;
    addActivity(`Destroyed: ${path.basename(state.selectedFileForShred || "file")}`);
    showNotification("Destruction cycle completed.", "success");
}

function resetShredUi() {
    state.selectedFileForShred = null;
    $("shred-file-info")?.classList.add("hidden");
    $("shred-options")?.classList.add("hidden");
    $("btn-execute-shred")?.classList.add("hidden");
    $("shred-progress-modal")?.classList.add("hidden");
    $("shred-success-modal")?.classList.add("hidden");
    if ($("shred-confirm-check")) {
        $("shred-confirm-check").checked = false;
    }
    ["step-1", "step-2", "step-3", "step-4"].forEach((id) => {
        const step = $(id);
        const bar = step?.querySelector(".step-progress");
        step?.classList.remove("active", "completed");
        if (bar) {
            bar.style.width = "0%";
        }
    });
    if ($("shred-progress-bar")) {
        $("shred-progress-bar").style.width = "0%";
    }
    $("shred-percent").textContent = "0%";
    $("shred-pass").textContent = "0/3";
}

function handleAuthenticate() {
    const password = loginEl.password?.value.trim();
    if (!password) {
        showLoginStatus("Enter the master key to continue.", "error");
        return;
    }
    state.profile = loginEl.mode?.value || "PERSONAL";
    syncProfileUi();
    showLoginStatus("Authenticating secure session...", "info");
    sendCommand("AUTH", {
        password_hash: hashPassword(password),
        keystroke_sample: buildKeystrokeSample(),
        mode: state.profile
    });
}

function handleAuthSuccess(behavioral) {
    const completeLogin = () => {
        state.authenticated = true;
        state.sessionStart = Date.now();
        closeCameraWorkflow();
        screens.login?.classList.remove("active");
        screens.app?.classList.add("active");
        syncProfileUi();
        renderAuthStatus(behavioral || state.authStatus);
        startTimers();
        startPolling();
        loadAppSettings();
        loadOperatorProfile();
        loadVaultList();
        loadDecoyStatus();
        loadMonitorStatus();
        addActivity("Secure session established");
        showNotification(
            behavioral?.message || "Vault session established.",
            "success"
        );
        resetKeystrokeTrace();
    };

    if (state.cameraMode === "login-recovery" && state.recoveryPipelineActive) {
        finalizeRecoveryPipeline(true, "Recovery verification complete. Session release authorized.", completeLogin);
        return;
    }

    completeLogin();
}

function loadAuthStatus() {
    sendCommand("GET_AUTH_STATUS", {});
}

function renderAuthStatus(data) {
    if (!data) {
        return;
    }
    state.authStatus = data;
    state.failedPasswordAttempts = Number(data.failed_password_attempts || 0);
    state.recoveryTriggerAttempts = Number(data.visual_recovery_trigger_attempts || 0);
    state.recoveryConfigured = Boolean(data.visual_recovery?.configured);
    const statusText = !data.configured
        ? "No master identity enrolled yet. First session will establish Rhythm Lock."
        : data.enforcement_ready
            ? `${data.lock_name || "Rhythm Lock"} active. Score ${data.last_score ?? "n/a"}.`
            : `${data.lock_name || "Rhythm Lock"} training ${data.sample_count || 0}/${data.minimum_training_samples || 5}.`;
    if ($("rhythm-lock-status")) {
        $("rhythm-lock-status").textContent = statusText;
    }
    renderSecurityPolicy(data);
    updateLoginRecoveryButton(data);
}

function lockSystem() {
    sendCommand("LOGOUT", {});
    state.authenticated = false;
    state.monitorActive = false;
    closeCameraWorkflow();
    clearTimers();
    stopPolling();
    screens.app?.classList.remove("active");
    screens.login?.classList.add("active");
    if (loginEl.password) {
        loginEl.password.value = "";
    }
    resetKeystrokeTrace();
    showLoginStatus("System locked.", "success");
}

function startTimers() {
    clearTimers();
    const autoLockMs = state.autoLockMinutes * 60 * 1000;
    const startedAt = Date.now();
    state.autoLockTimer = setTimeout(() => {
        addActivity("Auto-lock engaged");
        lockSystem();
    }, autoLockMs);
    state.countdownTimer = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, autoLockMs - elapsed);
        if (appEl.sessionTimer) {
            appEl.sessionTimer.textContent = formatDuration(elapsed);
        }
        if (appEl.dashboardAutoLock) {
            appEl.dashboardAutoLock.textContent = formatDuration(remaining);
        }
    }, 1000);
}

function clearTimers() {
    if (state.autoLockTimer) {
        clearTimeout(state.autoLockTimer);
        state.autoLockTimer = null;
    }
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
    }
}

function loadOperatorProfile() {
    if (!state.authenticated) {
        return;
    }
    sendCommand("GET_OPERATOR_PROFILE", {});
}

function saveOperatorProfile() {
    if (!state.authenticated) {
        showNotification("Authenticate before editing the dossier.", "error");
        return;
    }

    sendCommand("SAVE_OPERATOR_PROFILE", {
        profile: {
            call_sign: $("operator-call-sign")?.value || "",
            full_name: $("operator-full-name")?.value || "",
            organization: $("operator-organization")?.value || "",
            designation: $("operator-designation")?.value || "",
            email: $("operator-email")?.value || "",
            phone: $("operator-phone")?.value || "",
            location: $("operator-location")?.value || "",
            recovery_phrase_hint: $("operator-hint")?.value || "",
            mission_notes: $("operator-mission-notes")?.value || "",
            private_notes: $("operator-private-notes")?.value || ""
        }
    });
}

function renderOperatorProfile(profile) {
    state.operatorProfile = profile || null;
    if (!profile) {
        return;
    }

    const fieldMap = {
        "operator-call-sign": profile.call_sign,
        "operator-full-name": profile.full_name,
        "operator-organization": profile.organization,
        "operator-designation": profile.designation,
        "operator-email": profile.email,
        "operator-phone": profile.phone,
        "operator-location": profile.location,
        "operator-hint": profile.recovery_phrase_hint,
        "operator-mission-notes": profile.mission_notes,
        "operator-private-notes": profile.private_notes
    };

    Object.entries(fieldMap).forEach(([id, value]) => {
        if ($(id)) {
            $(id).value = value || "";
        }
    });

    const summary = $("dashboard-operator-summary");
    if (summary) {
        const name = profile.call_sign || profile.full_name || "Unassigned operator";
        summary.innerHTML = `
            <div class="ops-item">
                <div class="ops-item-head">
                    <strong>${escapeHtml(name)}</strong>
                    <span class="vault-pill">${escapeHtml(state.profile)}</span>
                </div>
                <div class="ops-item-meta">${escapeHtml(profile.designation || profile.organization || "No designation set")}</div>
                <div class="ops-item-submeta">${escapeHtml(profile.location || "Location sealed")} | ${escapeHtml(profile.email || "No contact set")}</div>
            </div>
            <div class="ops-item">
                <div class="ops-item-head">
                    <strong>Mission Notes</strong>
                    <span class="ops-item-time">${formatTimestamp(profile.updated_at, true)}</span>
                </div>
                <div class="ops-item-meta">${escapeHtml((profile.mission_notes || "No mission note stored yet.").slice(0, 220))}</div>
            </div>
        `;
    }
    updateDashboardState();
}

function loadAppSettings() {
    sendCommand("GET_APP_SETTINGS", {});
}

function readCheckbox(id, fallback = false) {
    const element = $(id);
    return element ? Boolean(element.checked) : fallback;
}

function isVisualRecoveryEnabled() {
    return state.appSettings?.visual_recovery_enabled !== false;
}

function collectAppSettingsPayload(overrides = {}) {
    const base = state.appSettings || {};
    return {
        auto_lock_minutes:
            overrides.auto_lock_minutes ??
            (
                Number.parseInt(
                    $("autolock-minutes")?.value ||
                    $("operator-auto-lock")?.value ||
                    String(base.auto_lock_minutes || state.autoLockMinutes || 10),
                    10
                ) || 10
            ),
        default_security_profile:
            overrides.default_security_profile ??
            $("settings-profile")?.value ??
            $("operator-security-profile")?.value ??
            state.profile,
        privacy_mode:
            overrides.privacy_mode ??
            readCheckbox("settings-privacy-mode", base.privacy_mode !== false),
        store_full_paths:
            overrides.store_full_paths ??
            readCheckbox("settings-store-full-paths", Boolean(base.store_full_paths)),
        visual_recovery_enabled:
            overrides.visual_recovery_enabled ??
            readCheckbox(
                "operator-recovery-enabled",
                readCheckbox("settings-visual-recovery-enabled", base.visual_recovery_enabled !== false)
            ),
        login_binary_enabled:
            overrides.login_binary_enabled ??
            readCheckbox("settings-login-binary", base.login_binary_enabled !== false),
        reduced_motion:
            overrides.reduced_motion ??
            readCheckbox("settings-reduced-motion", Boolean(base.reduced_motion)),
    };
}

function applyUiSettings() {
    document.body.classList.toggle("reduced-motion", Boolean(state.appSettings?.reduced_motion));
    const ambient = screens.login?.querySelector(".ambient-layer");
    if (ambient) {
        ambient.classList.toggle("hidden", state.appSettings?.login_binary_enabled === false);
    }
}

function saveAppSettings() {
    const nextSettings = collectAppSettingsPayload();
    state.autoLockMinutes = nextSettings.auto_lock_minutes;
    state.profile = nextSettings.default_security_profile;
    state.appSettings = { ...(state.appSettings || {}), ...nextSettings };
    if (state.authenticated) {
        startTimers();
    }
    syncProfileUi();
    syncSettingsUi();
    applyUiSettings();
    updateDashboardState();
    if ($("settings-status")) {
        $("settings-status").textContent = "Applying runtime settings...";
    }
    sendCommand("UPDATE_APP_SETTINGS", nextSettings);
}

function saveSecurityControls() {
    const trainingTarget = Number.parseInt($("operator-training-target")?.value || "5", 10);
    const threshold = Number.parseFloat($("operator-threshold")?.value || "3.4");
    const autoLock = Number.parseInt($("operator-auto-lock")?.value || String(state.autoLockMinutes), 10);
    const selectedProfile = $("operator-security-profile")?.value || state.profile;

    state.autoLockMinutes = Number.isFinite(autoLock) ? autoLock : 10;
    state.profile = selectedProfile;
    syncProfileUi();
    syncSettingsUi();

    const nextSettings = collectAppSettingsPayload({
        auto_lock_minutes: state.autoLockMinutes,
        default_security_profile: state.profile,
    });
    state.appSettings = { ...(state.appSettings || {}), ...nextSettings };
    if (state.authenticated) {
        startTimers();
    }
    applyUiSettings();
    sendCommand("UPDATE_APP_SETTINGS", nextSettings);
    sendCommand("UPDATE_RHYTHM_POLICY", {
        minimum_training_samples: trainingTarget,
        threshold
    });
}

function renderAppSettings(settings) {
    if (!settings) {
        return;
    }

    state.appSettings = settings;
    state.autoLockMinutes = Number.parseInt(settings.auto_lock_minutes || "10", 10) || 10;
    if (!state.authenticated && settings.default_security_profile) {
        state.profile = settings.default_security_profile;
    }
    syncProfileUi();
    syncSettingsUi();
    applyUiSettings();
    if ($("settings-status")) {
        $("settings-status").textContent = "Runtime settings loaded and synchronized.";
    }
    updateDashboardState();
}

function syncSettingsUi() {
    if ($("autolock-minutes")) {
        $("autolock-minutes").value = String(state.autoLockMinutes);
    }
    if ($("operator-auto-lock")) {
        $("operator-auto-lock").value = String(state.autoLockMinutes);
    }
    if ($("settings-profile")) {
        $("settings-profile").value = state.profile;
    }
    if ($("operator-security-profile")) {
        $("operator-security-profile").value = state.profile;
    }
    if ($("settings-privacy-mode")) {
        $("settings-privacy-mode").checked = state.appSettings?.privacy_mode !== false;
    }
    if ($("settings-store-full-paths")) {
        $("settings-store-full-paths").checked = Boolean(state.appSettings?.store_full_paths);
    }
    if ($("settings-login-binary")) {
        $("settings-login-binary").checked = state.appSettings?.login_binary_enabled !== false;
    }
    if ($("settings-reduced-motion")) {
        $("settings-reduced-motion").checked = Boolean(state.appSettings?.reduced_motion);
    }
    if ($("settings-visual-recovery-enabled")) {
        $("settings-visual-recovery-enabled").checked = isVisualRecoveryEnabled();
    }
    if ($("operator-recovery-enabled")) {
        $("operator-recovery-enabled").checked = isVisualRecoveryEnabled();
    }
}

function renderSecurityPolicy(status) {
    if (!status) {
        return;
    }

    if ($("operator-training-target")) {
        $("operator-training-target").value = String(status.minimum_training_samples || 5);
    }
    if ($("operator-threshold")) {
        $("operator-threshold").value = String(status.threshold || 3.4);
    }

    if ($("operator-auth-policy")) {
        const mode = status.enforcement_ready
            ? `Enforcing after ${status.sample_count || 0} samples`
            : `Training ${status.sample_count || 0}/${status.minimum_training_samples || 5}`;
        $("operator-auth-policy").textContent = `Rhythm Lock ${mode}. Sensitivity ${status.threshold || 3.4}. Visual recovery is ${isVisualRecoveryEnabled() ? "available on login" : "disabled in settings"}.`;
    }

    renderRecoveryStatus(status.visual_recovery);
}

function renderRecoveryStatus(recoveryStatus) {
    if (!recoveryStatus) {
        return;
    }

    state.recoveryReady = Boolean(recoveryStatus.configured);
    state.recoveryConfigured = Boolean(recoveryStatus.configured);
    if (state.authStatus) {
        state.authStatus.visual_recovery = {
            ...(state.authStatus.visual_recovery || {}),
            ...recoveryStatus,
        };
        state.authStatus.visual_recovery_allowed = Boolean(recoveryStatus.configured) && (recoveryStatus.enabled ?? isVisualRecoveryEnabled());
    }
    if ($("recovery-gesture-label") && recoveryStatus.gesture_label) {
        $("recovery-gesture-label").value = recoveryStatus.gesture_label;
    }
    updateLoginRecoveryButton(state.authStatus);
    const recoveryEnabled = recoveryStatus.enabled ?? isVisualRecoveryEnabled();
    const recoveryButton = $("btn-start-recovery-enroll");
    if (recoveryButton) {
        recoveryButton.textContent = state.recoveryReady ? "Update Enrollment" : "Capture Enrollment";
    }
    if ($("btn-delete-recovery-profile")) {
        $("btn-delete-recovery-profile").disabled = !state.recoveryReady;
    }
    if ($("operator-recovery-status")) {
        $("operator-recovery-status").textContent = !state.recoveryReady
            ? "Visual recovery not enrolled."
            : recoveryEnabled
                ? `Visual recovery enrolled and active${recoveryStatus.gesture_label ? ` | ${recoveryStatus.gesture_label}` : ""}.`
                : `Visual recovery enrolled but disabled${recoveryStatus.gesture_label ? ` | ${recoveryStatus.gesture_label}` : ""}.`;
    }
    if ($("operator-recovery-metrics")) {
        $("operator-recovery-metrics").innerHTML = state.recoveryReady
            ? `
                <div class="ops-item">
                    <div class="ops-item-head">
                        <strong>Face + Hand Signature</strong>
                        <span class="vault-pill ${recoveryEnabled ? "is-ok" : "is-warn"}">${recoveryEnabled ? "ACTIVE" : "DISABLED"}</span>
                    </div>
                    <div class="ops-item-meta">${escapeHtml(recoveryStatus.gesture_label || "Custom signature")}</div>
                    <div class="ops-item-submeta">Updated ${formatTimestamp(recoveryStatus.updated_at)} | ${recoveryEnabled ? "Available on every login screen" : "Stored but unavailable until re-enabled"}</div>
                </div>
            `
            : '<div class="activity-empty">Capture a face frame and your chosen hand signature to enable recovery.</div>';
    }
    if ($("settings-recovery-status")) {
        $("settings-recovery-status").textContent = !state.recoveryReady
            ? "No visual recovery signature stored."
            : recoveryEnabled
                ? `Visual recovery signature is active${recoveryStatus.gesture_label ? ` | ${recoveryStatus.gesture_label}` : ""}.`
                : `Visual recovery signature is stored but disabled${recoveryStatus.gesture_label ? ` | ${recoveryStatus.gesture_label}` : ""}.`;
    }
    syncSettingsUi();
}

function handleRecoveryToggleSync(event) {
    const enabled = Boolean(event?.target?.checked);
    if ($("settings-visual-recovery-enabled") && event?.target?.id !== "settings-visual-recovery-enabled") {
        $("settings-visual-recovery-enabled").checked = enabled;
    }
    if ($("operator-recovery-enabled") && event?.target?.id !== "operator-recovery-enabled") {
        $("operator-recovery-enabled").checked = enabled;
    }

    state.appSettings = {
        ...(state.appSettings || {}),
        visual_recovery_enabled: enabled,
    };
    applyUiSettings();
    if ($("settings-status")) {
        $("settings-status").textContent = "Applying visual recovery preference...";
    }
    updateLoginRecoveryButton(state.authStatus);
    renderRecoveryStatus({
        configured: state.recoveryReady,
        gesture_label: $("recovery-gesture-label")?.value || "Custom signature",
        updated_at: state.authStatus?.visual_recovery?.updated_at || state.appSettings?.updated_at || null,
        enabled,
    });
    sendCommand("UPDATE_APP_SETTINGS", { visual_recovery_enabled: enabled });
}

function deleteVisualRecoveryProfile() {
    if (!state.recoveryReady) {
        showNotification("No visual recovery signature is stored.", "info");
        return;
    }
    if (!window.confirm("Delete the enrolled face and gesture signature?")) {
        return;
    }
    sendCommand("DELETE_VISUAL_RECOVERY", {});
}

function rotateMasterKey() {
    const currentPassword = $("operator-current-password")?.value || "";
    const newPassword = $("operator-new-password")?.value || "";
    const confirmPassword = $("operator-confirm-password")?.value || "";

    if (!currentPassword || !newPassword) {
        showNotification("Enter the current and new master keys.", "error");
        return;
    }
    if (newPassword !== confirmPassword) {
        showNotification("New master key confirmation does not match.", "error");
        return;
    }

    sendCommand("ROTATE_MASTER_KEY", {
        current_password_hash: hashPassword(currentPassword),
        new_password_hash: hashPassword(newPassword)
    });
}

async function openCameraWorkflow(mode) {
    state.cameraMode = mode;
    resetCameraCaptures();
    clearRecoveryPipeline();

    $("camera-modal-title").textContent =
        mode === "enroll" ? "Enroll Visual Recovery" : "Visual Recovery Override";
    $("camera-modal-subtitle").textContent =
        mode === "enroll"
            ? "Capture your face and your chosen hand signature."
            : "Capture live face and gesture, then submit them for verification.";
    if ($("btn-camera-submit")) {
        $("btn-camera-submit").textContent =
            mode === "enroll" ? "Enable Visual Recovery" : "Submit & Verify";
    }
    $("camera-capture-status").className = "status-message info";
    $("camera-capture-status").textContent = "Opening camera feed...";
    $("camera-capture-modal")?.classList.remove("hidden");

    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Camera API unavailable");
        }
        state.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: false
        });
        const video = $("camera-preview");
        if (video) {
            video.srcObject = state.cameraStream;
            await video.play();
        }
        $("camera-capture-status").textContent = "Camera online. Capture face first, then the hand signature.";
        updateCameraCaptureUi();
    } catch (_error) {
        $("camera-capture-status").textContent = "Camera unavailable. Check desktop camera permissions.";
        showNotification("Unable to access the camera.", "error");
    }
}

function closeCameraWorkflow() {
    clearRecoveryPipeline();
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach((track) => track.stop());
        state.cameraStream = null;
    }
    state.cameraMode = null;
    resetCameraCaptures();
    $("camera-capture-modal")?.classList.add("hidden");
}

function captureCameraFrame(kind) {
    const video = $("camera-preview");
    const canvas = kind === "face" ? $("camera-face-canvas") : $("camera-gesture-canvas");
    if (!video || !canvas || !video.videoWidth) {
        showNotification("Camera feed is not ready yet.", "error");
        return;
    }

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    state.captures[kind] = canvas.toDataURL("image/png");
    $("camera-capture-status").textContent =
        kind === "face"
            ? "Face frame captured. Now capture the hand signature."
            : "Gesture frame captured. Submit when ready.";
    updateCameraCaptureUi();
}

function submitCameraWorkflow() {
    if (!state.captures.face || !state.captures.gesture) {
        showNotification("Capture both face and gesture frames first.", "error");
        return;
    }

    if (state.cameraMode === "enroll") {
        startRecoveryPipeline("enroll");
        sendCommand("ENROLL_VISUAL_RECOVERY", {
            face_image: state.captures.face,
            gesture_image: state.captures.gesture,
            gesture_label: $("recovery-gesture-label")?.value || "Custom signature"
        });
    } else if (state.cameraMode === "login-recovery") {
        startRecoveryPipeline("login-recovery");
        showLoginStatus("Submitting passwordless visual recovery...", "info");
        sendCommand("AUTH_VISUAL_RECOVERY", {
            recovery_payload: {
                face_image: state.captures.face,
                gesture_image: state.captures.gesture
            }
        });
    }
}

function resetCameraCaptures() {
    state.captures.face = null;
    state.captures.gesture = null;
    clearRecoveryPipeline();
    if ($("camera-face-canvas")) {
        clearCameraCanvas($("camera-face-canvas"));
    }
    if ($("camera-gesture-canvas")) {
        clearCameraCanvas($("camera-gesture-canvas"));
    }
    updateCameraCaptureUi();
}

function updateCameraCaptureUi() {
    const hasFace = Boolean(state.captures.face);
    const hasGesture = Boolean(state.captures.gesture);
    const ready = hasFace && hasGesture;
    const busy = state.recoveryPipelineActive;

    if ($("btn-camera-submit")) {
        $("btn-camera-submit").disabled = !ready || busy;
    }
    if ($("btn-camera-reset")) {
        $("btn-camera-reset").disabled = busy;
    }
    if ($("btn-capture-face")) {
        $("btn-capture-face").disabled = busy;
    }
    if ($("btn-capture-gesture")) {
        $("btn-capture-gesture").disabled = busy;
    }
    if ($("btn-camera-close")) {
        $("btn-camera-close").disabled = busy;
    }

    const summary = $("camera-enrollment-summary");
    if (summary) {
        if (busy) {
            summary.textContent =
                state.cameraMode === "enroll"
                    ? "Enrollment package submitted. Awaiting secure commit."
                    : "Verification package submitted. Awaiting secure verdict.";
        } else if (ready) {
            summary.textContent =
                state.cameraMode === "enroll"
                    ? "Both captures ready. Enable visual recovery to save enrollment."
                    : "Both captures ready. Submit and verify recovery now.";
        } else if (hasFace || hasGesture) {
            summary.textContent = `Waiting for ${hasFace ? "gesture" : "face"} capture.`;
        } else {
            summary.textContent = "Waiting for face and gesture capture.";
        }
    }

    updateCameraStepState("camera-step-face", hasFace);
    updateCameraStepState("camera-step-gesture", hasGesture);
    updateCameraStepState("camera-step-enable", ready);
}

function updateCameraStepState(id, complete) {
    const element = $(id);
    if (!element) {
        return;
    }
    element.classList.toggle("is-complete", complete);
}

function getRecoveryPipelineStages(mode) {
    if (mode === "enroll") {
        return [
            { target: 12, label: "Ingesting face frame", detail: "Packaging enrollment capture" },
            { target: 28, label: "Extracting face signature", detail: "Normalizing facial contrast map" },
            { target: 46, label: "Extracting gesture contour", detail: "Tracing hand silhouette geometry" },
            { target: 64, label: "Matching pixel topology", detail: "Reducing frame into secure feature vectors" },
            { target: 82, label: "Sealing recovery profile", detail: "Encrypting visual recovery enrollment" },
            { target: 96, label: "Awaiting backend commit", detail: "Writing protected recovery artifact" }
        ];
    }
    return [
        { target: 10, label: "Submitting recovery package", detail: "Face and gesture frames transferred" },
        { target: 24, label: "Processing face image", detail: "Reading luminance and boundary features" },
        { target: 41, label: "Matching facial signature", detail: "Comparing live frame against enrolled vector" },
        { target: 58, label: "Processing gesture image", detail: "Normalizing posture and contour geometry" },
        { target: 75, label: "Matching gesture signature", detail: "Computing gesture similarity confidence" },
        { target: 90, label: "Correlating combined trust score", detail: "Binding face and gesture confidence" },
        { target: 97, label: "Awaiting engine verdict", detail: "Final secure decision pending" }
    ];
}

function renderRecoveryPipeline() {
    const panel = $("camera-processing-panel");
    if (!panel) {
        return;
    }

    const active = state.recoveryPipelineActive;
    panel.classList.toggle("hidden", !active && state.recoveryPipelineProgress <= 0);

    const label = $("camera-processing-label");
    const value = $("camera-processing-value");
    const bar = $("camera-processing-bar");
    const feed = $("camera-processing-feed");
    const progress = Math.max(0, Math.min(100, state.recoveryPipelineProgress || 0));
    const stages = state.recoveryPipelineStages || [];
    const activeStageIndex = stages.findIndex((stage) => progress < stage.target);
    const currentIndex = activeStageIndex === -1 ? stages.length - 1 : activeStageIndex;

    if (label) {
        label.textContent = stages[currentIndex]?.label || "Recovery pipeline idle";
    }
    if (value) {
        value.textContent = `${Math.round(progress)}%`;
    }
    if (bar) {
        bar.style.width = `${progress}%`;
    }
    if (feed) {
        feed.innerHTML = stages.map((stage, index) => {
            const stageState = progress >= stage.target
                ? "is-complete"
                : index === currentIndex && active
                    ? "is-active"
                    : "is-pending";
            return `
                <div class="camera-processing-item ${stageState}">
                    <strong>${escapeHtml(stage.label)}</strong>
                    <span>${escapeHtml(stage.detail)}</span>
                </div>
            `;
        }).join("");
    }
}

function startRecoveryPipeline(mode) {
    clearRecoveryPipeline();
    state.recoveryPipelineActive = true;
    state.recoveryPipelineMode = mode;
    state.recoveryPipelineProgress = 3;
    state.recoveryPipelineStages = getRecoveryPipelineStages(mode);
    if ($("camera-capture-status")) {
        $("camera-capture-status").textContent =
            mode === "enroll"
                ? "Submitting enrollment captures into secure recovery pipeline..."
                : "Submitting recovery captures for live verification...";
    }
    renderRecoveryPipeline();
    updateCameraCaptureUi();

    state.recoveryPipelineTimer = setInterval(() => {
        if (!state.recoveryPipelineActive) {
            return;
        }
        const nextStage = state.recoveryPipelineStages.find((stage) => state.recoveryPipelineProgress < stage.target);
        const ceiling = nextStage ? nextStage.target : 97;
        const delta = state.recoveryPipelineProgress < 40 ? 4 : state.recoveryPipelineProgress < 80 ? 3 : 1;
        state.recoveryPipelineProgress = Math.min(ceiling, state.recoveryPipelineProgress + delta);
        renderRecoveryPipeline();
    }, 180);
}

function clearRecoveryPipeline() {
    if (state.recoveryPipelineTimer) {
        clearInterval(state.recoveryPipelineTimer);
        state.recoveryPipelineTimer = null;
    }
    state.recoveryPipelineActive = false;
    state.recoveryPipelineMode = null;
    state.recoveryPipelineProgress = 0;
    state.recoveryPipelineStages = [];
    renderRecoveryPipeline();
    updateCameraCaptureUi();
}

function finalizeRecoveryPipeline(success, message, onDone) {
    if (!state.recoveryPipelineActive && state.recoveryPipelineProgress <= 0) {
        onDone?.();
        return;
    }

    if (state.recoveryPipelineTimer) {
        clearInterval(state.recoveryPipelineTimer);
        state.recoveryPipelineTimer = null;
    }
    state.recoveryPipelineActive = false;
    state.recoveryPipelineProgress = 100;
    renderRecoveryPipeline();
    if ($("camera-capture-status")) {
        $("camera-capture-status").textContent = message;
        $("camera-capture-status").className = `status-message ${success ? "success" : "error"}`;
    }

    setTimeout(() => {
        clearRecoveryPipeline();
        if ($("camera-capture-status")) {
            $("camera-capture-status").className = "status-message info";
        }
        onDone?.();
    }, success ? 520 : 380);
}

function updateLoginRecoveryButton(authStatus) {
    const button = $("btn-login-recovery");
    if (!button) {
        return;
    }

    const configured = Boolean(
        authStatus?.visual_recovery?.configured || state.recoveryConfigured
    );
    const enabled = authStatus?.visual_recovery?.enabled ?? isVisualRecoveryEnabled();

    button.classList.toggle("hidden", !configured || !enabled);
    if (!configured || !enabled) {
        button.disabled = true;
        button.textContent = enabled ? "Visual Recovery Unavailable" : "Visual Recovery Disabled";
        return;
    }

    state.recoveryConfigured = true;
    button.disabled = false;
    button.textContent = "Engage Visual Recovery";
}

function clearCameraCanvas(canvas) {
    const context = canvas.getContext("2d");
    context.fillStyle = "#050816";
    context.fillRect(0, 0, canvas.width, canvas.height);
}

function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => {
        if (!state.authenticated) {
            return;
        }

        if (state.currentSection === "vault" || state.vaultItems.length === 0) {
            loadVaultList();
        }
        if (state.currentSection === "operator") {
            loadOperatorProfile();
            loadAuthStatus();
        }
        loadDecoyStatus();
        if (state.monitorActive || state.currentSection === "signals") {
            loadMonitorStatus();
        }
    }, 5000);
}

function stopPolling() {
    if (state.pollTimer) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
}

function syncProfileUi() {
    if (appEl.profile) {
        appEl.profile.textContent = state.profile;
    }
    if ($("settings-profile")) {
        $("settings-profile").value = state.profile;
    }
    if (loginEl.mode) {
        loginEl.mode.value = state.profile;
    }
    if ($("operator-security-profile")) {
        $("operator-security-profile").value = state.profile;
    }
}

function updateDashboardState() {
    const vaultCount = state.vaultItems.length;
    const auth = state.authStatus || {};
    let postureScore = 0;

    if (auth.configured) {
        postureScore += 1;
    }
    if (auth.enforcement_ready) {
        postureScore += 2;
    }
    if (state.monitorActive) {
        postureScore += 1;
    }
    if (state.profile === "PUBLIC") {
        postureScore += 1;
    } else if (state.profile === "WORK") {
        postureScore += 0.5;
    }

    let posture = "STANDBY";
    if (postureScore >= 4) {
        posture = "BLACKSITE";
    } else if (postureScore >= 2.5) {
        posture = "ELEVATED";
    } else if (postureScore >= 1) {
        posture = "GUARDED";
    }

    if (appEl.vaultStatus) {
        appEl.vaultStatus.textContent = `${vaultCount} Sealed`;
    }
    if (appEl.vaultCount) {
        appEl.vaultCount.textContent = `${vaultCount} item${vaultCount === 1 ? "" : "s"}`;
    }
    if (appEl.dashboardVaultCount) {
        appEl.dashboardVaultCount.textContent = String(vaultCount);
    }
    if (appEl.dashboardSecurityLevel) {
        appEl.dashboardSecurityLevel.textContent = posture;
    }
}

function addActivity(message, kind = "INFO") {
    state.activityLog.push({
        message,
        kind,
        timestamp: new Date().toISOString()
    });
    state.activityLog = state.activityLog.slice(-24);
    renderActivityLog();
}

function renderActivityLog() {
    if (!appEl.activityLog) {
        return;
    }

    if (state.activityLog.length === 0) {
        appEl.activityLog.innerHTML = '<div class="activity-empty">No recent activity</div>';
        return;
    }

    appEl.activityLog.innerHTML = state.activityLog
        .slice()
        .reverse()
        .map(
            (entry) => `
                <div class="activity-item">
                    <div class="activity-copy">${escapeHtml(entry.message)}</div>
                    <span class="activity-time">${formatTimestamp(entry.timestamp, true)}</span>
                </div>
            `
        )
        .join("");
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}

function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(durationMs) {
    const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
    }
    return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatTimestamp(timestamp, compact = false) {
    if (!timestamp) {
        return compact ? "--:--" : "Unavailable";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return String(timestamp);
    }

    if (compact) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    return date.toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function sendCommand(action, payload = {}) {
    ipcRenderer.send(
        "secure-command",
        JSON.stringify({
            action,
            payload
        })
    );
}

function showLoginStatus(message, type = "info") {
    if (!loginEl.status) {
        return;
    }

    loginEl.status.className = `status-message ${type}`;
    loginEl.status.textContent = message;
}

function showNotification(message, type = "info") {
    let stack = $("notification-stack");
    if (!stack) {
        stack = document.createElement("div");
        stack.id = "notification-stack";
        stack.className = "toast-stack";
        document.body.appendChild(stack);
    }

    const titleMap = {
        info: "Signal",
        success: "Confirmed",
        error: "Alert"
    };

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-title">${escapeHtml(titleMap[type] || "Signal")}</div>
        <div class="toast-body">${escapeHtml(message)}</div>
    `;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add("visible");
    });

    setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => toast.remove(), 220);
    }, 3600);
}

function safeStat(filePath) {
    try {
        return fs.statSync(filePath);
    } catch (_error) {
        return null;
    }
}

function wait(durationMs) {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function processEngineChunk(chunk) {
    state.engineBuffer += chunk;
    const lines = state.engineBuffer.split(/\r?\n/);
    state.engineBuffer = lines.pop() || "";

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }

        try {
            handleEngineMessage(JSON.parse(trimmed));
        } catch (_error) {
            console.warn("Unreadable engine payload:", trimmed);
        }
    });
}

function extractMessage(payload) {
    if (!payload) {
        return "No response received";
    }

    if (typeof payload.data === "string") {
        return payload.data;
    }
    if (payload.data && typeof payload.data.message === "string") {
        return payload.data.message;
    }
    if (typeof payload.message === "string") {
        return payload.message;
    }
    return payload.status || "Operation completed";
}

function handleEngineMessage(payload) {
    const message = extractMessage(payload);
    const behavioral = payload?.data?.behavioral || payload?.data;

    switch (payload.status) {
        case "AUTH_SUCCESS":
            showLoginStatus("Session established.", "success");
            handleAuthSuccess(behavioral);
            break;
        case "AUTH_FAIL":
            const recoveryAttemptInFlight = state.cameraMode === "login-recovery" && state.recoveryPipelineActive;
            if (behavioral && typeof behavioral === "object") {
                renderAuthStatus(behavioral);
            }
            if (recoveryAttemptInFlight) {
                finalizeRecoveryPipeline(false, `Verification completed: ${message}`, () => {
                    showLoginStatus(message, "error");
                    showNotification(message, "error");
                    updateCameraCaptureUi();
                });
            } else {
                showLoginStatus(message, "error");
                showNotification(message, "error");
            }
            if (behavioral?.visual_recovery?.configured && behavioral?.visual_recovery?.enabled !== false) {
                if ($("btn-login-recovery")) {
                    $("btn-login-recovery").classList.remove("hidden");
                    $("btn-login-recovery").disabled = false;
                }
                if (!recoveryAttemptInFlight) {
                    showLoginStatus(`${message} Use visual recovery if needed.`, "error");
                }
            } else {
                resetKeystrokeTrace();
            }
            break;
        case "LOGOUT_SUCCESS":
            loadAuthStatus();
            showNotification(message, "info");
            break;
        case "OK":
            routeOkPayload(payload);
            break;
        case "SUCCESS":
            routeSuccessPayload(payload);
            break;
        case "ERROR":
            stopLoadingAnimation();
            if (!state.authenticated || payload.action === "AUTH") {
                showLoginStatus(message, "error");
            }
            if (state.cameraMode && state.recoveryPipelineActive) {
                finalizeRecoveryPipeline(false, `Pipeline completed with error: ${message}`, () => {
                    if ($("camera-capture-status")) {
                        $("camera-capture-status").textContent = message;
                    }
                    updateCameraCaptureUi();
                });
            } else if (state.cameraMode && $("camera-capture-status")) {
                $("camera-capture-status").textContent = message;
            }
            if (payload.action === "ROTATE_MASTER_KEY" && $("operator-password-status")) {
                $("operator-password-status").textContent = message;
            }
            showNotification(message, "error");
            addActivity(`Error: ${message}`, "ERROR");
            break;
        case "PONG":
            break;
        default:
            showNotification(message, "info");
            break;
    }
}

function routeOkPayload(payload) {
    const action = payload.action;
    const data = payload.data;

    switch (action) {
        case "GET_AUTH_STATUS":
            renderAuthStatus(data);
            updateDashboardState();
            break;
        case "GET_APP_SETTINGS":
        case "UPDATE_APP_SETTINGS":
            renderAppSettings(data);
            if (action === "UPDATE_APP_SETTINGS") {
                addActivity("Session controls updated");
                showNotification("Session controls updated.", "success");
                if ($("settings-status")) {
                    $("settings-status").textContent = "Runtime settings saved.";
                }
            }
            break;
        case "GET_OPERATOR_PROFILE":
            renderOperatorProfile(data);
            break;
        case "GET_VAULT_LIST":
            renderVaultList(payload);
            break;
        case "GET_DECOY_STATUS":
            renderDecoyStatus(data);
            break;
        case "GET_MONITOR_STATUS":
        case "START_MONITORING":
        case "STOP_MONITORING":
            renderMonitorStatus(data);
            updateDashboardState();
            break;
        case "SCAN_IMAGE":
            renderScanResult(data);
            addActivity(`Scan complete: ${data?.is_obsidyn ? "OBSIDYN signature detected" : data?.message || "No hidden payload"}`);
            break;
        case "GET_STATUS":
            updateDashboardState();
            break;
        default:
            if (data && Array.isArray(data.vaults)) {
                renderDecoyStatus(data);
            } else if (data && Array.isArray(data.processes)) {
                renderMonitorStatus(data);
            } else if (Array.isArray(data)) {
                renderVaultList(payload);
            }
            break;
    }
}

function routeSuccessPayload(payload) {
    const action = payload.action;
    const message = extractMessage(payload);

    switch (action) {
        case "LOCK_FILE":
        case "LOCK_FOLDER":
            addActivity(message);
            loadVaultList();
            showNotification(message, "success");
            break;
        case "UNLOCK_FILE":
        case "UNLOCK_FOLDER":
            addActivity(message);
            loadVaultList();
            showNotification(message, "success");
            break;
        case "DELETE_VAULT_ITEM":
            addActivity(message);
            loadVaultList();
            showNotification(message, "success");
            break;
        case "HIDE_DATA":
            stopLoadingAnimation();
            addActivity(message);
            showNotification(message, "success");
            break;
        case "EXTRACT_DATA":
            stopLoadingAnimation();
            addActivity(message);
            showNotification(message, "success");
            break;
        case "CREATE_DECOY_VAULT":
            addActivity(message);
            loadDecoyStatus();
            showNotification(message, "success");
            break;
        case "SAVE_OPERATOR_PROFILE":
            renderOperatorProfile(payload.profile);
            addActivity("Operator dossier updated");
            showNotification(message, "success");
            break;
        case "UPDATE_RHYTHM_POLICY":
            renderSecurityPolicy(payload.policy);
            addActivity("Rhythm Lock policy updated");
            showNotification(message, "success");
            break;
        case "ENROLL_VISUAL_RECOVERY":
            if (state.cameraMode === "enroll" && state.recoveryPipelineActive) {
                finalizeRecoveryPipeline(true, "Enrollment sealed. Visual recovery profile committed.", () => {
                    renderRecoveryStatus(payload.recovery);
                    closeCameraWorkflow();
                    addActivity("Visual recovery enrollment updated");
                    showNotification(message, "success");
                });
            } else {
                renderRecoveryStatus(payload.recovery);
                closeCameraWorkflow();
                addActivity("Visual recovery enrollment updated");
                showNotification(message, "success");
            }
            break;
        case "DELETE_VISUAL_RECOVERY":
            renderRecoveryStatus(payload.recovery);
            addActivity("Visual recovery enrollment deleted");
            showNotification(message, "success");
            break;
        case "ROTATE_MASTER_KEY":
            if (payload.auth_status) {
                renderAuthStatus(payload.auth_status);
            }
            if ($("operator-password-status")) {
                $("operator-password-status").textContent = message;
            }
            ["operator-current-password", "operator-new-password", "operator-confirm-password"].forEach((id) => {
                if ($(id)) {
                    $(id).value = "";
                }
            });
            addActivity("Master key rotated");
            showNotification(message, "success");
            break;
        case "SHRED_FILE":
            handleShredSuccess();
            break;
        default:
            showNotification(message, "success");
            break;
    }
}

function renderScanResult(data) {
    const result = $("scan-result");
    const content = $("scan-result-content");
    if (!result || !content) {
        return;
    }

    result.classList.remove("hidden");

    const info = data?.image_info || {};
    const rows = [
        ["Status", data?.message || "No signal"],
        ["Image", `${info.width || "-"} x ${info.height || "-"} | ${info.format || "Unknown"}`],
        ["Mode", info.mode || "Unknown"],
        ["Size", formatBytes(info.size_bytes || 0)],
        ["Capacity", formatBytes(info.capacity_bytes || 0)],
        ["Hidden Payload", data?.has_hidden_data ? "Detected" : "Not detected"],
        ["OBSIDYN Signature", data?.is_obsidyn ? "Confirmed" : "Not confirmed"]
    ];

    if (data?.hidden_data_size) {
        rows.push(["Payload Size", formatBytes(data.hidden_data_size)]);
    }

    content.innerHTML = rows
        .map(
            ([label, value]) => `
                <div class="scan-row">
                    <span>${escapeHtml(label)}</span>
                    <strong>${escapeHtml(String(value))}</strong>
                </div>
            `
        )
        .join("");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

ipcRenderer.on("engine-message", (_event, chunk) => {
    processEngineChunk(String(chunk || ""));
});

window.unlockFile = unlockFile;
window.deleteVaultItem = deleteVaultItem;

document.addEventListener("DOMContentLoaded", init);
