const { webFrame } = require('electron');

// Gather's video mute state lives in a Redux store that is never exposed on
// window, so there is no direct way to toggle the camera from outside. The
// store is created with Redux Toolkit's configureStore with devTools enabled
// (the default), which makes Gather's own code look for the Redux DevTools
// hook (window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) at store-creation time.
// We provide a minimal hook that composes enhancers normally and captures the
// created store, then expose a toggle helper for main.js to call.
//
// Failure modes are all graceful: if Gather ever disables devTools the hook is
// simply never called and the toggle becomes a no-op — unlike impersonating
// the _electron_interop desktop bridge, nothing here can break the app.
webFrame.executeJavaScript(`(() => {
  const stores = [];
  const composeAndCapture = (funcs) => (createStore) => (...args) => {
    const store = funcs.reduceRight((acc, f) => f(acc), createStore)(...args);
    stores.push(store);
    return store;
  };
  // The real extension supports both (options)(...enhancers) and (...enhancers)
  window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ = (...args) => {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      return (...funcs) => composeAndCapture(funcs);
    }
    return composeAndCapture(args);
  };

  // Other bundled libs may also create devtools-enabled stores, so identify
  // Gather's by its state shape instead of assuming the last one captured.
  const findGatherStore = () => stores.find((s) => {
    try {
      const state = s.getState();
      return state && state.video && 'videoMuteClicked' in state.video;
    } catch { return false; }
  });

  window.__toggleGatherVideo = () => {
    const store = findGatherStore();
    if (!store) return null;
    const video = store.getState().video;
    // Mirrors the guard in Gather's own toggleVideo helper
    if (video.videoMuteDisabled) return 'disabled';
    const next = !video.videoMuteClicked;
    store.dispatch({ type: 'video/setVideoMuteClicked', payload: next });
    return next;
  };

  window.__gatherVideoMuted = () => findGatherStore()?.getState().video.videoMuteClicked;
})()`);
