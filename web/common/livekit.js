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

  async function fetchToken({ roomName, identity, participantName, canPublish, canSubscribe }) {
    const res = await fetch('/api/livekit-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomName,
        identity,
        participantName,
        canPublish,
        canSubscribe,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch LiveKit token');
    }
    return data;
  }

  async function connect({ roomName, identity, participantName, canPublish = false, canSubscribe = true }) {
    const sdk = requireSDK();
    const creds = await fetchToken({
      roomName,
      identity,
      participantName,
      canPublish,
      canSubscribe,
    });

    room = new sdk.Room();

    await room.connect(creds.serverUrl, creds.token);
    return room;
  }

  async function disconnect() {
    if (room) {
      room.disconnect();
      room = null;
    }
    localTracks = [];
  }

  async function listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      videoInputs: devices.filter(d => d.kind === 'videoinput'),
      audioInputs: devices.filter(d => d.kind === 'audioinput'),
      audioOutputs: devices.filter(d => d.kind === 'audiooutput'),
    };
  }

  async function createAndPublishLocalTracks({ videoDeviceId, audioDeviceId }) {
    const sdk = requireSDK();
    if (!room) throw new Error('Not connected to a LiveKit room.');

    localTracks = await sdk.createLocalTracks({
      video: videoDeviceId ? { deviceId: videoDeviceId } : true,
      audio: audioDeviceId ? { deviceId: audioDeviceId } : true,
    });

    for (const track of localTracks) {
      await room.localParticipant.publishTrack(track);
    }

    return localTracks;
  }

  function attachLocalPreview(videoEl) {
    const videoTrack = localTracks.find(t => t.kind === 'video');
    if (videoTrack && videoEl) {
      videoTrack.attach(videoEl);
    }
  }

  function onTrackSubscribed(handler) {
    if (!room) throw new Error('Not connected to a LiveKit room.');
    room.on('trackSubscribed', (track, publication, participant) => {
      handler({ track, publication, participant });
    });
  }

  function onTrackUnsubscribed(handler) {
    if (!room) throw new Error('Not connected to a LiveKit room.');
    room.on('trackUnsubscribed', (track, publication, participant) => {
      handler({ track, publication, participant });
    });
  }

  function getRoom() {
    return room;
  }

  function getRemoteParticipants() {
    if (!room) return [];
    return Array.from(room.remoteParticipants.values());
  }

  return {
    connect,
    disconnect,
    listDevices,
    createAndPublishLocalTracks,
    attachLocalPreview,
    onTrackSubscribed,
    onTrackUnsubscribed,
    getRoom,
    getRemoteParticipants,
  };
})();