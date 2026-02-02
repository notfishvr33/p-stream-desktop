const warpToggle = document.getElementById('warp-toggle');
const warpStatus = document.getElementById('warp-status');
const discordToggle = document.getElementById('discord-rpc-toggle');
const versionText = document.getElementById('version-text');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const updateNowBtn = document.getElementById('update-now-btn');

// Load initial state
async function loadState() {
  // Load WARP VPN state
  try {
    const warpEnabled = await window.settings.getWarpEnabled();
    warpToggle.checked = warpEnabled;
    updateWarpStatus();
  } catch (error) {
    console.error('Failed to load WARP state:', error);
  }

  // Load Discord RPC state
  try {
    const enabled = await window.settings.getDiscordRPCEnabled();
    discordToggle.checked = enabled;
  } catch (error) {
    console.error('Failed to load Discord RPC state:', error);
  }

  // Load version
  try {
    const version = await window.settings.getVersion();
    versionText.textContent = `v${version}`;
  } catch (error) {
    console.error('Failed to load version:', error);
    versionText.textContent = 'Unknown';
  }

  // Check if we're in development mode
  try {
    const updateCheck = await window.settings.checkForUpdates();
    if (updateCheck.isDevelopment) {
      checkUpdatesBtn.textContent = 'Open Releases Page';
      updateNowBtn.hidden = true;
      versionText.textContent = `v${updateCheck.version} (Dev Mode)`;
    } else {
      checkUpdatesBtn.textContent = 'Check for Updates';
      updateNowBtn.hidden = true;
    }
  } catch (error) {
    console.log('Could not determine if in dev mode:', error);
    checkUpdatesBtn.textContent = 'Check for Updates';
    updateNowBtn.hidden = true;
  }
}

// Update WARP status display
async function updateWarpStatus() {
  try {
    const status = await window.settings.getWarpStatus();
    if (status.enabled) {
      warpStatus.textContent = `Connected via ${status.proxyHost}:${status.proxyPort}`;
      warpStatus.style.color = '#4ade80';
    } else if (status.error) {
      warpStatus.textContent = `Error: ${status.error}`;
      warpStatus.style.color = '#f87171';
    } else {
      warpStatus.textContent = 'Disabled';
      warpStatus.style.color = '#a1a1aa';
    }
  } catch (error) {
    warpStatus.textContent = '';
  }
}

// Handle WARP toggle change
warpToggle.addEventListener('change', async (event) => {
  const enabling = event.target.checked;
  warpToggle.disabled = true;
  warpStatus.textContent = enabling ? 'Connecting...' : 'Disconnecting...';
  warpStatus.style.color = '#fbbf24';

  try {
    const result = await window.settings.setWarpEnabled(enabling);
    if (result.success) {
      warpToggle.checked = enabling;
      await updateWarpStatus();
    } else {
      warpToggle.checked = !enabling;
      warpStatus.textContent = result.error || 'Failed';
      warpStatus.style.color = '#f87171';
    }
  } catch (error) {
    console.error('Failed to update WARP state:', error);
    warpToggle.checked = !enabling;
    warpStatus.textContent = error.message || 'Failed';
    warpStatus.style.color = '#f87171';
  } finally {
    warpToggle.disabled = false;
  }
});

// Handle Discord RPC toggle change
discordToggle.addEventListener('change', async (event) => {
  try {
    await window.settings.setDiscordRPCEnabled(event.target.checked);
  } catch (error) {
    console.error('Failed to update Discord RPC state:', error);
    discordToggle.checked = !event.target.checked;
  }
});

// Handle update check button
checkUpdatesBtn.addEventListener('click', async () => {
  const buttonText = checkUpdatesBtn.textContent;

  if (buttonText === 'Open Releases Page') {
    await handleOpenReleasesPage();
  } else {
    await handleCheckForUpdates();
  }
});

// Handle Update now button
updateNowBtn.addEventListener('click', handleUpdateNow);

async function handleCheckForUpdates() {
  checkUpdatesBtn.disabled = true;
  checkUpdatesBtn.textContent = 'Checking...';

  try {
    const result = await window.settings.checkForUpdates();

    if (result.error) {
      versionText.textContent = result.error;
      updateNowBtn.hidden = true;
      checkUpdatesBtn.textContent = 'Check for Updates';
      setTimeout(() => {
        if (versionText.textContent === result.error) {
          versionText.textContent = `v${result.version || 'Unknown'}`;
        }
      }, 5000);
    } else if (result.isDevelopment) {
      versionText.textContent = `v${result.version} (Dev Mode)`;
      updateNowBtn.hidden = true;
      checkUpdatesBtn.textContent = 'Open Releases Page';
    } else if (result.updateAvailable) {
      versionText.textContent = `Update available: v${result.version}`;
      updateNowBtn.hidden = false;
      checkUpdatesBtn.textContent = 'Open Releases Page';
    } else {
      const displayVersion = result.version || result.currentVersion || 'Unknown';
      versionText.textContent = `v${displayVersion} (Latest)`;
      updateNowBtn.hidden = true;
      checkUpdatesBtn.textContent = 'Up to Date';
      setTimeout(() => {
        checkUpdatesBtn.textContent = 'Check for Updates';
      }, 2000);
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
    versionText.textContent = 'Error checking for updates';
    checkUpdatesBtn.textContent = 'Check for Updates';
    setTimeout(() => {
      if (versionText.textContent === 'Error checking for updates') {
        window.settings.getVersion().then((version) => {
          versionText.textContent = `v${version}`;
        });
      }
    }, 5000);
  } finally {
    checkUpdatesBtn.disabled = false;
  }
}

async function handleOpenReleasesPage() {
  try {
    await window.settings.openReleasesPage();
  } catch (error) {
    console.error('Failed to open releases page:', error);
    versionText.textContent = 'Error opening releases page';
    setTimeout(() => {
      window.settings.getVersion().then((version) => {
        versionText.textContent = `v${version}`;
      });
    }, 3000);
  }
}

async function handleUpdateNow() {
  updateNowBtn.disabled = true;
  checkUpdatesBtn.disabled = true;
  updateNowBtn.textContent = 'Starting update...';

  try {
    const result = await window.settings.installUpdate();
    if (result.updateInstalling) {
      versionText.textContent = 'Update in progress...';
    } else if (result.error) {
      versionText.textContent = result.error;
      updateNowBtn.textContent = 'Update now';
      updateNowBtn.disabled = false;
      checkUpdatesBtn.disabled = false;
      setTimeout(async () => {
        if (versionText.textContent === result.error) {
          try {
            const v = await window.settings.getVersion();
            versionText.textContent = `v${v}`;
          } catch {
            versionText.textContent = 'Unknown';
          }
        }
      }, 5000);
    } else {
      updateNowBtn.textContent = 'Update now';
      updateNowBtn.disabled = false;
      checkUpdatesBtn.disabled = false;
    }
  } catch (error) {
    console.error('Update now failed:', error);
    versionText.textContent = 'Update failed';
    updateNowBtn.textContent = 'Update now';
    updateNowBtn.disabled = false;
    checkUpdatesBtn.disabled = false;
  }
}

// Load state when page loads
loadState();
