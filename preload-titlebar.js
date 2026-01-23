const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximizeToggle: () => ipcRenderer.send('window-maximize-toggle'),
  close: () => ipcRenderer.send('window-close'),
  onTitleChanged: (cb) => ipcRenderer.on('title-changed', (_event, title) => cb(title)),
  onMaximizedChanged: (cb) => ipcRenderer.on('window-maximized', (_event, isMaximized) => cb(isMaximized)),
  onThemeColorChanged: (cb) => ipcRenderer.on('theme-color', (_event, color) => cb(color))
});
