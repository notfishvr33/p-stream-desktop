const toggle = document.getElementById('discord-rpc-toggle');
const versionText = document.getElementById('version-text');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const resetAppBtn = document.getElementById('reset-app-btn');

// Load initial state
async function loadState() {
  try {
    const enabled = await window.controlPanel.getDiscordRPCEnabled();
    toggle.checked = enabled;
  } catch (error) {
    console.error('Failed to load Discord RPC state:', error);
  }

  try {
    const version = await window.controlPanel.getVersion();
    versionText.textContent = `v${version}`;
  } catch (error) {
    console.error('Failed to load version:', error);
    versionText.textContent = 'Unknown';
  }
}

// Handle toggle change
toggle.addEventListener('change', async (event) => {
  try {
    await window.controlPanel.setDiscordRPCEnabled(event.target.checked);
  } catch (error) {
    console.error('Failed to update Discord RPC state:', error);
    // Revert toggle on error
    toggle.checked = !event.target.checked;
  }
});

// Handle update check button
checkUpdatesBtn.addEventListener('click', async () => {
  checkUpdatesBtn.disabled = true;
  checkUpdatesBtn.textContent = 'Checking...';

  try {
    const result = await window.controlPanel.checkForUpdates();

    if (result.error) {
      // Show error message
      versionText.textContent = result.error;
      checkUpdatesBtn.textContent = 'Check for Updates';
      // Reset after a few seconds
      setTimeout(() => {
        if (versionText.textContent === result.error) {
          versionText.textContent = `v${result.version || 'Unknown'}`;
        }
      }, 5000);
    } else if (result.isDevelopment) {
      // Development mode - show friendly message
      versionText.textContent = result.message || 'Development mode';
      checkUpdatesBtn.textContent = 'Check for Updates';
      setTimeout(() => {
        versionText.textContent = `v${result.version}`;
      }, 3000);
    } else if (result.updateAvailable) {
      // Update available
      versionText.textContent = `Update available: v${result.version}`;
      checkUpdatesBtn.textContent = 'Update Available!';
    } else {
      // Already up to date
      versionText.textContent = `v${result.version} (Latest)`;
      checkUpdatesBtn.textContent = 'Up to Date';
      setTimeout(() => {
        checkUpdatesBtn.textContent = 'Check for Updates';
      }, 2000);
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
    versionText.textContent = 'Error checking for updates';
    checkUpdatesBtn.textContent = 'Check for Updates';
    // Reset after a few seconds
    setTimeout(() => {
      if (versionText.textContent === 'Error checking for updates') {
        window.controlPanel.getVersion().then((version) => {
          versionText.textContent = `v${version}`;
        });
      }
    }, 5000);
  } finally {
    checkUpdatesBtn.disabled = false;
  }
});

// Handle reset app button
resetAppBtn.addEventListener('click', async () => {
  // Confirm with user
  const confirmed = confirm(
    'Are you sure you want to reset the app? This will clear all local data and cookies. This action cannot be undone.',
  );

  if (!confirmed) {
    return;
  }

  resetAppBtn.disabled = true;
  resetAppBtn.textContent = 'Resetting...';

  try {
    await window.controlPanel.resetApp();
    resetAppBtn.textContent = 'Reset Complete';

    // Show success message
    alert('App has been reset successfully. The app will reload.');

    // Reload the control panel after a short delay
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    console.error('Failed to reset app:', error);
    resetAppBtn.textContent = 'Reset App';
    alert('Failed to reset app. Please try again.');
  } finally {
    resetAppBtn.disabled = false;
  }
});

// Load state when page loads
loadState();
