const titleEl = document.getElementById('window-title');
const minimizeBtn = document.getElementById('minimize');
const maximizeBtn = document.getElementById('maximize');
const closeBtn = document.getElementById('close');
const titlebar = document.getElementById('titlebar');

minimizeBtn.addEventListener('click', () => window.windowControls.minimize());
maximizeBtn.addEventListener('click', () => window.windowControls.maximizeToggle());
closeBtn.addEventListener('click', () => window.windowControls.close());

titlebar.addEventListener('dblclick', (event) => {
  const isButton = event.target.closest('.window-btn');
  if (isButton) return;
  window.windowControls.maximizeToggle();
});

window.windowControls.onTitleChanged((title) => {
  if (titleEl) titleEl.textContent = title || 'P-Stream';
});

window.windowControls.onMaximizedChanged((isMaximized) => {
  if (!maximizeBtn) return;
  if (isMaximized) maximizeBtn.classList.add('is-maximized');
  else maximizeBtn.classList.remove('is-maximized');
});

window.windowControls.onThemeColorChanged((color) => {
  if (!titlebar || !color) return;
  titlebar.style.background = color;
  titlebar.style.borderBottomColor = 'transparent';
});
