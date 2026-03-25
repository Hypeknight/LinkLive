import { AccessToken } from 'livekit-server-sdk';

const ALLOWED_ORIGIN = 'https://linklive.willie-gerald1.workers.dev';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

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

      const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity,
        name: participantName || identity,
        ttl: '2h',
      });

      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish,
        canSubscribe,
        canPublishData: true,
      });

      return json({
        serverUrl: env.LIVEKIT_URL,
        token: await token.toJwt(),
      });
    } catch (err) {
      return json({ error: err.message || 'Token generation failed' }, 500);
    }
  },
};