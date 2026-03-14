import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'linkdn-v2-backend' });
});

app.get('/api/bootstrap', (_req, res) => {
  res.json({
    ownerSections: ['dashboard', 'profile', 'venues', 'workers', 'messages', 'billing'],
    venueSections: ['dashboard', 'controls', 'devices', 'metrics', 'workers', 'messages'],
    adminSections: ['dashboard', 'venues', 'owners', 'workers', 'billing', 'metrics']
  });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Linkd'N V2 backend listening on http://localhost:${port}`);
});
