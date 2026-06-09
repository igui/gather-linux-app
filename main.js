const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
