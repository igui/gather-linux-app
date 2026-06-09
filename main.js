const { app, BrowserWindow, shell, session, desktopCapturer } = require('electron');
const path = require('path');

// --- Chromium Flags passed before app.ready ---
// WebRTCPipeWireCapturer : activates PipeWire capturer necessary for
// getDisplayMedia to pass through xdg-desktop-portal on Wayland.
// WaylandWindowDecorations : renders client-side decorations correctly.
app.commandLine.appendSwitch(
  'enable-features',
  'WebRTCPipeWireCapturer,WaylandWindowDecorations',
);
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

function createWindow() {
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
    const parsedUrl = new URL(url);
    
    // Allow Google auth popups and internal gather.town popups to open as new electron windows
    if (parsedUrl.hostname.includes('google.com') || 
        parsedUrl.hostname.includes('gather.town') ||
        parsedUrl.hostname.includes('firebaseapp.com')) {
      return { action: 'allow' };
    }
    
    // Route everything else to the OS default browser
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Intercept same-window navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    
    if (!parsedUrl.hostname.includes('gather.town') && 
        !parsedUrl.hostname.includes('google.com') && 
        !parsedUrl.hostname.includes('firebaseapp.com')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Load Gather
  // Gather checks the user agent. We need to pretend to be a regular Chrome browser to avoid the "desktop not supported" error
  mainWindow.webContents.userAgent = mainWindow.webContents.userAgent.replace(/Electron\/\S+ /, '').replace(/gather-app\/\S+ /, '');
  
  mainWindow.loadURL('https://app.v2.gather.town/');
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
