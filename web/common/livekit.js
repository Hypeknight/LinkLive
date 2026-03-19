window.LinkdNLiveKit = (() => {
  let room = null;
  function getSDK() { return window.LivekitClient || window.livekit || null; }
  function requireSDK() { const sdk = getSDK(); if (!sdk) throw new Error('LiveKit client library is not loaded.'); return sdk; }
  async function connectStub(){ requireSDK(); return null; }
  return { connectStub };
})();
