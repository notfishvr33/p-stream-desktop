const DiscordRPC = require('discord-rpc');
const { ipcMain } = require('electron');

const clientId = '1451640447993774232';
DiscordRPC.register(clientId);

const rpc = new DiscordRPC.Client({ transport: 'ipc' });

// Store current media metadata for Discord RPC
let currentMediaMetadata = null;
let currentActivityTitle = null;
let store = null;

function getStreamUrlForRPC() {
  if (!store) return 'https://pstream.mov/';
  const streamUrl = store.get('streamUrl', 'pstream.mov');
  return streamUrl.startsWith('http://') || streamUrl.startsWith('https://') ? streamUrl : `https://${streamUrl}/`;
}

function createProgressBar(time, duration, options = {}) {
  const { barLength = 10, barFill = '█', barTrack = '░', showLabel = true } = options;

  if (!time || !duration || duration === 0) {
    return '';
  }

  const progress = Math.floor((time / duration) * 100);
  const numChars = Math.floor((progress / 100) * barLength);

  const bar = `${barFill.repeat(numChars)}${barTrack.repeat(barLength - numChars)}`;
  return showLabel ? `${bar}  ${progress}%` : bar;
}

async function setActivity(title, mediaMetadata = null) {
  if (!rpc) return;

  if (store && !store.get('discordRPCEnabled', true)) {
    rpc.clearActivity().catch(console.error);
    return;
  }

  if (!mediaMetadata || !mediaMetadata.title) {
    const activity = {
      details: title && title !== 'P-Stream' ? `Watching: ${title}` : 'P-Stream',
      startTimestamp: new Date(),
      largeImageKey: 'logo',
      largeImageText: 'P-Stream',
      instance: false,
      buttons: [{ label: 'Use P-Stream', url: getStreamUrlForRPC() }],
    };
    rpc.setActivity(activity).catch(console.error);
    return;
  }

  // Only show progress bar if there's valid progress data
  const hasProgress = mediaMetadata.currentTime != null && mediaMetadata.duration != null && mediaMetadata.duration > 0;

  const state = hasProgress ? createProgressBar(mediaMetadata.currentTime, mediaMetadata.duration) : null;

  const activity = {
    details: 'Watching: ' + (mediaMetadata.artist ? mediaMetadata.artist + ' ' : '') + mediaMetadata.title,
    startTimestamp: new Date(),
    largeImageKey: mediaMetadata.poster || 'logo',
    largeImageText: mediaMetadata.artist || mediaMetadata.title || 'P-Stream',
    instance: false,
    buttons: [{ label: 'Use P-Stream', url: getStreamUrlForRPC() }],
  };

  if (state) {
    activity.state = state;
  }

  if (mediaMetadata.currentTime != null && mediaMetadata.duration != null) {
    const now = Date.now();
    const elapsed = mediaMetadata.currentTime * 1000;
    const remaining = (mediaMetadata.duration - mediaMetadata.currentTime) * 1000;
    activity.startTimestamp = new Date(now - elapsed);
    activity.endTimestamp = new Date(now + remaining);
  }

  rpc.setActivity(activity).catch(console.error);
}

function initialize(settingsStore) {
  store = settingsStore;

  // Set up ready handler
  rpc.on('ready', () => {
    console.log('Discord RPC started');
    // Only set activity if RPC is enabled (store might not be initialized yet)
    if (!store || store.get('discordRPCEnabled', true)) {
      setActivity(currentActivityTitle, currentMediaMetadata);
    }
  });

  // Login to Discord RPC
  rpc.login({ clientId }).catch(console.error);

  // Register IPC handlers
  ipcMain.handle('get-discord-rpc-enabled', () => {
    if (!store) return true; // Default to enabled if store not initialized
    return store.get('discordRPCEnabled', true);
  });

  ipcMain.handle('set-discord-rpc-enabled', async (event, enabled) => {
    if (!store) return false;

    store.set('discordRPCEnabled', enabled);

    // Update activity immediately
    if (enabled) {
      // Use stored current media metadata or fall back to title
      await setActivity(currentActivityTitle, currentMediaMetadata);
    } else {
      // Clear activity if disabled
      if (rpc) {
        rpc.clearActivity().catch(console.error);
      }
    }

    return true;
  });

  ipcMain.handle('updateMediaMetadata', async (event, data) => {
    try {
      const hasMetadata = data?.metadata && (data.metadata.title || data.metadata.artist);
      const hasProgress = data?.progress && (data.progress.currentTime != null || data.progress.duration != null);

      if (!hasMetadata && !hasProgress) {
        currentMediaMetadata = null;
        setActivity(currentActivityTitle, null);
        return { success: true };
      }

      if (!currentMediaMetadata) {
        currentMediaMetadata = {};
      }

      if (data.metadata) {
        Object.assign(currentMediaMetadata, {
          title: data.metadata.title ?? currentMediaMetadata.title,
          artist: data.metadata.artist ?? currentMediaMetadata.artist,
          poster: data.metadata.poster ?? currentMediaMetadata.poster,
          season:
            data.metadata.season != null && !isNaN(data.metadata.season)
              ? data.metadata.season
              : currentMediaMetadata.season,
          episode:
            data.metadata.episode != null && !isNaN(data.metadata.episode)
              ? data.metadata.episode
              : currentMediaMetadata.episode,
        });
      }

      if (data.progress) {
        Object.assign(currentMediaMetadata, {
          currentTime:
            data.progress.currentTime != null && !isNaN(data.progress.currentTime)
              ? data.progress.currentTime
              : currentMediaMetadata.currentTime,
          duration:
            data.progress.duration != null && !isNaN(data.progress.duration)
              ? data.progress.duration
              : currentMediaMetadata.duration,
          isPlaying: data.progress.isPlaying ?? currentMediaMetadata.isPlaying,
        });
      }

      if (currentMediaMetadata.title) {
        await setActivity(currentActivityTitle, currentMediaMetadata);
      } else {
        currentMediaMetadata = null;
        setActivity(currentActivityTitle, null);
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating media metadata:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  initialize,
  setActivity,
  getCurrentActivityTitle: () => currentActivityTitle,
  setCurrentActivityTitle: (title) => {
    currentActivityTitle = title;
  },
  getCurrentMediaMetadata: () => currentMediaMetadata,
  setCurrentMediaMetadata: (metadata) => {
    currentMediaMetadata = metadata;
  },
  updateActivity: () => {
    setActivity(currentActivityTitle, currentMediaMetadata);
  },
};
