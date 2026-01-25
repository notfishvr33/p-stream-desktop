const { app, BrowserWindow, BrowserView, session, ipcMain, dialog, Notification, globalShortcut } = require('electron');
const path = require('path');
const { handlers, setupInterceptors } = require('./ipc-handlers');
const DiscordRPC = require('discord-rpc');
const { autoUpdater } = require('electron-updater');
const SimpleStore = require('./storage');

const clientId = '1451640447993774232';
DiscordRPC.register(clientId);

const rpc = new DiscordRPC.Client({ transport: 'ipc' });
const startTimestamp = new Date();

// Settings store (will be initialized when app is ready)
let store = null;

// Control panel window reference
let controlPanelWindow = null;

// Track if update is downloaded and ready to install
let updateDownloaded = false;
let downloadedUpdateVersion = null;

// BrowserView reference (for reset functionality)
let mainBrowserView = null;

// Store current activity title
let currentActivityTitle = null;

function getStreamUrlForRPC() {
  if (!store) return 'https://pstream.mov/';
  const streamUrl = store.get('streamUrl', 'pstream.mov');
  return streamUrl.startsWith('http://') || streamUrl.startsWith('https://') ? streamUrl : `https://${streamUrl}/`;
}

async function setActivity(title) {
  if (!rpc) return;

  // Check if Discord RPC is enabled (store might not be initialized yet)
  if (store && !store.get('discordRPCEnabled', true)) {
    // Clear activity if disabled
    rpc.clearActivity().catch(console.error);
    return;
  }

  let details = 'Not watching anything';
  let state = 'P-Stream is goated af';

  if (title && title !== 'P-Stream') {
    details = `Watching: ${title}`;
    state = 'P-Stream is goated af';
  }

  rpc
    .setActivity({
      details: details,
      state: state,
      startTimestamp,
      largeImageKey: 'logo',
      largeImageText: 'P-Stream',
      instance: false,
      buttons: [{ label: 'Use P-Stream', url: getStreamUrlForRPC() }],
    })
    .catch(console.error);
}

function createWindow() {
  const TITLE_BAR_HEIGHT = 40;
  // Allow platform override via environment variable for previewing different platforms
  const platform = process.env.PLATFORM_OVERRIDE || process.platform;
  const isMac = platform === 'darwin';

  // Configure window based on platform
  const windowOptions = {
    width: 1300,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'logo.png'),
    backgroundColor: '#1f2025',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-titlebar.js'),
    },
    title: 'P-Stream',
  };

  if (isMac) {
    // macOS: Use hidden title bar with native traffic lights
    windowOptions.frame = false;
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 12, y: 12 };
  } else {
    // Windows and Linux: Use frameless window with custom buttons
    windowOptions.frame = false;
  }

  const mainWindow = new BrowserWindow(windowOptions);

  // Remove the menu entirely
  mainWindow.setMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      persistSessionCookies: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Store reference to BrowserView globally
  mainBrowserView = view;

  mainWindow.setBrowserView(view);

  // Set up keyboard shortcuts after view is created
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isMac = platform === 'darwin';
    const isReload =
      (isMac && input.meta && input.key.toLowerCase() === 'r') ||
      (!isMac && input.control && input.key.toLowerCase() === 'r');

    if (isReload && input.type === 'keyDown') {
      // Reload the BrowserView (embedded web page)
      if (view && view.webContents) {
        view.webContents.reload();
      }
      event.preventDefault();
    } else if (input.control && input.shift && input.key.toLowerCase() === 'i' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  const resizeView = () => {
    const { width, height } = mainWindow.getContentBounds();
    view.setBounds({ x: 0, y: TITLE_BAR_HEIGHT, width, height: height - TITLE_BAR_HEIGHT });
  };

  resizeView();
  view.setAutoResize({ width: true, height: true });

  mainWindow.on('resize', resizeView);
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));

  // Get the saved stream URL or use default
  const streamUrl = store ? store.get('streamUrl', 'pstream.mov') : 'pstream.mov';
  const fullUrl =
    streamUrl.startsWith('http://') || streamUrl.startsWith('https://') ? streamUrl : `https://${streamUrl}/`;
  view.webContents.loadURL(fullUrl);

  // Update title when page title changes
  view.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();

    if (title === 'P-Stream') {
      mainWindow.setTitle('P-Stream');
      currentActivityTitle = null;
      setActivity(null);
    } else {
      const cleanTitle = title.replace(' - P-Stream', '');
      mainWindow.setTitle(`${cleanTitle} - P-Stream`);
      currentActivityTitle = cleanTitle;
      setActivity(cleanTitle);
    }

    mainWindow.webContents.send('title-changed', mainWindow.getTitle());
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('title-changed', mainWindow.getTitle());
    mainWindow.webContents.send('window-maximized', mainWindow.isMaximized());
    mainWindow.webContents.send('platform-changed', platform);
  });

  // Optional: Open DevTools
  // view.webContents.openDevTools();
}

function createControlPanelWindow() {
  // If window already exists, focus it
  if (controlPanelWindow) {
    controlPanelWindow.focus();
    return;
  }

  controlPanelWindow = new BrowserWindow({
    width: 500,
    height: 400,
    minWidth: 400,
    minHeight: 300,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'logo.png'),
    backgroundColor: '#1f2025',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-control-panel.js'),
    },
    title: 'P-Stream Control Panel',
    show: false,
  });

  controlPanelWindow.loadFile(path.join(__dirname, 'control-panel.html'));

  controlPanelWindow.once('ready-to-show', () => {
    controlPanelWindow.show();
  });

  controlPanelWindow.on('closed', () => {
    controlPanelWindow = null;
  });
}

// Auto-updater configuration
autoUpdater.autoDownload = false; // Don't auto-download, let user choose
autoUpdater.autoInstallOnAppQuit = true; // Auto-install when app quits

// Configure updater for GitHub releases
// electron-updater automatically reads from package.json build.publish config
// But we can explicitly configure it for better error handling
if (app.isPackaged) {
  try {
    // electron-updater v6+ automatically uses package.json config
    // But we can explicitly set it to ensure it works
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'p-stream',
      repo: 'p-stream-desktop',
    });
    console.log('Auto-updater configured for GitHub releases');
  } catch (error) {
    console.error('Failed to configure auto-updater:', error);
  }
}

// Track if we're doing a manual check to avoid duplicate dialogs
let isManualCheck = false;

// Simple version comparison function (handles semantic versioning)
function compareVersions(current, latest) {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;

    if (latestPart > currentPart) return 1; // latest is newer
    if (latestPart < currentPart) return -1; // current is newer
  }

  return 0; // versions are equal
}

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);

  // Only show dialog for automatic checks, not manual checks from control panel
  // Manual checks will show status in the control panel instead
  if (!isManualCheck) {
    dialog
      .showMessageBox(BrowserWindow.getFocusedWindow() || null, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) of P-Stream is available!`,
        detail: 'Would you like to download and install it now?',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          // Download button
          autoUpdater.downloadUpdate();

          // Show download progress notification
          if (Notification.isSupported()) {
            new Notification({
              title: 'Downloading Update',
              body: 'P-Stream update is being downloaded...',
            }).show();
          }
        }
      })
      .catch(console.error);
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available. Current version:', info.version);
  // Silently handle - user is already on latest version, no action needed
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
  // Only show error dialog for actual failures, not for "already up to date" scenarios
  // Check if it's a network/API error vs. just no update available
  const errorMessage = err.message || err.toString().toLowerCase();
  const isNetworkError =
    errorMessage.includes('enotfound') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('etimedout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('timeout');

  // Don't show errors for "no update available" scenarios
  const isNoUpdateError =
    errorMessage.includes('no update available') ||
    errorMessage.includes('already latest') ||
    errorMessage.includes('404') ||
    errorMessage.includes('not found');

  // Only show dialog for actual network/API errors, not for "no update" scenarios
  if (isNetworkError && !isNoUpdateError) {
    dialog.showErrorBox(
      'Update Check Failed',
      'Unable to check for updates. Please check your internet connection and try again later.',
    );
  } else {
    // For "no update available" or minor errors, just log silently
    console.log('Update check completed (no update available):', err.message || err.toString());
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
  console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  updateDownloaded = true;
  downloadedUpdateVersion = info.version;

  // Notify control panel if it's open
  if (controlPanelWindow && !controlPanelWindow.isDestroyed()) {
    controlPanelWindow.webContents.send('update-downloaded', {
      version: info.version,
    });
  }

  // Only show dialog for automatic checks (not manual checks from control panel)
  if (!isManualCheck) {
    dialog
      .showMessageBox(BrowserWindow.getFocusedWindow() || null, {
        type: 'info',
        title: 'Update Downloaded',
        message: `P-Stream ${info.version} has been downloaded!`,
        detail: 'The update will be installed when you restart the application.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          // Restart Now button
          autoUpdater.quitAndInstall();
        }
      })
      .catch(console.error);
  }
});

rpc.on('ready', () => {
  console.log('Discord RPC started');
  // Only set activity if RPC is enabled (store might not be initialized yet)
  if (!store || store.get('discordRPCEnabled', true)) {
    setActivity(currentActivityTitle);
  }
});

app.whenReady().then(async () => {
  // Set the app name
  app.setName('P-Stream');

  // Initialize settings store (after app is ready so app.getPath works)
  store = new SimpleStore({
    defaults: {
      discordRPCEnabled: true,
      streamUrl: 'pstream.mov',
    },
  });

  // Register IPC handlers
  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, async (event, ...args) => {
      return handler(...args);
    });
  });

  // Setup Network Interceptors
  setupInterceptors(session.defaultSession);

  createWindow();

  // Check for updates (only in production)
  if (!app.isPackaged) {
    console.log('Running in development mode, skipping update check');
  } else {
    // Check for updates after a short delay to let the app fully load
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000);
  }

  // IPC handler for manual update check
  ipcMain.handle('checkForUpdates', async () => {
    try {
      // In development mode, autoUpdater.checkForUpdates() returns null
      if (!app.isPackaged) {
        return {
          updateAvailable: false,
          version: app.getVersion(),
          isDevelopment: true,
          message: 'Update checking is not available in development mode',
        };
      }

      // Set flag to indicate this is a manual check (prevents duplicate dialogs)
      isManualCheck = true;
      console.log('Manual update check initiated...');

      const result = await autoUpdater.checkForUpdates();

      // Handle null result (can happen if update check is skipped or no releases found)
      if (!result) {
        console.log('Update check returned null - no releases found or update server not configured');
        isManualCheck = false;
        return {
          updateAvailable: false,
          version: app.getVersion(),
          message: 'No updates available or update server not found. Make sure releases exist on GitHub.',
        };
      }

      // Check if updateInfo exists and compare versions
      if (result.updateInfo) {
        const currentVersion = app.getVersion();
        const updateVersion = result.updateInfo.version;
        const versionComparison = compareVersions(currentVersion, updateVersion);

        console.log(
          `Version comparison: current=${currentVersion}, latest=${updateVersion}, comparison=${versionComparison}`,
        );

        // Only return updateAvailable if the update version is actually newer
        if (versionComparison > 0) {
          console.log('Update available:', updateVersion);
          // Reset flag after a short delay to allow event handlers to process
          setTimeout(() => {
            isManualCheck = false;
          }, 500);
          return {
            updateAvailable: true,
            version: updateVersion,
            currentVersion: currentVersion,
          };
        } else {
          console.log('Already on latest version:', currentVersion);
          isManualCheck = false;
          return {
            updateAvailable: false,
            version: currentVersion,
            message: 'Already up to date',
          };
        }
      }

      // No update available
      console.log('No update available');
      isManualCheck = false;
      return {
        updateAvailable: false,
        version: app.getVersion(),
      };
    } catch (error) {
      // Always reset flag on error
      isManualCheck = false;

      console.error('Manual update check failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
      });

      // Provide user-friendly error messages
      const errorMessage = error.message || error.toString().toLowerCase();
      let userMessage = 'Unable to check for updates';

      if (
        errorMessage.includes('network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('fetch') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('econnrefused')
      ) {
        userMessage = 'Network error. Please check your internet connection.';
      } else if (
        errorMessage.includes('not found') ||
        errorMessage.includes('404') ||
        errorMessage.includes('no published releases') ||
        errorMessage.includes('release not found')
      ) {
        userMessage = 'Update server not found. Make sure releases exist on GitHub with update metadata files.';
      } else if (errorMessage.includes('403') || errorMessage.includes('unauthorized')) {
        userMessage = 'Update server access denied. The repository may be private or requires authentication.';
      } else {
        userMessage = `Update check failed: ${error.message || 'Unknown error'}`;
      }

      return {
        error: userMessage,
        version: app.getVersion(),
      };
    }
  });

  // IPC handler for downloading updates
  ipcMain.handle('downloadUpdate', async () => {
    try {
      if (!app.isPackaged) {
        return {
          success: false,
          error: 'Update download is not available in development mode',
        };
      }

      console.log('Starting update download...');
      await autoUpdater.downloadUpdate();

      // Show download progress notification
      if (Notification.isSupported()) {
        new Notification({
          title: 'Downloading Update',
          body: 'P-Stream update is being downloaded...',
        }).show();
      }

      return {
        success: true,
        message: 'Update download started',
      };
    } catch (error) {
      console.error('Failed to download update:', error);
      return {
        success: false,
        error: error.message || 'Failed to download update',
      };
    }
  });

  // IPC handler for checking if update is downloaded
  ipcMain.handle('isUpdateDownloaded', () => {
    return {
      downloaded: updateDownloaded,
      version: downloadedUpdateVersion,
    };
  });

  // IPC handler for installing updates (restart and install)
  ipcMain.handle('installUpdate', async () => {
    try {
      if (!app.isPackaged) {
        return {
          success: false,
          error: 'Update installation is not available in development mode',
        };
      }

      if (!updateDownloaded) {
        return {
          success: false,
          error: 'Update is not downloaded yet. Please wait for download to complete.',
        };
      }

      console.log('Installing update and restarting...');
      console.log('Update downloaded version:', downloadedUpdateVersion);
      console.log('Calling quitAndInstall - app will restart and install update');

      // quitAndInstall will:
      // 1. Quit the application immediately
      // 2. Run the installer (with UI since isSilent=false)
      // 3. Restart the app after installation (since isForceRunAfter=true)
      // Note: This call is synchronous and will cause the app to quit immediately
      // The app will close, install the update, and then restart automatically
      autoUpdater.quitAndInstall(false, true); // false = isSilent (show installer UI), true = isForceRunAfter (restart app)

      // This return may not execute since quitAndInstall quits the app immediately
      // But we return it anyway for the IPC call
      return {
        success: true,
        message: 'Installing update and restarting...',
      };
    } catch (error) {
      console.error('Failed to install update:', error);
      return {
        success: false,
        error: error.message || 'Failed to install update',
      };
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Register global keyboard shortcut (Cmd/Ctrl + ,)
  const shortcut = process.platform === 'darwin' ? 'Command+,' : 'Control+,';
  globalShortcut.register(shortcut, () => {
    createControlPanelWindow();
  });
});

// Unregister all shortcuts when app quits
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-maximize-toggle', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.on('theme-color', (event, color) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.webContents.send('theme-color', color);
});

// IPC handlers for Discord RPC toggle
ipcMain.handle('get-discord-rpc-enabled', () => {
  if (!store) return true; // Default to enabled if store not initialized
  return store.get('discordRPCEnabled', true);
});

ipcMain.handle('set-discord-rpc-enabled', async (event, enabled) => {
  if (!store) return false;

  store.set('discordRPCEnabled', enabled);

  // Update activity immediately
  if (enabled) {
    // Use stored current activity title
    await setActivity(currentActivityTitle);
  } else {
    // Clear activity if disabled
    if (rpc) {
      rpc.clearActivity().catch(console.error);
    }
  }

  return true;
});

// IPC handler for getting app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// IPC handlers for stream URL
ipcMain.handle('get-stream-url', () => {
  if (!store) return 'pstream.mov';
  return store.get('streamUrl', 'pstream.mov');
});

ipcMain.handle('set-stream-url', async (event, url) => {
  if (!store) return false;

  // Validate and normalize URL
  let normalizedUrl = url.trim();

  // Remove protocol if present (we'll add it when loading)
  if (normalizedUrl.startsWith('http://')) {
    normalizedUrl = normalizedUrl.replace('http://', '');
  }
  if (normalizedUrl.startsWith('https://')) {
    normalizedUrl = normalizedUrl.replace('https://', '');
  }

  // Remove trailing slash
  normalizedUrl = normalizedUrl.replace(/\/$/, '');

  // Basic validation - should be a valid domain
  if (!normalizedUrl || normalizedUrl.length === 0) {
    throw new Error('URL cannot be empty');
  }

  store.set('streamUrl', normalizedUrl);

  // Reload the BrowserView with the new URL if it exists
  if (mainBrowserView && mainBrowserView.webContents) {
    const fullUrl = `https://${normalizedUrl}/`;
    mainBrowserView.webContents.loadURL(fullUrl);
  }

  // Update Discord RPC button URL
  if (rpc && currentActivityTitle !== null) {
    await setActivity(currentActivityTitle);
  }

  return true;
});

// IPC handler for resetting the app
ipcMain.handle('reset-app', async () => {
  try {
    // Clear local storage (settings)
    if (store) {
      store.clear();
    }

    // Clear cookies and storage from the BrowserView session
    if (mainBrowserView && mainBrowserView.webContents) {
      const viewSession = mainBrowserView.webContents.session;

      // Clear cookies
      await viewSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'cachestorage', 'filesystem'],
      });
    }

    // Also clear default session cookies (in case they're used elsewhere)
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'cachestorage', 'filesystem'],
    });

    // Reload the BrowserView with the default URL
    if (mainBrowserView && mainBrowserView.webContents) {
      const defaultUrl = 'https://pstream.mov/';
      mainBrowserView.webContents.loadURL(defaultUrl);
    }

    return { success: true };
  } catch (error) {
    console.error('Error resetting app:', error);
    return { success: false, error: error.message };
  }
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

rpc.login({ clientId }).catch(console.error);
