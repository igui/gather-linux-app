# Gather Town Electron App (Linux)

**⚠️ Note: This app is in early beta!**

This is a wrapper app to run Gather.town natively on Linux using Electron.

## Features:
- Preserves the ability to use the Microphone and Camera (a necessity for Gather).
- Fixes screen sharing on Linux: works on Wayland via PipeWire and the desktop portal (where Gather in a regular browser often fails).
- Global keyboard shortcuts that work even when the window is not focused: `Ctrl+Shift+A` toggles the microphone, `Ctrl+Shift+V` toggles the camera.
- Intercepts external links to open in your system's default browser.
- Remembers the last visited space and reopens it on launch.
- Provided as a standalone portable Linux executable (AppImage).

## How to Run:
We have already built a standalone portable executable for you.
Simply execute the `.AppImage` file:
```bash
cd dist
chmod +x gather-app-1.0.0.AppImage
./gather-app-1.0.0.AppImage
```

## Development
To start the app in development mode:
```bash
npm install
npm start
```

To rebuild the AppImage:
```bash
npm run dist
```
