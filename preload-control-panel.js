const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controlPanel', {
  getDiscordRPCEnabled: () => ipcRenderer.invoke('get-discord-rpc-enabled'),
  setDiscordRPCEnabled: (enabled) => ipcRenderer.invoke('set-discord-rpc-enabled', enabled),
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('checkForUpdates'),
});
