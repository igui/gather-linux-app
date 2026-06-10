const { app, BrowserWindow, shell, session, desktopCapturer, globalShortcut } = require('electron');
const path = require('path');

let store;

// --- Chromium Flags passed before app.ready ---
// WebRTCPipeWireCapturer : activates PipeWire capturer necessary for
// getDisplayMedia to pass through xdg-desktop-portal on Wayland.
// WaylandWindowDecorations : renders client-side decorations correctly.
app.commandLine.appendSwitch(
  'enable-features',
  'WebRTCPipeWireCapturer,WaylandWindowDecorations',
);
// Disable DocumentPictureInPictureAPI to prevent Gather from throwing
// "Document PiP requires user activation" errors when backgrounded/unlocked.
app.commandLine.appendSwitch('disable-features', 'DocumentPictureInPictureAPI');
// ozone-platform-hint=auto : lets Chromium choose Wayland if available,
// otherwise falls back to X11. This avoids forcing a transport and breaks less
// on hybrid setups.
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

// Prevent multiple instances
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Need this for Gather.town to function properly
      webSecurity: true,
      // Captures Gather's Redux store (for the video toggle shortcut) via the
      // Redux DevTools hook, which must exist before page scripts run
      preload: path.join(__dirname, 'preload.js'),
      // Preload needs the full webFrame API (executeJavaScript) to define the
      // hook in the main world; contextIsolation still protects Node
      sandbox: false,
    }
  });

  // Handle permissions (camera, microphone, etc.) automatically for gather.town
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    if (url.includes('gather.town')) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Allow checks for device permissions
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (new URL(requestingOrigin).hostname.includes('gather.town')) {
      return true;
    }
    return false;
  });

  // --- Screen sharing (getDisplayMedia) ---
  // Flow on Wayland + PipeWire (WebRTCPipeWireCapturer active):
  //   1. Gather calls navigator.mediaDevices.getDisplayMedia()
  //   2. Chromium invokes our handler
  //   3. desktopCapturer.getSources({ types: ['screen'] }) triggers the
  //      xdg-desktop-portal, the user chooses a screen
  //   4. We pass the chosen source to the callback
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      // NOTE: We request ONLY ['screen']. Requesting ['screen', 'window']
      // on Wayland can cause the portal to double-invoke PipeWire and freeze the process.
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      
      if (sources.length === 0) {
        callback({});
        return;
      }

      // Pass the selected screen to gather
      callback({ video: sources[0] });
    } catch (err) {
      console.error('desktopCapturer failed:', err);
      callback({});
    }
  });

  // Handle new window requests (e.g. target="_blank" links)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow empty windows and data blobs to open normally
    if (url === 'about:blank' || url.startsWith('blob:') || url.startsWith('data:')) {
      return { action: 'allow' };
    }

    try {
      const parsedUrl = new URL(url);
      
      // Allow Google auth popups and internal gather.town popups to open as new electron windows
      if (parsedUrl.hostname.includes('google.com') || 
          parsedUrl.hostname.includes('gather.town') ||
          parsedUrl.hostname.includes('firebaseapp.com')) {
        return { action: 'allow' };
      }
    } catch (e) {
      console.error('Invalid URL (window-open):', url.substring(0, 50));
    }
    
    // Route everything else to the OS default browser
    shell.openExternal(url).catch(console.error);
    return { action: 'deny' };
  });

  // Intercept same-window navigation to external sites
  const blockOffOriginNavigation = (event, url) => {
    if (url === 'about:blank' || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('file://')) {
      return;
    }

    try {
      const parsedUrl = new URL(url);
      
      if (parsedUrl.hostname.includes('gather.town')) {
        // Save the last visited gather.town space
        if (url.includes('/app/') && store) {
          store.set('lastVisitedSpace', url);
        }
        return;
      }
      
      if (!parsedUrl.hostname.includes('google.com') && 
          !parsedUrl.hostname.includes('firebaseapp.com')) {
        event.preventDefault();
        shell.openExternal(url).catch(console.error);
      }
    } catch (e) {
      console.error('Invalid URL (off-origin-navigation):', url.substring(0, 50));
    }
  };

  mainWindow.webContents.on('will-navigate', blockOffOriginNavigation);
  mainWindow.webContents.on('will-redirect', blockOffOriginNavigation);

  // Load Gather
  // Gather checks the user agent. We need to pretend to be a regular Chrome browser to avoid the "desktop not supported" error
  mainWindow.webContents.userAgent = mainWindow.webContents.userAgent.replace(/Electron\/\S+ /, '').replace(/gather-app\/\S+ /, '');
  
  // Wait for store to be initialized if it isn't already
  if (!store) {
    const Store = (await import('electron-store')).default;
    store = new Store();
  }

  const lastSpace = store.get('lastVisitedSpace');
  if (lastSpace) {
    mainWindow.loadURL(lastSpace);
  } else {
    mainWindow.loadURL('https://app.v2.gather.town/');
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();

  // Toggle self mute from anywhere (works even when the window is unfocused).
  // Calls the same store action as Gather's mic button so the UI stays in sync.
  // gatherDev.Repos.localMediaSelfInfo only exists after entering a space,
  // hence the optional chaining.
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.executeJavaScript(
        `globalThis.gatherDev?.Repos?.localMediaSelfInfo?.toggleAudioMuteClicked({ reason: "globalShortcut" })`
      ).catch(console.error);
    }
  });

  // Toggle camera from anywhere. Dispatches setVideoMuteClicked on Gather's
  // Redux store, captured by preload.js via the Redux DevTools hook. No-op
  // until the store exists (i.e. before the app chunk loads).
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.executeJavaScript(
        `window.__toggleGatherVideo?.()`
      ).catch(console.error);
    }
  });

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow && mainWindow.webContents) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
