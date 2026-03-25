window.LinkdNLiveKit = (() => {
  let room = null;
  let localTracks = [];

  function getSDK() {
    return window.LivekitClient || window.livekit || null;
  }

  function requireSDK() {
    const sdk = getSDK();
    if (!sdk) throw new Error('LiveKit client library is not loaded.');
    return sdk;
  }

  async function fetchToken({ roomName, identi