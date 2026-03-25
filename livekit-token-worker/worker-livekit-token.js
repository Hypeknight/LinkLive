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
      if (!env.LIVEKIT_URL) return json({ error: 'LIVEKIT_URL secret is missing' }, 500);
      if (!env.LIVEKIT_API_KEY) return json({ error: 'LIVEKIT_API_KEY secret is missing' }, 500);
      if (!env.LIVEKIT_API_SECRET) return json({ error: 'LIVEKIT_API_SECRET secret is missing' }, 500);

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

      const token = new AccessToken(
        env.LIVEKIT_API_KEY,
        env.LIVEKIT_API_SECRET,
        {
          identity,
          name: participantName || identity,
          ttl: '2h',
        }
      );

      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish,
        canSubscribe,
        canPublishData: true,
      });

      const jwt = await token.toJwt();

      return json({
        serverUrl: env.LIVEKIT_URL,
        token: jwt,
      });
    } catch (err) {
      return json({
        error: err?.message || 'Token generation failed',
        stack: err?.stack || null,
      }, 500);
    }
  },
};