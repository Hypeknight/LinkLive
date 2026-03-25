import { AccessToken } from 'livekit-server-sdk';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    try {
      const body = await request.json();
      const {
        roomName,
        identity,
        participantName,
        canPublish = false,
        canSubscribe = true,
      } = body || {};

      if (!roomName || !identity) {
        return json({ error: 'roomName and identity are required' }, 400);
      }

      const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity,
        name: participantName || identity,
        ttl: '2h',
      });

      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish,
        canSubscribe,
        canPublishData: true,
      });

      const token = await at.toJwt();

      return json({
        serverUrl: env.LIVEKIT_URL,
        token,
      });
    } catch (err) {
      return json({ error: err.message || 'Token generation failed' }, 500);
    }
  },
};