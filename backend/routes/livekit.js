import express from 'express';
import { AccessToken } from 'livekit-server-sdk';

const router = express.Router();

router.post('/livekit-token', async (req, res) => {
  try {
    const {
      roomName,
      identity,
      name,
      metadata,
      canPublish = true,
      canSubscribe = true,
      roomAdmin = false
    } = req.body;

    if (!roomName || !identity) {
      return res.status(400).json({ error: 'roomName and identity are required.' });
    }

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity,
        name,
        metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {})
      }
    );

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish,
      canSubscribe,
      roomAdmin
    });

    return res.json({
      token: await at.toJwt(),
      url: process.env.LIVEKIT_URL
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not generate token.' });
  }
});

export default router;
