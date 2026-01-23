const { app, BrowserWindow, session, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const { handlers, setupInterceptors } = require('./ipc-handlers');
const DiscordRPC = require('discord-rpc');
const { autoUpdater } = require('electron-updater');

const clientId = '1451640447993774232';
DiscordRPC.register(clientId);

const rpc = new DiscordRPC.Client({ transport: 'ipc' });
const startTimestamp = new Date();

async function setActivity(title) {
  if (!rpc) return;

  let details = 'Not watching anything';
  let state = 'P-Stream is goated af';

  if (title && title !== 'P-Stream') {
    details = `Watching: ${title}`;
    state = 'P-Stream is goated af';
  }

  rpc.setActivity({
    details: details,
    state: state,
    startTimestamp,
    largeImageKey: 'logo',
    largeImageText: 'P-Stream',
    instance: false,
    buttons: [{ label: 'Use P-Stream', url: 'https://pstream.mov/' }]
  }).catch(console.error);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      persistSessionCookies: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: "P-Stream"
  });

  // Remove the menu entirely
  mainWindow.setMenu(null);

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.loadURL('https://pstream.mov/');

  // Update title when page title changes
  mainWindow.on('page-title-updated', (event, title) => {
    event.preventDefault();
    let displayTitle = title;
    
    if (title === 'P-Stream') {
      mainWindow.setTitle('P-Stream');
      setActivity(null);
    } else {
      // Assuming the title comes as "Movie Title - P-Stream" or just "Movie Title"
      // If it's "Movie Title - P-Stream", we want "Movie Title"
      const cleanTitle = title.replace(' - P-Stream', '');
      mainWindow.setTitle(`${cleanTitle} - P-Stream`);
      setActivity(cleanTitle);
    }
  });

  // Optional: Open DevTools
  // mainWindow.webContents.openDevTools();
}

// Auto-updater configuration
autoUpdater.autoDownload = false; // Don't auto-download, let user choose
autoUpdater.autoInstallOnAppQuit = true; // Auto-install when app quits

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  dialog.showMessageBox(BrowserWindow.getFocusedWindow() || null, {
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) of P-Stream is available!`,
    detail: 'Would you like to download and install it now?',
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then(result => {
    if (result.response === 0) { // Download button
      autoUpdater.downloadUpdate();

      // Show download progress notification
      if (Notification.isSupported()) {
        new Notification({
          title: 'Downloading Update',
          body: 'P-Stream update is being downloaded...'
        }).show();
      }
    }
  }).catch(console.error);
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
  const isNetworkError = errorMessage.includes('enotfound') || 
                         errorMessage.includes('econnrefused') ||
                         errorMessage.includes('etimedout') ||
                         errorMessage.includes('network') ||
                         errorMessage.includes('connection') ||
                         errorMessage.includes('fetch') ||
                         errorMessage.includes('timeout');
  
  // Don't show errors for "no update available" scenarios
  const isNoUpdateError = errorMessage.includes('no update available') ||
                          errorMessage.includes('already latest') ||
                          errorMessage.includes('404') ||
                          errorMessage.includes('not found');
  
  // Only show dialog for actual network/API errors, not for "no update" scenarios
  if (isNetworkError && !isNoUpdateError) {
    dialog.showErrorBox('Update Check Failed', 'Unable to check for updates. Please check your internet connection and try again later.');
  } else {
    // For "no update available" or minor errors, just log silently
    console.log('Update check completed (no update available):', err.message || err.toString());
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  dialog.showMessageBox(BrowserWindow.getFocusedWindow() || null, {
    type: 'info',
    title: 'Update Downloaded',
    message: `P-Stream ${info.version} has been downloaded!`,
    detail: 'The update will be installed when you restart the application.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then(result => {
    if (result.response === 0) { // Restart Now button
      autoUpdater.quitAndInstall();
    }
  }).catch(console.error);
});

rpc.on('ready', () => {
  console.log('Discord RPC started');
  setActivity(null);
});

app.whenReady().then(async () => {
  // Set the app name
  app.setName('P-Stream');

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
      const result = await autoUpdater.checkForUpdates();
      return {
        updateAvailable: result.updateInfo ? true : false,
        version: result.updateInfo?.version || app.getVersion()
      };
    } catch (error) {
      console.error('Manual update check failed:', error);
      return { error: error.message };
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

rpc.login({ clientId }).catch(console.error);
