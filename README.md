# Gather Town Electron App (Linux)

**⚠️ Note: This app is in early beta!**

This is a wrapper app to run Gather.town natively on Linux using Electron.

## Features:
- Preserves the ability to use the Microphone and Camera (a necessity for Gather).
- Intercepts external links to open in your system's default browser.
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
